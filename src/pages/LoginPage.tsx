import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// Standard SHA-256 Hashing function to handle secure PIN storage/comparison
// Falls back to a JS implementation if Web Crypto is unavailable (non-secure context)
async function hashPin(pin: string): Promise<string> {
  // Try using the native Web Crypto API first (requires Secure Context / HTTPS)
  try {
    if (window.isSecureContext && crypto?.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(pin);
      const hash = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch (e) {
    console.warn("Native Web Crypto failed, falling back to JS implementation:", e);
  }

  // Fallback SHA-256 implementation for non-secure contexts (HTTP via IP address)
  // This ensures the same hash is generated regardless of the device/connection
  function sha256(ascii: string) {
    function rightRotate(value: number, amount: number) {
      return (value >>> amount) | (value << (32 - amount));
    }

    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    const lengthProperty = 'length';
    let i, j; // Used as a counter across the whole file
    let result = '';

    const words: any[] = [];
    const asciiBitLength = ascii[lengthProperty] * 8;

    //* caching results to be used later
    let hash: any = [];
    let k: any = [];
    let primeCounter = 0;

    const isPrime = (n: number) => {
      for (let factor = 2; factor <= Math.sqrt(n); factor++) {
        if (n % factor === 0) return false;
      }
      return true;
    };

    let candidate = 2;
    while (primeCounter < 64) {
      if (isPrime(candidate)) {
        if (primeCounter < 8) hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
        primeCounter++;
      }
      candidate++;
    }

    ascii += '\x80'; // Append '1' bit (plus 7 zero bits)
    while ((ascii[lengthProperty] % 64) - 56) ascii += '\x00'; // More zero bytes
    for (i = 0; i < ascii[lengthProperty]; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return ''; // ASCII check: only accept characters in range 0-255
      words[i >> 2] |= j << ((3 - (i % 4)) * 8);
    }
    words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
    words[words[lengthProperty]] = asciiBitLength | 0;

    for (j = 0; j < words[lengthProperty]; j += 16) {
      const w = words.slice(j, j + 16);
      const oldHash = hash;
      hash = hash.slice(0);

      for (i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];

        const a = hash[0], e = hash[4];
        const temp1 =
          hash[7] +
          (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + // s1
          ((e & hash[5]) ^ (~e & hash[6])) + // ch
          k[i] +
          (w[i] =
            i < 16
              ? w[i]
              : (w[i - 16] +
                  (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) + // s0
                  w[i - 7] +
                  (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | // s1
                0);
        const temp2 =
          (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + // s0
          ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2])); // maj

        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }

      for (i = 0; i < 8; i++) {
        hash[i] = (hash[i] + oldHash[i]) | 0;
      }
    }

    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += (b < 16 ? '0' : '') + b.toString(16);
      }
    }
    return result;
  }

  return sha256(pin);
}

type LoginMode = 'login' | 'claim' | 'signup';

