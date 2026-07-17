import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FolderOpen, Plus, RefreshCw, Search, FileText,
  Download, ChevronLeft, ChevronRight, X,
  AlertCircle, Building2, Loader2, Ban, MessagesSquare,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import type { Document, DocumentStateCode, DocumentTypeCode } from '../../types/database';
import { StateBadge } from '../../components/StateBadge';
import { UploadDocumentDrawer } from './UploadDocumentDrawer';
import { AnnulDocumentModal, type AnnulTarget } from '../admin/AnnulDocumentModal';
import { CommentCorrectionDrawer } from '../admin/CommentCorrectionDrawer';

const PAGE_SIZE = 10;

const STATE_FILTER_OPTIONS: { value: DocumentStateCode | ''; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'APROBADO', label: 'Aprobado' },
  { value: 'RECHAZADO', label: 'Rechazado' },
  { value: 'ANULADO', label: 'Anulado' },
];

type DocWithJoins = Document & {
  state: { code: DocumentStateCode; name: string };
  branch: { name: string; code: string };
  document_type: { code: string };
};

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

export interface CajaDocumentPageConfig {
  title: string;
  documentTypeCode: DocumentTypeCode;
  referenceLabel: string;
  referencePlaceholder: string;
  searchPlaceholder: string;
  tableColumnHeader: string;
}

interface CajaDocumentPageProps {
  config: CajaDocumentPageConfig;
}

