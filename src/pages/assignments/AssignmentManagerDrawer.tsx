import { useEffect, useState, useCallback } from 'react';
import {
  X, Network, Building2, CheckCircle2, XCircle,
  PlusCircle, Loader2, FolderOpen, Wallet,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Branch, BranchProcessorAssignment, ProfileWithRole } from '../../types/database';

// ── Types ─────────────────────────────────────────────────────────────────────
type AssignmentStatus = 'none' | 'active' | 'inactive';

interface BranchSlot {
  branch: Branch;
  assignment: BranchProcessorAssignment | null;
  status: AssignmentStatus;
  pending: AssignmentStatus | null;
  // Current section access
  can_caja_general: boolean;
  can_caja_chica: boolean;
  // Pending section changes (null = no change)
  pendingCG: boolean | null;
  pendingCC: boolean | null;
}

interface AssignmentManagerDrawerProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  processor?: ProfileWithRole | null;
  processors: ProfileWithRole[];
  branches: Branch[];
  adminProfileId: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function AssignmentManagerDrawer({
  open,
  onClose,
  onSaved,
  processor: initialProcessor,
  processors,
  branches,
  adminProfileId,
}: AssignmentManagerDrawerProps) {
  const isNewMode = !initialProcessor;

  const [selectedProcessorId, setSelectedProcessorId] = useState<string>('');
  const [slots, setSlots] = useState<BranchSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeProcessor = isNewMode
    ? processors.find((p) => p.id === selectedProcessorId) ?? null
    : initialProcessor;

  useEffect(() => {
    const pid = activeProcessor?.id;
    if (!open || !pid) { setSlots([]); return; }
    setLoadingSlots(true);
    setError(null);

    supabase
      .from('branch_processor_assignments')
      .select('*')
      .eq('processor_id', pid)
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); setLoadingSlots(false); return; }

        const existing = (data ?? []) as BranchProcessorAssignment[];
        const assignmentMap = new Map(existing.map((a) => [a.branch_id, a]));

        const built: BranchSlot[] = branches.map((branch) => {
          const assignment = assignmentMap.get(branch.id) ?? null;
          const status: AssignmentStatus = assignment
            ? (assignment.is_active ? 'active' : 'inactive')
            : 'none';
          return {
            branch,
            assignment,
            status,
            pending: null,
            can_caja_general: assignment?.can_caja_general ?? true,
            can_caja_chica: assignment?.can_caja_chica ?? true,
            pendingCG: null,
            pendingCC: null,
          };
        });

        setSlots(built);
        setLoadingSlots(false);
      });
  }, [open, activeProcessor?.id, branches]);

  useEffect(() => {
    if (open) {
      setSelectedProcessorId(isNewMode ? '' : (initialProcessor?.id ?? ''));
      setError(null);
      setSaving(false);
    }
  }, [open, isNewMode, initialProcessor?.id]);

  const setPending = useCallback((branchId: string, target: AssignmentStatus) => {
    setSlots((prev) =>
      prev.map((s) => {
        if (s.branch.id !== branchId) return s;
        const newPending = target === s.status ? null : target;
        return { ...s, pending: newPending };
      }),
    );
  }, []);

  const setSectionPending = useCallback((branchId: string, field: 'CG' | 'CC', value: boolean) => {
    setSlots((prev) =>
      prev.map((s) => {
        if (s.branch.id !== branchId) return s;
        if (field === 'CG') {
          const newVal = value === s.can_caja_general ? null : value;
          return { ...s, pendingCG: newVal };
        }
        const newVal = value === s.can_caja_chica ? null : value;
        return { ...s, pendingCC: newVal };
      }),
    );
  }, []);

  const pendingCount = slots.filter((s) =>
    s.pending !== null || s.pendingCG !== null || s.pendingCC !== null
  ).length;

  const handleSave = async () => {
    if (!activeProcessor) return;
    const changes = slots.filter((s) => s.pending !== null || s.pendingCG !== null || s.pendingCC !== null);
    if (changes.length === 0) { onClose(); return; }

    setSaving(true);
    setError(null);

    for (const slot of changes) {
      const effectiveStatus = slot.pending ?? slot.status;
      const effectiveCG = slot.pendingCG !== null ? slot.pendingCG : slot.can_caja_general;
      const effectiveCC = slot.pendingCC !== null ? slot.pendingCC : slot.can_caja_chica;

      if (slot.assignment === null && effectiveStatus === 'active') {
        const { error: err } = await supabase
          .from('branch_processor_assignments')
          .insert({
            processor_id: activeProcessor.id,
            branch_id: slot.branch.id,
            is_active: true,
            can_caja_general: effectiveCG,
            can_caja_chica: effectiveCC,
          });
        if (err) { setError(err.message); setSaving(false); return; }
      } else if (slot.assignment !== null) {
        const { error: err } = await supabase
          .from('branch_processor_assignments')
          .update({
            is_active: effectiveStatus === 'active',
            can_caja_general: effectiveCG,
            can_caja_chica: effectiveCC,
          })
          .eq('id', slot.assignment.id);
        if (err) { setError(err.message); setSaving(false); return; }
      }
    }

    await supabase.from('audit_log').insert({
      user_id: adminProfileId,
      action: 'UPDATE_PROCESSOR_ASSIGNMENTS',
      entity_type: 'processor',
      entity_id: activeProcessor.id,
      details: {
        changes: changes.map((s) => ({
          branch_id: s.branch.id,
          branch_name: s.branch.name,
          status_from: s.status,
          status_to: s.pending ?? s.status,
          cg_from: s.can_caja_general,
          cg_to: s.pendingCG !== null ? s.pendingCG : s.can_caja_general,
          cc_from: s.can_caja_chica,
          cc_to: s.pendingCC !== null ? s.pendingCC : s.can_caja_chica,
        })),
      },
    });

    setSaving(false);
    onSaved();
    onClose();
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {open && <div className="fixed inset-0 bg-slate-900/40 z-40" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[520px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
              <Network className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {isNewMode ? 'Nueva Asignación' : 'Gestionar Asignaciones'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {activeProcessor ? `@${activeProcessor.username} — ${activeProcessor.full_name}` : 'Selecciona un procesador'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Processor selector */}
        {isNewMode && (
          <div className="px-6 py-4 border-b border-slate-100 flex-shrink-0">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Procesador <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedProcessorId}
              onChange={(e) => { setSelectedProcessorId(e.target.value); setSlots([]); }}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm appearance-none bg-white"
            >
              <option value="">Seleccionar procesador...</option>
              {processors.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name} (@{p.username})</option>
              ))}
            </select>
          </div>
        )}

        {/* Branch list */}
        <div className="flex-1 overflow-y-auto">
          {!activeProcessor && isNewMode ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                <Network className="w-7 h-7 text-slate-300" />
              </div>
              <p className="text-sm text-slate-400 text-center px-8">
                Selecciona un procesador para ver y gestionar sus sucursales y secciones asignadas.
              </p>
            </div>
          ) : loadingSlots ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : (
            <div className="px-4 py-4 space-y-2">
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm mb-3">{error}</div>
              )}

              {/* Legend */}
              <div className="flex items-center gap-3 px-2 pb-2 flex-wrap">
                <LegendItem color="emerald" label="Activa" />
                <LegendItem color="rose" label="Inactiva" />
                <LegendItem color="slate" label="Sin asignar" />
              </div>

              {branches.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No hay sucursales disponibles.</p>
              ) : (
                slots.map((slot) => (
                  <BranchSlotRow
                    key={slot.branch.id}
                    slot={slot}
                    onSet={setPending}
                    onSetSection={setSectionPending}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {activeProcessor && (
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
            {pendingCount > 0 && (
              <p className="text-xs text-blue-600 font-medium mb-3 text-center">
                {pendingCount} cambio{pendingCount !== 1 ? 's' : ''} pendiente{pendingCount !== 1 ? 's' : ''} — no olvidés guardar
              </p>
            )}
            <div className="flex gap-3">
              <button onClick={onClose} disabled={saving}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving || pendingCount === 0}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
                {saving
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : pendingCount === 0 ? 'Sin cambios' : `Guardar (${pendingCount})`}
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

// ── BranchSlotRow ─────────────────────────────────────────────────────────────
function BranchSlotRow({
  slot,
  onSet,
  onSetSection,
}: {
  slot: BranchSlot;
  onSet: (branchId: string, target: AssignmentStatus) => void;
  onSetSection: (branchId: string, field: 'CG' | 'CC', value: boolean) => void;
}) {
  const effective = slot.pending ?? slot.status;
  const effectiveCG = slot.pendingCG !== null ? slot.pendingCG : slot.can_caja_general;
  const effectiveCC = slot.pendingCC !== null ? slot.pendingCC : slot.can_caja_chica;
  const hasChange = slot.pending !== null || slot.pendingCG !== null || slot.pendingCC !== null;
  const isActive = effective === 'active';

  return (
    <div className={`rounded-xl border transition-all ${
      hasChange ? 'border-blue-300 bg-blue-50/60' : 'border-slate-100 bg-white hover:border-slate-200'
    }`}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
          slot.branch.is_active ? 'bg-slate-700' : 'bg-slate-300'
        }`}>
          <Building2 className="w-4 h-4 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{slot.branch.name}</p>
          <p className="text-xs font-mono text-slate-400">{slot.branch.code}</p>
        </div>

        <StatusIcon status={effective} changed={hasChange} />

        <div className="flex items-center gap-1 flex-shrink-0">
          {effective === 'none' && (
            <ActionBtn label="Asignar" icon={<PlusCircle className="w-3.5 h-3.5" />}
              onClick={() => onSet(slot.branch.id, 'active')} color="blue" />
          )}
          {effective === 'active' && (
            <ActionBtn label="Inactivar" icon={<XCircle className="w-3.5 h-3.5" />}
              onClick={() => onSet(slot.branch.id, 'inactive')} color="rose" />
          )}
          {effective === 'inactive' && (
            <ActionBtn label="Activar" icon={<CheckCircle2 className="w-3.5 h-3.5" />}
              onClick={() => onSet(slot.branch.id, 'active')} color="emerald" />
          )}
          {hasChange && (
            <button
              onClick={() => {
                onSet(slot.branch.id, slot.status);
                if (slot.pendingCG !== null) onSetSection(slot.branch.id, 'CG', slot.can_caja_general);
                if (slot.pendingCC !== null) onSetSection(slot.branch.id, 'CC', slot.can_caja_chica);
              }}
              className="px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              title="Deshacer"
            >
              ↩
            </button>
          )}
        </div>
      </div>

      {/* Section access (only when active or being activated) */}
      {isActive && (
        <div className="px-4 pb-3 flex items-center gap-2 border-t border-slate-100 pt-2.5">
          <span className="text-xs text-slate-500 mr-1">Secciones:</span>
          <SectionToggle
            icon={<FolderOpen className="w-3 h-3" />}
            label="Caja General"
            active={effectiveCG}
            changed={slot.pendingCG !== null}
            onToggle={() => onSetSection(slot.branch.id, 'CG', !effectiveCG)}
          />
          <SectionToggle
            icon={<Wallet className="w-3 h-3" />}
            label="Caja Chica"
            active={effectiveCC}
            changed={slot.pendingCC !== null}
            onToggle={() => onSetSection(slot.branch.id, 'CC', !effectiveCC)}
          />
        </div>
      )}
    </div>
  );
}

function SectionToggle({ icon, label, active, changed, onToggle }: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  changed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
        active
          ? changed
            ? 'bg-blue-100 border-blue-400 text-blue-700'
            : 'bg-emerald-50 border-emerald-300 text-emerald-700'
          : changed
            ? 'bg-blue-50 border-blue-300 text-blue-500 line-through opacity-70'
            : 'bg-slate-50 border-slate-200 text-slate-400'
      }`}
    >
      {icon}
      {label}
      <span className={`w-1.5 h-1.5 rounded-full ml-0.5 ${active ? 'bg-emerald-400' : 'bg-slate-300'}`} />
    </button>
  );
}

function StatusIcon({ status, changed }: { status: AssignmentStatus; changed: boolean }) {
  if (status === 'active') return (
    <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
      changed ? 'bg-emerald-200 text-emerald-800' : 'bg-emerald-100 text-emerald-700'
    }`}>
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Activa
    </span>
  );
  if (status === 'inactive') return (
    <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
      changed ? 'bg-rose-200 text-rose-800' : 'bg-rose-100 text-rose-600'
    }`}>
      <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />Inactiva
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />Sin asignar
    </span>
  );
}

function ActionBtn({ label, icon, onClick, color }: {
  label: string; icon: React.ReactNode; onClick: () => void; color: 'blue' | 'rose' | 'emerald';
}) {
  const colors = {
    blue:    'text-blue-600 hover:bg-blue-100 border-blue-200',
    rose:    'text-rose-600 hover:bg-rose-100 border-rose-200',
    emerald: 'text-emerald-600 hover:bg-emerald-100 border-emerald-200',
  };
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition ${colors[color]}`}>
      {icon} {label}
    </button>
  );
}

function LegendItem({ color, label }: { color: 'emerald' | 'rose' | 'slate'; label: string }) {
  const dot = { emerald: 'bg-emerald-500', rose: 'bg-rose-400', slate: 'bg-slate-300' };
  return (
    <span className="flex items-center gap-1 text-xs text-slate-500">
      <span className={`w-2 h-2 rounded-full ${dot[color]}`} />{label}
    </span>
  );
}
