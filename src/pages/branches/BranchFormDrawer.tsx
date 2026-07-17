import { useEffect, useRef, useState } from 'react';
import { X, Hash, Building2 } from 'lucide-react';
import type { Branch } from '../../types/database';

export interface BranchFormData {
  code: string;
  name: string;
  is_active: boolean;
}

interface BranchFormDrawerProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: BranchFormData) => Promise<{ error: string | null }>;
  editBranch?: Branch | null;
}

const EMPTY: BranchFormData = { code: '', name: '', is_active: true };

function fromBranch(b: Branch): BranchFormData {
  return { code: b.code, name: b.name, is_active: b.is_active };
}

export function BranchFormDrawer({ open, onClose, onSubmit, editBranch }: BranchFormDrawerProps) {
  const isEdit = !!editBranch;
  const [form, setForm] = useState<BranchFormData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm(editBranch ? fromBranch(editBranch) : EMPTY);
      setError(null);
      setSaving(false);
      setTimeout(() => nameRef.current?.focus(), 80);
    }
  }, [open, editBranch]);

  const set = (k: keyof BranchFormData, v: string | boolean) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const code = form.code.trim().toUpperCase();
    const name = form.name.trim();
    if (!code) { setError('El código es obligatorio.'); return; }
    if (!/^[A-Z0-9-_]+$/.test(code)) { setError('El código solo puede contener letras, números, guiones y guiones bajos.'); return; }
    if (!name) { setError('El nombre es obligatorio.'); return; }
    setSaving(true);
    const { error: e2 } = await onSubmit({ code, name, is_active: form.is_active });
    setSaving(false);
    if (e2) { setError(e2); } else { onClose(); }
  };

  return (
    <>
      {open && <div className="fixed inset-0 bg-slate-900/40 z-40" onClick={onClose} />}
      <aside className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {isEdit ? 'Editar Sucursal' : 'Nueva Sucursal'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isEdit ? `Modificando: ${editBranch?.code}` : 'Completa los datos de la sucursal'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              <span className="font-medium">Error:</span> {error}
            </div>
          )}

          {/* Código */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Código <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={form.code}
                onChange={(e) => set('code', e.target.value.toUpperCase().replace(/\s/g, ''))}
                placeholder="Ej: SUC-001"
                disabled={isEdit}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-mono tracking-wide transition disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
              />
            </div>
            {isEdit
              ? <p className="mt-1 text-xs text-slate-400">El código no se puede cambiar.</p>
              : <p className="mt-1 text-xs text-slate-400">Letras, números, guiones. Se convierte a mayúsculas.</p>
            }
          </div>

          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Nombre <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                ref={nameRef}
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Ej: Sucursal Centro"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition"
              />
            </div>
          </div>

          {/* Estado */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Estado</label>
            <div className="flex gap-3">
              {([true, false] as const).map((val) => (
                <button key={String(val)} type="button" onClick={() => set('is_active', val)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    form.is_active === val
                      ? val ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-rose-50 border-rose-400 text-rose-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}>
                  <span className={`w-2 h-2 rounded-full ${val ? 'bg-emerald-500' : 'bg-rose-400'}`} />
                  {val ? 'Activa' : 'Inactiva'}
                </button>
              ))}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex gap-3 flex-shrink-0 bg-slate-50">
          <button type="button" onClick={onClose} disabled={saving}
            className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-60 flex items-center justify-center gap-2">
            {saving
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : isEdit ? 'Guardar cambios' : 'Crear sucursal'}
          </button>
        </div>
      </aside>
    </>
  );
}
