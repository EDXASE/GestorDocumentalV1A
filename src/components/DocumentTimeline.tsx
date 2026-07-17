import { useEffect, useState } from 'react';
import {
  FilePlus2, CheckCircle2, XCircle, Ban, Pencil, FileUp, MessageSquare,
  ArrowRight, User, Loader2, AlertCircle, ShieldCheck,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface StateRef { code: string; name: string; }
interface UserRef { full_name: string; roleName: string | null; }

type TimelineEvent = {
  id: string;
  created_at: string;
  user: UserRef | null;
} & (
  | { kind: 'history'; action: string; notes: string | null; from_state: StateRef | null; to_state: StateRef | null }
  | { kind: 'pdf'; file_name: string | null }
  | { kind: 'comment'; text: string }
  | { kind: 'correction'; previous_text: string; new_text: string; reason: string }
);

// ── Event metadata ────────────────────────────────────────────────────────────

const HISTORY_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; dot: string }> = {
  CREATE:  { label: 'Documento creado',   icon: FilePlus2,     color: 'bg-blue-100 text-blue-700',    dot: 'border-blue-400 bg-blue-400' },
  APPROVE: { label: 'Aprobado',           icon: CheckCircle2,  color: 'bg-emerald-100 text-emerald-700', dot: 'border-emerald-500 bg-emerald-500' },
  REJECT:  { label: 'Rechazado',          icon: XCircle,       color: 'bg-rose-100 text-rose-700',    dot: 'border-rose-500 bg-rose-500' },
  ANNUL:   { label: 'Anulado',            icon: Ban,           color: 'bg-slate-200 text-slate-600',  dot: 'border-slate-400 bg-slate-400' },
  UPDATE:  { label: 'Actualizado',        icon: Pencil,        color: 'bg-amber-100 text-amber-700',  dot: 'border-amber-400 bg-amber-400' },
  ASSIGN:  { label: 'Asignado',           icon: ShieldCheck,   color: 'bg-violet-100 text-violet-700', dot: 'border-violet-400 bg-violet-400' },
};

const KIND_META = {
  pdf:        { label: 'PDF cargado',     icon: FileUp,        color: 'bg-teal-100 text-teal-700',   dot: 'border-teal-400 bg-teal-400' },
  comment:    { label: 'Comentario',      icon: MessageSquare, color: 'bg-sky-100 text-sky-700',     dot: 'border-sky-400 bg-sky-400' },
  correction: { label: 'Corrección admin', icon: ShieldCheck,  color: 'bg-violet-100 text-violet-700', dot: 'border-violet-500 bg-violet-500' },
};

const STATE_PILL: Record<string, string> = {
  PENDIENTE:  'bg-amber-50 text-amber-700 border-amber-200',
  APROBADO:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  RECHAZADO:  'bg-rose-50 text-rose-700 border-rose-200',
  ANULADO:    'bg-slate-100 text-slate-600 border-slate-200',
};

function StatePill({ code, name }: StateRef) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium border ${STATE_PILL[code] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {name}
    </span>
  );
}

// ── Helper: extract user from Supabase join (may come as array or object) ─────

