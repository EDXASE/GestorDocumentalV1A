import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollText, RefreshCw, Download, Filter, X,
  ChevronLeft, ChevronRight, AlertCircle, Loader2,
  User, Clock, ChevronDown, ChevronRight as ChevronRightIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const PAGE_SIZE = 25;

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Inicio de sesión',
  CREATE_USER: 'Crear usuario',
  EDIT_USER: 'Editar usuario',
  ACTIVATE_USER: 'Activar usuario',
  DEACTIVATE_USER: 'Inactivar usuario',
  CHANGE_PASSWORD: 'Cambio de contraseña',
  CREATE_BRANCH: 'Crear sucursal',
  EDIT_BRANCH: 'Modificar sucursal',
  ASSIGN_PROCESSOR: 'Asignar procesador',
  UPLOAD_DOCUMENT: 'Cargar documento',
  APPROVE_DOCUMENT: 'Aprobar documento',
  REJECT_DOCUMENT: 'Rechazar documento',
  ANNUL_DOCUMENT: 'Anular documento',
  CORRECT_COMMENT: 'Corregir comentario',
  DOWNLOAD_PDF: 'Descargar PDF',
  PROCESS_START: 'Inicio procesamiento',
};

const ACTION_COLORS: Record<string, string> = {
  LOGIN: 'bg-blue-100 text-blue-700',
  CREATE_USER: 'bg-teal-100 text-teal-700',
  EDIT_USER: 'bg-amber-100 text-amber-700',
  ACTIVATE_USER: 'bg-emerald-100 text-emerald-700',
  DEACTIVATE_USER: 'bg-rose-100 text-rose-700',
  CHANGE_PASSWORD: 'bg-violet-100 text-violet-700',
  CREATE_BRANCH: 'bg-teal-100 text-teal-700',
  EDIT_BRANCH: 'bg-amber-100 text-amber-700',
  ASSIGN_PROCESSOR: 'bg-violet-100 text-violet-700',
  UPLOAD_DOCUMENT: 'bg-blue-100 text-blue-700',
  APPROVE_DOCUMENT: 'bg-emerald-100 text-emerald-700',
  REJECT_DOCUMENT: 'bg-rose-100 text-rose-700',
  ANNUL_DOCUMENT: 'bg-slate-200 text-slate-700',
  CORRECT_COMMENT: 'bg-violet-100 text-violet-700',
  DOWNLOAD_PDF: 'bg-sky-100 text-sky-700',
};

const ENTITY_LABELS: Record<string, string> = {
  document: 'Documento',
  user: 'Usuario',
  branch: 'Sucursal',
  document_comment: 'Comentario',
  auth: 'Autenticación',
  assignment: 'Asignación',
};

const ACTION_OPTIONS = [
  { value: '', label: 'Todas las acciones' },
  { value: 'LOGIN', label: 'Inicio de sesión' },
  { value: 'CREATE_USER', label: 'Crear usuario' },
  { value: 'EDIT_USER', label: 'Editar usuario' },
  { value: 'ACTIVATE_USER', label: 'Activar usuario' },
  { value: 'DEACTIVATE_USER', label: 'Inactivar usuario' },
  { value: 'CHANGE_PASSWORD', label: 'Cambio de contraseña' },
  { value: 'CREATE_BRANCH', label: 'Crear sucursal' },
  { value: 'EDIT_BRANCH', label: 'Modificar sucursal' },
  { value: 'ASSIGN_PROCESSOR', label: 'Asignar procesador' },
  { value: 'UPLOAD_DOCUMENT', label: 'Cargar documento' },
  { value: 'APPROVE_DOCUMENT', label: 'Aprobar documento' },
  { value: 'REJECT_DOCUMENT', label: 'Rechazar documento' },
  { value: 'ANNUL_DOCUMENT', label: 'Anular documento' },
  { value: 'CORRECT_COMMENT', label: 'Corregir comentario' },
  { value: 'DOWNLOAD_PDF', label: 'Descargar PDF' },
];

const ENTITY_OPTIONS = [
  { value: '', label: 'Todas las entidades' },
  { value: 'document', label: 'Documento' },
  { value: 'user', label: 'Usuario' },
  { value: 'branch', label: 'Sucursal' },
  { value: 'document_comment', label: 'Comentario' },
  { value: 'auth', label: 'Autenticación' },
  { value: 'assignment', label: 'Asignación' },
];

