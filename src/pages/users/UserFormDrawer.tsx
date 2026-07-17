import { useEffect, useRef, useState } from 'react';
import { X, Eye, EyeOff, User, Lock, ShieldCheck, Building2 } from 'lucide-react';
import type { Branch, ProfileWithRole, RoleName } from '../../types/database';
import { ROLE_LABELS, ALL_ROLES } from '../../types/roles';

export interface UserFormData {
  full_name: string;
  username: string;
  password: string;
  role_name: RoleName | '';
  branch_id: string;
  is_active: boolean;
}

interface UserFormDrawerProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: UserFormData) => Promise<{ error: string | null }>;
  editUser?: ProfileWithRole | null;
  branches: Branch[];
}

const EMPTY_FORM: UserFormData = {
  full_name: '',
  username: '',
  password: '',
  role_name: '',
  branch_id: '',
  is_active: true,
};

function fieldFromUser(user: ProfileWithRole): UserFormData {
  return {
    full_name: user.full_name,
    username: user.username,
    password: '',
    role_name: user.role?.name ?? '',
    branch_id: user.branch_id ?? '',
    is_active: user.is_active,
  };
}

const ROLE_COLORS: Record<RoleName, string> = {
  ADMINISTRADOR: 'bg-blue-50 text-blue-700 border-blue-200',
  CARGADOR: 'bg-amber-50 text-amber-700 border-amber-200',
  PROCESADOR: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CONSULTOR: 'bg-slate-100 text-slate-700 border-slate-200',
};

export function UserFormDrawer({
  open,
  onClose,
  onSubmit,
  editUser,
  branches,
}: UserFormDrawerProps) {
  const isEdit = !!editUser;
  const [form, setForm] = useState<UserFormData>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm(editUser ? fieldFromUser(editUser) : EMPTY_FORM);
      setError(null);
      setSaving(false);
      setShowPassword(false);
      setTimeout(() => firstInputRef.current?.focus(), 80);
    }
  }, [open, editUser]);

  const set = (key: keyof UserFormData, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const branchRequired = form.role_name === 'CARGADOR';
  const showBranchNote = form.role_name === 'PROCESADOR';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.full_name.trim()) { setError('El nombre es obligatorio.'); return; }
    if (!form.username.trim()) { setError('El usuario es obligatorio.'); return; }
    if (!isEdit && !form.password) { setError('La contraseña es obligatoria al crear el usuario.'); return; }
    if (!form.role_name) { setError('Selecciona un rol.'); return; }
    if (branchRequired && !form.branch_id) { setError('La sucursal es obligatoria para el rol Cargador.'); return; }

    setSaving(true);
    const { error: submitErr } = await onSubmit(form);
    setSaving(false);
    if (submitErr) {
      setError(submitErr);
    } else {
      onClose();
    }
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-slate-900/40 z-40 transition-opacity" onClick={onClose} />
      )}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[460px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {isEdit ? 'Editar Usuario' : 'Nuevo Usuario'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isEdit ? `Modificando: @${editUser?.username}` : 'Completa los datos del nuevo usuario'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-5">
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                <span className="font-medium">Error:</span> {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Nombre completo <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  ref={firstInputRef}
                  type="text"
                  value={form.full_name}
                  onChange={(e) => set('full_name', e.target.value)}
                  placeholder="Ej: Juan Perez"
                  required
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Usuario <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none select-none">@</span>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => set('username', e.target.value.toLowerCase().replace(/\s/g, ''))}
                  placeholder="juanperez"
                  required
                  disabled={isEdit}
                  className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
                />
              </div>
              {isEdit && <p className="mt-1 text-xs text-slate-400">El nombre de usuario no se puede cambiar.</p>}
            </div>

            {!isEdit && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Contraseña <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => set('password', e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition"
                  />
                  <button type="button" onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-400">La contraseña será definida por el administrador.</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Rol <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <select
                  value={form.role_name}
                  onChange={(e) => set('role_name', e.target.value)}
                  required
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition appearance-none bg-white"
                >
                  <option value="">Seleccionar rol...</option>
                  {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
              {form.role_name && (
                <div className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${ROLE_COLORS[form.role_name as RoleName]}`}>
                  <ShieldCheck className="w-3 h-3" />
                  {ROLE_LABELS[form.role_name as RoleName]}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Sucursal {branchRequired && <span className="text-rose-500">*</span>}
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <select
                  value={form.branch_id}
                  onChange={(e) => set('branch_id', e.target.value)}
                  required={branchRequired}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition appearance-none bg-white"
                >
                  <option value="">Sin sucursal asignada</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                </select>
              </div>
              {showBranchNote && (
                <p className="mt-1 text-xs text-amber-600">
                  Los Procesadores gestionan sus sucursales y secciones desde el módulo Asignaciones.
                </p>
              )}
              {branches.length === 0 && (
                <p className="mt-1 text-xs text-slate-400">No hay sucursales disponibles. Crea una desde el módulo Sucursales.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Estado</label>
              <div className="flex gap-3">
                {[true, false].map((val) => (
                  <button key={String(val)} type="button" onClick={() => set('is_active', val)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      form.is_active === val
                        ? val ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-rose-50 border-rose-400 text-rose-700'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}>
                    <span className={`w-2 h-2 rounded-full ${val ? 'bg-emerald-500' : 'bg-rose-400'}`} />
                    {val ? 'Activo' : 'Inactivo'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-slate-200 flex gap-3 flex-shrink-0 bg-slate-50">
          <button type="button" onClick={onClose} disabled={saving}
            className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-60 flex items-center justify-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : isEdit ? 'Guardar cambios' : 'Crear usuario'}
          </button>
        </div>
      </aside>
    </>
  );
}
