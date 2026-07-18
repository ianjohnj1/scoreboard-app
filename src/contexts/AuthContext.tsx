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
  connectionError: boolean;
  login: (profile: Profile) => Promise<void>;
  logout: () => Promise<void>;
  retryConnection: () => Promise<void>;
  isAdmin: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);

  const initializeAuth = useCallback(async () => {
    setLoading(true);
    setConnectionError(false);
    try {
      // Perform a lightweight "ping" to verify DNS/Connectivity
      const { error: pingError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .limit(1);
      
      if (pingError && (pingError.message?.includes('Failed to fetch') || pingError.code === 'PGRST301')) {
        throw new Error('Supabase unreachable');
      }

      const storedUser = localStorage.getItem('sk_user');
      const storedSession = localStorage.getItem('sk_session_id');

      if (storedUser) {
        const profile = JSON.parse(storedUser);
        setCurrentUser(profile);
        
        if (profile.id) {
          const { data: session } = await supabase
            .from('active_sessions')
            .select('id')
            .eq('profile_id', profile.id)
            .maybeSingle();

          if (session) {
            setSessionId(session.id);
            localStorage.setItem('sk_session_id', session.id);
          } else {
            const { data: newSession } = await supabase
              .from('active_sessions')
              .insert({
                profile_id: profile.id,
                last_seen: new Date().toISOString(),
              })
              .select()
              .single();

            if (newSession) {
              setSessionId(newSession.id);
              localStorage.setItem('sk_session_id', newSession.id);
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('Auth initialization failed:', err);
      // Catch net::ERR_NAME_NOT_RESOLVED (TypeError: Failed to fetch)
      if (err.message?.includes('Failed to fetch') || err.name === 'TypeError' || err.message === 'Supabase unreachable') {
        setConnectionError(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Load from localStorage on mount and ensure session exists
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  const retryConnection = useCallback(async () => {
    await initializeAuth();
  }, [initializeAuth]);

  const login = useCallback(async (profile: Profile) => {
    // Ensure sensitive data is not saved to localStorage
    const safeProfile = { ...profile };
    delete (safeProfile as any).pin_hash;

    setCurrentUser(safeProfile);
    localStorage.setItem('sk_user', JSON.stringify(safeProfile));

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
        connectionError,
        login,
        logout,
        retryConnection,
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