function toUserRef(raw: unknown): UserRef | null {
  if (!raw) return null;
  const obj = Array.isArray(raw) ? raw[0] : raw;
  if (!obj) return null;
  const role = (obj as { role?: unknown }).role;
  const roleObj = Array.isArray(role) ? role[0] : role;
  return {
    full_name: (obj as { full_name?: string }).full_name ?? '—',
    roleName: (roleObj as { name?: string } | null)?.name ?? null,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface DocumentTimelineProps {
  documentId: string;
  compact?: boolean;
}

export function DocumentTimeline({ documentId, compact = false }: DocumentTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) return;
    setLoading(true);
    setError(null);

    (async () => {
      // ── Parallel fetch of first 3 sources ──────────────────────────────────
      const [histRes, pdfRes, commRes] = await Promise.all([
        supabase
          .from('document_history')
          .select(`id, action, notes, created_at,
            user:profiles!user_id(full_name, role:roles(name)),
            from_state:document_states!from_state_id(code, name),
            to_state:document_states!to_state_id(code, name)`)
          .eq('document_id', documentId)
          .order('created_at', { ascending: true }),

        supabase
          .from('document_pdfs')
          .select('id, file_name, created_at, uploader:profiles!uploaded_by(full_name, role:roles(name))')
          .eq('document_id', documentId)
          .order('created_at', { ascending: true }),

        supabase
          .from('document_comments')
          .select('id, comment, created_at, user:profiles!user_id(full_name, role:roles(name))')
          .eq('document_id', documentId)
          .order('created_at', { ascending: true }),
      ]);

      if (histRes.error || pdfRes.error || commRes.error) {
        setError(histRes.error?.message ?? pdfRes.error?.message ?? commRes.error?.message ?? 'Error');
        setLoading(false);
        return;
      }

      // ── Comment edits (sequential — needs comment_ids first) ───────────────
      const commentIds = (commRes.data ?? []).map((c: { id: string }) => c.id);
      let editRows: unknown[] = [];
      if (commentIds.length > 0) {
        const editRes = await supabase
          .from('document_comment_edits')
          .select(`id, comment_id, previous_text, new_text, reason, created_at,
            editor:profiles!edited_by(full_name, role:roles(name))`)
          .in('comment_id', commentIds)
          .order('created_at', { ascending: true });
        if (!editRes.error) editRows = editRes.data ?? [];
      }

      // ── Build unified event list ───────────────────────────────────────────
      const all: TimelineEvent[] = [];

      for (const h of (histRes.data ?? []) as Record<string, unknown>[]) {
        const fromS = h.from_state as { code: string; name: string } | null;
        const toS   = h.to_state   as { code: string; name: string } | null;
        all.push({
          id: h.id as string,
          kind: 'history',
          created_at: h.created_at as string,
          user: toUserRef(h.user),
          action: h.action as string,
          notes: (h.notes as string | null) ?? null,
          from_state: fromS,
          to_state: toS,
        });
      }

      for (const p of (pdfRes.data ?? []) as Record<string, unknown>[]) {
        all.push({
          id: p.id as string,
          kind: 'pdf',
          created_at: p.created_at as string,
          user: toUserRef(p.uploader),
          file_name: (p.file_name as string | null) ?? null,
        });
      }

      for (const c of (commRes.data ?? []) as Record<string, unknown>[]) {
        all.push({
          id: c.id as string,
          kind: 'comment',
          created_at: c.created_at as string,
          user: toUserRef(c.user),
          text: c.comment as string,
        });
      }

      for (const e of editRows as Record<string, unknown>[]) {
        all.push({
          id: e.id as string,
          kind: 'correction',
          created_at: e.created_at as string,
          user: toUserRef(e.editor),
          previous_text: e.previous_text as string,
          new_text: e.new_text as string,
          reason: e.reason as string,
        });
      }

      // Sort by created_at ascending
      all.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      setEvents(all);
      setLoading(false);
    })();
  }, [documentId]);

  const fmt = (d: string) =>
    new Date(d).toLocaleString('es', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
        <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400 text-sm">Sin eventos registrados.</div>
    );
  }

  return (
    <ol className="relative border-l-2 border-slate-200 ml-2 space-y-0">
      {events.map((ev, idx) => {
        const isLast = idx === events.length - 1;

        // ── Resolve display metadata ────────────────────────────────────────
        let meta: { label: string; icon: React.ComponentType<{ className?: string }>; color: string; dot: string };
        if (ev.kind === 'history') {
          meta = HISTORY_META[ev.action] ?? {
            label: ev.action, icon: Pencil,
            color: 'bg-slate-100 text-slate-600', dot: 'border-slate-300 bg-slate-300',
          };
        } else {
          meta = KIND_META[ev.kind];
        }

        const Icon = meta.icon;

        return (
          <li key={`${ev.kind}-${ev.id}`} className={`relative pl-6 ${isLast ? 'pb-0' : compact ? 'pb-4' : 'pb-5'}`}>
            {/* Timeline dot */}
            <span className={`absolute -left-[7px] top-1.5 w-3.5 h-3.5 rounded-full border-2 ${meta.dot}`} />

            <div className={`rounded-xl border border-slate-200 bg-slate-50 ${compact ? 'p-3' : 'p-3.5'} space-y-2`}>
              {/* Row 1: action badge + datetime */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${meta.color}`}>
                  <Icon className="w-3 h-3" />
                  {meta.label}
                </span>
                <time className="text-[11px] text-slate-400 whitespace-nowrap">{fmt(ev.created_at)}</time>
              </div>

              {/* Row 2: state transition (history only) */}
              {ev.kind === 'history' && (ev.from_state || ev.to_state) && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {ev.from_state
                    ? <StatePill {...ev.from_state} />
                    : <span className="text-[11px] text-slate-400 italic">Nuevo</span>}
                  <ArrowRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  {ev.to_state && <StatePill {...ev.to_state} />}
                </div>
              )}

              {/* Row 3: user + role */}
              {ev.user && (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <User className="w-3 h-3 flex-shrink-0" />
                  <span className="font-semibold text-slate-700">{ev.user.full_name}</span>
                  {ev.user.roleName && <span className="text-slate-400">({ev.user.roleName})</span>}
                </div>
              )}

              {/* Detail content ─────────────────────────────────────────── */}

              {/* History notes */}
              {ev.kind === 'history' && ev.notes && (
                <p className="text-xs text-slate-600 bg-white rounded-lg border border-slate-200 px-2.5 py-1.5 leading-relaxed">
                  {ev.notes}
                </p>
              )}

              {/* PDF file name */}
              {ev.kind === 'pdf' && ev.file_name && (
                <p className="text-xs text-teal-700 font-mono bg-teal-50 rounded px-2 py-1 border border-teal-100">
                  {ev.file_name}
                </p>
              )}

              {/* Comment text */}
              {ev.kind === 'comment' && (
                <p className="text-xs text-slate-700 bg-white rounded-lg border border-slate-200 px-2.5 py-1.5 leading-relaxed">
                  {ev.text}
                </p>
              )}

              {/* Correction diff */}
              {ev.kind === 'correction' && (
                <div className="space-y-1.5 text-xs">
                  <div className="bg-rose-50 rounded border border-rose-100 px-2 py-1 text-slate-600">
                    <span className="text-rose-500 font-medium">Antes: </span>{ev.previous_text}
                  </div>
                  <div className="bg-emerald-50 rounded border border-emerald-100 px-2 py-1 text-slate-600">
                    <span className="text-emerald-600 font-medium">Después: </span>{ev.new_text}
                  </div>
                  <div className="text-slate-500">
                    <span className="font-medium">Motivo: </span>{ev.reason}
                  </div>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