export default function LoginPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState<LoginMode>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [pin, setPin] = useState('');
  const [masterToken, setMasterToken] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Instantly convert the raw user PIN into a secure hash string
      const hashedPin = await hashPin(pin);

      if (mode === 'signup') {
        // --- Create Completely New Account Logic ---
        
        // 1. Check if the username is already taken
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', username.toLowerCase().trim())
          .maybeSingle();

        if (existingUser) {
          alert("This username is already taken. Please choose another one.");
          setLoading(false);
          return;
        }

        // 2. Insert the completely new player profile into the database
        const { data: newProfile, error: signupError } = await supabase
          .from('profiles')
          .insert([
            {
              username: username.toLowerCase().trim(),
              display_name: displayName.trim() || username.trim(),
              pin_hash: hashedPin,
              is_guest: false // Brand new direct player, not a guest
            }
          ])
          .select()
          .single();

        if (signupError) {
          console.error("Signup error details:", signupError);
          alert("Could not create account. Please check database permissions or try again.");
        } else if (newProfile) {
          alert("Account created successfully! Logging you in...");
          await login(newProfile); // Log them in automatically
          navigate('/dashboard');
        }

      } else if (mode === 'claim') {
        // --- Migration Logic ---
        const { data: guest, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('username', username.toLowerCase().trim())
          .eq('is_guest', true)
          .single();

        if (error || !guest) {
          alert("Guest profile not found!");
        } else if (masterToken !== "YOUR_SECRET_TOKEN") { 
          alert("Invalid migration token.");
        } else {
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ is_guest: false, pin_hash: hashedPin })
            .eq('id', guest.id);

          if (!updateError) {
            alert("Migration successful! You can now log in.");
            setMode('login');
          }
        }
      } else {
        // --- Secure Standard Login Logic ---
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('username', username.toLowerCase().trim())
          .eq('pin_hash', hashedPin)
          .single();

        if (error || !profile) {
          await new Promise(resolve => setTimeout(resolve, 800));
          alert("Invalid username or PIN.");
        } else {
          delete profile.pin_hash;
          await login(profile);
          navigate('/dashboard');
        }
      }
    } catch (err) {
      console.error("Authentication error:", err);
      alert("An unexpected error occurred during authentication.");
    } finally {
      setLoading(false);
    }
  };

  // Helper to determine the title heading text
  const getHeadingText = () => {
    if (mode === 'signup') return 'Create Account';
    if (mode === 'claim') return 'Claim Guest Account';
    return 'Login';
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-charcoal-900 text-charcoal-50">
      <form onSubmit={handleAction} className="p-8 bg-charcoal-800 rounded-xl w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center">{getHeadingText()}</h1>
        
        {/* Username Input - Used in all 3 modes */}
        <input 
          placeholder="Username" 
          value={username} 
          onChange={(e) => setUsername(e.target.value)}
          className="w-full p-3 mb-4 bg-charcoal-700 rounded text-charcoal-50"
          maxLength={20}
          required
        />

        {/* Display Name Input - ONLY shown when creating a new account */}
        {mode === 'signup' && (
          <input 
            placeholder="Display Name (e.g. Edawwg)" 
            value={displayName} 
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full p-3 mb-4 bg-charcoal-700 rounded text-charcoal-50 border border-green-500"
            maxLength={20}
            required
          />
        )}

        {/* Master Migration Token Input - ONLY shown during guest claim */}
        {mode === 'claim' && (
          <input 
            type="password"
            placeholder="Master Migration Token" 
            value={masterToken} 
            onChange={(e) => setMasterToken(e.target.value)}
            className="w-full p-3 mb-4 bg-charcoal-700 rounded border border-blue-500 text-charcoal-50"
            required
          />
        )}

        {/* PIN Input - Used in all 3 modes */}
        <input 
          type="password" 
          placeholder={mode === 'signup' ? "Create a 4-Digit PIN" : "PIN"} 
          value={pin} 
          onChange={(e) => setPin(e.target.value)}
          className="w-full p-3 mb-4 bg-charcoal-700 rounded text-charcoal-50"
          required
        />

        {/* Action Button */}
        <button disabled={loading} className="w-full p-3 bg-blue-600 rounded font-bold hover:bg-blue-700 transition-colors">
          {loading ? 'Processing...' : (mode === 'signup' ? 'Sign Up' : mode === 'claim' ? 'Claim Account' : 'Login')}
        </button>

        {/* Toggles and navigation down below the form fields */}
        <div className="mt-6 space-y-2 text-center text-sm text-gray-400">
          {mode !== 'login' && (
            <button 
              type="button"
              onClick={() => setMode('login')}
              className="underline block w-full hover:text-charcoal-50"
            >
              Back to Login
            </button>
          )}

          {mode === 'login' && (
            <>
              <button 
                type="button"
                onClick={() => setMode('signup')}
                className="underline block w-full text-green-400 hover:text-green-300"
              >
                Create a new profile (New Player)
              </button>
              
              <button 
                type="button"
                onClick={() => setMode('claim')}
                className="underline block w-full hover:text-charcoal-50"
              >
                I am a guest upgrading my account
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}