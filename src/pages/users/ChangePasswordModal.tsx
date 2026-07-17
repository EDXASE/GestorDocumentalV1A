import { useEffect, useRef, useState } from 'react';
import { X, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import type { ProfileWithRole } from '../../types/database';

interface ChangePasswordModalProps {
  open: boolean;
  user: ProfileWithRole | null;
  onClose: () => void;
  onSubmit: (userId: string, newPassword: string) => Promise<{ error: string | null }>;
}

function PasswordStrength({ password }: { password: string }) {
  const len = password.length;
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  const score = [len >= 8, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;

  if (!password) return null;

  const levels = [
    { min: 0, label: 'Muy débil', color: 'bg-rose-500', width: 'w-1/4' },
    { min: 1, label: 'Débil', color: 'bg-orange-500', width: 'w-2/4' },
    { min: 2, label: 'Regular', color: 'bg-amber-500', width: 'w-3/4' },
    { min: 3, label: 'Fuerte', color: 'bg-emerald-500', width: 'w-full' },
  ];
  const level = levels[Math.min(score, 3)];

  return (
    <div className="mt-2">
      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${level.color} ${level.width}`} />
      </div>
      <p className={`text-xs mt-1 font-medium`} style={{ color: '' }}>
        <span className="text-slate-400">Fortaleza: </span>
        <span className={score >= 3 ? 'text-emerald-600' : score >= 2 ? 'text-amber-600' : 'text-rose-600'}>
          {level.label}
        </span>
      </p>
    </div>
  );
}

export function ChangePasswordModal({
  open,
  user,
  onClose,
  onSubmit,
}: ChangePasswordModalProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showCf, setShowCf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPassword('');
      setConfirm('');
      setError(null);
      setSaving(false);
      setShowPw(false);
      setShowCf(false);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!password) { setError('La contraseña es obligatoria.'); return; }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    if (!user) return;

    setSaving(true);
    const { error: submitErr } = await onSubmit(user.id, password);
    setSaving(false);
    if (submitErr) { setError(submitErr); } else { onClose(); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Lock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Cambiar Contraseña</h3>
              <p className="text-xs text-slate-500">@{user?.username}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              La nueva contraseña será definida por el Administrador y deberá comunicársela al usuario de forma segura.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              {error}
            </div>
          )}

          {/* Nueva contraseña */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Nueva contraseña <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                ref={inputRef}
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition"
              />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <PasswordStrength password={password} />
          </div>

          {/* Confirmar */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Confirmar contraseña <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type={showCf ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repite la contraseña"
                className={`w-full pl-9 pr-10 py-2.5 rounded-xl border text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition ${
                  confirm && confirm !== password ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                }`}
              />
              <button type="button" onClick={() => setShowCf(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                {showCf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirm && confirm !== password && (
              <p className="mt-1 text-xs text-rose-500">Las contraseñas no coinciden.</p>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : 'Cambiar contraseña'}
          </button>
        </div>
      </div>
    </div>
  );
}
