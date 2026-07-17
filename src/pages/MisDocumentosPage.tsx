import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList, RefreshCw, Search, FileText, Download,
  History, ChevronLeft, ChevronRight, X, AlertCircle,
  Loader2, Filter, Building2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { DocumentStateCode, DocumentTypeCode } from '../types/database';
import { StateBadge } from '../components/StateBadge';
import { DocumentHistoryDrawer } from './mis-documentos/DocumentHistoryDrawer';

const PAGE_SIZE = 10;

// ── Types ─────────────────────────────────────────────────────────────────────

interface CommentRow {
  document_id: string;
  comment: string;
  user: { full_name: string; role: { name: string } | null } | null;
}

interface DocRow {
  id: string;
  document_number: string;
  document_date: string;
  description: string | null;
  created_at: string;
  document_type: { code: DocumentTypeCode; name: string };
  branch: { name: string; code: string };
  state: { code: DocumentStateCode; name: string };
}

interface EnrichedDoc extends DocRow {
  cargadorComment: string | null;
  procesadorComment: string | null;
  pdfPath: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function openPdf(filePath: string) {
  const { data, error } = await supabase.storage
    .from('document-pdfs')
    .createSignedUrl(filePath, 3600);
  if (error || !data?.signedUrl) {
    alert('No se pudo abrir el PDF. Intenta nuevamente.');
    return;
  }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

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

function truncate(text: string | null, max = 60): string {
  if (!text) return '—';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MisDocumentosPage() {
  const { profile } = useAuth();

  // Data
  const [docs, setDocs] = useState<EnrichedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<DocumentTypeCode | ''>('');
  const [stateFilter, setStateFilter] = useState<DocumentStateCode | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [referenceSearch, setReferenceSearch] = useState('');
  const [nameSearch, setNameSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);

  // History drawer
  const [historyDocId, setHistoryDocId] = useState<string | null>(null);
  const [historyDocName, setHistoryDocName] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setDataError(null);

    // Fetch documents uploaded by this CARGADOR
    const { data: rawDocs, error: docsErr } = await supabase
      .from('documents')
      .select(
        `id, document_number, document_date, description, created_at,
         document_type:document_types(code, name),
         branch:branches(name, code),
         state:document_states(code, name)`,
      )
      .eq('uploaded_by', profile.id)
      .order('created_at', { ascending: false });

    if (docsErr) { setDataError(docsErr.message); setLoading(false); return; }

    const list = (rawDocs ?? []) as unknown as DocRow[];

    if (list.length === 0) {
      setDocs([]);
      setLoading(false);
      return;
    }

    const ids = list.map((d) => d.id);

    // Batch fetch comments with author role info
    const { data: commentsRaw } = await supabase
      .from('document_comments')
      .select(
        `document_id, comment,
         user:profiles!user_id(full_name, role:roles(name))`,
      )
      .in('document_id', ids)
      .order('created_at', { ascending: true });

    // Batch fetch first PDF per document
    const { data: pdfsRaw } = await supabase
      .from('document_pdfs')
      .select('document_id, file_path')
      .in('document_id', ids);

    // Build maps
    const commentsByDoc: Record<string, CommentRow[]> = {};
    ((commentsRaw ?? []) as unknown as CommentRow[]).forEach((c) => {
      if (!commentsByDoc[c.document_id]) commentsByDoc[c.document_id] = [];
      commentsByDoc[c.document_id].push(c);
    });

    const pdfByDoc: Record<string, string> = {};
    (pdfsRaw ?? []).forEach((p: { document_id: string; file_path: string }) => {
      if (!pdfByDoc[p.document_id]) pdfByDoc[p.document_id] = p.file_path;
    });

    const enriched: EnrichedDoc[] = list.map((doc) => {
      const comments = commentsByDoc[doc.id] ?? [];
      const cargadorComment =
        comments.find(
          (c) =>
            c.user?.role?.name === 'CARGADOR' ||
            // fallback: comments created at upload time have no role join edge case
            (!c.user?.role?.name && comments.indexOf(c) === 0),
        )?.comment ?? null;
      const procesadorComment =
        comments.find((c) => c.user?.role?.name === 'PROCESADOR')?.comment ?? null;

      return {
        ...doc,
        cargadorComment,
        procesadorComment,
        pdfPath: pdfByDoc[doc.id] ?? null,
      };
    });

    setDocs(enriched);
    setLoading(false);
  }, [profile]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const refQ = referenceSearch.toLowerCase().trim();
    const nameQ = nameSearch.toLowerCase().trim();
    return docs.filter((d) => {
      if (typeFilter && d.document_type?.code !== typeFilter) return false;
      if (stateFilter && d.state?.code !== stateFilter) return false;
      if (dateFrom && d.document_date < dateFrom) return false;
      if (dateTo && d.document_date > dateTo) return false;
      if (refQ && !d.document_number.toLowerCase().includes(refQ)) return false;
      if (nameQ && !(d.description ?? '').toLowerCase().includes(nameQ)) return false;
      return true;
    });
  }, [docs, typeFilter, stateFilter, dateFrom, dateTo, referenceSearch, nameSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [typeFilter, stateFilter, dateFrom, dateTo, referenceSearch, nameSearch]);

  const stats = useMemo(() => ({
    total: docs.length,
    pendiente: docs.filter((d) => d.state?.code === 'PENDIENTE').length,
    aprobado: docs.filter((d) => d.state?.code === 'APROBADO').length,
    rechazado: docs.filter((d) => d.state?.code === 'RECHAZADO').length,
  }), [docs]);

  const activeFiltersCount = [typeFilter, stateFilter, dateFrom, dateTo, referenceSearch, nameSearch]
    .filter(Boolean).length;

  const clearFilters = () => {
    setTypeFilter('');
    setStateFilter('');
    setDateFrom('');
    setDateTo('');
    setReferenceSearch('');
    setNameSearch('');
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Mis Documentos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Todos tus documentos cargados
            {profile?.branch && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-400">
                <Building2 className="w-3 h-3" />{profile.branch.name}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={fetchDocs}
          disabled={loading}
          className="self-start sm:self-auto p-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats */}
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

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Filter toggle header */}
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
            <ChevronLeft
              className={`w-4 h-4 text-slate-400 transition-transform ${filtersOpen ? '-rotate-90' : 'rotate-180'}`}
            />
          </div>
        </button>

        {filtersOpen && (
          <div className="px-4 pb-4 pt-1 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Type */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as DocumentTypeCode | '')}
                className="w-full py-2 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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

            {/* Reference / code */}
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
              <label className="block text-xs font-medium text-slate-600 mb-1">Nombre del documento</label>
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
          </div>
        )}

        {/* Active filters summary */}
        {activeFiltersCount > 0 && (
          <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between bg-blue-50/60">
            <p className="text-xs text-slate-500">
              {filtered.length} resultado{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
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
          <ClipboardList className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">Mis Documentos</h2>
          {!loading && (
            <span className="ml-auto text-xs text-slate-400">{filtered.length} documento{filtered.length !== 1 ? 's' : ''}</span>
          )}
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
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
              <ClipboardList className="w-7 h-7 text-slate-400" />
            </div>
            <div className="text-center">
              <p className="text-slate-600 text-sm font-medium">
                {activeFiltersCount > 0
                  ? 'No se encontraron documentos con los filtros aplicados.'
                  : 'Aún no has cargado ningún documento.'}
              </p>
              {activeFiltersCount === 0 && (
                <p className="text-slate-400 text-xs mt-1">
                  Usa Caja General o Caja Chica para cargar tu primer documento.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-8">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Referencia</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden xl:table-cell">Com. Cargador</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden xl:table-cell">Com. Procesador</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">PDF</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Hist.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((doc, idx) => {
                  const rowNum = (currentPage - 1) * PAGE_SIZE + idx + 1;
                  const typeCode = doc.document_type?.code;
                  return (
                    <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                      {/* # */}
                      <td className="px-4 py-3.5 text-slate-400 text-xs">{rowNum}</td>

                      {/* Tipo */}
                      <td className="px-4 py-3.5">
                        {typeCode ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${TYPE_COLORS[typeCode]}`}>
                            {TYPE_LABELS[typeCode]}
                          </span>
                        ) : '—'}
                      </td>

                      {/* Referencia */}
                      <td className="px-4 py-3.5">
                        <span className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 whitespace-nowrap">
                          {doc.document_number}
                        </span>
                      </td>

                      {/* Nombre */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-3.5 h-3.5 text-blue-600" />
                          </div>
                          <span className="font-medium text-slate-800 truncate max-w-[140px]" title={doc.description ?? ''}>
                            {doc.description || '—'}
                          </span>
                        </div>
                      </td>

                      {/* Fecha */}
                      <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap hidden md:table-cell text-xs">
                        {new Date(`${doc.document_date}T12:00:00`).toLocaleDateString('es', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </td>

                      {/* Comentario Cargador */}
                      <td className="px-4 py-3.5 hidden xl:table-cell">
                        {doc.cargadorComment ? (
                          <span className="text-xs text-slate-600 italic" title={doc.cargadorComment}>
                            {truncate(doc.cargadorComment, 50)}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Comentario Procesador */}
                      <td className="px-4 py-3.5 hidden xl:table-cell">
                        {doc.procesadorComment ? (
                          <span className="text-xs text-slate-600 italic" title={doc.procesadorComment}>
                            {truncate(doc.procesadorComment, 50)}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3.5">
                        {doc.state?.code && <StateBadge state={doc.state.code} />}
                      </td>

                      {/* PDF */}
                      <td className="px-4 py-3.5 text-center">
                        {doc.pdfPath ? (
                          <button
                            onClick={() => openPdf(doc.pdfPath!)}
                            title="Ver / descargar PDF"
                            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50 transition"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Historial */}
                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => {
                            setHistoryDocId(doc.id);
                            setHistoryDocName(doc.description ?? doc.document_number);
                          }}
                          title="Ver historial"
                          className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
                        >
                          <History className="w-4 h-4" />
                        </button>
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

      {/* History drawer */}
      <DocumentHistoryDrawer
        open={!!historyDocId}
        onClose={() => { setHistoryDocId(null); setHistoryDocName(null); }}
        documentId={historyDocId}
        documentName={historyDocName}
      />
    </div>
  );
}
