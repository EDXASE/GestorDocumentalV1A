import { useState, type FormEvent } from 'react';
import { FileText, LogIn, AlertCircle, User, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../router/Router';
import { ROLE_LABELS } from '../types/roles';
import type { RoleName } from '../types/database';

export function LoginPage() {
  const { signIn } = useAuth();
  const { navigate } = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Ingresa tu usuario y contraseña.');
      return;
    }
    setError(null);
    setLoading(true);
    const { error: loginError } = await signIn(username.trim(), password);
    setLoading(false);

    if (loginError) {
      setError(loginError);
      setPassword('');
      return;
    }

    // Redirect based on role (profile is now set in AuthContext after signIn)
    // We read it from context after the state updates via a small workaround:
    // navigate to dashboard first; the role-specific redirect is cosmetic here
    // since all roles can see /dashboard — but CARGADOR/PROCESADOR prefer /caja-general
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 items-center justify-center p-12">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-6 shadow-xl">
            <FileText className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">GESTOR</h1>
          <h2 className="text-2xl font-light text-blue-200 mb-6">DOCUMENTAL</h2>
          <p className="text-slate-400 leading-relaxed">
            Sistema empresarial de gestion de documentos de Caja General y Caja Chica
            con control de acceso por roles y auditoria completa.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4 text-left">
            {(
              [
                ['ADMINISTRADOR', 'Gestion total del sistema'],
                ['CARGADOR', 'Carga de documentos'],
                ['PROCESADOR', 'Procesamiento y estados'],
                ['CONSULTOR', 'Consulta y reportes'],
              ] as [RoleName, string][]
            ).map(([role, desc]) => (
              <div key={role} className="bg-white/5 rounded-xl p-3 border border-white/10">
                <p className="text-xs font-semibold text-blue-300 mb-0.5">
                  {ROLE_LABELS[role]}
                </p>
                <p className="text-xs text-slate-400">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-xl bg-blue-600 flex items-center justify-center mb-3">
              <FileText className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-800">GESTOR DOCUMENTAL</h1>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
            <h2 className="text-2xl font-bold text-slate-800 mb-1">Bienvenido</h2>
            <p className="text-sm text-slate-500 mb-7">
              Ingresa tus credenciales para acceder al sistema
            </p>

            {error && (
              <div className="mb-5 flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200">
                <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-rose-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="username"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Usuario
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    id="username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={loading}
                    autoFocus
                    autoComplete="username"
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-slate-50 disabled:cursor-not-allowed"
                    placeholder="usuario"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Contrasena
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="current-password"
                    className="w-full pl-9 pr-11 py-2.5 rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-slate-50 disabled:cursor-not-allowed"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    Iniciar Sesion
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100">
              <p className="text-xs text-slate-400 text-center">
                Si no tienes credenciales, contacta al administrador del sistema
              </p>
            </div>
          </div>

          <p className="text-center text-xs text-slate-400 mt-5">
            GESTOR DOCUMENTAL &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
