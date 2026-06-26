import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// Standard SHA-256 Hashing function to handle secure PIN storage/comparison
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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
          alert("Invalid username or PIN.");
        } else {
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
    <div className="flex flex-col items-center justify-center min-h-screen bg-charcoal-900 text-white">
      <form onSubmit={handleAction} className="p-8 bg-charcoal-800 rounded-xl w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center">{getHeadingText()}</h1>
        
        {/* Username Input - Used in all 3 modes */}
        <input 
          placeholder="Username" 
          value={username} 
          onChange={(e) => setUsername(e.target.value)}
          className="w-full p-3 mb-4 bg-charcoal-700 rounded text-white"
          required
        />

        {/* Display Name Input - ONLY shown when creating a new account */}
        {mode === 'signup' && (
          <input 
            placeholder="Display Name (e.g. Edawwg)" 
            value={displayName} 
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full p-3 mb-4 bg-charcoal-700 rounded text-white border border-green-500"
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
            className="w-full p-3 mb-4 bg-charcoal-700 rounded border border-blue-500 text-white"
            required
          />
        )}

        {/* PIN Input - Used in all 3 modes */}
        <input 
          type="password" 
          placeholder={mode === 'signup' ? "Create a 4-Digit PIN" : "PIN"} 
          value={pin} 
          onChange={(e) => setPin(e.target.value)}
          className="w-full p-3 mb-4 bg-charcoal-700 rounded text-white"
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
              className="underline block w-full hover:text-white"
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
                className="underline block w-full hover:text-white"
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