const ROL_OPTIONS = [
  { value: '', label: 'Todos los roles' },
  { value: 'ADMINISTRADOR', label: 'Administrador' },
  { value: 'CARGADOR', label: 'Cargador' },
  { value: 'PROCESADOR', label: 'Procesador' },
  { value: 'CONSULTOR', label: 'Consultor' },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  user: { id: string; full_name: string; role: { name: string } | null } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function escapeCsv(v: unknown): string {
  const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function DetailBadge({ details }: { details: Record<string, unknown> | null }) {
  if (!details || Object.keys(details).length === 0) return <span className="text-slate-300 text-xs">—</span>;

  const pairs = Object.entries(details).slice(0, 3);
  return (
    <div className="flex flex-wrap gap-1">
      {pairs.map(([k, v]) => (
        <span key={k} className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
          <span className="font-medium">{k}:</span>
          <span className="text-slate-500 truncate max-w-[80px]">{String(v).substring(0, 30)}</span>
        </span>
      ))}
      {Object.keys(details).length > 3 && (
        <span className="text-[11px] text-slate-400">+{Object.keys(details).length - 3}</span>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [usuarioSearch, setUsuarioSearch] = useState('');
  const [rolFilter, setRolFilter] = useState('');
  const [accionFilter, setAccionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [documentoSearch, setDocumentoSearch] = useState('');
  const [sucursalSearch, setSucursalSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(true);

  // Pagination
  const [page, setPage] = useState(1);

  // Detail expansion
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setDataError(null);

    let q = supabase
      .from('audit_log')
      .select(`id, action, entity_type, entity_id, details, ip_address, user_agent, created_at,
        user:profiles!user_id(id, full_name, role:roles(name))`)
      .order('created_at', { ascending: false })
      .limit(2000);

    if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`);
    if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59`);
    if (accionFilter) q = q.eq('action', accionFilter);
    if (entityFilter) q = q.eq('entity_type', entityFilter);

    const { data, error } = await q;
    if (error) { setDataError(error.message); setLoading(false); return; }
    setEntries((data ?? []) as unknown as AuditEntry[]);
    setLoading(false);
  }, [dateFrom, dateTo, accionFilter, entityFilter]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);
  useEffect(() => { setPage(1); }, [dateFrom, dateTo, accionFilter, entityFilter, usuarioSearch, rolFilter, documentoSearch, sucursalSearch]);

  // ── Client-side filtering ──────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const userQ = usuarioSearch.toLowerCase().trim();
    const docQ  = documentoSearch.toLowerCase().trim();
    const sucQ  = sucursalSearch.toLowerCase().trim();

    return entries.filter((e) => {
      if (userQ && !(e.user?.full_name ?? '').toLowerCase().includes(userQ)) return false;
      if (rolFilter && e.user?.role?.name !== rolFilter) return false;
      if (docQ) {
        const detStr = JSON.stringify(e.details ?? {}).toLowerCase();
        const idStr  = (e.entity_id ?? '').toLowerCase();
        if (!detStr.includes(docQ) && !idStr.includes(docQ)) return false;
      }
      if (sucQ) {
        const detStr = JSON.stringify(e.details ?? {}).toLowerCase();
        if (!detStr.includes(sucQ)) return false;
      }
      return true;
    });
  }, [entries, usuarioSearch, rolFilter, documentoSearch, sucursalSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const activeFilters = [dateFrom, dateTo, usuarioSearch, rolFilter, accionFilter, entityFilter, documentoSearch, sucursalSearch].filter(Boolean).length;

  const clearFilters = () => {
    setDateFrom(''); setDateTo(''); setUsuarioSearch(''); setRolFilter('');
    setAccionFilter(''); setEntityFilter(''); setDocumentoSearch(''); setSucursalSearch('');
  };

  // ── Stats ──────────────────────────────────────────────────────────────────

  const stats = useMemo(() => ({
    total: filtered.length,
    logins: filtered.filter((e) => e.action === 'LOGIN').length,
    documents: filtered.filter((e) => e.entity_type === 'document').length,
    users: filtered.filter((e) => ['CREATE_USER','EDIT_USER','ACTIVATE_USER','DEACTIVATE_USER','CHANGE_PASSWORD'].includes(e.action)).length,
  }), [filtered]);

  // ── CSV Export ─────────────────────────────────────────────────────────────

  const exportCSV = () => {
    const headers = ['Fecha', 'Hora', 'Usuario', 'Rol', 'Acción', 'Entidad', 'ID Entidad', 'Detalles', 'IP', 'User Agent'];
    const rows = filtered.map((e) => [
      fmtDate(e.created_at),
      fmtTime(e.created_at),
      e.user?.full_name ?? '—',
      e.user?.role?.name ?? '—',
      ACTION_LABELS[e.action] ?? e.action,
      e.entity_type ? (ENTITY_LABELS[e.entity_type] ?? e.entity_type) : '—',
      e.entity_id ?? '—',
      e.details ? JSON.stringify(e.details) : '—',
      e.ip_address ?? '—',
      e.user_agent ?? '—',
    ]);
    const csv = [headers, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Auditoría del Sistema</h1>
          <p className="text-sm text-slate-500 mt-0.5">Bitácora completa de acciones realizadas en el sistema</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            disabled={loading || filtered.length === 0}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition"
          >
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
          <button
            onClick={fetchEntries}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Eventos', value: stats.total, color: 'text-slate-800', bg: 'bg-white' },
          { label: 'Logins', value: stats.logins, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Documentos', value: stats.documents, color: 'text-teal-700', bg: 'bg-teal-50' },
          { label: 'Usuarios', value: stats.users, color: 'text-violet-700', bg: 'bg-violet-50' },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-xl border border-slate-200 px-4 py-3`}>
            <p className="text-xs text-slate-500 leading-snug">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition"
        >
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="font-medium">Filtros</span>
            {activeFilters > 0 && (
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold inline-flex items-center justify-center">
                {activeFilters}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeFilters > 0 && (
              <span onClick={(e) => { e.stopPropagation(); clearFilters(); }} className="text-xs text-blue-600 font-medium cursor-pointer hover:text-blue-700">
                Limpiar
              </span>
            )}
            <ChevronLeft className={`w-4 h-4 text-slate-400 transition-transform ${filtersOpen ? '-rotate-90' : 'rotate-180'}`} />
          </div>
        </button>

        {filtersOpen && (
          <div className="px-4 pb-4 pt-1 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Fecha inicio</label>
              <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Fecha fin</label>
              <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Usuario</label>
              <input type="text" value={usuarioSearch} onChange={(e) => setUsuarioSearch(e.target.value)} placeholder="Nombre de usuario…"
                className="w-full py-2 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Rol</label>
              <select value={rolFilter} onChange={(e) => setRolFilter(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {ROL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Acción</label>
              <select value={accionFilter} onChange={(e) => setAccionFilter(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Entidad</label>
              <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {ENTITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Documento / ID</label>
              <input type="text" value={documentoSearch} onChange={(e) => setDocumentoSearch(e.target.value)} placeholder="UUID o dato en detalles…"
                className="w-full py-2 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Sucursal</label>
              <input type="text" value={sucursalSearch} onChange={(e) => setSucursalSearch(e.target.value)} placeholder="Nombre o código…"
                className="w-full py-2 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        )}

        {activeFilters > 0 && (
          <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between bg-blue-50/60">
            <p className="text-xs text-slate-500">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</p>
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
              <X className="w-3 h-3" /> Limpiar
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">Bitácora de Auditoría</h2>
          {!loading && <span className="ml-auto text-xs text-slate-400">{filtered.length} registros</span>}
        </div>

        {dataError && (
          <div className="p-4 bg-rose-50 text-rose-700 text-sm border-b border-rose-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {dataError}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
            <ScrollText className="w-10 h-10" />
            <p className="text-sm">{activeFilters > 0 ? 'Sin resultados con los filtros aplicados.' : 'No hay eventos registrados.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-36">Fecha/Hora</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Usuario</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Rol</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Acción</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Entidad</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden xl:table-cell">Detalles</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((entry) => {
                  const isExpanded = expandedId === entry.id;
                  const actionLabel = ACTION_LABELS[entry.action] ?? entry.action;
                  const actionColor = ACTION_COLORS[entry.action] ?? 'bg-slate-100 text-slate-600';
                  const entityLabel = entry.entity_type ? (ENTITY_LABELS[entry.entity_type] ?? entry.entity_type) : null;

                  return (
                    <>
                      <tr
                        key={entry.id}
                        className={`hover:bg-slate-50 transition-colors cursor-pointer ${isExpanded ? 'bg-blue-50/40' : ''}`}
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      >
                        {/* Fecha/Hora */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-slate-400 flex-shrink-0" />
                            <div>
                              <p className="text-xs font-medium text-slate-700">{fmtDate(entry.created_at)}</p>
                              <p className="text-[11px] text-slate-400">{fmtTime(entry.created_at)}</p>
                            </div>
                          </div>
                        </td>

                        {/* Usuario */}
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                              <User className="w-3 h-3 text-slate-500" />
                            </div>
                            <span className="text-xs font-medium text-slate-700">{entry.user?.full_name ?? '—'}</span>
                          </div>
                        </td>

                        {/* Rol */}
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {entry.user?.role?.name
                            ? <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">{entry.user.role.name}</span>
                            : <span className="text-slate-300 text-xs">—</span>
                          }
                        </td>

                        {/* Acción */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${actionColor}`}>
                            {actionLabel}
                          </span>
                        </td>

                        {/* Entidad */}
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <div className="space-y-0.5">
                            {entityLabel && (
                              <p className="text-xs text-slate-600 font-medium">{entityLabel}</p>
                            )}
                            {entry.entity_id && (
                              <p className="text-[10px] text-slate-400 font-mono truncate max-w-[120px]" title={entry.entity_id}>
                                {entry.entity_id.substring(0, 8)}…
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Detalles preview */}
                        <td className="px-4 py-3 hidden xl:table-cell">
                          <DetailBadge details={entry.details} />
                        </td>

                        {/* Expand toggle */}
                        <td className="px-4 py-3 text-center">
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4 text-blue-500 mx-auto" />
                            : <ChevronRightIcon className="w-4 h-4 text-slate-400 mx-auto" />
                          }
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isExpanded && (
                        <tr key={`${entry.id}-detail`} className="bg-blue-50/30">
                          <td colSpan={7} className="px-5 py-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                              {/* Usuario / Rol */}
                              <div className="space-y-1">
                                <p className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Usuario</p>
                                <p className="font-medium text-slate-800">{entry.user?.full_name ?? '—'}</p>
                                {entry.user?.role?.name && <p className="text-slate-500">{entry.user.role.name}</p>}
                              </div>

                              {/* Entidad */}
                              <div className="space-y-1">
                                <p className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Entidad</p>
                                <p className="text-slate-700">{entityLabel ?? '—'}</p>
                                {entry.entity_id && (
                                  <p className="font-mono text-[11px] text-slate-500 break-all">{entry.entity_id}</p>
                                )}
                              </div>

                              {/* IP / UA */}
                              {(entry.ip_address || entry.user_agent) && (
                                <div className="space-y-1">
                                  <p className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Dispositivo</p>
                                  {entry.ip_address && <p className="text-slate-600 font-mono">{entry.ip_address}</p>}
                                  {entry.user_agent && (
                                    <p className="text-slate-400 truncate max-w-[280px]" title={entry.user_agent}>
                                      {entry.user_agent.substring(0, 80)}
                                    </p>
                                  )}
                                </div>
                              )}

                              {/* Full details JSON */}
                              {entry.details && Object.keys(entry.details).length > 0 && (
                                <div className="sm:col-span-2 lg:col-span-3 space-y-1">
                                  <p className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Detalles completos</p>
                                  <div className="bg-white rounded-lg border border-slate-200 p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                                    {Object.entries(entry.details).map(([k, v]) => (
                                      <div key={k}>
                                        <p className="text-[10px] text-slate-400 font-semibold uppercase">{k.replace(/_/g, ' ')}</p>
                                        <p className="text-xs text-slate-700 font-medium break-all">
                                          {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
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

        {/* Pagination */}
        {!loading && filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <p className="text-xs text-slate-500">
              {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => Math.abs(p - currentPage) <= 2 || p === 1 || p === totalPages)
                .reduce<(number | '...')[]>((acc, p, i, arr) => {
                  if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...');
                  acc.push(p); return acc;
                }, [])
                .map((p, i) =>
                  p === '...'
                    ? <span key={`d${i}`} className="px-1 text-slate-400">…</span>
                    : (
                      <button key={p} onClick={() => setPage(p as number)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition ${currentPage === p ? 'bg-blue-600 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-100'}`}>
                        {p}
                      </button>
                    ),
                )}
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition">
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
