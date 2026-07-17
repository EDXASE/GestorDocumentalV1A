import { useEffect, useRef, useState } from 'react';
import {
  X, Ban, AlertTriangle, Building2, FileText, Hash,
  Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { DocumentStateCode } from '../../types/database';
import { StateBadge } from '../../components/StateBadge';

// ── Exported type ─────────────────────────────────────────────────────────────

export interface AnnulTarget {
  id: string;
  description: string | null;
  document_number: string;
  state: { code: DocumentStateCode; name: string };
  branch: { name: string; code: string };
  document_type: { code: string; name?: string };
}

interface AnnulDocumentModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (docId: string) => void;
  doc: AnnulTarget | null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'idle' | 'confirming' | 'processing' | 'done' | 'error';

const TYPE_LABELS: Record<string, string> = {
  CAJA_GENERAL: 'Caja General',
  CAJA_CHICA: 'Caja Chica',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function AnnulDocumentModal({ open, onClose, onSuccess, doc }: AnnulDocumentModalProps) {
  const [step, setStep] = useState<Step>('idle');
  const [motivo, setMotivo] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const motivoRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setStep('idle');
      setMotivo('');
      setErrorMsg(null);
      setTimeout(() => motivoRef.current?.focus(), 80);
    }
  }, [open]);

  const handleAnular = () => {
    if (!motivo.trim()) {
      motivoRef.current?.focus();
      return;
    }
    setStep('confirming');
  };

  const handleConfirm = async () => {
    setStep('processing');
    setErrorMsg(null);

    const res = await supabase.functions.invoke('annul-document', {
      body: { doc_id: doc!.id, motivo: motivo.trim() },
    });

    if (res.error || res.data?.error) {
      setErrorMsg(res.data?.error ?? res.error?.message ?? 'Error al anular el documento.');
      setStep('error');
      return;
    }

    setStep('done');
    setTimeout(() => {
      onSuccess(doc!.id);
      onClose();
    }, 1800);
  };

  if (!open || !doc) return null;

  const typeLabel = TYPE_LABELS[doc.document_type?.code] ?? doc.document_type?.name ?? '—';
  const isIdle = step === 'idle';
  const isConfirming = step === 'confirming';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
              <Ban className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Anular Documento</h2>
              <p className="text-xs text-slate-500">Esta acción no puede deshacerse</p>
            </div>
          </div>
          {step !== 'processing' && step !== 'done' && (
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-5">

          {/* Warning banner */}
          <div className="flex items-start gap-3 px-3.5 py-3 rounded-xl bg-rose-50 border border-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-rose-700 leading-relaxed">
              El documento será marcado como <strong>ANULADO</strong>. Su PDF, comentarios e historial
              se conservarán intactos. No se puede revertir este estado.
            </p>
          </div>

          {/* Document info */}
          <div className="space-y-2.5 bg-slate-50 rounded-xl border border-slate-200 px-4 py-3.5">
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] text-slate-400 leading-none mb-0.5">Documento</p>
                <p className="text-sm font-semibold text-slate-800">{doc.description ?? '—'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] text-slate-400 leading-none mb-0.5">Tipo</p>
                  <p className="text-sm font-medium text-slate-700">{typeLabel}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] text-slate-400 leading-none mb-0.5">Sucursal</p>
                  <p className="text-sm font-medium text-slate-700">{doc.branch?.name}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Hash className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] text-slate-400 leading-none mb-0.5">Referencia</p>
                  <p className="text-sm font-mono font-semibold text-slate-700">{doc.document_number}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] text-slate-400 leading-none mb-0.5">Estado actual</p>
                  <StateBadge state={doc.state?.code} />
                </div>
              </div>
            </div>
          </div>

          {/* Motivo field (idle & confirming) */}
          {(isIdle || isConfirming) && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Motivo de anulación <span className="text-rose-500">*</span>
              </label>
              {isIdle ? (
                <textarea
                  ref={motivoRef}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Describe el motivo por el que este documento debe ser anulado…"
                  rows={3}
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-300 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent resize-none transition"
                />
              ) : (
                <div className="px-3.5 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-slate-700">
                  {motivo}
                </div>
              )}
              {isIdle && !motivo.trim() && (
                <p className="text-xs text-rose-500 mt-1">El motivo es obligatorio para continuar.</p>
              )}
            </div>
          )}

          {/* Confirmation prompt */}
          {isConfirming && (
            <div className="flex items-start gap-2 px-3.5 py-3 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                ¿Confirmas la anulación del documento <strong>{doc.description ?? doc.document_number}</strong>?
                Esta operación quedará registrada en auditoría.
              </p>
            </div>
          )}

          {/* Processing state */}
          {step === 'processing' && (
            <div className="flex items-center gap-3 px-4 py-4 rounded-xl bg-slate-50 border border-slate-200">
              <Loader2 className="w-5 h-5 text-rose-500 animate-spin flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-700">Anulando documento…</p>
                <p className="text-xs text-slate-400 mt-0.5">Por favor no cierre esta ventana.</p>
              </div>
            </div>
          )}

          {/* Done state */}
          {step === 'done' && (
            <div className="flex items-center gap-3 px-4 py-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">Documento anulado correctamente.</p>
                <p className="text-xs text-emerald-600 mt-0.5">El historial y auditoría han sido registrados.</p>
              </div>
            </div>
          )}

          {/* Error state */}
          {step === 'error' && errorMsg && (
            <div className="flex items-start gap-2.5 px-4 py-3.5 rounded-xl bg-rose-50 border border-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-rose-700">Error al anular</p>
                <p className="text-xs text-rose-600 mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {(isIdle || isConfirming || step === 'error') && (
          <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex gap-3">
            <button
              onClick={() => isConfirming ? setStep('idle') : onClose()}
              className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition"
            >
              {isConfirming ? 'Volver' : 'Cancelar'}
            </button>
            {isIdle && (
              <button
                onClick={handleAnular}
                disabled={!motivo.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
              >
                <Ban className="w-4 h-4" /> Anular documento
              </button>
            )}
            {isConfirming && (
              <button
                onClick={handleConfirm}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition shadow-sm"
              >
                Confirmar anulación
              </button>
            )}
            {step === 'error' && (
              <button
                onClick={() => { setStep('idle'); setErrorMsg(null); }}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-900 transition"
              >
                Reintentar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