export function CajaDocumentPage({ config }: CajaDocumentPageProps) {
  const { profile, assignedBranches } = useAuth();
  const role = profile?.role?.name;
  const isCargador = role === 'CARGADOR';
  const isAdmin = role === 'ADMINISTRADOR';
  const isProcessador = role === 'PROCESADOR';

  // Lookup IDs
  const [documentTypeId, setDocumentTypeId] = useState<string | null>(null);
  const [pendingStateId, setPendingStateId] = useState<string | null>(null);
  const [lookupReady, setLookupReady] = useState(false);

  // Documents
  const [docs, setDocs] = useState<DocWithJoins[]>([]);
  const [pdfMap, setPdfMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<DocumentStateCode | ''>('');
  const [page, setPage] = useState(1);

  // Upload drawer
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Admin modals
  const [annulTarget, setAnnulTarget] = useState<AnnulTarget | null>(null);
  const [commentDocId, setCommentDocId] = useState<string | null>(null);
  const [commentDocName, setCommentDocName] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Load lookup IDs once when documentTypeCode changes
  useEffect(() => {
    setLookupReady(false);
    Promise.all([
      supabase.from('document_types').select('id').eq('code', config.documentTypeCode).maybeSingle(),
      supabase.from('document_states').select('id').eq('code', 'PENDIENTE').maybeSingle(),
    ]).then(([typeRes, stateRes]) => {
      setDocumentTypeId(typeRes.data?.id ?? null);
      setPendingStateId(stateRes.data?.id ?? null);
      setLookupReady(true);
    });
  }, [config.documentTypeCode]);

  const fetchDocs = useCallback(async () => {
    if (!profile || !documentTypeId) return;
    setLoading(true);
    setDataError(null);

    let query = supabase
      .from('documents')
      .select(
        '*, state:document_states(code, name), branch:branches(name, code), document_type:document_types(code)',
      )
      .eq('document_type_id', documentTypeId)
      .order('created_at', { ascending: false });

    if (isCargador) {
      query = query.eq('uploaded_by', profile.id);
    }

    const { data, error } = await query;
    if (error) { setDataError(error.message); setLoading(false); return; }

    const list = (data ?? []) as DocWithJoins[];
    setDocs(list);

    if (list.length > 0) {
      const { data: pdfData } = await supabase
        .from('document_pdfs')
        .select('document_id, file_path')
        .in('document_id', list.map((d) => d.id));
      const map: Record<string, string> = {};
      (pdfData ?? []).forEach((p: { document_id: string; file_path: string }) => {
        if (!map[p.document_id]) map[p.document_id] = p.file_path;
      });
      setPdfMap(map);
    } else {
      setPdfMap({});
    }

    setLoading(false);
  }, [profile, isCargador, documentTypeId]);

  useEffect(() => { if (lookupReady) fetchDocs(); }, [fetchDocs, lookupReady]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return docs.filter((d) => {
      if (stateFilter && d.state?.code !== stateFilter) return false;
      if (
        q &&
        !d.document_number.toLowerCase().includes(q) &&
        !(d.description ?? '').toLowerCase().includes(q)
      ) return false;
      return true;
    });
  }, [docs, search, stateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, stateFilter]);

  const stats = useMemo(() => ({
    total: docs.length,
    pendiente: docs.filter((d) => d.state?.code === 'PENDIENTE').length,
    aprobado: docs.filter((d) => d.state?.code === 'APROBADO').length,
    rechazado: docs.filter((d) => d.state?.code === 'RECHAZADO').length,
  }), [docs]);

  const clearFilters = () => { setSearch(''); setStateFilter(''); };
  const hasFilters = search || stateFilter;
  const canUpload = isCargador && !!profile?.branch_id && lookupReady && !!documentTypeId && !!pendingStateId;
  const sectionKey = config.documentTypeCode === 'CAJA_GENERAL' ? 'can_caja_general' : 'can_caja_chica';
  const canAccessSection = !isProcessador || assignedBranches === null || assignedBranches.some((b) => b[sectionKey]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{config.title}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isCargador ? 'Mis documentos cargados' : `Documentos de ${config.title}`}
            {isCargador && profile?.branch && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-400">
                <Building2 className="w-3 h-3" />{profile.branch.name}
              </span>
            )}
          </p>
        </div>
        {canAccessSection && (
          <div className="flex items-center gap-2">
            <button
              onClick={fetchDocs}
              disabled={loading}
              className="p-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {canUpload && (
              <button
                onClick={() => setDrawerOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition shadow-sm"
              >
                <Plus className="w-4 h-4" />Cargar Documento
              </button>
            )}
          </div>
        )}
      </div>

      {/* No section access */}
      {!canAccessSection && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
            <Ban className="w-8 h-8 text-slate-400" />
          </div>
          <div className="text-center">
            <p className="text-slate-700 font-semibold">Sin acceso a esta sección</p>
            <p className="text-slate-400 text-sm mt-1">
              No tienes permisos para acceder a {config.title}. Contacta al administrador.
            </p>
          </div>
        </div>
      )}

      {canAccessSection && (<>
      {/* No-branch warning */}
      {isCargador && !profile?.branch_id && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            <span className="font-semibold">Sin sucursal asignada.</span> Contacta al administrador para que asigne tu sucursal antes de cargar documentos.
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: isCargador ? 'Mis documentos' : 'Total', value: stats.total, color: 'text-slate-800', bg: 'bg-white' },
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

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder={config.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as DocumentStateCode | '')}
            className="py-2 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white sm:w-52"
          >
            {STATE_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        {hasFilters && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
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
          <FolderOpen className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">
            {isCargador ? 'Mis Documentos' : `Documentos de ${config.title}`}
          </h2>
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
              <FolderOpen className="w-7 h-7 text-slate-400" />
            </div>
            <div className="text-center">
              <p className="text-slate-600 text-sm font-medium">
                {hasFilters
                  ? 'No se encontraron documentos con los filtros aplicados.'
                  : 'No hay documentos todavía.'}
              </p>
              {isCargador && !hasFilters && (
                <p className="text-slate-400 text-xs mt-1">
                  Usa el botón "Cargar Documento" para agregar el primero.
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">
                    {config.tableColumnHeader}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Registrado</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">PDF</th>
                  {isAdmin && (
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Admin</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((doc, idx) => {
                  const rowNum = (currentPage - 1) * PAGE_SIZE + idx + 1;
                  const pdfPath = pdfMap[doc.id];
                  return (
                    <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3.5 text-slate-400 text-xs">{rowNum}</td>
                      <td className="px-4 py-3.5 text-slate-700 whitespace-nowrap">
                        {new Date(`${doc.document_date}T12:00:00`).toLocaleDateString('es', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-4 h-4 text-blue-600" />
                          </div>
                          <span className="font-medium text-slate-800 truncate max-w-[160px]">
                            {doc.description || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        <span className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {doc.document_number}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {doc.state?.code && <StateBadge state={doc.state.code} />}
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell text-xs text-slate-400 whitespace-nowrap">
                        {doc.created_at
                          ? new Date(doc.created_at).toLocaleDateString('es', {
                              day: '2-digit', month: 'short', year: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {pdfPath ? (
                          <button
                            onClick={() => openPdf(pdfPath)}
                            title="Ver / descargar PDF"
                            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50 transition"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {doc.state?.code !== 'ANULADO' && (
                              <button
                                onClick={() => setAnnulTarget(doc as unknown as AnnulTarget)}
                                title="Anular documento"
                                className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 transition"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setCommentDocId(doc.id);
                                setCommentDocName(doc.description ?? doc.document_number);
                              }}
                              title="Gestionar comentarios"
                              className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-violet-600 hover:bg-violet-50 transition"
                            >
                              <MessagesSquare className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
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
      </>)}

      {/* Upload drawer */}
      {profile && lookupReady && documentTypeId && pendingStateId && (
        <UploadDocumentDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onSuccess={() => {
            showToast('Documento cargado exitosamente. Aparece en Mis Documentos.');
            fetchDocs();
          }}
          profile={profile}
          documentTypeId={documentTypeId}
          pendingStateId={pendingStateId}
          documentTypeLabel={config.title}
          documentTypeCode={config.documentTypeCode}
          referenceLabel={config.referenceLabel}
          referencePlaceholder={config.referencePlaceholder}
        />
      )}

      {/* Admin: Annul modal */}
      {isAdmin && (
        <AnnulDocumentModal
          open={!!annulTarget}
          onClose={() => setAnnulTarget(null)}
          doc={annulTarget}
          onSuccess={(docId) => {
            setDocs((prev) =>
              prev.map((d) =>
                d.id === docId
                  ? { ...d, state: { ...d.state, code: 'ANULADO' as DocumentStateCode, name: 'Anulado' } }
                  : d,
              ),
            );
            showToast('Documento anulado correctamente.');
            setAnnulTarget(null);
          }}
        />
      )}

      {/* Admin: Comment correction drawer */}
      {isAdmin && (
        <CommentCorrectionDrawer
          open={!!commentDocId}
          onClose={() => { setCommentDocId(null); setCommentDocName(null); }}
          documentId={commentDocId}
          documentName={commentDocName}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg bg-emerald-600 text-white text-sm font-medium">
          {toast}
          <button onClick={() => setToast(null)} className="ml-1 opacity-80 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
