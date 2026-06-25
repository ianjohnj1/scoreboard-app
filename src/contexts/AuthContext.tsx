import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import type { Profile } from '../lib/supabase';
import { supabase } from '../lib/supabase';

type AuthContextType = {
  currentUser: Profile | null;
  sessionId: string | null;
  loading: boolean;
  login: (profile: Profile) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('sk_user');
      const storedSession = localStorage.getItem('sk_session_id');

      if (storedUser) setCurrentUser(JSON.parse(storedUser));
      if (storedSession) setSessionId(storedSession);
    } catch {
      console.warn('Failed to parse stored auth data');
    }

    setLoading(false);
  }, []);

  const login = useCallback(async (profile: Profile) => {
    setCurrentUser(profile);
    localStorage.setItem('sk_user', JSON.stringify(profile));

    // Create/update active session
    const { data: existing } = await supabase
      .from('active_sessions')
      .select('id')
      .eq('profile_id', profile.id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('active_sessions')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', existing.id);

      setSessionId(existing.id);
      localStorage.setItem('sk_session_id', existing.id);
    } else {
      const { data } = await supabase
        .from('active_sessions')
        .insert({
          profile_id: profile.id,
          last_seen: new Date().toISOString(),
        })
        .select()
        .single();

      if (data) {
        setSessionId(data.id);
        localStorage.setItem('sk_session_id', data.id);
      }
    }
  }, []);

  const logout = useCallback(async () => {
    if (sessionId) {
      await supabase.from('active_sessions').delete().eq('id', sessionId);
    }

    setCurrentUser(null);
    setSessionId(null);

    localStorage.removeItem('sk_user');
    localStorage.removeItem('sk_session_id');
  }, [sessionId]);

  // Heartbeat every 30s
  useEffect(() => {
    if (!sessionId) return;

    const interval = setInterval(async () => {
      await supabase
        .from('active_sessions')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', sessionId);
    }, 30000);

    return () => clearInterval(interval);
  }, [sessionId]);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        sessionId,
        loading,
        login,
        logout,
        isAdmin: currentUser?.is_admin ?? false,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
};
