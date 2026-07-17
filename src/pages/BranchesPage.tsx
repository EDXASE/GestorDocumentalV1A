import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, Plus, Search, RefreshCw, Edit2, Eye,
  ToggleLeft, ToggleRight, ChevronLeft, ChevronRight,
  AlertTriangle, X, Hash,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Branch } from '../types/database';
import { BranchFormDrawer, type BranchFormData } from './branches/BranchFormDrawer';
import { BranchDetailModal } from './branches/BranchDetailModal';

const PAGE_SIZE = 10;

// ── Shared UI atoms ───────────────────────────────────────────────────────────
function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
      active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-rose-400'}`} />
      {active ? 'Activa' : 'Inactiva'}
    </span>
  );
}

function ConfirmDialog({
  open, title, message, confirmLabel, confirmClass, onConfirm, onCancel, loading,
}: {
  open: boolean; title: string; message: string; confirmLabel: string;
  confirmClass: string; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <h3 className="text-base font-bold text-slate-800">{title}</h3>
        </div>
        <p className="text-sm text-slate-500 mb-5">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={loading}
            className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition disabled:opacity-60 flex items-center justify-center gap-2 ${confirmClass}`}>
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Aggregate stats ───────────────────────────────────────────────────────────
interface BranchAggregate {
  userCount: number;
  processorCount: number;
  docCount: number;
}

async function fetchAggregates(
  branchIds: string[],
): Promise<Record<string, BranchAggregate>> {
  if (branchIds.length === 0) return {};

  const [usersRes, assignmentsRes, docsRes] = await Promise.all([
    supabase.from('profiles').select('branch_id').in('branch_id', branchIds),
    supabase.from('branch_processor_assignments').select('branch_id').in('branch_id', branchIds).eq('is_active', true),
    supabase.from('documents').select('branch_id').in('branch_id', branchIds),
  ]);

  const agg: Record<string, BranchAggregate> = {};
  branchIds.forEach((id) => { agg[id] = { userCount: 0, processorCount: 0, docCount: 0 }; });

  (usersRes.data ?? []).forEach((r) => { if (r.branch_id) agg[r.branch_id]!.userCount++; });
  (assignmentsRes.data ?? []).forEach((r) => { agg[r.branch_id]!.processorCount++; });
  (docsRes.data ?? []).forEach((r) => { agg[r.branch_id]!.docCount++; });

  return agg;
}

// ── Main page ────────────────────────────────────────────────────────────────
export function BranchesPage() {
  const { profile } = useAuth();

  // Data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [aggregates, setAggregates] = useState<Record<string, BranchAggregate>>({});
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Pagination
  const [page, setPage] = useState(1);

  // Panels
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);
  const [detailBranch, setDetailBranch] = useState<Branch | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Branch | null>(null);
  const [toggleLoading, setToggleLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setDataError(null);
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .order('name', { ascending: true });

    if (error) { setDataError(error.message); setLoading(false); return; }

    const list = (data ?? []) as Branch[];
    setBranches(list);

    const ids = list.map((b) => b.id);
    const agg = await fetchAggregates(ids);
    setAggregates(agg);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Filtered + paginated ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return branches.filter((b) => {
      if (q && !b.name.toLowerCase().includes(q) && !b.code.toLowerCase().includes(q)) return false;
      if (statusFilter === 'active' && !b.is_active) return false;
      if (statusFilter === 'inactive' && b.is_active) return false;
      return true;
    });
  }, [branches, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: branches.length,
    active: branches.filter((b) => b.is_active).length,
    inactive: branches.filter((b) => !b.is_active).length,
  }), [branches]);

  // ── Audit helper ──────────────────────────────────────────────────────────
  const writeAudit = useCallback(async (
    action: string,
    entityId: string,
    details: Record<string, unknown>,
  ) => {
    await supabase.from('audit_log').insert({
      user_id: profile?.id,
      action,
      entity_type: 'branch',
      entity_id: entityId,
      details,
    });
  }, [profile]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCreate = async (data: BranchFormData): Promise<{ error: string | null }> => {
    // Check code uniqueness
    const { data: existing } = await supabase
      .from('branches').select('id').eq('code', data.code).maybeSingle();
    if (existing) return { error: 'Ya existe una sucursal con ese código.' };

    const { data: created, error } = await supabase
      .from('branches')
      .insert({ code: data.code, name: data.name, is_active: data.is_active })
      .select()
      .single();

    if (error) return { error: error.message };

    await writeAudit('CREATE_BRANCH', created.id, { code: data.code, name: data.name, is_active: data.is_active });
    showToast('Sucursal creada exitosamente.');
    await fetchData();
    return { error: null };
  };

  const handleUpdate = async (data: BranchFormData): Promise<{ error: string | null }> => {
    if (!editBranch) return { error: null };

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (editBranch.name !== data.name) changes.name = { from: editBranch.name, to: data.name };
    if (editBranch.is_active !== data.is_active) changes.is_active = { from: editBranch.is_active, to: data.is_active };

    const { error } = await supabase
      .from('branches')
      .update({ name: data.name, is_active: data.is_active })
      .eq('id', editBranch.id);

    if (error) return { error: error.message };

    await writeAudit('UPDATE_BRANCH', editBranch.id, { changes });
    showToast('Sucursal actualizada.');
    await fetchData();
    return { error: null };
  };

  const handleToggleStatus = async () => {
    if (!toggleTarget) return;
    const newActive = !toggleTarget.is_active;
    setToggleLoading(true);

    const { error } = await supabase
      .from('branches')
      .update({ is_active: newActive })
      .eq('id', toggleTarget.id);

    setToggleLoading(false);
    setToggleTarget(null);

    if (error) { showToast(error.message, 'error'); return; }

    await writeAudit(
      newActive ? 'ACTIVATE_BRANCH' : 'DEACTIVATE_BRANCH',
      toggleTarget.id,
      { name: toggleTarget.name, code: toggleTarget.code },
    );
    showToast(`Sucursal ${newActive ? 'activada' : 'inactivada'}.`);
    await fetchData();
  };

  const clearFilters = () => { setSearch(''); setStatusFilter('all'); };
  const hasFilters = search || statusFilter !== 'all';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Sucursales</h1>
          <p className="text-sm text-slate-500 mt-0.5">Administración y seguimiento de sucursales</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} disabled={loading}
            className="p-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => { setEditBranch(null); setDrawerOpen(true); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition shadow-sm">
            <Plus className="w-4 h-4" />
            Nueva Sucursal
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-slate-800', bg: 'bg-white' },
          { label: 'Activas', value: stats.active, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'Inactivas', value: stats.inactive, color: 'text-rose-600', bg: 'bg-rose-50' },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-xl border border-slate-200 px-4 py-3`}>
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por código o nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-1 p-1 bg-slate-100 rounded-lg sm:w-64">
            {(['all', 'active', 'inactive'] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${
                  statusFilter === s ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                }`}>
                {s === 'all' ? 'Todas' : s === 'active' ? 'Activas' : 'Inactivas'}
              </button>
            ))}
          </div>
        </div>

        {hasFilters && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
            </p>
            <button onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
              <X className="w-3 h-3" /> Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {dataError && (
          <div className="p-4 bg-rose-50 text-rose-700 text-sm border-b border-rose-200">{dataError}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
              <Building2 className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-slate-500 text-sm">
              {hasFilters ? 'No se encontraron sucursales con los filtros aplicados.' : 'No hay sucursales registradas.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-8">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Código</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Usuarios</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Procesadores</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Documentos</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((branch, idx) => {
                  const agg = aggregates[branch.id];
                  const rowNum = (currentPage - 1) * PAGE_SIZE + idx + 1;
                  return (
                    <tr key={branch.id} className={`hover:bg-slate-50 transition-colors ${!branch.is_active ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3.5 text-slate-400 text-xs">{rowNum}</td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-mono font-semibold tracking-wide border border-slate-200">
                          <Hash className="w-3 h-3 text-slate-400" />
                          {branch.code}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            branch.is_active ? 'bg-blue-600' : 'bg-slate-300'
                          }`}>
                            <Building2 className="w-4 h-4 text-white" />
                          </div>
                          <span className="font-semibold text-slate-800">{branch.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        <StatChip value={agg?.userCount ?? 0} label="usuario" color="blue" />
                      </td>
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        <StatChip value={agg?.processorCount ?? 0} label="procesador" color="emerald" />
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        <StatChip value={agg?.docCount ?? 0} label="documento" color="amber" />
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge active={branch.is_active} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          {/* Detail */}
                          <button onClick={() => setDetailBranch(branch)} title="Ver detalles"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition">
                            <Eye className="w-4 h-4" />
                          </button>
                          {/* Edit */}
                          <button onClick={() => { setEditBranch(branch); setDrawerOpen(true); }} title="Editar"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {/* Toggle status */}
                          <button onClick={() => setToggleTarget(branch)}
                            title={branch.is_active ? 'Inactivar' : 'Activar'}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition ${
                              branch.is_active
                                ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                            }`}>
                            {branch.is_active
                              ? <ToggleRight className="w-4 h-4" />
                              : <ToggleLeft className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <p className="text-xs text-slate-500">
              Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => Math.abs(p - currentPage) <= 2 || p === 1 || p === totalPages)
                .reduce<(number | '...')[]>((acc, p, i, arr) => {
                  if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '...' ? (
                    <span key={`d${i}`} className="px-1 text-slate-400 text-sm">…</span>
                  ) : (
                    <button key={p} onClick={() => setPage(p as number)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition ${
                        currentPage === p ? 'bg-blue-600 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
                      }`}>
                      {p}
                    </button>
                  ),
                )}
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Drawer */}
      <BranchFormDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditBranch(null); }}
        onSubmit={editBranch ? handleUpdate : handleCreate}
        editBranch={editBranch}
      />

      {/* Detail modal */}
      <BranchDetailModal
        branch={detailBranch}
        onClose={() => setDetailBranch(null)}
      />

      {/* Confirm dialog */}
      <ConfirmDialog
        open={!!toggleTarget}
        title={toggleTarget?.is_active ? 'Inactivar Sucursal' : 'Activar Sucursal'}
        message={
          toggleTarget?.is_active
            ? `¿Inactivar "${toggleTarget?.name}"? Los usuarios asociados perderán acceso a esta sucursal.`
            : `¿Activar "${toggleTarget?.name}"? La sucursal quedará disponible para los usuarios.`
        }
        confirmLabel={toggleTarget?.is_active ? 'Inactivar' : 'Activar'}
        confirmClass={toggleTarget?.is_active ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}
        onConfirm={handleToggleStatus}
        onCancel={() => setToggleTarget(null)}
        loading={toggleLoading}
      />

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
        }`}>
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-1 opacity-80 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Stat chip ─────────────────────────────────────────────────────────────────
function StatChip({
  value, label, color,
}: {
  value: number;
  label: string;
  color: 'blue' | 'emerald' | 'amber';
}) {
  const colors = {
    blue:    'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber:   'bg-amber-50 text-amber-700',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${colors[color]}`}>
      {value}
      <span className="font-normal opacity-70">{label}{value !== 1 ? 's' : ''}</span>
    </span>
  );
}
