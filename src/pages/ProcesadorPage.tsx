import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScanLine, RefreshCw, Search, FileText, Download,
  ChevronLeft, ChevronRight, X, AlertCircle,
  Loader2, Filter, Info,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { DocumentStateCode, DocumentTypeCode } from '../types/database';
import { StateBadge } from '../components/StateBadge';
import { PdfViewerModal } from './procesador/PdfViewerModal';
import { ProcessDocumentModal, type ProcessDoc } from './procesador/ProcessDocumentModal';

const PAGE_SIZE = 10;

// ── Types ─────────────────────────────────────────────────────────────────────

interface AssignedBranch {
  id: string;
  name: string;
  code: string;
}

interface DocRow {
  id: string;
  document_number: string;
  document_date: string;
  description: string | null;
  created_at: string;
  document_type: { code: DocumentTypeCode; name: string };
  branch: { id: string; name: string; code: string };
  state: { id: string; code: DocumentStateCode; name: string };
  uploader: { full_name: string } | null;
}

interface EnrichedDoc extends DocRow {
  cargadorComment: string | null;
  pdfPath: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────


const TYPE_LABELS: Record<DocumentTypeCode, string> = {
  CAJA_GENERAL: 'Caja General',
  CAJA_CHICA: 'Caja Chica',
};

const TYPE_COLORS: Record<DocumentTypeCode, string> = {
  CAJA_GENERAL: 'bg-blue-100 text-blue-700',
  CAJA_CHICA: 'bg-teal-100 text-teal-700',
};

const STATE_OPTIONS: { value: DocumentStateCode | ''; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'APROBADO', label: 'Aprobado' },
  { value: 'RECHAZADO', label: 'Rechazado' },
  { value: 'ANULADO', label: 'Anulado' },
];

const TYPE_OPTIONS: { value: DocumentTypeCode | ''; label: string }[] = [
  { value: '', label: 'Todos los tipos' },
  { value: 'CAJA_GENERAL', label: 'Caja General' },
  { value: 'CAJA_CHICA', label: 'Caja Chica' },
];

