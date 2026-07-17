import { X, Clock } from 'lucide-react';
import { DocumentTimeline } from '../../components/DocumentTimeline';

interface DocumentHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  documentId: string | null;
  documentName: string | null;
}

export function DocumentHistoryDrawer({
  open,
  onClose,
  documentId,
  documentName,
}: DocumentHistoryDrawerProps) {
  return (
    <>
      {open && <div className="fixed inset-0 bg-slate-900/40 z-40" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[500px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Historial Documental</h2>
              <p className="text-xs text-slate-500 mt-0.5 max-w-[320px] truncate">
                {documentName ?? 'Documento'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {open && documentId
            ? <DocumentTimeline documentId={documentId} />
            : <div className="text-center py-12 text-slate-400 text-sm">Sin documento seleccionado.</div>
          }
        </div>
      </aside>
    </>
  );
}
