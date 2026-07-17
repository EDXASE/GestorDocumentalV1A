import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { ProfileWithRole, RoleName } from '../types/database';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function toInternalEmail(username: string): string {
  return `${username.toLowerCase().trim()}@gestor.internal`;
}

export interface BranchAccess {
  branchId: string;
  can_caja_general: boolean;
  can_caja_chica: boolean;
}

export type SessionValidationResult =
  | {
      valid: true;
      role: RoleName;
      profile: ProfileWithRole;
      assignedBranchIds: string[] | null;
      assignedBranches: BranchAccess[] | null;
    }
  | { valid: false; reason: string };

async function callValidateSession(
  accessToken: string,
): Promise<SessionValidationResult> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/validate-session`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Apikey: SUPABASE_ANON_KEY,
      },
    });
    const data = await res.json();
    if (!res.ok || !data.valid) {
      return { valid: false, reason: data.reason ?? 'UNKNOWN' };
    }
    return {
      valid: true,
      role: data.role,
      profile: data.profile,
      assignedBranchIds: data.assignedBranchIds ?? null,
      assignedBranches: data.assignedBranches ?? null,
    };
  } catch {
    return { valid: false, reason: 'NETWORK_ERROR' };
  }
}

interface AuthContextValue {
  session: Session | null;
  profile: ProfileWithRole | null;
  loading: boolean;
  assignedBranchIds: string[] | null;
  assignedBranches: BranchAccess[] | null;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileWithRole | null>(null);
  const [assignedBranchIds, setAssignedBranchIds] = useState<string[] | null>(null);
  const [assignedBranches, setAssignedBranches] = useState<BranchAccess[] | null>(null);
  const [loading, setLoading] = useState(true);

  const applyValidationResult = useCallback((result: SessionValidationResult) => {
    if (result.valid) {
      setProfile(result.profile);
      setAssignedBranchIds(result.assignedBranchIds);
      setAssignedBranches(result.assignedBranches);
    } else {
      setProfile(null);
      setAssignedBranchIds(null);
      setAssignedBranches(null);
    }
  }, []);

  const refreshProfile = useCallback(async (accessToken?: string) => {
    const token =
      accessToken ?? (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    const result = await callValidateSession(token);
    applyValidationResult(result);
  }, [applyValidationResult]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      setSession(s);
      if (s?.access_token) {
        refreshProfile(s.access_token).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.access_token) {
        (async () => {
          await refreshProfile(newSession.access_token);
          setLoading(false);
        })();
      } else {
        setProfile(null);
        setAssignedBranchIds(null);
        setAssignedBranches(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [refreshProfile]);

  const signIn = useCallback(
    async (username: string, password: string): Promise<{ error: string | null }> => {
      const email = toInternalEmail(username);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) return { error: 'Usuario o contraseña incorrectos.' };

      const result = await callValidateSession(data.session.access_token);
      if (!result.valid) {
        await supabase.auth.signOut();
        if (result.reason === 'INACTIVE_USER') {
          return { error: 'Tu cuenta se encuentra INACTIVA. Contacta al administrador.' };
        }
        if (result.reason === 'PROFILE_NOT_FOUND') {
          return { error: 'Perfil de usuario no encontrado. Contacta al administrador.' };
        }
        return { error: 'Error de validacion. Intenta nuevamente.' };
      }

      applyValidationResult(result);

      supabase.from('audit_log').insert({
        user_id: result.profile.id,
        action: 'LOGIN',
        entity_type: 'auth',
        entity_id: result.profile.id,
        details: { role: result.role },
        user_agent: navigator.userAgent.substring(0, 200),
      }).then(() => {});

      return { error: null };
    },
    [applyValidationResult],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
    setAssignedBranchIds(null);
    setAssignedBranches(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, assignedBranchIds, assignedBranches, signIn, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

export function useCurrentRole(): RoleName | undefined {
  return useAuth().profile?.role?.name;
}

export function useBranchAccess(branchId: string | undefined): boolean {
  const { assignedBranchIds } = useAuth();
  if (!branchId) return false;
  if (assignedBranchIds === null) return true;
  return assignedBranchIds.includes(branchId);
}
