import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Send,
  Sparkles,
  MessageCircle,
  Phone,
  Mail,
  MapPin,
  FileText,
  Clock,
  CheckCheck,
  UserCog,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import { supabase, type Conversation, type Message, type Client, type Channel, type Advisor } from '../lib/supabase';
import { useSession } from '../lib/store';
import { Avatar, Badge, Card, EmptyState, Spinner } from '../components/ui';
import { cn, timeAgo, formatDateTime } from '../lib/utils';
import { logAudit } from '../lib/audit';
import { isVendedor } from '../lib/permissions';

const CHANNEL_ICONS: Record<string, { color: string; abbr: string }> = {
  whatsapp: { color: '#25D366', abbr: 'WA' },
  messenger: { color: '#0084FF', abbr: 'FB' },
  instagram: { color: '#E1306C', abbr: 'IG' },
};

const AI_SUGGESTIONS = [
  'Gracias por su mensaje. Le comparto la cotización actualizada con el descuento aplicado. ¿Le parece bien si avanzamos?',
  'Entendido. Voy a revisarlo con mi equipo y le confirmo en el transcurso del día. ¿Hay algún plazo en particular?',
  'Perfecto. Podemos ofrecerle un 8% adicional por volumen. ¿Le gustaría que agende una llamada para cerrar detalles?',
  'Hola, con gusto le ayudo. Para ofrecerle la mejor opción, ¿podría indicarme cuántas unidades requiere?',
];

