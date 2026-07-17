import { useEffect, useRef, useState } from 'react';
import {
  X, MessagesSquare, User, Clock, Pencil, ChevronDown, ChevronRight,
  Loader2, AlertCircle, CheckCircle2, History, ArrowRight, ShieldCheck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EditEntry {
  id: string;
  previous_text: string;
  new_text: string;
  reason: string;
  created_at: string;
  editor: { full_name: string } | { full_name: string }[] | null;
}

interface CommentWithEdits {
  id: string;
  comment: string;
  created_at: string;
  user: { full_name: string; role: { name: string } | null } | null;
  edits: EditEntry[];
}

interface CommentCorrectionDrawerProps {
  open: boolean;
  onClose: () => void;
  documentId: string | null;
  documentName: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  CARGADOR: 'bg-blue-100 text-blue-700',
  PROCESADOR: 'bg-emerald-100 text-emerald-700',
  ADMINISTRADOR: 'bg-violet-100 text-violet-700',
  CONSULTOR: 'bg-slate-100 text-slate-600',
};

function editorName(e: EditEntry['editor']): string {
  if (!e) return 'Administrador';
  if (Array.isArray(e)) return e[0]?.full_name ?? 'Administrador';
  return e.full_name;
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleString('es', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CommentCorrectionDrawer({
  open,
  onClose,
  documentId,
  documentName,
}: CommentCorrectionDrawerProps) {
  const [comments, setComments] = useState<CommentWithEdits[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null); // commentId that just succeeded

  // Expanded history
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const editTextRef = useRef<HTMLTextAreaElement>(null);

  // ── Fetch data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !documentId) return;
    setLoading(true);
    setLoadError(null);
    setComments([]);
    setEditingId(null);
    setExpandedIds(new Set());

    (async () => {
      const { data: rawComments, error: commErr } = await supabase
        .from('document_comments')
        .select('id, comment, created_at, user:profiles!user_id(full_name, role:roles(name))')
        .eq('document_id', documentId)
        .order('created_at', { ascending: true });

      if (commErr) { setLoadError(commErr.message); setLoading(false); return; }

      const cList = (rawComments ?? []) as unknown as Omit<CommentWithEdits, 'edits'>[];

      if (cList.length === 0) { setComments([]); setLoading(false); return; }

      const ids = cList.map((c) => c.id);
      const { data: rawEdits, error: editsErr } = await supabase
        .from('document_comment_edits')
        .select('id, comment_id, previous_text, new_text, reason, created_at, editor:profiles!edited_by(full_name)')
        .in('comment_id', ids)
        .order('created_at', { ascending: true });

      if (editsErr) { setLoadError(editsErr.message); setLoading(false); return; }

      const editsByComment: Record<string, EditEntry[]> = {};
      (rawEdits ?? []).forEach((e: EditEntry & { comment_id: string }) => {
        if (!editsByComment[e.comment_id]) editsByComment[e.comment_id] = [];
        editsByComment[e.comment_id].push(e);
      });

      setComments(cList.map((c) => ({ ...c, edits: editsByComment[c.id] ?? [] })));
      setLoading(false);
    })();
  }, [open, documentId]);

  const startEdit = (c: CommentWithEdits) => {
    setEditingId(c.id);
    setEditText(c.comment);
    setEditReason('');
    setEditError(null);
    setTimeout(() => editTextRef.current?.focus(), 60);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
    setEditReason('');
    setEditError(null);
  };

  const saveEdit = async (commentId: string) => {
    if (!editText.trim()) { setEditError('El texto no puede estar vacío.'); return; }
    if (!editReason.trim()) { setEditError('El motivo de la corrección es obligatorio.'); return; }

    setEditSaving(true);
    setEditError(null);

    const res = await supabase.functions.invoke('correct-comment', {
      body: {
        comment_id: commentId,
        new_text: editText.trim(),
        reason: editReason.trim(),
      },
    });

    setEditSaving(false);

    if (res.error || res.data?.error) {
      setEditError(res.data?.error ?? res.error?.message ?? 'Error al guardar la corrección.');
      return;
    }

    // Update local state
    const newText = editText.trim();
    const newReason = editReason.trim();
    const now = new Date().toISOString();
    setComments((prev) =>
      prev.map((c) => {
        if (c.id !== commentId) return c;
        const newEdit: EditEntry = {
          id: crypto.randomUUID(),
          previous_text: c.comment,
          new_text: newText,
          reason: newReason,
          created_at: now,
          editor: null, // admin, shown as "Tú"
        };
        return { ...c, comment: newText, edits: [...c.edits, newEdit] };
      }),
    );

    setEditSuccess(commentId);
    setEditingId(null);
    setEditText('');
    setEditReason('');
    setTimeout(() => setEditSuccess(null), 3000);
  };

  const toggleHistory = (id: string) => {
    setExpandedIds((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  return (
    <>
      {open && <div className="fixed inset-0 bg-slate-900/40 z-40" onClick={onClose} />}
      <aside className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[560px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <MessagesSquare className="w-5 h-5 text-violet-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-800">Corrección de Comentarios</h2>
              <p className="text-xs text-slate-500 truncate max-w-[360px] mt-0.5">
                {documentName ?? 'Documento'}
              </p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <ShieldCheck className="w-3 h-3 text-violet-500" />
                <span className="text-[11px] text-violet-600 font-medium">Solo ADMINISTRADOR</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info bar */}
        <div className="px-5 py-2.5 border-b border-slate-100 bg-violet-50 flex-shrink-0">
          <p className="text-xs text-violet-700">
            Los textos originales nunca se eliminan. Cada corrección genera un registro de auditoría permanente.
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-7 h-7 text-violet-500 animate-spin" />
            </div>
          )}

          {loadError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {loadError}
            </div>
          )}

          {!loading && !loadError && comments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
              <MessagesSquare className="w-10 h-10" />
              <p className="text-sm">Este documento no tiene comentarios.</p>
            </div>
          )}

          {!loading && comments.map((c) => {
            const roleName = c.user?.role?.name ?? '';
            const roleColor = ROLE_COLORS[roleName] ?? 'bg-slate-100 text-slate-600';
            const isEditing = editingId === c.id;
            const isExpanded = expandedIds.has(c.id);
            const hasEdits = c.edits.length > 0;
            const justSaved = editSuccess === c.id;

            return (
              <div
                key={c.id}
                className={`rounded-xl border transition ${
                  justSaved ? 'border-emerald-300 bg-emerald-50' :
                  isEditing ? 'border-violet-300 bg-violet-50/30' :
                  'border-slate-200 bg-white'
                }`}
              >
                {/* Comment header */}
                <div className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800">
                          {c.user?.full_name ?? '—'}
                        </span>
                        {roleName && (
                          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${roleColor}`}>
                            {roleName}
                          </span>
                        )}
                        {hasEdits && (
                          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                            Editado {c.edits.length}×
                          </span>
                        )}
                        {justSaved && (
                          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Guardado
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <time className="text-[11px] text-slate-400">{fmt(c.created_at)}</time>
                      </div>
                    </div>
                  </div>
                  {!isEditing && (
                    <button
                      onClick={() => startEdit(c)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-violet-700 border border-violet-300 hover:bg-violet-100 transition flex-shrink-0"
                    >
                      <Pencil className="w-3 h-3" /> Editar
                    </button>
                  )}
                </div>

                {/* Current comment text */}
                {!isEditing && (
                  <div className="px-4 pb-3">
                    <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                      {c.comment}
                    </p>
                  </div>
                )}

                {/* Edit form */}
                {isEditing && (
                  <div className="px-4 pb-4 space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Texto original</label>
                      <p className="text-xs text-slate-500 bg-slate-100 rounded-lg px-3 py-2 border border-slate-200 line-through decoration-rose-400">
                        {c.comment}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Texto corregido <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        ref={editTextRef}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2.5 rounded-lg border border-violet-300 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Motivo de la corrección <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={editReason}
                        onChange={(e) => setEditReason(e.target.value)}
                        placeholder="Ej: Corrección de datos, error tipográfico, actualización…"
                        className="w-full px-3 py-2 rounded-lg border border-violet-300 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 transition"
                      />
                    </div>
                    {editError && (
                      <div className="flex items-center gap-1.5 text-xs text-rose-600">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {editError}
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={cancelEdit}
                        disabled={editSaving}
                        className="flex-1 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-50 transition disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => saveEdit(c.id)}
                        disabled={editSaving || !editText.trim() || !editReason.trim()}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 transition"
                      >
                        {editSaving
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando…</>
                          : <><CheckCircle2 className="w-3.5 h-3.5" /> Guardar</>
                        }
                      </button>
                    </div>
                  </div>
                )}

                {/* Edit history accordion */}
                {hasEdits && !isEditing && (
                  <div className="border-t border-slate-100">
                    <button
                      onClick={() => toggleHistory(c.id)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-slate-500 hover:bg-slate-50 transition"
                    >
                      <div className="flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5" />
                        <span>Historial de ediciones ({c.edits.length})</span>
                      </div>
                      {isExpanded
                        ? <ChevronDown className="w-3.5 h-3.5" />
                        : <ChevronRight className="w-3.5 h-3.5" />
                      }
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3">
                        {c.edits.map((edit, i) => (
                          <div key={edit.id} className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
                            <div className="flex items-center justify-between flex-wrap gap-1">
                              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                                Edición {i + 1}
                              </span>
                              <time className="text-[11px] text-slate-400">{fmt(edit.created_at)}</time>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <ShieldCheck className="w-3 h-3 text-violet-500 flex-shrink-0" />
                              <span className="text-xs text-violet-700 font-medium">
                                {editorName(edit.editor)}
                              </span>
                            </div>
                            <div className="space-y-1.5 text-xs">
                              <div>
                                <span className="text-slate-400 font-medium">Antes:</span>
                                <p className="mt-0.5 text-slate-600 bg-rose-50 rounded px-2 py-1 border border-rose-100">
                                  {edit.previous_text}
                                </p>
                              </div>
                              <div className="flex justify-center">
                                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                              </div>
                              <div>
                                <span className="text-slate-400 font-medium">Después:</span>
                                <p className="mt-0.5 text-slate-600 bg-emerald-50 rounded px-2 py-1 border border-emerald-100">
                                  {edit.new_text}
                                </p>
                              </div>
                            </div>
                            <div className="text-xs text-slate-500">
                              <span className="font-medium">Motivo:</span> {edit.reason}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
