import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Eye, RefreshCw, Search, FileText, Download,
  ChevronLeft, ChevronRight, X, AlertCircle,
  Loader2, Filter, BookOpen,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { DocumentStateCode, DocumentTypeCode } from '../types/database';
import { StateBadge } from '../components/StateBadge';
import { PdfViewerModal } from './procesador/PdfViewerModal';
import { DocumentDetailDrawer, type ConsultorDoc } from './consultor/DocumentDetailDrawer';

const PAGE_SIZE = 12;

// ── Local types ───────────────────────────────────────────────────────────────

interface BranchOption { id: string; name: string; code: string; }

interface RawDoc {
  id: string;
  document_number: string;
  document_date: string;
  description: string | null;
  amount: number;
  created_at: string;
  updated_at: string;
  document_type: { code: DocumentTypeCode; name: string };
  branch: { id: string; name: string; code: string };
  state: { code: DocumentStateCode; name: string };
  uploader: { id: string; full_name: string } | null;
  processor: { id: string; full_name: string } | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

export function SeguimientoPage() {
  // Data
  const [docs, setDocs] = useState<ConsultorDoc[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // Filters
  const [branchFilter, setBranchFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<DocumentTypeCode | ''>('');
  const [stateFilter, setStateFilter] = useState<DocumentStateCode | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [comprobanteSearch, setComprobanteSearch] = useState('');
  const [codigoSearch, setCodigoSearch] = useState('');
  const [nameSearch, setNameSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(true);

  // Pagination
  const [page, setPage] = useState(1);

  // Modals
  const [pdfDocId, setPdfDocId] = useState<string | null>(null);
  const [pdfDocName, setPdfDocName] = useState<string | null>(null);
  const [detailDoc, setDetailDoc] = useState<ConsultorDoc | null>(null);

  // ── Fetch branches ─────────────────────────────────────────────────────────
  useEffect(() => {
    supabase
      .from('branches')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        setBranches((data ?? []) as BranchOption[]);
      });
  }, []);

  // ── Fetch documents ────────────────────────────────────────────────────────
  const fetchDocs = useCallback(async () => {
    setLoading(true);
    setDataError(null);

    const { data: rawDocs, error: docsErr } = await supabase
      .from('documents')
      .select(
        `id, document_number, document_date, description, amount, created_at, updated_at,
         document_type:document_types(code, name),
         branch:branches(id, name, code),
         state:document_states(code, name),
         uploader:profiles!uploaded_by(id, full_name),
         processor:profiles!processed_by(id, full_name)`,
      )
      .order('created_at', { ascending: false });

    if (docsErr) { setDataError(docsErr.message); setLoading(false); return; }

    const list = (rawDocs ?? []) as unknown as RawDoc[];

    if (list.length === 0) { setDocs([]); setLoading(false); return; }

    // Batch fetch first PDF per document
    const ids = list.map((d) => d.id);
    const { data: pdfsRaw } = await supabase
      .from('document_pdfs')
      .select('document_id, file_path')
      .in('document_id', ids);

    const pdfByDoc: Record<string, string> = {};
    (pdfsRaw ?? []).forEach((p: { document_id: string; file_path: string }) => {
      if (!pdfByDoc[p.document_id]) pdfByDoc[p.document_id] = p.file_path;
    });

    setDocs(list.map((doc) => ({ ...doc, pdfPath: pdfByDoc[doc.id] ?? null })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const nameQ = nameSearch.toLowerCase().trim();
    const comQ = comprobanteSearch.toLowerCase().trim();
    const codQ = codigoSearch.toLowerCase().trim();

    return docs.filter((d) => {
      if (branchFilter && d.branch?.id !== branchFilter) return false;
      if (typeFilter && d.document_type?.code !== typeFilter) return false;
      if (stateFilter && d.state?.code !== stateFilter) return false;
      if (dateFrom && d.document_date < dateFrom) return false;
      if (dateTo && d.document_date > dateTo) return false;
      if (nameQ && !(d.description ?? '').toLowerCase().includes(nameQ)) return false;
      // Comprobante only matches CAJA_GENERAL docs
      if (comQ) {
        if (d.document_type?.code !== 'CAJA_GENERAL') return false;
        if (!d.document_number.toLowerCase().includes(comQ)) return false;
      }
      // Código de reposición only matches CAJA_CHICA docs
      if (codQ) {
        if (d.document_type?.code !== 'CAJA_CHICA') return false;
        if (!d.document_number.toLowerCase().includes(codQ)) return false;
      }
      return true;
    });
  }, [docs, branchFilter, typeFilter, stateFilter, dateFrom, dateTo, nameSearch, comprobanteSearch, codigoSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [branchFilter, typeFilter, stateFilter, dateFrom, dateTo, nameSearch, comprobanteSearch, codigoSearch]);

  const stats = useMemo(() => ({
    total: docs.length,
    pendiente: docs.filter((d) => d.state?.code === 'PENDIENTE').length,
    aprobado: docs.filter((d) => d.state?.code === 'APROBADO').length,
    rechazado: docs.filter((d) => d.state?.code === 'RECHAZADO').length,
    anulado: docs.filter((d) => d.state?.code === 'ANULADO').length,
  }), [docs]);

  const activeFiltersCount = [branchFilter, typeFilter, stateFilter, dateFrom, dateTo, nameSearch, comprobanteSearch, codigoSearch]
    .filter(Boolean).length;

  const clearFilters = () => {
    setBranchFilter(''); setTypeFilter(''); setStateFilter('');
    setDateFrom(''); setDateTo('');
    setNameSearch(''); setComprobanteSearch(''); setCodigoSearch('');
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Seguimiento Documental</h1>
          <p className="text-sm text-slate-500 mt-0.5">Vista de lectura de todos los documentos del sistema</p>
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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-slate-800', bg: 'bg-white' },
          { label: 'Pendientes', value: stats.pendiente, color: 'text-amber-700', bg: 'bg-amber-50' },
          { label: 'Aprobados', value: stats.aprobado, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'Rechazados', value: stats.rechazado, color: 'text-rose-600', bg: 'bg-rose-50' },
          { label: 'Anulados', value: stats.anulado, color: 'text-slate-500', bg: 'bg-slate-100' },
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
            {/* Sucursal */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Sucursal</label>
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Todas las sucursales</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                ))}
              </select>
            </div>

            {/* Tipo */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de documento</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as DocumentTypeCode | '')}
                className="w-full py-2 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Estado */}
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

            {/* Nombre */}
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

            {/* Fecha desde */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Fecha inicio</label>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Fecha hasta */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Fecha fin</label>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Comprobante (CAJA_GENERAL) */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                N° Comprobante
                <span className="ml-1 text-slate-400 font-normal">(Caja General)</span>
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={comprobanteSearch}
                  onChange={(e) => setComprobanteSearch(e.target.value)}
                  placeholder="Buscar…"
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Código reposición (CAJA_CHICA) */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Código de reposición
                <span className="ml-1 text-slate-400 font-normal">(Caja Chica)</span>
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={codigoSearch}
                  onChange={(e) => setCodigoSearch(e.target.value)}
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
          <BookOpen className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">Documentos</h2>
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

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
              <BookOpen className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-slate-600 text-sm font-medium">
              {activeFiltersCount > 0
                ? 'No se encontraron documentos con los filtros aplicados.'
                : 'No hay documentos en el sistema.'}
            </p>
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Cargado por</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">PDF</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Ver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((doc, idx) => {
                  const rowNum = (currentPage - 1) * PAGE_SIZE + idx + 1;
                  const typeCode = doc.document_type?.code;
                  const isSelected = detailDoc?.id === doc.id;
                  return (
                    <tr
                      key={doc.id}
                      className={`hover:bg-slate-50 transition-colors cursor-pointer ${isSelected ? 'bg-blue-50/60 ring-1 ring-inset ring-blue-200' : ''}`}
                      onClick={() => setDetailDoc(doc)}
                    >
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

                      {/* Cargado por */}
                      <td className="px-4 py-3.5 text-xs text-slate-600 hidden lg:table-cell">
                        {doc.uploader?.full_name ?? '—'}
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3.5">
                        {doc.state?.code && <StateBadge state={doc.state.code} />}
                      </td>

                      {/* PDF */}
                      <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                        {doc.pdfPath ? (
                          <button
                            onClick={() => { setPdfDocId(doc.id); setPdfDocName(doc.description ?? doc.document_number); }}
                            title="Ver PDF"
                            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50 transition"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Ver detalles */}
                      <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setDetailDoc(doc)}
                          title="Ver detalles"
                          className={`w-8 h-8 inline-flex items-center justify-center rounded-lg transition ${
                            isSelected ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                          }`}
                        >
                          <Eye className="w-4 h-4" />
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

      {/* PDF Viewer Modal */}
      <PdfViewerModal
        open={!!pdfDocId}
        onClose={() => { setPdfDocId(null); setPdfDocName(null); }}
        documentId={pdfDocId}
        documentName={pdfDocName}
      />

      {/* Document Detail Drawer */}
      <DocumentDetailDrawer
        open={!!detailDoc}
        onClose={() => setDetailDoc(null)}
        doc={detailDoc}
        onViewPdf={(docId, docName) => { setPdfDocId(docId); setPdfDocName(docName); }}
      />
    </div>
  );
}
