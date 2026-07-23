import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { createUser, loginWithPin } from '../lib/auth';

type LoginMode = 'login' | 'signup';

export default function LoginPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState<LoginMode>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
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

        // 2. Create the profile via the server-side signup RPC (verifies/hashes
        // the PIN and mints the session atomically - see rpc_signup)
        try {
          const newProfile = await createUser(displayName.trim() || username.trim(), pin, username);
          if (newProfile) {
            alert("Account created successfully! Logging you in...");
            await login(newProfile, newProfile.session_id); // Log them in automatically
            navigate('/');
          }
        } catch (signupError) {
          console.error("Signup error details:", signupError);
          const message = signupError instanceof Error ? signupError.message : '';
          alert(message.includes('username_taken')
            ? "This username is already taken. Please choose another one."
            : "Could not create account. Please check database permissions or try again.");
        }
      } else {
        // --- Secure Standard Login Logic (verified server-side via rpc_login) ---
        const profile = await loginWithPin(username, pin);

        if (!profile) {
          await new Promise(resolve => setTimeout(resolve, 800));
          alert("Invalid username or PIN.");
        } else {
          delete (profile as Partial<typeof profile>).pin_hash;
          await login(profile, profile.session_id);
          navigate('/');
        }
      }
    } catch (err) {
      console.error("Authentication error:", err);
      alert("An unexpected error occurred during authentication.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-charcoal-900 text-charcoal-50">
      <form onSubmit={handleAction} className="p-8 bg-charcoal-800 rounded-xl w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center">{mode === 'signup' ? 'Create Account' : 'Login'}</h1>

        {/* Username Input - Used in both modes */}
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

        {/* PIN Input - Used in both modes */}
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
          {loading ? 'Processing...' : (mode === 'signup' ? 'Sign Up' : 'Login')}
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
            <button
              type="button"
              onClick={() => setMode('signup')}
              className="underline block w-full text-green-400 hover:text-green-300"
            >
              Create a new profile (New Player)
            </button>
          )}
        </div>
      </form>
    </div>
  );
}