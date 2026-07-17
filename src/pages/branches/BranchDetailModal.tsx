import { useEffect, useState } from 'react';
import { X, Users, Network, FileText, ShieldCheck, Building2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Branch, DocumentStateCode, Profile, RoleName } from '../../types/database';
import { ROLE_LABELS } from '../../types/roles';

interface BranchStats {
  users: (Profile & { role?: { name: RoleName } })[];
  processors: { id: string; processor: Profile & { role?: { name: RoleName } }; assigned_at: string }[];
  docCounts: Record<DocumentStateCode, number>;
  totalDocs: number;
}

const STATE_LABELS: Record<DocumentStateCode, string> = {
  PENDIENTE: 'Pendientes',
  APROBADO: 'Aprobados',
  RECHAZADO: 'Rechazados',
  ANULADO: 'Anulados',
};

const STATE_COLORS: Record<DocumentStateCode, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-700',
  APROBADO: 'bg-emerald-100 text-emerald-700',
  RECHAZADO: 'bg-rose-100 text-rose-600',
  ANULADO: 'bg-slate-100 text-slate-600',
};

const ROLE_BADGE: Record<RoleName, string> = {
  ADMINISTRADOR: 'bg-blue-100 text-blue-700',
  CARGADOR:      'bg-amber-100 text-amber-700',
  PROCESADOR:    'bg-emerald-100 text-emerald-700',
  CONSULTOR:     'bg-slate-100 text-slate-600',
};

interface BranchDetailModalProps {
  branch: Branch | null;
  onClose: () => void;
}

export function BranchDetailModal({ branch, onClose }: BranchDetailModalProps) {
  const [stats, setStats] = useState<BranchStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'processors' | 'documents'>('users');

  useEffect(() => {
    if (!branch) return;
    setStats(null);
    setLoading(true);
    setActiveTab('users');

    (async () => {
      const [usersRes, assignmentsRes, docsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('*, role:roles(name)')
          .eq('branch_id', branch.id)
          .order('full_name'),
        supabase
          .from('branch_processor_assignments')
          .select('id, assigned_at, processor:profiles!processor_id(*, role:roles(name))')
          .eq('branch_id', branch.id)
          .eq('is_active', true)
          .order('assigned_at'),
        supabase
          .from('documents')
          .select('state:document_states(code)')
          .eq('branch_id', branch.id),
      ]);

      const docCounts: Record<DocumentStateCode, number> = { PENDIENTE: 0, APROBADO: 0, RECHAZADO: 0, ANULADO: 0 };
      (docsRes.data ?? []).forEach((d) => {
        const code = (d.state as unknown as { code: string } | null)?.code as DocumentStateCode | undefined;
        if (code && code in docCounts) docCounts[code]++;
      });

      setStats({
        users: (usersRes.data ?? []) as unknown as BranchStats['users'],
        processors: (assignmentsRes.data ?? []) as unknown as BranchStats['processors'],
        docCounts,
        totalDocs: (docsRes.data ?? []).length,
      });
      setLoading(false);
    })();
  }, [branch]);

  if (!branch) return null;

  const tabs = [
    { key: 'users' as const, label: 'Usuarios', icon: Users, count: stats?.users.length },
    { key: 'processors' as const, label: 'Procesadores', icon: Network, count: stats?.processors.length },
    { key: 'documents' as const, label: 'Documentos', icon: FileText, count: stats?.totalDocs },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
              branch.is_active ? 'bg-blue-600' : 'bg-slate-400'
            }`}>
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-800">{branch.name}</h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  branch.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'
                }`}>
                  {branch.is_active ? 'Activa' : 'Inactiva'}
                </span>
              </div>
              <p className="text-xs font-mono text-slate-400 mt-0.5">{branch.code}</p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6 flex-shrink-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}>
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                    activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {loading ? '…' : tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : (
            <>
              {/* Users tab */}
              {activeTab === 'users' && (
                <div className="p-4">
                  {stats?.users.length === 0 ? (
                    <EmptyState icon={<Users className="w-7 h-7 text-slate-300" />} text="No hay usuarios asignados a esta sucursal." />
                  ) : (
                    <div className="space-y-2">
                      {stats?.users.map((u) => (
                        <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 hover:bg-slate-50">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                            u.is_active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
                          }`}>
                            {u.full_name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{u.full_name}</p>
                            <p className="text-xs text-slate-400">@{u.username}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {u.role?.name && (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[u.role.name]}`}>
                                <ShieldCheck className="w-3 h-3" />
                                {ROLE_LABELS[u.role.name]}
                              </span>
                            )}
                            {!u.is_active && (
                              <span className="px-1.5 py-0.5 rounded text-xs bg-rose-50 text-rose-500 border border-rose-200">Inactivo</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Processors tab */}
              {activeTab === 'processors' && (
                <div className="p-4">
                  {stats?.processors.length === 0 ? (
                    <EmptyState icon={<Network className="w-7 h-7 text-slate-300" />} text="No hay procesadores asignados a esta sucursal." />
                  ) : (
                    <div className="space-y-2">
                      {stats?.processors.map((a) => (
                        <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 hover:bg-slate-50">
                          <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                            {a.processor.full_name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{a.processor.full_name}</p>
                            <p className="text-xs text-slate-400">@{a.processor.username}</p>
                          </div>
                          <span className="text-xs text-slate-400 flex-shrink-0">
                            Desde {new Date(a.assigned_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Documents tab */}
              {activeTab === 'documents' && (
                <div className="p-4">
                  {stats?.totalDocs === 0 ? (
                    <EmptyState icon={<FileText className="w-7 h-7 text-slate-300" />} text="No hay documentos registrados para esta sucursal." />
                  ) : (
                    <div className="space-y-3">
                      <div className="text-center py-2">
                        <p className="text-4xl font-bold text-slate-800">{stats?.totalDocs}</p>
                        <p className="text-sm text-slate-500 mt-1">documentos en total</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {(Object.keys(STATE_LABELS) as DocumentStateCode[]).map((code) => (
                          <div key={code} className={`rounded-xl p-4 ${STATE_COLORS[code]} border border-current/10`}>
                            <p className="text-2xl font-bold">{stats?.docCounts[code] ?? 0}</p>
                            <p className="text-xs font-medium mt-1">{STATE_LABELS[code]}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex-shrink-0">
          <button onClick={onClose}
            className="w-full py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
        {icon}
      </div>
      <p className="text-sm text-slate-500 max-w-xs">{text}</p>
    </div>
  );
}
