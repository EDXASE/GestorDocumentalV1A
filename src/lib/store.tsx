import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, type Advisor } from './supabase';

type Role = 'asesor' | 'gerente' | 'admin';

type SessionUser = {
  id: string;
  authId: string;
  email: string;
  name: string;
  role: Role;
  avatar_color: string;
};

type SessionContextType = {
  user: SessionUser | null;
  advisor: Advisor | null;
  advisors: Advisor[];
  loading: boolean;
  session: Session | null;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionContextType | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [advisor, setAdvisor] = useState<Advisor | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('advisors')
      .select('*')
      .order('name', { ascending: true });
    if (!error && data) setAdvisors(data as Advisor[]);
  }, []);

  const resolveAdvisor = useCallback(async (authId: string) => {
    const { data, error } = await supabase
      .from('advisors')
      .select('*')
      .eq('user_id', authId)
      .maybeSingle();
    if (error) {
      setAdvisor(null);
      return;
    }
    setAdvisor(data as Advisor | null);
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        resolveAdvisor(data.session.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      (async () => {
        if (!mounted) return;
        setSession(newSession);
        if (newSession?.user) {
          await resolveAdvisor(newSession.user.id);
        } else {
          setAdvisor(null);
        }
        setLoading(false);
      })();
    });

    refresh();

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [refresh, resolveAdvisor]);

  const user = useMemo<SessionUser | null>(() => {
    if (!session?.user || !advisor) return null;
    return {
      id: advisor.id,
      authId: session.user.id,
      email: session.user.email ?? advisor.email ?? '',
      name: advisor.name,
      role: advisor.role as Role,
      avatar_color: advisor.avatar_color ?? '#1e6091',
    };
  }, [session, advisor]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setAdvisor(null);
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ user, advisor, advisors, loading, session, signOut, refresh }),
    [user, advisor, advisors, loading, session, signOut, refresh]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
