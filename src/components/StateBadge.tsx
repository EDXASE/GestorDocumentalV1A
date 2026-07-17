import type { DocumentStateCode } from '../types/database';

const STATE_STYLES: Record<DocumentStateCode, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-800 border-amber-200',
  APROBADO: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  RECHAZADO: 'bg-rose-100 text-rose-800 border-rose-200',
  ANULADO: 'bg-slate-200 text-slate-700 border-slate-300',
};

const STATE_LABELS: Record<DocumentStateCode, string> = {
  PENDIENTE: 'Pendiente',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
  ANULADO: 'Anulado',
};

export function StateBadge({ state }: { state: DocumentStateCode }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATE_STYLES[state]}`}
    >
      {STATE_LABELS[state]}
    </span>
  );
}