export function Inbox() {
  const { user, advisors } = useSession();
  const [conversations, setConversations] = useState<(Conversation & { client?: Client; channel?: Channel; advisor?: Advisor })[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'pending' | 'mine'>('all');
  const [search, setSearch] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversations();
  }, []);

  async function loadConversations() {
    setLoading(true);
    const { data: convs } = await supabase
      .from('conversations')
      .select('*')
      .order('last_message_at', { ascending: false });
    if (!convs) {
      setLoading(false);
      return;
    }
    const clientIds = Array.from(new Set(convs.map((c) => c.client_id)));
    const channelIds = Array.from(new Set(convs.map((c) => c.channel_id).filter(Boolean) as string[]));
    const advisorIds = Array.from(new Set(convs.map((c) => c.advisor_id).filter(Boolean) as string[]));
    const [cl, ch, ad] = await Promise.all([
      clientIds.length ? supabase.from('clients').select('*').in('id', clientIds) : Promise.resolve({ data: [] }),
      channelIds.length ? supabase.from('channels').select('*').in('id', channelIds) : Promise.resolve({ data: [] }),
      advisorIds.length ? supabase.from('advisors').select('*').in('id', advisorIds) : Promise.resolve({ data: [] }),
    ]);
    const clientMap = new Map((cl.data as Client[] | undefined)?.map((c) => [c.id, c]) ?? []);
    const channelMap = new Map((ch.data as Channel[] | undefined)?.map((c) => [c.id, c]) ?? []);
    const advisorMap = new Map((ad.data as Advisor[] | undefined)?.map((a) => [a.id, a]) ?? []);
    const merged = convs.map((c) => ({
      ...c,
      client: clientMap.get(c.client_id),
      channel: channelMap.get(c.channel_id ?? ''),
      advisor: advisorMap.get(c.advisor_id ?? ''),
    })) as (Conversation & { client?: Client; channel?: Channel; advisor?: Advisor })[];
    setConversations(merged);
    if (merged.length > 0 && !selectedId) setSelectedId(merged[0].id);
    setLoading(false);
  }

  useEffect(() => {
    if (!selectedId) return;
    loadMessages(selectedId);
  }, [selectedId]);

  async function loadMessages(convId: string) {
    setMsgLoading(true);
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    setMessages((data as Message[]) ?? []);
    setMsgLoading(false);
    // Mark unread as read
    const conv = conversations.find((c) => c.id === convId);
    if (conv && conv.unread_count > 0) {
      await supabase.from('conversations').update({ unread_count: 0 }).eq('id', convId);
      setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c)));
    }
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  const filtered = useMemo(() => {
    return conversations.filter((c) => {
      // Vendedores solo ven chats asignados a ellos
      if (isVendedor(user?.role) && c.advisor_id !== user?.id) return false;
      if (filter === 'mine' && c.advisor_id !== user?.id) return false;
      if (filter === 'open' && c.status !== 'open') return false;
      if (filter === 'pending' && c.status !== 'pending') return false;
      if (search && !c.client?.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [conversations, filter, search, user]);

  const selected = conversations.find((c) => c.id === selectedId);

  async function sendMessage(body: string, aiSuggested = false) {
    if (!selectedId || !body.trim()) return;
    const conv = conversations.find((c) => c.id === selectedId);
    if (!conv) return;
    const msg: Partial<Message> = {
      conversation_id: selectedId,
      body: body.trim(),
      direction: 'outbound',
      sender: aiSuggested ? 'ai' : 'advisor',
      ai_suggested: aiSuggested,
    };
    // Optimistic
    const tempId = crypto.randomUUID();
    setMessages((prev) => [...prev, { ...(msg as Message), id: tempId, created_at: new Date().toISOString(), read_at: null }]);
    setDraft('');
    await supabase.from('messages').insert(msg);
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', selectedId);
    await logAudit({
      actor_id: user?.id,
      actor_name: user?.name,
      action: 'create',
      entity: 'message',
      entity_id: selectedId,
      entity_label: `Mensaje a ${conv.client?.name ?? 'cliente'}`,
      changes: { body, ai_suggested: aiSuggested } as any,
    });
    loadConversations();
  }

  async function generateAiSummary() {
    if (!selected) return;
    setAiLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    const lastMessages = messages.slice(-6).map((m) => `${m.direction === 'inbound' ? 'Cliente' : 'Asesor'}: ${m.body}`).join(' | ');
    const summary = `1. ${selected.client?.name ?? 'Cliente'} ${selected.status === 'open' ? 'activo en negociación' : 'en espera de respuesta'}. 2. Último tema: ${messages[messages.length - 1]?.body.slice(0, 60) ?? 'sin mensajes'}. 3. Próximo paso: ${selected.status === 'pending' ? 'enviar seguimiento' : 'cerrar acuerdo'}.`;
    void lastMessages;
    await supabase.from('conversations').update({ ai_summary: summary }).eq('id', selected.id);
    setConversations((prev) => prev.map((c) => (c.id === selected.id ? { ...c, ai_summary: summary } : c)));
    setAiLoading(false);
  }

  async function assignAdvisor(advisorId: string) {
    if (!selectedId) return;
    await supabase.from('conversations').update({ advisor_id: advisorId }).eq('id', selectedId);
    const advisor = advisors.find((a) => a.id === advisorId);
    await logAudit({
      actor_id: user?.id,
      actor_name: user?.name,
      action: 'update',
      entity: 'conversation',
      entity_id: selectedId,
      entity_label: `Asignada a ${advisor?.name ?? 'asesor'}`,
    });
    setAssignOpen(false);
    loadConversations();
  }

  return (
    <div className="grid grid-cols-12 gap-0 h-[calc(100vh-64px)] -m-4 sm:-m-6">
      {/* Conversation list */}
      <div className={cn(
        'col-span-12 md:col-span-4 lg:col-span-3 border-r border-ink-200 bg-white flex flex-col',
        selectedId && 'hidden md:flex'
      )}>
        <div className="p-3 border-b border-ink-100 space-y-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ink-50 border border-ink-200">
            <Search size={15} className="text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversación…"
              className="bg-transparent outline-none flex-1 text-sm"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {(['all', 'open', 'pending', 'mine'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-600 transition',
                  filter === f ? 'bg-brand-600 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
                )}
              >
                {f === 'all' ? 'Todas' : f === 'open' ? 'Abiertas' : f === 'pending' ? 'Pendientes' : 'Mías'}
              </button>
            ))}
            <button
              onClick={loadConversations}
              className="ml-auto p-1.5 rounded-md text-ink-500 hover:bg-ink-100"
              title="Actualizar"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="p-6 text-center"><Spinner className="h-5 w-5 mx-auto" /></div>
          ) : filtered.length === 0 ? (
            <EmptyState title="Sin conversaciones" description="No hay conversaciones que coincidan con el filtro." />
          ) : (
            filtered.map((c) => {
              const ch = c.channel ? CHANNEL_ICONS[c.channel.slug] ?? { color: '#3282b8', abbr: 'CH' } : null;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    'w-full text-left px-3 py-3 border-b border-ink-100 hover:bg-ink-50 transition flex gap-3',
                    selectedId === c.id && 'bg-brand-50/60 border-l-2 border-l-brand-600'
                  )}
                >
                  <div className="relative">
                    <Avatar name={c.client?.name ?? '?'} color={c.channel?.color ?? '#1e6091'} size={40} />
                    {ch && (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full ring-2 ring-white flex items-center justify-center text-[8px] font-700 text-white"
                        style={{ backgroundColor: ch.color }}
                      >
                        {ch.abbr}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-600 text-ink-900 truncate">{c.client?.name ?? 'Cliente'}</p>
                      <span className="text-[10px] text-ink-400 shrink-0">{timeAgo(c.last_message_at)}</span>
                    </div>
                    <p className="text-xs text-ink-500 truncate">{c.ai_summary ?? 'Sin resumen IA'}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge tone={c.status === 'open' ? 'success' : c.status === 'pending' ? 'warning' : 'muted'}>
                        {c.status === 'open' ? 'Abierta' : c.status === 'pending' ? 'Pendiente' : 'Cerrada'}
                      </Badge>
                      {c.advisor && <span className="text-[10px] text-ink-400">· {c.advisor.name.split(' ')[0]}</span>}
                      {c.unread_count > 0 && (
                        <span className="ml-auto h-5 min-w-5 px-1.5 rounded-full bg-brand-600 text-white text-[10px] font-700 flex items-center justify-center">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat panel */}
      <div className={cn(
        'col-span-12 md:col-span-8 lg:col-span-6 flex flex-col bg-ink-50',
        !selectedId && 'hidden md:flex'
      )}>
        {selected ? (
          <>
            <div className="px-3 sm:px-4 py-3 bg-white border-b border-ink-200 flex items-center gap-3">
              <button
                onClick={() => setSelectedId(null)}
                className="md:hidden p-2 -ml-2 rounded-lg hover:bg-ink-100 text-ink-600 transition shrink-0"
                aria-label="Volver"
              >
                <ArrowLeft size={18} />
              </button>
              <Avatar name={selected.client?.name ?? '?'} color={selected.channel?.color ?? '#1e6091'} size={40} />
              <div className="min-w-0 flex-1">
                <p className="font-600 text-ink-900 truncate">{selected.client?.name ?? 'Cliente'}</p>
                <p className="text-xs text-ink-500 truncate">
                  {selected.channel?.name} · {selected.client?.company ?? 'Sin empresa'}
                </p>
              </div>
              <button
                onClick={() => setAssignOpen(true)}
                className="btn-ghost text-xs hidden sm:inline-flex"
                title="Asignar asesor"
              >
                <UserCog size={14} /> Asignar
              </button>
              <button
                onClick={generateAiSummary}
                className="btn-outline text-xs"
                disabled={aiLoading}
              >
                {aiLoading ? <Spinner /> : <Sparkles size={14} />} <span className="hidden sm:inline">Resumen IA</span>
              </button>
            </div>

            {selected.ai_summary && (
              <div className="px-4 py-2.5 bg-gradient-to-r from-brand-50 to-transparent border-b border-brand-100">
                <div className="flex items-start gap-2">
                  <Sparkles size={14} className="text-brand-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-ink-700"><strong className="font-700">Resumen IA:</strong> {selected.ai_summary}</p>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
              {msgLoading ? (
                <div className="text-center py-8"><Spinner className="h-5 w-5 mx-auto" /></div>
              ) : messages.length === 0 ? (
                <EmptyState title="Sin mensajes" description="Inicia la conversación enviando un mensaje." />
              ) : (
                messages.map((m) => {
                  const outbound = m.direction === 'outbound';
                  return (
                    <div key={m.id} className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
                      <div
                        className={cn(
                          'max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm shadow-sm',
                          outbound
                            ? m.sender === 'ai'
                              ? 'bg-gradient-to-br from-brand-600 to-brand-700 text-white rounded-br-md'
                              : 'bg-brand-600 text-white rounded-br-md'
                            : 'bg-white text-ink-900 rounded-bl-md border border-ink-200'
                        )}
                      >
                        {m.ai_suggested && (
                          <div className="flex items-center gap-1 mb-1 opacity-90">
                            <Sparkles size={11} />
                            <span className="text-[10px] font-700 uppercase tracking-wide">Sugerencia IA</span>
                          </div>
                        )}
                        <p className="leading-relaxed">{m.body}</p>
                        <div className={cn('flex items-center gap-1 mt-1 text-[10px]', outbound ? 'text-white/70' : 'text-ink-400')}>
                          <span>{new Date(m.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                          {outbound && <CheckCheck size={12} />}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* AI Copilot panel */}
            {aiOpen && (
              <div className="px-4 py-3 bg-white border-t border-ink-200 animate-fade-in">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={14} className="text-brand-600" />
                  <p className="text-xs font-700 text-ink-700 uppercase tracking-wide">Sugerencias IA Copilot</p>
                </div>
                <div className="space-y-1.5">
                  {AI_SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setDraft(s);
                        setAiOpen(false);
                      }}
                      className="w-full text-left text-xs text-ink-700 p-2.5 rounded-lg bg-brand-50/60 hover:bg-brand-100 transition border border-brand-100"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Composer */}
            <div className="p-3 bg-white border-t border-ink-200">
              <div className="flex items-end gap-2">
                <button
                  onClick={() => setAiOpen((v) => !v)}
                  className={cn(
                    'btn-outline shrink-0',
                    aiOpen && 'bg-brand-50 border-brand-300 text-brand-700'
                  )}
                  title="Sugerencias IA"
                >
                  <Sparkles size={16} />
                </button>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage(draft);
                    }
                  }}
                  rows={1}
                  placeholder="Escribe un mensaje… (Enter para enviar)"
                  className="flex-1 resize-none px-3.5 py-2.5 rounded-xl border border-ink-200 bg-ink-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 focus:bg-white transition max-h-32"
                />
                <button
                  onClick={() => sendMessage(draft)}
                  disabled={!draft.trim()}
                  className="btn-primary shrink-0"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            icon={<MessageCircle size={32} />}
            title="Selecciona una conversación"
            description="Elige un chat de la lista para ver los mensajes y responder."
          />
        )}
      </div>

      {/* Client info panel */}
      <div className="hidden lg:flex col-span-3 border-l border-ink-200 bg-white flex-col overflow-y-auto scrollbar-thin">
        {selected?.client ? (
          <ClientInfoPanel client={selected.client} channel={selected.channel} advisor={selected.advisor} />
        ) : (
          <EmptyState title="Sin cliente seleccionado" />
        )}
      </div>

      {/* Assign modal */}
      {assignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-sm" onClick={() => setAssignOpen(false)} />
          <Card className="relative w-full max-w-md p-5">
            <h3 className="font-display font-700 text-ink-900 mb-3">Asignar asesor</h3>
            <p className="text-sm text-ink-500 mb-4">Distribución inteligente: elige el asesor disponible para este chat.</p>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {advisors.map((a) => {
                const activeConv = conversations.filter((c) => c.advisor_id === a.id && c.status === 'open').length;
                return (
                  <button
                    key={a.id}
                    onClick={() => assignAdvisor(a.id)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-ink-50 transition text-left"
                  >
                    <Avatar name={a.name} color={a.avatar_color ?? '#1e6091'} size={36} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-600 text-ink-900 truncate">{a.name}</p>
                      <p className="text-xs text-ink-500 capitalize">{a.role} · {activeConv} chats activos</p>
                    </div>
                    {selected?.advisor_id === a.id && <Badge tone="brand">Actual</Badge>}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function ClientInfoPanel({ client, channel, advisor }: { client: Client; channel?: Channel; advisor?: Advisor }) {
  return (
    <div className="p-4 space-y-5">
      <div className="text-center">
        <Avatar name={client.name} color={channel?.color ?? '#1e6091'} size={64} />
        <p className="font-display font-700 text-ink-900 mt-2">{client.name}</p>
        <p className="text-xs text-ink-500">{client.company ?? 'Sin empresa'}</p>
        <div className="flex justify-center gap-1.5 mt-2">
          {client.tags.slice(0, 3).map((t) => (
            <Badge key={t} tone="brand">{t}</Badge>
          ))}
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <InfoRow icon={<Phone size={14} />} label="Teléfono" value={client.phone ?? '—'} />
        <InfoRow icon={<Mail size={14} />} label="Email" value={client.email ?? '—'} />
        <InfoRow icon={<MapPin size={14} />} label="Ciudad" value={client.city ?? '—'} />
        <InfoRow icon={<MessageCircle size={14} />} label="Canal" value={channel?.name ?? '—'} />
        <InfoRow icon={<UserCog size={14} />} label="Asesor" value={advisor?.name ?? 'Sin asignar'} />
      </div>

      <div>
        <p className="label">Notas comerciales</p>
        <p className="text-sm text-ink-700 bg-ink-50 rounded-lg p-3 border border-ink-100">{client.notes ?? 'Sin notas.'}</p>
      </div>

      <div>
        <p className="label">Historial rápido</p>
        <div className="space-y-2">
          <HistoryItem icon={<FileText size={12} />} title="Cotización enviada" time={client.last_contact_at ?? client.created_at} />
          <HistoryItem icon={<MessageCircle size={12} />} title="Conversación abierta" time={client.created_at} />
          <HistoryItem icon={<Clock size={12} />} title="Cliente creado" time={client.created_at} />
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-7 w-7 rounded-lg bg-ink-50 text-ink-500 flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-ink-400 font-600">{label}</p>
        <p className="text-sm text-ink-800 truncate">{value}</p>
      </div>
    </div>
  );
}

function HistoryItem({ icon, title, time }: { icon: React.ReactNode; title: string; time: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="h-6 w-6 rounded-md bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">{icon}</div>
      <span className="text-ink-700 flex-1 truncate">{title}</span>
      <span className="text-ink-400">{formatDateTime(time)}</span>
    </div>
  );
}
