import { useEffect, useState } from 'react';
import {
  X, FileText, Building2, Calendar, Hash, User, DollarSign,
  MessageSquare, Clock, Loader2, AlertCircle, ShieldOff, ExternalLink,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { DocumentStateCode, DocumentTypeCode } from '../../types/database';
import { StateBadge } from '../../components/StateBadge';
import { DocumentTimeline } from '../../components/DocumentTimeline';

// ── Exported type (used by SeguimientoPage) ───────────────────────────────────

export interface ConsultorDoc {
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
  pdfPath: string | null;
}

// ── Internal types ─────────────────────────────────────────────────────────────

interface CommentEntry {
  id: string;
  comment: string;
  created_at: string;
  user: { full_name: string; role: { name: string } | null } | null;
}

interface DocumentDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  doc: ConsultorDoc | null;
  onViewPdf: (docId: string, docName: string | null) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<DocumentTypeCode, string> = {
  CAJA_GENERAL: 'Caja General',
  CAJA_CHICA: 'Caja Chica',
};

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
      {children}
    </h3>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <div className="text-slate-400 flex-shrink-0 mt-0.5">{icon}</div>
      <div>
        <p className="text-xs text-slate-400 leading-none mb-0.5">{label}</p>
        <div className="text-sm text-slate-800 font-medium">{value}</div>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DocumentDetailDrawer({ open, onClose, doc, onViewPdf }: DocumentDetailDrawerProps) {
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !doc) return;
    setLoadingComments(true);
    setLoadError(null);
    setComments([]);

    supabase
      .from('document_comments')
      .select('id, comment, created_at, user:profiles!user_id(full_name, role:roles(name))')
      .eq('document_id', doc.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) setLoadError(error.message);
        else setComments((data ?? []) as unknown as CommentEntry[]);
        setLoadingComments(false);
      });
  }, [open, doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!doc) return null;

  const cargadorComments = comments.filter((c) => c.user?.role?.name === 'CARGADOR');
  const procesadorComments = comments.filter((c) => c.user?.role?.name === 'PROCESADOR');

  const fmt = (dateStr: string) =>
    new Date(dateStr).toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const fmtDate = (dateStr: string) =>
    new Date(`${dateStr}T12:00:00`).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <>
      {open && <div className="fixed inset-0 bg-slate-900/40 z-40" onClick={onClose} />}
      <aside className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[520px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-800 leading-tight truncate max-w-[340px]">
                {doc.description ?? doc.document_number}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {TYPE_LABELS[doc.document_type?.code]} · {doc.branch?.name}
              </p>
              <div className="mt-1.5">
                <StateBadge state={doc.state?.code} />
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PDF button */}
        {doc.pdfPath && (
          <div className="px-5 py-3 border-b border-slate-100 flex-shrink-0">
            <button
              onClick={() => onViewPdf(doc.id, doc.description ?? doc.document_number)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition shadow-sm"
            >
              <ExternalLink className="w-4 h-4" />
              Ver PDF adjunto
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {loadError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {loadError}
            </div>
          )}

          {/* ── Información del documento ── */}
          <div>
            <SectionHeader>Información del Documento</SectionHeader>
            <div className="space-y-3.5">
              <InfoRow icon={<Building2 className="w-4 h-4" />} label="Sucursal" value={`${doc.branch?.name} (${doc.branch?.code})`} />
              <InfoRow icon={<FileText className="w-4 h-4" />} label="Tipo" value={TYPE_LABELS[doc.document_type?.code]} />
              <InfoRow
                icon={<Hash className="w-4 h-4" />}
                label={doc.document_type?.code === 'CAJA_CHICA' ? 'Código de reposición' : 'N° Comprobante'}
                value={<span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-sm">{doc.document_number}</span>}
              />
              <InfoRow icon={<Calendar className="w-4 h-4" />} label="Fecha del documento" value={fmtDate(doc.document_date)} />
              {doc.amount > 0 && (
                <InfoRow
                  icon={<DollarSign className="w-4 h-4" />}
                  label="Importe"
                  value={doc.amount.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                />
              )}
              <InfoRow icon={<Clock className="w-4 h-4" />} label="Fecha de carga" value={fmt(doc.created_at)} />
            </div>
          </div>

          {/* ── Cargador ── */}
          <div>
            <SectionHeader>Cargador</SectionHeader>
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <span className="text-sm font-semibold text-slate-800">{doc.uploader?.full_name ?? '—'}</span>
              </div>
              {loadingComments ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 pt-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando comentarios…
                </div>
              ) : cargadorComments.length === 0 ? (
                <p className="text-xs text-slate-400 italic pt-1">Sin comentarios del cargador.</p>
              ) : (
                cargadorComments.map((c) => (
                  <div key={c.id} className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-3 h-3 text-slate-400" />
                      <time className="text-[11px] text-slate-400">{fmt(c.created_at)}</time>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed bg-white rounded-lg border border-slate-200 px-3 py-2">
                      {c.comment}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── Procesador ── */}
          <div>
            <SectionHeader>Procesador</SectionHeader>
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
              {doc.processor ? (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center">
                      <User className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <span className="text-sm font-semibold text-slate-800">{doc.processor.full_name}</span>
                    <span className="text-xs text-slate-400">—</span>
                    <StateBadge state={doc.state?.code} />
                  </div>
                  {loadingComments ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400 pt-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando comentarios…
                    </div>
                  ) : procesadorComments.length === 0 ? (
                    <p className="text-xs text-slate-400 italic pt-1">Sin comentarios del procesador.</p>
                  ) : (
                    procesadorComments.map((c) => (
                      <div key={c.id} className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-3 h-3 text-slate-400" />
                          <time className="text-[11px] text-slate-400">{fmt(c.created_at)}</time>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed bg-white rounded-lg border border-slate-200 px-3 py-2">
                          {c.comment}
                        </p>
                      </div>
                    ))
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <ShieldOff className="w-4 h-4 text-slate-400" />
                  <span>Pendiente de procesamiento</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Historial cronológico (unified timeline) ── */}
          <div>
            <SectionHeader>Historial Cronológico</SectionHeader>
            {open && <DocumentTimeline documentId={doc.id} compact />}
          </div>

        </div>
      </aside>
    </>
  );
}
