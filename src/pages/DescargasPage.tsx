import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FolderArchive, RefreshCw, Search, FileText, Filter, X,
  ChevronLeft, ChevronRight, AlertCircle, Loader2,
  CheckSquare, Square, MinusSquare, Download, Building2,
  Calendar, Hash,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { DocumentStateCode, DocumentTypeCode } from '../types/database';
import { StateBadge } from '../components/StateBadge';

const PAGE_SIZE = 20;
const MAX_DOCS = 200;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ── Types ─────────────────────────────────────────────────────────────────────

interface BranchOption { id: string; name: string; code: string; }

interface RawDoc {
  id: string;
  document_number: string;
  document_date: string;
  description: string | null;
  amount: number;
  created_at: string;
  document_type: { code: DocumentTypeCode; name: string };
  branch: { id: string; name: string; code: string };
  state: { code: DocumentStateCode; name: string };
  uploader: { id: string; full_name: string } | null;
  processor: { id: string; full_name: string } | null;
}

interface DocRow extends RawDoc {
  pdfSize: number | null;
  hasPdf: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<DocumentTypeCode, string> = {
  CAJA_GENERAL: 'Caja General',
  CAJA_CHICA: 'Caja Chica',
};

const TYPE_OPTIONS: { value: DocumentTypeCode | ''; label: string }[] = [
  { value: '', label: 'Todos los tipos' },
  { value: 'CAJA_GENERAL', label: 'Caja General' },
  { value: 'CAJA_CHICA', label: 'Caja Chica' },
];

const STATE_OPTIONS: { value: DocumentStateCode | ''; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'APROBADO', label: 'Aprobado' },
  { value: 'RECHAZADO', label: 'Rechazado' },
  { value: 'ANULADO', label: 'Anulado' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(d: string) {
  return new Date(`${d}T12:00:00`).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

function buildZipName(branches: BranchOption[], branchId: string, dateFrom: string, dateTo: string): string {
  const branch = branches.find((b) => b.id === branchId);
  const branchPart = branch ? branch.code.toUpperCase() : 'TODAS';
  const fromPart = dateFrom ? dateFrom.replace(/-/g, '') : '';
  const toPart = dateTo ? dateFrom.replace(/-/g, '') : '';
  const datePart = fromPart && toPart ? `${fromPart}_${toPart}` : fromPart || toPart || new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `GESTOR_DOCUMENTAL_${branchPart}_${datePart}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DescargasPage() {
  const { session } = useAuth();

  const [docs, setDocs] = useState<DocRow[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // Filters
  const [branchFilter, setBranchFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<DocumentTypeCode | ''>('');
  const [stateFilter, setStateFilter] = useState<DocumentStateCode | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [referenceSearch, setReferenceSearch] = useState('');
  const [nameSearch, setNameSearch] = useState('');
  const [uploaderSearch, setUploaderSearch] = useState('');
  const [processorSearch, setProcessorSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(true);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Pagination
  const [page, setPage] = useState(1);

  // Download state
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadResult, setDownloadResult] = useState<{ downloaded: number; skipped: number } | null>(null);

  // ── Fetch branches ───────────────────────────────────────────────────────
  useEffect(() => {
    supabase
      .from('branches')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setBranches((data ?? []) as BranchOption[]));
  }, []);

  // ── Fetch documents ──────────────────────────────────────────────────────
  const fetchDocs = useCallback(async () => {
    setLoading(true);
    setDataError(null);

    let q = supabase
      .from('documents')
      .select(`
        id, document_number, document_date, description, amount, created_at,
        document_type:document_types(code, name),
        branch:branches(id, name, code),
        state:document_states(code, name),
        uploader:profiles!uploaded_by(id, full_name),
        processor:profiles!processed_by(id, full_name)
      `)
      .order('created_at', { ascending: false })
      .limit(2000);

    if (branchFilter) q = q.eq('branch_id', branchFilter);
    if (stateFilter) {
      const { data: stateData } = await supabase
        .from('document_states')
        .select('id')
        .eq('code', stateFilter)
        .maybeSingle();
      if (stateData?.id) q = q.eq('state_id', stateData.id);
    }
    if (typeFilter) {
      const { data: typeData } = await supabase
        .from('document_types')
        .select('id')
        .eq('code', typeFilter)
        .maybeSingle();
      if (typeData?.id) q = q.eq('document_type_id', typeData.id);
    }
    if (dateFrom) q = q.gte('document_date', dateFrom);
    if (dateTo) q = q.lte('document_date', dateTo);

    const { data: rawDocs, error } = await q;
    if (error) { setDataError(error.message); setLoading(false); return; }

    // Fetch latest PDF per doc
    const docIds = (rawDocs ?? []).map((d) => d.id);
    let pdfMap: Record<string, { size: number | null }> = {};
    if (docIds.length > 0) {
      const { data: pdfs } = await supabase
        .from('document_pdfs')
        .select('document_id, file_size')
        .in('document_id', docIds)
        .order('created_at', { ascending: false });

      for (const pdf of (pdfs ?? [])) {
        if (!pdfMap[pdf.document_id]) {
          pdfMap[pdf.document_id] = { size: pdf.file_size };
        }
      }
    }

    const rows: DocRow[] = (rawDocs ?? []).map((d) => ({
      ...(d as unknown as RawDoc),
      pdfSize: pdfMap[d.id]?.size ?? null,
      hasPdf: !!pdfMap[d.id],
    }));

    setDocs(rows);
    setSelectedIds(new Set());
    setPage(1);
    setLoading(false);
  }, [branchFilter, typeFilter, stateFilter, dateFrom, dateTo]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // ── Client-side filtering ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return docs.filter((d) => {
      if (referenceSearch && !d.document_number.toLowerCase().includes(referenceSearch.toLowerCase())) return false;
      if (nameSearch && !d.description?.toLowerCase().includes(nameSearch.toLowerCase())) return false;
      if (uploaderSearch && !d.uploader?.full_name.toLowerCase().includes(uploaderSearch.toLowerCase())) return false;
      if (processorSearch && !d.processor?.full_name.toLowerCase().includes(processorSearch.toLowerCase())) return false;
      return true;
    });
  }, [docs, referenceSearch, nameSearch, uploaderSearch, processorSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageDocs = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Selection helpers ────────────────────────────────────────────────────
  const pageIds = pageDocs.map((d) => d.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id));

  function toggleDoc(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) { pageIds.forEach((id) => next.delete(id)); }
      else { pageIds.forEach((id) => next.add(id)); }
      return next;
    });
  }

  function selectAll() {
    const ids = filtered.slice(0, MAX_DOCS).map((d) => d.id);
    setSelectedIds(new Set(ids));
  }

  function clearSelection() { setSelectedIds(new Set()); }

  // ── Selected rows stats ──────────────────────────────────────────────────
  const selectedRows = useMemo(
    () => filtered.filter((d) => selectedIds.has(d.id)),
    [filtered, selectedIds],
  );

  const estimatedBytes = useMemo(
    () => selectedRows.reduce((sum, d) => sum + (d.pdfSize ?? 0), 0),
    [selectedRows],
  );

  const zipName = buildZipName(branches, branchFilter, dateFrom, dateTo);

  // ── Download ─────────────────────────────────────────────────────────────
  async function handleDownload() {
    if (selectedIds.size === 0) return;
    setDownloading(true);
    setDownloadError(null);
    setDownloadResult(null);

    const ids = Array.from(selectedIds).slice(0, MAX_DOCS);
    const token = session?.access_token ?? SUPABASE_ANON_KEY;

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/bulk-download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ mode: 'ids', document_ids: ids, zip_name: zipName }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error((errJson as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const downloaded = Number(res.headers.get('X-Downloaded-Count') ?? 0);
      const skipped = Number(res.headers.get('X-Skipped-Count') ?? 0);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${zipName}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      setDownloadResult({ downloaded, skipped });
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'Error inesperado.');
    } finally {
      setDownloading(false);
    }
  }

  // ── Filter panel ─────────────────────────────────────────────────────────
  const hasActiveFilters = branchFilter || typeFilter || stateFilter || dateFrom || dateTo || referenceSearch || nameSearch || uploaderSearch || processorSearch;

  function clearFilters() {
    setBranchFilter(''); setTypeFilter(''); setStateFilter('');
    setDateFrom(''); setDateTo('');
    setReferenceSearch(''); setNameSearch('');
    setUploaderSearch(''); setProcessorSearch('');
    setPage(1);
  }

  const inputCls = 'w-full text-sm rounded-lg border border-slate-200 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 placeholder:text-slate-400 transition';
  const selectCls = inputCls;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-slate-50 p-4 sm:p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <FolderArchive className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">Descargas Masivas</h1>
            <p className="text-xs text-slate-500">Selecciona documentos y genera un ZIP con sus PDFs</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border transition ${filtersOpen ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            <Filter className="w-4 h-4" />
            Filtros
            {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-blue-600" />}
          </button>
          <button
            onClick={fetchDocs}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Filters */}
      {filtersOpen && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Sucursal</label>
              <select className={selectCls} value={branchFilter} onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }}>
                <option value="">Todas las sucursales</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Tipo</label>
              <select className={selectCls} value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value as DocumentTypeCode | ''); setPage(1); }}>
                {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
              <select className={selectCls} value={stateFilter} onChange={(e) => { setStateFilter(e.target.value as DocumentStateCode | ''); setPage(1); }}>
                {STATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Fecha desde</label>
              <input type="date" className={inputCls} value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Fecha hasta</label>
              <input type="date" className={inputCls} value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">N° Referencia / Código</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input className={`${inputCls} pl-7`} placeholder="Buscar referencia…" value={referenceSearch} onChange={(e) => { setReferenceSearch(e.target.value); setPage(1); }} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Nombre / Descripción</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input className={`${inputCls} pl-7`} placeholder="Buscar descripción…" value={nameSearch} onChange={(e) => { setNameSearch(e.target.value); setPage(1); }} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Cargador</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input className={`${inputCls} pl-7`} placeholder="Nombre del cargador…" value={uploaderSearch} onChange={(e) => { setUploaderSearch(e.target.value); setPage(1); }} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Procesador</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input className={`${inputCls} pl-7`} placeholder="Nombre del procesador…" value={processorSearch} onChange={(e) => { setProcessorSearch(e.target.value); setPage(1); }} />
              </div>
            </div>
          </div>
          {hasActiveFilters && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <button onClick={clearFilters} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-rose-600 transition font-medium">
                <X className="w-3.5 h-3.5" /> Limpiar filtros
              </button>
            </div>
          )}
        </div>
      )}

      {/* Selection bar */}
      {(selectedIds.size > 0 || filtered.length > 0) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-3.5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{filtered.length}</span> documentos encontrados
            </span>
            {filtered.length > 0 && (
              <>
                <span className="text-slate-300">|</span>
                <button onClick={togglePage} className="text-xs text-blue-600 hover:text-blue-800 font-medium transition">
                  {allPageSelected ? 'Deseleccionar página' : 'Seleccionar página'}
                </button>
                <button onClick={selectAll} className="text-xs text-blue-600 hover:text-blue-800 font-medium transition">
                  Seleccionar todos ({Math.min(filtered.length, MAX_DOCS)})
                </button>
                {selectedIds.size > 0 && (
                  <button onClick={clearSelection} className="text-xs text-slate-400 hover:text-rose-600 font-medium transition">
                    Limpiar selección
                  </button>
                )}
              </>
            )}
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{selectedIds.size}</span> seleccionados
                {estimatedBytes > 0 && (
                  <span className="text-slate-400 ml-1.5">· ~{fmtBytes(estimatedBytes)}</span>
                )}
              </div>
              <div className="text-xs text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded border border-slate-200 truncate max-w-[200px]">
                {zipName}.zip
              </div>
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:scale-95 transition disabled:opacity-60 shadow-sm"
              >
                {downloading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparando…</>
                  : <><Download className="w-4 h-4" /> Descargar ZIP</>
                }
              </button>
            </div>
          )}
        </div>
      )}

      {/* Download result */}
      {downloadResult && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
          <Download className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Descarga completada</p>
            <p className="text-emerald-700 text-xs mt-0.5">
              {downloadResult.downloaded} archivo{downloadResult.downloaded !== 1 ? 's' : ''} incluido{downloadResult.downloaded !== 1 ? 's' : ''}
              {downloadResult.skipped > 0 ? ` · ${downloadResult.skipped} omitido${downloadResult.skipped !== 1 ? 's' : ''} (ver _INFORME.txt en el ZIP)` : ''}
            </p>
          </div>
          <button onClick={() => setDownloadResult(null)} className="ml-auto text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {downloadError && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Error en la descarga</p>
            <p className="text-rose-700 text-xs mt-0.5">{downloadError}</p>
          </div>
          <button onClick={() => setDownloadError(null)} className="ml-auto text-rose-400 hover:text-rose-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Download overlay */}
      {downloading && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 max-w-sm w-full mx-4">
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
              <FolderArchive className="w-8 h-8 text-blue-600" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-slate-900 text-lg">Preparando descarga</p>
              <p className="text-sm text-slate-500 mt-1">
                Recopilando {selectedIds.size} documento{selectedIds.size !== 1 ? 's' : ''} y generando ZIP…
              </p>
              <p className="text-xs text-slate-400 mt-2">Esto puede tomar unos segundos</p>
            </div>
            <div className="flex items-center gap-2 text-blue-600">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-medium">Procesando</span>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {dataError && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {dataError}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left w-10">
                  <button
                    onClick={togglePage}
                    className="text-slate-400 hover:text-blue-600 transition"
                    title={allPageSelected ? 'Deseleccionar página' : 'Seleccionar página'}
                  >
                    {allPageSelected
                      ? <CheckSquare className="w-4 h-4 text-blue-600" />
                      : somePageSelected
                        ? <MinusSquare className="w-4 h-4 text-blue-500" />
                        : <Square className="w-4 h-4" />
                    }
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Documento</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Sucursal</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">Cargando documentos…</p>
                  </td>
                </tr>
              ) : pageDocs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-500">Sin resultados</p>
                    <p className="text-xs text-slate-400 mt-1">Ajusta los filtros para encontrar documentos</p>
                  </td>
                </tr>
              ) : (
                pageDocs.map((doc) => {
                  const isSelected = selectedIds.has(doc.id);
                  return (
                    <tr
                      key={doc.id}
                      onClick={() => toggleDoc(doc.id)}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-slate-50'}`}
                    >
                      <td className="px-4 py-3.5">
                        {isSelected
                          ? <CheckSquare className="w-4 h-4 text-blue-600" />
                          : <Square className="w-4 h-4 text-slate-300" />
                        }
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-slate-800 flex items-center gap-1.5">
                          <Hash className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{doc.document_number}</span>
                        </div>
                        {doc.description && (
                          <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px]">{doc.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span className="text-slate-700">{doc.branch?.name}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 font-mono">{doc.branch?.code}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${doc.document_type?.code === 'CAJA_GENERAL' ? 'bg-blue-100 text-blue-700' : 'bg-teal-100 text-teal-700'}`}>
                          {TYPE_LABELS[doc.document_type?.code]}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <StateBadge state={doc.state?.code} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {fmtDate(doc.document_date)}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {doc.hasPdf ? (
                          <div className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-blue-500" />
                            <span className="text-xs text-slate-600">{fmtBytes(doc.pdfSize)}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Sin PDF</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <p className="text-xs text-slate-500">
              Página {page} de {totalPages} · {filtered.length} documentos
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pg: number;
                if (totalPages <= 5) pg = i + 1;
                else if (page <= 3) pg = i + 1;
                else if (page >= totalPages - 2) pg = totalPages - 4 + i;
                else pg = page - 2 + i;
                return (
                  <button
                    key={pg}
                    onClick={() => setPage(pg)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-medium transition ${pg === page ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                  >
                    {pg}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
