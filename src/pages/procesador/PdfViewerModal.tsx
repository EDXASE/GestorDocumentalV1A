import { useEffect, useState } from 'react';
import { X, Loader2, AlertCircle, ExternalLink, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface PdfViewerModalProps {
  open: boolean;
  onClose: () => void;
  documentId: string | null;
  documentName: string | null;
}

export function PdfViewerModal({ open, onClose, documentId, documentName }: PdfViewerModalProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !documentId) return;
    setLoading(true);
    setError(null);
    setPdfUrl(null);

    (async () => {
      const { data: pdfRow } = await supabase
        .from('document_pdfs')
        .select('file_path')
        .eq('document_id', documentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!pdfRow?.file_path) {
        setError('No se encontró ningún PDF para este documento.');
        setLoading(false);
        return;
      }

      const { data: signed, error: signErr } = await supabase.storage
        .from('document-pdfs')
        .createSignedUrl(pdfRow.file_path, 3600);

      if (signErr || !signed?.signedUrl) {
        setError('No se pudo generar la URL del PDF. Intenta nuevamente.');
        setLoading(false);
        return;
      }

      setPdfUrl(signed.signedUrl);
      setLoading(false);
    })();
  }, [open, documentId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 max-w-sm truncate">
                {documentName ?? 'Documento PDF'}
              </p>
              <p className="text-xs text-slate-400">Vista previa</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 border border-slate-300 hover:bg-slate-50 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Abrir en pestaña
              </a>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden bg-slate-100">
          {loading && (
            <div className="w-full h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <p className="text-sm text-slate-500">Cargando PDF…</p>
              </div>
            </div>
          )}
          {error && (
            <div className="w-full h-full flex items-center justify-center p-8">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 max-w-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}
          {pdfUrl && !loading && (
            <iframe
              src={pdfUrl}
              title="PDF viewer"
              className="w-full h-full border-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}
