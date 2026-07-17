import { useEffect, useRef, useState } from 'react';
import {
  X, Loader2, AlertCircle, ExternalLink, FileText,
  CheckCircle2, XCircle, Building2, Calendar, Hash,
  User, MessageSquare, ShieldAlert,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { DocumentStateCode, DocumentTypeCode } from '../../types/database';
import { StateBadge } from '../../components/StateBadge';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProcessDoc {
  id: string;
  document_number: string;
  document_date: string;
  description: string | null;
  created_at: string;
  document_type: { code: DocumentTypeCode; name: string };
  branch: { id: string; name: string; code: string };
  state: { id: string; code: DocumentStateCode; name: string };
  uploader: { full_name: string } | null;
  cargadorComment: string | null;
}

interface ProcessDocumentModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (docId: string, newState: 'APROBADO' | 'RECHAZADO') => void;
  doc: ProcessDoc | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type ModalStep = 'view' | 'confirming-approve' | 'confirming-reject' | 'processing' | 'done' | 'error';

const TYPE_LABELS: Record<DocumentTypeCode, string> = {
  CAJA_GENERAL: 'Caja General',
  CAJA_CHICA: 'Caja Chica',
};

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="text-slate-400 flex-shrink-0 mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 leading-none mb-0.5">{label}</p>
        <div className="text-sm text-slate-800 font-medium">{value}</div>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProcessDocumentModal({
  open,
  onClose,
  onSuccess,
  doc,
}: ProcessDocumentModalProps) {
  const [step, setStep] = useState<ModalStep>('view');
  const [comment, setComment] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pdf' | 'datos'>('datos');
  const commentRef = useRef<HTMLTextAreaElement>(null);

  const isPending = doc?.state?.code === 'PENDIENTE';

  // Fetch signed PDF URL when modal opens
  useEffect(() => {
    if (!open || !doc) return;
    setStep('view');
    setComment('');
    setErrorMsg(null);
    setActiveTab(isPending ? 'datos' : 'pdf');
    setPdfUrl(null);
    setPdfLoading(true);
    setPdfError(null);

    (async () => {
      const { data: pdfRow } = await supabase
        .from('document_pdfs')
        .select('file_path')
        .eq('document_id', doc.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!pdfRow?.file_path) {
        setPdfError('Sin PDF adjunto.');
        setPdfLoading(false);
        return;
      }

      const { data: signed, error: signErr } = await supabase.storage
        .from('document-pdfs')
        .createSignedUrl(pdfRow.file_path, 3600);

      if (signErr || !signed?.signedUrl) {
        setPdfError('No se pudo cargar el PDF.');
        setPdfLoading(false);
        return;
      }

      setPdfUrl(signed.signedUrl);
      setPdfLoading(false);
    })();
  }, [open, doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = (action: 'approve' | 'reject') => {
    setErrorMsg(null);
    setStep(action === 'approve' ? 'confirming-approve' : 'confirming-reject');
  };

  const handleConfirm = async () => {
    const action = step === 'confirming-approve' ? 'approve' : 'reject';
    setStep('processing');
    setErrorMsg(null);

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setErrorMsg('Sesión expirada. Recarga la página.');
      setStep('error');
      return;
    }

    try {
      const res = await supabase.functions.invoke('process-document', {
        body: {
          doc_id: doc!.id,
          action,
          comment: comment.trim() || undefined,
        },
      });

      if (res.error || res.data?.error) {
        const msg = res.data?.error ?? res.error?.message ?? 'Error al procesar el documento.';
        setErrorMsg(msg);
        setStep('error');
        return;
      }

      setStep('done');
      const newState = action === 'approve' ? 'APROBADO' : 'RECHAZADO';
      setTimeout(() => {
        onSuccess(doc!.id, newState);
        onClose();
      }, 1800);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Error inesperado.');
      setStep('error');
    }
  };

  if (!open || !doc) return null;

  const isConfirming = step === 'confirming-approve' || step === 'confirming-reject';
  const isProcessing = step === 'processing';
  const isDone = step === 'done';
  const isApproving = step === 'confirming-approve';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[96vh] sm:h-[92vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 flex-shrink-0 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate max-w-xs sm:max-w-md">
                {doc.description ?? doc.document_number}
              </p>
              <p className="text-xs text-slate-500">
                {TYPE_LABELS[doc.document_type?.code]} · {doc.branch?.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 border border-slate-300 hover:bg-slate-50 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Nueva pestaña
              </a>
            )}
            {!isProcessing && !isDone && (
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* ── Mobile tabs ── */}
        <div className="md:hidden flex border-b border-slate-200 flex-shrink-0">
          {(['pdf', 'datos'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-medium transition ${
                activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/40'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab === 'pdf' ? 'PDF' : 'Datos y Acción'}
            </button>
          ))}
        </div>

        {/* ── Main body (two-column on desktop, tabs on mobile) ── */}
        {isDone ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-5">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-600" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-800">¡Documento procesado!</h3>
              <p className="text-sm text-slate-500 mt-1">
                El documento fue procesado correctamente.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden min-h-0">

            {/* ── PDF Panel ── */}
            <div className={`${activeTab === 'pdf' ? 'flex' : 'hidden'} md:flex flex-col md:w-[60%] bg-slate-100 border-r border-slate-200`}>
              {pdfLoading && (
                <div className="flex-1 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                  <p className="text-sm text-slate-500">Cargando PDF…</p>
                </div>
              )}
              {pdfError && !pdfLoading && (
                <div className="flex-1 flex items-center justify-center p-8">
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 max-w-xs">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <p className="text-sm">{pdfError}</p>
                  </div>
                </div>
              )}
              {pdfUrl && !pdfLoading && (
                <iframe
                  src={pdfUrl}
                  title="PDF"
                  className="flex-1 w-full border-0"
                />
              )}
            </div>

            {/* ── Form Panel ── */}
            <div className={`${activeTab === 'datos' ? 'flex' : 'hidden'} md:flex flex-col md:w-[40%] overflow-y-auto`}>
              <div className="px-5 py-5 space-y-5 flex-1">

                {/* State banner */}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium ${
                  isPending
                    ? 'bg-amber-50 border border-amber-200 text-amber-700'
                    : doc.state.code === 'APROBADO'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                    : 'bg-rose-50 border border-rose-200 text-rose-700'
                }`}>
                  {isPending
                    ? <><ShieldAlert className="w-4 h-4 flex-shrink-0" /> Pendiente de revisión</>
                    : <><CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Documento ya procesado</>
                  }
                </div>

                {/* Document metadata */}
                <div className="space-y-3.5">
                  <InfoRow
                    icon={<Building2 className="w-4 h-4" />}
                    label="Sucursal"
                    value={`${doc.branch?.name} (${doc.branch?.code})`}
                  />
                  <InfoRow
                    icon={<FileText className="w-4 h-4" />}
                    label="Tipo"
                    value={TYPE_LABELS[doc.document_type?.code]}
                  />
                  <InfoRow
                    icon={<Hash className="w-4 h-4" />}
                    label="Referencia"
                    value={
                      <span className="font-mono text-sm bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        {doc.document_number}
                      </span>
                    }
                  />
                  <InfoRow
                    icon={<Calendar className="w-4 h-4" />}
                    label="Fecha"
                    value={new Date(`${doc.document_date}T12:00:00`).toLocaleDateString('es', {
                      day: '2-digit', month: 'long', year: 'numeric',
                    })}
                  />
                  <InfoRow
                    icon={<User className="w-4 h-4" />}
                    label="Cargado por"
                    value={doc.uploader?.full_name ?? '—'}
                  />
                  <InfoRow
                    icon={<Calendar className="w-4 h-4" />}
                    label="Estado"
                    value={<StateBadge state={doc.state.code} />}
                  />
                </div>

                {/* Cargador comment */}
                {doc.cargadorComment && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" /> Comentario del Cargador
                    </p>
                    <div className="px-3.5 py-3 rounded-xl bg-amber-50 border border-amber-100 text-sm text-slate-700 leading-relaxed">
                      {doc.cargadorComment}
                    </div>
                  </div>
                )}

                {/* ── Processing form (only for PENDIENTE) ── */}
                {isPending && !isConfirming && !isProcessing && step !== 'error' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" />
                      Tu comentario
                      <span className="font-normal text-slate-400">(opcional)</span>
                    </label>
                    <textarea
                      ref={commentRef}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Añade observaciones, motivo de aprobación o rechazo…"
                      rows={4}
                      className="w-full px-3.5 py-3 rounded-xl border border-slate-300 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition"
                    />
                  </div>
                )}

                {/* ── Error message ── */}
                {step === 'error' && errorMsg && (
                  <div className="flex items-start gap-2 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold mb-0.5">Error al procesar</p>
                      <p>{errorMsg}</p>
                    </div>
                  </div>
                )}

                {/* ── Confirmation dialog ── */}
                {isConfirming && (
                  <div className={`p-4 rounded-xl border ${
                    isApproving
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-rose-50 border-rose-200'
                  }`}>
                    <div className="flex items-center gap-2 mb-3">
                      {isApproving
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        : <XCircle className="w-5 h-5 text-rose-600" />
                      }
                      <p className={`text-sm font-bold ${isApproving ? 'text-emerald-800' : 'text-rose-800'}`}>
                        {isApproving ? '¿Confirmas la aprobación?' : '¿Confirmas el rechazo?'}
                      </p>
                    </div>
                    <div className="text-xs text-slate-600 space-y-1 mb-4 bg-white/60 rounded-lg px-3 py-2">
                      <p><span className="font-medium">Documento:</span> {doc.description ?? doc.document_number}</p>
                      <p><span className="font-medium">Referencia:</span> {doc.document_number}</p>
                      {comment.trim() && (
                        <p><span className="font-medium">Comentario:</span> {comment.trim()}</p>
                      )}
                    </div>
                    <p className={`text-xs mb-4 ${isApproving ? 'text-emerald-700' : 'text-rose-700'}`}>
                      Esta acción <strong>no se puede deshacer</strong>. El estado del documento cambiará
                      a <strong>{isApproving ? 'APROBADO' : 'RECHAZADO'}</strong>.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setStep('view')}
                        className="flex-1 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-white transition"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleConfirm}
                        className={`flex-1 py-2 rounded-xl text-white text-sm font-semibold transition ${
                          isApproving
                            ? 'bg-emerald-600 hover:bg-emerald-700'
                            : 'bg-rose-600 hover:bg-rose-700'
                        }`}
                      >
                        Confirmar
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Processing state ── */}
                {isProcessing && (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-blue-700">Procesando documento…</p>
                      <p className="text-xs text-blue-500 mt-0.5">Por favor, no cierre esta ventana.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Footer: action buttons ── */}
              {isPending && !isConfirming && !isProcessing && !isDone && step !== 'error' && (
                <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex gap-3 flex-shrink-0">
                  <button
                    onClick={() => handleAction('reject')}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-rose-300 text-rose-700 text-sm font-semibold hover:bg-rose-50 transition"
                  >
                    <XCircle className="w-4 h-4" /> Rechazar
                  </button>
                  <button
                    onClick={() => handleAction('approve')}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition shadow-sm"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Aprobar
                  </button>
                </div>
              )}

              {/* ── Footer: error retry ── */}
              {step === 'error' && (
                <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex gap-3 flex-shrink-0">
                  <button
                    onClick={() => { setStep('view'); setErrorMsg(null); }}
                    className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition"
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
