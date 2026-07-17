import { useEffect, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from './Router';
import type { RoleName } from '../types/database';
import { LoadingScreen } from '../components/LoadingScreen';
import { ShieldX } from 'lucide-react';

// ── RequireAuth ────────────────────────────────────────────────────────────────
// Redirects unauthenticated users to /login.
// Also enforces that the profile (loaded via backend edge function) must exist.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const { navigate } = useRouter();

  useEffect(() => {
    if (!loading && !session) {
      navigate('/login');
    }
  }, [session, loading, navigate]);

  if (loading) return <LoadingScreen />;
  if (!session) return null;

  // Session exists but profile not loaded yet
  if (!profile) return <LoadingScreen />;

  return <>{children}</>;
}

// ── RequireRole ────────────────────────────────────────────────────────────────
// Renders children only if the user's role (from backend-validated profile)
// is in the `allowed` list. Redirects to /dashboard otherwise.
// The role is authoritative — it comes from the edge function, not from
// client-controlled state.
export function RequireRole({
  allowed,
  children,
}: {
  allowed: RoleName[];
  children: ReactNode;
}) {
  const { profile, loading } = useAuth();
  const { navigate } = useRouter();

  const userRole = profile?.role?.name as RoleName | undefined;
  const hasAccess = !!userRole && allowed.includes(userRole);

  useEffect(() => {
    if (!loading && profile && !hasAccess) {
      // Silently redirect — don't expose what was attempted
      navigate('/dashboard');
    }
  }, [loading, profile, hasAccess, navigate]);

  if (loading || !profile) return <LoadingScreen />;

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center">
          <ShieldX className="w-7 h-7 text-rose-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-700">Acceso denegado</h2>
        <p className="text-slate-500 text-sm text-center max-w-xs">
          No tienes permisos para acceder a esta seccion.
          Seras redirigido al panel principal.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

// ── PublicOnly ─────────────────────────────────────────────────────────────────
// Used for /login: redirects already-authenticated users to /dashboard.
export function PublicOnly({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const { navigate } = useRouter();

  useEffect(() => {
    if (!loading && session) {
      navigate('/dashboard');
    }
  }, [session, loading, navigate]);

  if (loading) return <LoadingScreen />;
  if (session) return null;

  return <>{children}</>;
}
