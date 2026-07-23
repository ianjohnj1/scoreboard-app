import {
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
  login: (profile: Profile, sessionId: string) => Promise<void>;
  logout: () => Promise<void>;
  retryConnection: () => Promise<void>;
  syncCurrentUser: (profile: Profile) => void;
  isAdmin: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);

  const sanitizeProfile = useCallback((profile: Profile) => {
    const safeProfile = { ...profile };
    delete (safeProfile as any).pin_hash;
    return safeProfile;
  }, []);

  const syncCurrentUser = useCallback((profile: Profile) => {
    const safeProfile = sanitizeProfile(profile);
    setCurrentUser(safeProfile);
    localStorage.setItem('sk_user', JSON.stringify(safeProfile));
  }, [sanitizeProfile]);

  const initializeAuth = useCallback(async () => {
    setLoading(true);
    setConnectionError(false);
    try {
      // Perform a lightweight "ping" to verify DNS/Connectivity
      const { error: pingError } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .limit(1);
      
      if (pingError && (pingError.message?.includes('Failed to fetch') || pingError.code === 'PGRST301')) {
        throw new Error('Supabase unreachable');
      }

      // The session id is the sole source of truth across reloads - it's opaque
      // and can't be forged into pointing at someone else's profile. We never try
      // to "recover" a session from a cached profile id anymore (that was the
      // session-forgery hole: anyone could fake sk_user and inherit a live session).
      const storedSessionId = localStorage.getItem('sk_session_id');
      if (storedSessionId) {
        const { data, error: resumeError } = await supabase.rpc('rpc_resume_session');
        const row = data?.[0];

        if (!resumeError && row) {
          const profile = sanitizeProfile({ ...row, pin_hash: null } as Profile);
          setCurrentUser(profile);
          setSessionId(storedSessionId);
          localStorage.setItem('sk_user', JSON.stringify(profile));
        } else {
          localStorage.removeItem('sk_user');
          localStorage.removeItem('sk_session_id');
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
  }, [sanitizeProfile]);

  // Load from localStorage on mount and ensure session exists
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  const retryConnection = useCallback(async () => {
    await initializeAuth();
  }, [initializeAuth]);

  const login = useCallback(async (profile: Profile, newSessionId: string) => {
    syncCurrentUser(profile);
    setSessionId(newSessionId);
    localStorage.setItem('sk_session_id', newSessionId);
  }, [syncCurrentUser]);

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
        syncCurrentUser,
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
