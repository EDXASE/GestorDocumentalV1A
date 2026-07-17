import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, RefreshCw, Building2, Users,
  Settings, ChevronDown, ChevronRight, X, ShieldAlert,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Branch, BranchProcessorAssignment, ProfileWithRole } from '../types/database';
import { AssignmentManagerDrawer } from './assignments/AssignmentManagerDrawer';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProcessorRow {
  processor: ProfileWithRole;
  assignments: (BranchProcessorAssignment & { branch: Branch })[];
  activeCount: number;
  inactiveCount: number;
}

interface BranchRow {
  branch: Branch;
  assignments: (BranchProcessorAssignment & { processor: ProfileWithRole })[];
  activeCount: number;
}

// ── Shared atoms ──────────────────────────────────────────────────────────────
function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
      active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-rose-400'}`} />
      {active ? 'Activa' : 'Inactiva'}
    </span>
  );
}

function TabBtn({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
        active ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
      }`}>
      {icon}{label}
    </button>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}

function EmptyRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">{icon}</div>
      <p className="text-slate-500 text-sm">{text}</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function AssignmentsPage() {
  const { profile } = useAuth();

  const [processors, setProcessors] = useState<ProfileWithRole[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allAssignments, setAllAssignments] = useState<
    (BranchProcessorAssignment & { processor: ProfileWithRole; branch: Branch })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'processors' | 'branches'>('processors');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [managingProcessor, setManagingProcessor] = useState<ProfileWithRole | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setDataError(null);

    const [profilesRes, branchesRes, assignmentsRes] = await Promise.all([
      supabase.from('profiles').select('*, role:roles(*), branch:branches(*)').order('full_name'),
      supabase.from('branches').select('*').order('name'),
      supabase
        .from('branch_processor_assignments')
        .select('*, processor:profiles!processor_id(*, role:roles(*), branch:branches(*)), branch:branches!branch_id(*)')
        .order('assigned_at'),
    ]);

    if (profilesRes.error) { setDataError(profilesRes.error.message); setLoading(false); return; }
    if (branchesRes.error) { setDataError(branchesRes.error.message); setLoading(false); return; }

    const allProfiles = (profilesRes.data ?? []) as ProfileWithRole[];
    setProcessors(allProfiles.filter((p) => p.role?.name === 'PROCESADOR'));
    setBranches((branchesRes.data ?? []) as Branch[]);
    setAllAssignments(
      (assignmentsRes.data ?? []) as (BranchProcessorAssignment & { processor: ProfileWithRole; branch: Branch })[],
    );
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Computed views ──────────────────────────────────────────────────────────
  const processorRows = useMemo((): ProcessorRow[] =>
    processors.map((proc) => {
      const assignments = allAssignments
        .filter((a) => a.processor_id === proc.id)
        .map((a) => ({ ...a, branch: a.branch as Branch }));
      return {
        processor: proc,
        assignments,
        activeCount: assignments.filter((a) => a.is_active).length,
        inactiveCount: assignments.filter((a) => !a.is_active).length,
      };
    }),
  [processors, allAssignments]);

  const branchRows = useMemo((): BranchRow[] =>
    branches.map((branch) => {
      const assignments = allAssignments
        .filter((a) => a.branch_id === branch.id && a.is_active)
        .map((a) => ({ ...a, processor: a.processor as ProfileWithRole }));
      return { branch, assignments, activeCount: assignments.length };
    }),
  [branches, allAssignments]);

  const stats = useMemo(() => ({
    activeAssignments: allAssignments.filter((a) => a.is_active).length,
    totalAssignments: allAssignments.length,
    processorsWithAssignments: new Set(allAssignments.filter((a) => a.is_active).map((a) => a.processor_id)).size,
    branchesWithProcessors: new Set(allAssignments.filter((a) => a.is_active).map((a) => a.branch_id)).size,
  }), [allAssignments]);

  const toggleExpand = (id: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleManage = (proc: ProfileWithRole) => {
    setManagingProcessor(proc);
    setDrawerOpen(true);
  };

  const handleSaved = async () => {
    showToast('Asignaciones actualizadas correctamente.');
    await fetchData();
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Asignaciones</h1>
          <p className="text-sm text-slate-500 mt-0.5">Procesadores asignados a sucursales</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} disabled={loading}
            className="p-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => { setManagingProcessor(null); setDrawerOpen(true); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition shadow-sm">
            <Plus className="w-4 h-4" />Nueva Asignación
          </button>
        </div>
      </div>

      {/* Backend enforcement notice */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
        <ShieldAlert className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          <span className="font-semibold">Restricción activa en backend:</span> Los Procesadores solo pueden consultar documentos de sus sucursales activamente asignadas. Esta regla está forzada por políticas RLS en la base de datos, independientemente de la interfaz.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Asignaciones activas', value: stats.activeAssignments, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'Total asignaciones', value: stats.totalAssignments, color: 'text-slate-800', bg: 'bg-white' },
          { label: 'Procesadores activos', value: stats.processorsWithAssignments, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Sucursales cubiertas', value: stats.branchesWithProcessors, color: 'text-amber-700', bg: 'bg-amber-50' },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-xl border border-slate-200 px-4 py-3`}>
            <p className="text-xs text-slate-500 leading-snug">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        <TabBtn active={activeTab === 'processors'} onClick={() => setActiveTab('processors')} icon={<Users className="w-4 h-4 mr-1" />} label="Por Procesador" />
        <TabBtn active={activeTab === 'branches'} onClick={() => setActiveTab('branches')} icon={<Building2 className="w-4 h-4 mr-1" />} label="Por Sucursal" />
      </div>

      {dataError && (
        <div className="p-4 bg-rose-50 text-rose-700 text-sm rounded-xl border border-rose-200">{dataError}</div>
      )}

      {/* VIEW: Por Procesador */}
      {activeTab === 'processors' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          {loading ? <LoadingRow /> : processorRows.length === 0 ? (
            <EmptyRow icon={<Users className="w-7 h-7 text-slate-400" />} text="No hay procesadores registrados." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Procesador</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Sucursales activas</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Resumen</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {processorRows.map((row) => {
                    const isExpanded = expandedRows.has(row.processor.id);
                    const activeBranches = row.assignments.filter((a) => a.is_active);
                    return (
                      <>
                        <tr key={row.processor.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                                row.processor.is_active ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'
                              }`}>
                                {row.processor.full_name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-800">{row.processor.full_name}</p>
                                <p className="text-xs text-slate-400">@{row.processor.username}</p>
                              </div>
                              {!row.processor.is_active && (
                                <span className="px-1.5 py-0.5 rounded text-xs bg-rose-50 text-rose-500 border border-rose-200">Inactivo</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 hidden sm:table-cell">
                            <div className="flex flex-wrap gap-1.5">
                              {activeBranches.length === 0 ? (
                                <span className="text-slate-300 text-xs italic">Sin asignaciones activas</span>
                              ) : (
                                activeBranches.slice(0, 4).map((a) => (
                                  <span key={a.id}
                                    title={a.branch.name}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                    <Building2 className="w-2.5 h-2.5" />
                                    {a.branch.code}
                                  </span>
                                ))
                              )}
                              {activeBranches.length > 4 && (
                                <span className="text-xs text-slate-400">+{activeBranches.length - 4} más</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 hidden md:table-cell">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="font-bold text-emerald-700">{row.activeCount}</span>
                              <span className="text-slate-300">/</span>
                              <span className="text-slate-500">{row.assignments.length} total</span>
                              {row.inactiveCount > 0 && (
                                <span className="text-xs text-rose-400">({row.inactiveCount} inact.)</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center justify-end gap-1">
                              {row.assignments.length > 0 && (
                                <button onClick={() => toggleExpand(row.processor.id)}
                                  title="Expandir"
                                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition">
                                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                              )}
                              <button onClick={() => handleManage(row.processor)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition">
                                <Settings className="w-3.5 h-3.5" />
                                Gestionar
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${row.processor.id}-exp`}>
                            <td colSpan={4} className="px-6 py-3 bg-slate-50 border-t border-slate-100">
                              <div className="flex flex-wrap gap-2">
                                {row.assignments.map((a) => (
                                  <div key={a.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-white text-xs shadow-sm">
                                    <Building2 className="w-3 h-3 text-slate-400" />
                                    <span className="font-medium text-slate-700">{a.branch.name}</span>
                                    <span className="text-slate-400 font-mono">{a.branch.code}</span>
                                    <ActiveBadge active={a.is_active} />
                                    <span className="text-slate-300 text-xs">
                                      {new Date(a.assigned_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' })}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW: Por Sucursal */}
      {activeTab === 'branches' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          {loading ? <LoadingRow /> : branchRows.length === 0 ? (
            <EmptyRow icon={<Building2 className="w-7 h-7 text-slate-400" />} text="No hay sucursales registradas." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Sucursal</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Procesadores asignados</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Estado sucursal</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Asignaciones activas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {branchRows.map((row) => (
                    <tr key={row.branch.id} className={`hover:bg-slate-50 transition-colors ${!row.branch.is_active ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            row.branch.is_active ? 'bg-blue-600' : 'bg-slate-300'
                          }`}>
                            <Building2 className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">{row.branch.name}</p>
                            <p className="text-xs font-mono text-slate-400">{row.branch.code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1.5">
                          {row.assignments.length === 0 ? (
                            <span className="text-slate-300 text-xs italic">Sin procesadores activos</span>
                          ) : (
                            row.assignments.map((a) => (
                              <span key={a.id} title={`@${a.processor.username}`}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {a.processor.full_name.split(' ').slice(0, 2).map((w: string) => w[0]).join('')}
                                <span className="hidden sm:inline opacity-70">— {a.processor.full_name.split(' ')[0]}</span>
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        <ActiveBadge active={row.branch.is_active} />
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        <span className={`text-sm font-bold ${row.activeCount > 0 ? 'text-emerald-700' : 'text-rose-400'}`}>
                          {row.activeCount}
                        </span>
                        <span className="text-slate-400 text-xs ml-1">
                          procesador{row.activeCount !== 1 ? 'es' : ''}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Drawer */}
      <AssignmentManagerDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setManagingProcessor(null); }}
        onSaved={handleSaved}
        processor={managingProcessor}
        processors={processors}
        branches={branches}
        adminProfileId={profile?.id ?? ''}
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