function truncate(text: string | null, max = 55): string {
  if (!text) return '—';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProcesadorPage() {
  const { profile, assignedBranches: contextAssignedBranches } = useAuth();

  // Sections this procesador is allowed to see (across all their branches)
  const allowedTypeCodes = useMemo<DocumentTypeCode[]>(() => {
    if (contextAssignedBranches === null) return ['CAJA_GENERAL', 'CAJA_CHICA'];
    const codes: DocumentTypeCode[] = [];
    if (contextAssignedBranches.some((b) => b.can_caja_general)) codes.push('CAJA_GENERAL');
    if (contextAssignedBranches.some((b) => b.can_caja_chica)) codes.push('CAJA_CHICA');
    return codes;
  }, [contextAssignedBranches]);

  // Assigned branches
  const [assignedBranches, setAssignedBranches] = useState<AssignedBranch[]>([]);
  const [branchesLoaded, setBranchesLoaded] = useState(false);

  // Data
  const [docs, setDocs] = useState<EnrichedDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // Filters
  const [branchFilter, setBranchFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<DocumentTypeCode | ''>('');
  const [stateFilter, setStateFilter] = useState<DocumentStateCode | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [referenceSearch, setReferenceSearch] = useState('');
  const [nameSearch, setNameSearch] = useState('');
  const [commentSearch, setCommentSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(true);

  // Pagination
  const [page, setPage] = useState(1);

  // Modals
  const [pdfDocId, setPdfDocId] = useState<string | null>(null);
  const [pdfDocName, setPdfDocName] = useState<string | null>(null);
  const [processDoc, setProcessDoc] = useState<ProcessDoc | null>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  }, []);

  // ── Load assigned branches ─────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    supabase
      .from('branch_processor_assignments')
      .select('branch:branches(id, name, code)')
      .eq('processor_id', profile.id)
      .eq('is_active', true)
      .then(({ data }) => {
        const branches = (data ?? []).map((row) => {
          const b = row.branch as unknown as AssignedBranch;
          return { id: b.id, name: b.name, code: b.code };
        });
        setAssignedBranches(branches);
        setBranchesLoaded(true);
      });
  }, [profile]);

  // ── Fetch documents ────────────────────────────────────────────────────────
  const fetchDocs = useCallback(async () => {
    if (!profile || !branchesLoaded) return;

    if (assignedBranches.length === 0) {
      setDocs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setDataError(null);

    const branchIds = assignedBranches.map((b) => b.id);

    const { data: rawDocs, error: docsErr } = await supabase
      .from('documents')
      .select(
        `id, document_number, document_date, description, created_at,
         document_type:document_types(code, name),
         branch:branches(id, name, code),
         state:document_states(id, code, name),
         uploader:profiles!uploaded_by(full_name)`,
      )
      .in('branch_id', branchIds)
      .order('created_at', { ascending: false });

    if (docsErr) { setDataError(docsErr.message); setLoading(false); return; }

    const list = (rawDocs ?? []) as unknown as DocRow[];

    if (list.length === 0) {
      setDocs([]);
      setLoading(false);
      return;
    }

    const ids = list.map((d) => d.id);

    // Batch fetch: cargador comments + PDF paths
    const [commentsRes, pdfsRes] = await Promise.all([
      supabase
        .from('document_comments')
        .select('document_id, comment, user:profiles!user_id(role:roles(name))')
        .in('document_id', ids)
        .order('created_at', { ascending: true }),
      supabase
        .from('document_pdfs')
        .select('document_id, file_path')
        .in('document_id', ids),
    ]);

    // Build comment map (first CARGADOR comment per document)
    const cargadorComments: Record<string, string> = {};
    ((commentsRes.data ?? []) as unknown as { document_id: string; comment: string; user: { role: { name: string } | null } | null }[])
      .forEach((c) => {
        if (!cargadorComments[c.document_id] && c.user?.role?.name === 'CARGADOR') {
          cargadorComments[c.document_id] = c.comment;
        }
      });

    // Build PDF map (first PDF per document)
    const pdfMap: Record<string, string> = {};
    (pdfsRes.data ?? []).forEach((p: { document_id: string; file_path: string }) => {
      if (!pdfMap[p.document_id]) pdfMap[p.document_id] = p.file_path;
    });

    setDocs(list.map((doc) => ({
      ...doc,
      cargadorComment: cargadorComments[doc.id] ?? null,
      pdfPath: pdfMap[doc.id] ?? null,
    })));

    setLoading(false);
  }, [profile, branchesLoaded, assignedBranches]);

  useEffect(() => {
    if (branchesLoaded) fetchDocs();
  }, [fetchDocs, branchesLoaded]);

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const refQ = referenceSearch.toLowerCase().trim();
    const nameQ = nameSearch.toLowerCase().trim();
    const commentQ = commentSearch.toLowerCase().trim();
    return docs.filter((d) => {
      if (!allowedTypeCodes.includes(d.document_type?.code)) return false;
      if (branchFilter && d.branch?.id !== branchFilter) return false;
      if (typeFilter && d.document_type?.code !== typeFilter) return false;
      if (stateFilter && d.state?.code !== stateFilter) return false;
      if (dateFrom && d.document_date < dateFrom) return false;
      if (dateTo && d.document_date > dateTo) return false;
      if (refQ && !d.document_number.toLowerCase().includes(refQ)) return false;
      if (nameQ && !(d.description ?? '').toLowerCase().includes(nameQ)) return false;
      if (commentQ && !(d.cargadorComment ?? '').toLowerCase().includes(commentQ)) return false;
      return true;
    });
  }, [docs, allowedTypeCodes, branchFilter, typeFilter, stateFilter, dateFrom, dateTo, referenceSearch, nameSearch, commentSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [branchFilter, typeFilter, stateFilter, dateFrom, dateTo, referenceSearch, nameSearch, commentSearch]);

  const stats = useMemo(() => ({
    total: docs.length,
    pendiente: docs.filter((d) => d.state?.code === 'PENDIENTE').length,
    aprobado: docs.filter((d) => d.state?.code === 'APROBADO').length,
    rechazado: docs.filter((d) => d.state?.code === 'RECHAZADO').length,
  }), [docs]);

  const activeFiltersCount = [branchFilter, typeFilter, stateFilter, dateFrom, dateTo, referenceSearch, nameSearch, commentSearch]
    .filter(Boolean).length;

  const clearFilters = () => {
    setBranchFilter('');
    setTypeFilter('');
    setStateFilter('');
    setDateFrom('');
    setDateTo('');
    setReferenceSearch('');
    setNameSearch('');
    setCommentSearch('');
  };

  const handleProcessSuccess = useCallback((docId: string, newState: 'APROBADO' | 'RECHAZADO') => {
    setDocs((prev) =>
      prev.map((d) =>
        d.id === docId
          ? {
              ...d,
              state: {
                ...d.state,
                code: newState,
                name: newState === 'APROBADO' ? 'Aprobado' : 'Rechazado',
              },
            }
          : d,
      ),
    );
    showToast(
      `Documento ${newState === 'APROBADO' ? 'aprobado' : 'rechazado'} exitosamente.`,
      'success',
    );
  }, [showToast]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Procesamiento</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Revisión y procesamiento de documentos de tus sucursales asignadas
          </p>
        </div>
        <button
          onClick={fetchDocs}
          disabled={loading || !branchesLoaded}
          className="self-start sm:self-auto p-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* No assignments banner */}
      {branchesLoaded && assignedBranches.length === 0 && (
        <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-amber-50 border border-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">
            <span className="font-semibold">Sin sucursales asignadas.</span> Contacta al administrador para que configure tus asignaciones.
          </p>
        </div>
      )}

      {/* Stats */}
      {assignedBranches.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: stats.total, color: 'text-slate-800', bg: 'bg-white' },
            { label: 'Pendientes', value: stats.pendiente, color: 'text-amber-700', bg: 'bg-amber-50' },
            { label: 'Aprobados', value: stats.aprobado, color: 'text-emerald-700', bg: 'bg-emerald-50' },
            { label: 'Rechazados', value: stats.rechazado, color: 'text-rose-600', bg: 'bg-rose-50' },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-xl border border-slate-200 px-4 py-3`}>
              <p className="text-xs text-slate-500 leading-snug">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Assigned branches info */}
      {branchesLoaded && assignedBranches.length > 0 && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-700">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            <span className="font-semibold">Sucursales asignadas:</span>{' '}
            {assignedBranches.map((b) => b.name).join(', ')}
          </span>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition"
        >
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="font-medium">Filtros</span>
            {activeFiltersCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold">
                {activeFiltersCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeFiltersCount > 0 && (
              <span
                onClick={(e) => { e.stopPropagation(); clearFilters(); }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
              >
                Limpiar
              </span>
            )}
            <ChevronLeft className={`w-4 h-4 text-slate-400 transition-transform ${filtersOpen ? '-rotate-90' : 'rotate-180'}`} />
          </div>
        </button>

        {filtersOpen && (
          <div className="px-4 pb-4 pt-1 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Branch */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Sucursal</label>
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Todas las sucursales</option>
                {assignedBranches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                ))}
              </select>
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as DocumentTypeCode | '')}
                className="w-full py-2 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {TYPE_OPTIONS.filter((o) => !o.value || allowedTypeCodes.includes(o.value)).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* State */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Estado</label>
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value as DocumentStateCode | '')}
                className="w-full py-2 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {STATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Date from */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Fecha desde</label>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Date to */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Fecha hasta</label>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Reference */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Comprobante / Código</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={referenceSearch}
                  onChange={(e) => setReferenceSearch(e.target.value)}
                  placeholder="Buscar…"
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nombre</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={nameSearch}
                  onChange={(e) => setNameSearch(e.target.value)}
                  placeholder="Buscar…"
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Cargador comment */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Comentario del Cargador</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={commentSearch}
                  onChange={(e) => setCommentSearch(e.target.value)}
                  placeholder="Buscar…"
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {activeFiltersCount > 0 && (
          <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between bg-blue-50/60">
            <p className="text-xs text-slate-500">
              {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
            </p>
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              <X className="w-3 h-3" /> Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <ScanLine className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">Documentos a Procesar</h2>
          {!loading && (
            <span className="ml-auto text-xs text-slate-400">
              {filtered.length} documento{filtered.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {dataError && (
          <div className="p-4 bg-rose-50 text-rose-700 text-sm border-b border-rose-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {dataError}
          </div>
        )}

        {loading || !branchesLoaded ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
              <ScanLine className="w-7 h-7 text-slate-400" />
            </div>
            <div className="text-center">
              <p className="text-slate-600 text-sm font-medium">
                {activeFiltersCount > 0
                  ? 'No se encontraron documentos con los filtros aplicados.'
                  : 'No hay documentos en tus sucursales asignadas.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-8">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Sucursal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Referencia</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Documento</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden xl:table-cell">Com. Cargador</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Cargado por</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">PDF</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Procesar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((doc, idx) => {
                  const rowNum = (currentPage - 1) * PAGE_SIZE + idx + 1;
                  const typeCode = doc.document_type?.code;
                  const isPending = doc.state?.code === 'PENDIENTE';
                  return (
                    <tr key={doc.id} className={`hover:bg-slate-50 transition-colors ${isPending ? '' : 'opacity-80'}`}>
                      <td className="px-4 py-3.5 text-slate-400 text-xs">{rowNum}</td>

                      {/* Sucursal */}
                      <td className="px-4 py-3.5 hidden lg:table-cell">
                        <span className="text-xs text-slate-700 font-medium">{doc.branch?.name}</span>
                        <span className="ml-1 text-xs text-slate-400">({doc.branch?.code})</span>
                      </td>

                      {/* Tipo */}
                      <td className="px-4 py-3.5">
                        {typeCode && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${TYPE_COLORS[typeCode]}`}>
                            {TYPE_LABELS[typeCode]}
                          </span>
                        )}
                      </td>

                      {/* Referencia */}
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        <span className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 whitespace-nowrap">
                          {doc.document_number}
                        </span>
                      </td>

                      {/* Documento */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-3.5 h-3.5 text-blue-600" />
                          </div>
                          <span className="font-medium text-slate-800 truncate max-w-[130px]" title={doc.description ?? ''}>
                            {doc.description || '—'}
                          </span>
                        </div>
                      </td>

                      {/* Fecha */}
                      <td className="px-4 py-3.5 text-xs text-slate-600 whitespace-nowrap hidden md:table-cell">
                        {new Date(`${doc.document_date}T12:00:00`).toLocaleDateString('es', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </td>

                      {/* Comentario Cargador */}
                      <td className="px-4 py-3.5 hidden xl:table-cell">
                        <span className="text-xs text-slate-500 italic" title={doc.cargadorComment ?? ''}>
                          {truncate(doc.cargadorComment)}
                        </span>
                      </td>

                      {/* Cargado por */}
                      <td className="px-4 py-3.5 hidden lg:table-cell text-xs text-slate-600">
                        {doc.uploader?.full_name ?? '—'}
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3.5">
                        {doc.state?.code && <StateBadge state={doc.state.code} />}
                      </td>

                      {/* Ver PDF */}
                      <td className="px-4 py-3.5 text-center">
                        {doc.pdfPath ? (
                          <button
                            onClick={() => { setPdfDocId(doc.id); setPdfDocName(doc.description ?? doc.document_number); }}
                            title="Ver PDF en la aplicación"
                            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50 transition"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Procesar */}
                      <td className="px-4 py-3.5 text-center">
                        {isPending ? (
                          <button
                            onClick={() => setProcessDoc(doc)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition shadow-sm whitespace-nowrap"
                          >
                            <ScanLine className="w-3.5 h-3.5" />
                            Procesar
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Procesado</span>
                        )}
                      </td>
                    </tr>
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
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition"
              >
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
                    <span key={`d${i}`} className="px-1 text-slate-400">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition ${
                        currentPage === p
                          ? 'bg-blue-600 text-white'
                          : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {p}
                    </button>
                  ),
                )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* PDF Viewer Modal */}
      <PdfViewerModal
        open={!!pdfDocId}
        onClose={() => { setPdfDocId(null); setPdfDocName(null); }}
        documentId={pdfDocId}
        documentName={pdfDocName}
      />

      {/* Process Document Modal */}
      <ProcessDocumentModal
        open={!!processDoc}
        onClose={() => setProcessDoc(null)}
        onSuccess={handleProcessSuccess}
        doc={processDoc}
      />

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${
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
