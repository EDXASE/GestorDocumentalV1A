import { useState, type FormEvent } from 'react';
import { Sparkles, Mail, Lock, ArrowRight, AlertCircle, Eye, EyeOff, ShieldCheck, MessagesSquare, BarChart3 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

const DEMO_ACCOUNTS = [
  { email: 'laura@crmcorp.com', label: 'Laura Méndez', role: 'Gerente' },
  { email: 'carlos@crmcorp.com', label: 'Carlos Ruiz', role: 'Asesor' },
  { email: 'sofia@crmcorp.com', label: 'Sofía Castro', role: 'Asesor' },
];

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      const msg = signInError.message.toLowerCase();
      if (msg.includes('invalid login credentials')) {
        setError('Correo o contraseña incorrectos. Verifica tus credenciales.');
      } else if (msg.includes('email not confirmed')) {
        setError('Tu cuenta no ha sido confirmada. Contacta al administrador.');
      } else if (msg.includes('rate limit') || msg.includes('too many')) {
        setError('Demasiados intentos. Espera unos segundos e inténtalo de nuevo.');
      } else {
        setError(signInError.message);
      }
      setLoading(false);
      return;
    }

    // On success, onAuthStateChange in SessionProvider will pick up the session.
    // Keep loading true so the spinner stays until the app swaps to the CRM shell.
  }

  function fillDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword('NexusCRM2026!');
    setError(null);
  }

  return (
    <div className="min-h-screen flex bg-ink-50">
      {/* Left panel — brand / marketing */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[56%] relative overflow-hidden bg-ink-950">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-700 via-brand-600 to-ink-950" />
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-brand-400/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-brand-300/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 text-white w-full">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center ring-1 ring-white/20">
              <Sparkles size={22} className="text-white" />
            </div>
            <div className="leading-tight">
              <p className="font-display font-800 text-xl tracking-tight">Nexus CRM</p>
              <p className="text-[11px] text-white/60 uppercase tracking-widest">Omnicanal · BI</p>
            </div>
          </div>

          <div className="max-w-md">
            <h1 className="font-display font-800 text-4xl xl:text-5xl leading-[1.1] tracking-tight text-balance">
              La plataforma comercial que tu equipo merece.
            </h1>
            <p className="mt-5 text-white/70 text-base leading-relaxed">
              Centraliza WhatsApp, Messenger e Instagram. Cotiza en segundos, automatiza el seguimiento y toma decisiones con inteligencia de negocio en tiempo real.
            </p>

            <div className="mt-10 space-y-4">
              {[
                { icon: MessagesSquare, title: 'Bandeja omnicanal', desc: 'Todos los canales en una sola vista' },
                { icon: BarChart3, title: 'Inteligencia de negocio', desc: 'KPIs, embudo y análisis para Power BI' },
                { icon: ShieldCheck, title: 'Auditoría y roles', desc: 'Control de seguridad y registro inmutable' },
              ].map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.title} className="flex items-start gap-3.5">
                    <div className="h-10 w-10 rounded-xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center shrink-0">
                      <Icon size={18} className="text-white" />
                    </div>
                    <div className="leading-tight pt-1">
                      <p className="font-600 text-white">{f.title}</p>
                      <p className="text-sm text-white/55">{f.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} Nexus CRM. Todos los derechos reservados.
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8 justify-center">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 flex items-center justify-center shadow-lg">
              <Sparkles size={20} className="text-white" />
            </div>
            <div className="leading-tight">
              <p className="font-display font-800 text-white text-lg tracking-tight">Nexus CRM</p>
              <p className="text-[10px] text-ink-400 uppercase tracking-widest">Omnicanal · BI</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="font-display font-800 text-ink-950 text-2xl tracking-tight">Iniciar sesión</h2>
            <p className="text-sm text-ink-500 mt-1.5">
              Accede a tu panel comercial con tus credenciales corporativas.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-xs font-700 text-ink-600 mb-1.5 uppercase tracking-wide">
                Correo corporativo
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@crmcorp.com"
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-ink-200 bg-white text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-700 text-ink-600 mb-1.5 uppercase tracking-wide">
                Contraseña
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-10 py-2.5 rounded-lg border border-ink-200 bg-white text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 transition p-1"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm animate-fade-in">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-600 transition-all duration-150',
                'bg-brand-600 text-white hover:bg-brand-700 active:scale-[0.99] shadow-sm',
                'disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100'
              )}
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Verificando…
                </>
              ) : (
                <>
                  Entrar
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Demo accounts */}
          <div className="mt-8 pt-6 border-t border-ink-200">
            <p className="text-[11px] font-700 uppercase tracking-widest text-ink-400 mb-3">
              Cuentas demo — un clic para autocompletar
            </p>
            <div className="space-y-2">
              {DEMO_ACCOUNTS.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => fillDemo(d.email)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-ink-200 bg-white hover:bg-ink-50 hover:border-ink-300 transition text-left group"
                >
                  <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-700 shrink-0">
                    {d.label.split(' ').map((p) => p[0]).join('').slice(0, 2)}
                  </div>
                  <div className="leading-tight min-w-0 flex-1">
                    <p className="text-sm font-600 text-ink-900 truncate">{d.label}</p>
                    <p className="text-[11px] text-ink-500 truncate">{d.email}</p>
                  </div>
                  <span className="chip bg-ink-100 text-ink-600 text-[10px] font-600 uppercase tracking-wide">
                    {d.role}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-ink-400 leading-relaxed">
              Contraseña demo: <span className="font-600 text-ink-600 font-mono">NexusCRM2026!</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
