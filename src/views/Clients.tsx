import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Users,
  Phone,
  Mail,
  Building2,
  MapPin,
  Tag,
  X,
  GripVertical,
  Filter,
  TrendingUp,
  FileText,
  MessageCircle,
  ExternalLink,
} from 'lucide-react';
import {
  supabase,
  type Client,
  type ClientStage,
  type Channel,
  type Advisor,
  type Quote,
} from '../lib/supabase';
import { useSession } from '../lib/store';
import { Avatar, Badge, Card, Drawer, EmptyState, Modal, Spinner } from '../components/ui';
import { cn, formatCurrency, formatDate, timeAgo } from '../lib/utils';
import { logAudit } from '../lib/audit';
import { isVendedor } from '../lib/permissions';

const STAGES: { key: ClientStage; label: string; color: string; bg: string }[] = [
  { key: 'contacto_inicial', label: 'Contacto Inicial', color: '#3282b8', bg: 'bg-brand-50' },
  { key: 'cotizacion_enviada', label: 'Cotización Enviada', color: '#f4a261', bg: 'bg-amber-50' },
  { key: 'negociacion', label: 'Negociación', color: '#2a9d8f', bg: 'bg-teal-50' },
  { key: 'cerrado_ganado', label: 'Cerrado / Ganado', color: '#10b981', bg: 'bg-emerald-50' },
  { key: 'cerrado_perdido', label: 'Cerrado / Perdido', color: '#ef4444', bg: 'bg-rose-50' },
];

const ALL_TAGS = ['VIP', 'Industrial', 'Servicios', 'Retail', 'Recompra', 'Prospecto', 'WhatsApp', 'Messenger', 'Instagram', 'Startup', 'Tecnología', 'Construcción', 'Farmacéutica', 'Distribución', 'Corporativo', 'Automotriz', 'Energía', 'Alimentos', 'Diseño', 'Logística'];

export function Clients() {
  const { user, advisors } = useSession();
  const [clients, setClients] = useState<Client[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [advisorFilter, setAdvisorFilter] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<ClientStage | null>(null);
  const [selected, setSelected] = useState<Client | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const vendedor = isVendedor(user?.role);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [cl, ch, q] = await Promise.all([
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('channels').select('*'),
      supabase.from('quotes').select('*'),
    ]);
    setClients((cl.data as Client[]) ?? []);
    setChannels((ch.data as Channel[]) ?? []);
    setQuotes((q.data as Quote[]) ?? []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let base = clients;
    // Vendedores solo ven sus clientes asignados
    if (vendedor && user) {
      base = base.filter((c) => c.advisor_id === user.id);
    }
    return base.filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        if (!c.name.toLowerCase().includes(q) && !c.company?.toLowerCase().includes(q) && !c.email?.toLowerCase().includes(q)) return false;
      }
      if (tagFilter && !c.tags.includes(tagFilter)) return false;
      if (advisorFilter && c.advisor_id !== advisorFilter) return false;
      return true;
    });
  }, [clients, search, tagFilter, advisorFilter, vendedor, user]);

  const byStage = useMemo(() => {
    const map: Record<ClientStage, Client[]> = {
      contacto_inicial: [],
      cotizacion_enviada: [],
      negociacion: [],
      cerrado_ganado: [],
      cerrado_perdido: [],
    };
    filtered.forEach((c) => map[c.stage].push(c));
    return map;
  }, [filtered]);

  async function moveStage(clientId: string, newStage: ClientStage) {
    const client = clients.find((c) => c.id === clientId);
    if (!client || client.stage === newStage) return;
    const oldStage = client.stage;
    setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, stage: newStage } : c)));
    await supabase.from('clients').update({ stage: newStage, updated_at: new Date().toISOString() }).eq('id', clientId);
    await logAudit({
      actor_id: user?.id,
      actor_name: user?.name,
      action: 'update',
      entity: 'client',
      entity_id: clientId,
      entity_label: client.name,
      changes: { stage: [oldStage, newStage] } as any,
    });
  }

  async function createClient(data: Partial<Client>) {
    const { error } = await supabase.from('clients').insert({
      name: data.name,
      company: data.company,
      email: data.email,
      phone: data.phone,
      industry: data.industry,
      city: data.city,
      location_url: data.location_url,
      whatsapp_id: data.whatsapp_id || null,
      facebook_id: data.facebook_id || null,
      channel_id: data.channel_id,
      advisor_id: vendedor ? user?.id : data.advisor_id,
      stage: data.stage ?? 'contacto_inicial',
      tags: data.tags ?? [],
      notes: data.notes,
    });
    if (!error) {
      await logAudit({
        actor_id: user?.id,
        actor_name: user?.name,
        action: 'create',
        entity: 'client',
        entity_label: data.name,
      });
      setCreateOpen(false);
      load();
    }
  }

  if (loading) {
    return <div className="flex justify-center py-24"><Spinner className="h-6 w-6" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ink-50 border border-ink-200 flex-1 min-w-[180px]">
            <Search size={15} className="text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, empresa o email…"
              className="bg-transparent outline-none flex-1 text-sm"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-ink-400 hover:text-ink-700">
                <X size={14} />
              </button>
            )}
          </div>

          {!vendedor && (
            <select
              value={advisorFilter ?? ''}
              onChange={(e) => setAdvisorFilter(e.target.value || null)}
              className="input w-auto hidden sm:block"
            >
              <option value="">Todos los asesores</option>
              {advisors.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-1 ml-auto">
            <div className="flex bg-ink-50 rounded-lg p-0.5 border border-ink-200">
              <button
                onClick={() => setView('kanban')}
                className={cn('px-3 py-1.5 rounded-md text-xs font-600 transition', view === 'kanban' ? 'bg-white shadow-sm text-ink-900' : 'text-ink-500')}
              >
                Kanban
              </button>
              <button
                onClick={() => setView('list')}
                className={cn('px-3 py-1.5 rounded-md text-xs font-600 transition', view === 'list' ? 'bg-white shadow-sm text-ink-900' : 'text-ink-500')}
              >
                Lista
              </button>
            </div>
            <button onClick={() => setCreateOpen(true)} className="btn-primary">
              <Plus size={15} /> <span className="hidden sm:inline">Nuevo cliente</span><span className="sm:hidden">Nuevo</span>
            </button>
          </div>
        </div>

        {/* Tag filters */}
        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
          <Filter size={13} className="text-ink-400 shrink-0" />
          <button
            onClick={() => setTagFilter(null)}
            className={cn('chip transition', !tagFilter ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200')}
          >
            Todos
          </button>
          {ALL_TAGS.slice(0, 10).map((t) => (
            <button
              key={t}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
              className={cn('chip transition', tagFilter === t ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200')}
            >
              {t}
            </button>
          ))}
        </div>
      </Card>

      {/* Kanban */}
      {view === 'kanban' ? (
        <div className="grid grid-cols-stages gap-4">
          {STAGES.map((stage) => {
            const items = byStage[stage.key];
            return (
              <div
                key={stage.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(stage.key);
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => {
                  if (dragId) moveStage(dragId, stage.key);
                  setDragId(null);
                  setDragOver(null);
                }}
                className={cn(
                  'rounded-2xl border bg-ink-50/50 transition',
                  dragOver === stage.key ? 'border-brand-400 bg-brand-50/40 ring-2 ring-brand-200' : 'border-ink-200'
                )}
              >
                <div className="px-3 py-2.5 flex items-center justify-between sticky top-0">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                    <p className="font-600 text-sm text-ink-800">{stage.label}</p>
                  </div>
                  <span className="text-xs font-700 text-ink-500 bg-white px-2 py-0.5 rounded-md border border-ink-200">
                    {items.length}
                  </span>
                </div>
                <div className="px-2 pb-2 space-y-2 min-h-[120px]">
                  {items.length === 0 ? (
                    <p className="text-xs text-ink-400 text-center py-6">Arrastra clientes aquí</p>
                  ) : (
                    items.map((c) => {
                      const channel = channels.find((ch) => ch.id === c.channel_id);
                      const clientQuotes = quotes.filter((q) => q.client_id === c.id);
                      return (
                        <div
                          key={c.id}
                          draggable
                          onDragStart={() => setDragId(c.id)}
                          onDragEnd={() => setDragId(null)}
                          onClick={() => setSelected(c)}
                          className={cn(
                            'bg-white rounded-xl border border-ink-200 p-3 cursor-pointer hover:shadow-soft hover:border-ink-300 transition group',
                            dragId === c.id && 'opacity-50'
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <Avatar name={c.name} color={channel?.color ?? '#1e6091'} size={32} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-600 text-ink-900 truncate">{c.name}</p>
                              <p className="text-xs text-ink-500 truncate">{c.company ?? c.industry ?? '—'}</p>
                            </div>
                            <GripVertical size={14} className="text-ink-300 opacity-0 group-hover:opacity-100 transition" />
                          </div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {c.tags.slice(0, 3).map((t) => (
                              <span key={t} className="chip bg-ink-100 text-ink-600 text-[10px]">{t}</span>
                            ))}
                          </div>
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-ink-100">
                            <span className="text-[10px] text-ink-400">{formatCurrency(c.lifetime_value)}</span>
                            <span className="text-[10px] text-ink-400">{clientQuotes.length} cot.</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // List view
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-ink-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3 font-600">Cliente</th>
                  <th className="text-left px-4 py-3 font-600 hidden md:table-cell">Empresa</th>
                  <th className="text-left px-4 py-3 font-600 hidden lg:table-cell">Canal</th>
                  <th className="text-left px-4 py-3 font-600 hidden md:table-cell">Asesor</th>
                  <th className="text-left px-4 py-3 font-600">Etapa</th>
                  <th className="text-right px-4 py-3 font-600 hidden sm:table-cell">LTV</th>
                  <th className="text-right px-4 py-3 font-600 hidden lg:table-cell">Últ. contacto</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const channel = channels.find((ch) => ch.id === c.channel_id);
                  const advisor = advisors.find((a) => a.id === c.advisor_id);
                  const stage = STAGES.find((s) => s.key === c.stage);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelected(c)}
                      className="border-t border-ink-100 hover:bg-ink-50 cursor-pointer transition"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={c.name} color={channel?.color ?? '#1e6091'} size={32} />
                          <div className="min-w-0">
                            <p className="font-600 text-ink-900 truncate">{c.name}</p>
                            <p className="text-xs text-ink-500 truncate">{c.email ?? '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-700 hidden md:table-cell">{c.company ?? '—'}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs font-600" style={{ color: channel?.color ?? '#1e6091' }}>
                          {channel?.name.split(' ')[0] ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-700 hidden md:table-cell">{advisor?.name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="chip" style={{ backgroundColor: `${stage?.color}15`, color: stage?.color }}>
                          {stage?.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-600 tabular-nums hidden sm:table-cell">{formatCurrency(c.lifetime_value)}</td>
                      <td className="px-4 py-3 text-right text-xs text-ink-500 hidden lg:table-cell">{timeAgo(c.last_contact_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <EmptyState icon={<Users size={28} />} title="Sin clientes" description="Ajusta los filtros o crea un nuevo cliente." />}
        </Card>
      )}

      {/* Client detail drawer */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Ficha del cliente"
        width={520}
      >
        {selected && (
          <ClientDetail
            client={selected}
            channel={channels.find((c) => c.id === selected.channel_id)}
            advisor={advisors.find((a) => a.id === selected.advisor_id)}
            quotes={quotes.filter((q) => q.client_id === selected.id)}
            advisors={advisors}
            channels={channels}
            onClose={() => setSelected(null)}
            onChanged={load}
          />
        )}
      </Drawer>

      {/* Create modal */}
      <ClientCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={createClient}
        advisors={advisors}
        channels={channels}
      />
    </div>
  );
}

function ClientDetail({
  client,
  channel,
  advisor,
  quotes,
  advisors,
  channels,
  onClose,
  onChanged,
}: {
  client: Client;
  channel?: Channel;
  advisor?: Advisor;
  quotes: Quote[];
  advisors: Advisor[];
  channels: Channel[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user } = useSession();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(client);

  async function save() {
    await supabase
      .from('clients')
      .update({
        name: form.name,
        company: form.company,
        email: form.email,
        phone: form.phone,
        industry: form.industry,
        city: form.city,
        location_url: form.location_url,
        whatsapp_id: form.whatsapp_id,
        facebook_id: form.facebook_id,
        channel_id: form.channel_id,
        advisor_id: form.advisor_id,
        tags: form.tags,
        notes: form.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', client.id);
    await logAudit({
      actor_id: user?.id,
      actor_name: user?.name,
      action: 'update',
      entity: 'client',
      entity_id: client.id,
      entity_label: form.name,
    });
    setEditing(false);
    onChanged();
    onClose();
  }

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-start gap-3">
        <Avatar name={client.name} color={channel?.color ?? '#1e6091'} size={56} />
        <div className="flex-1 min-w-0">
          {editing ? (
            <input className="input font-display text-lg font-700" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          ) : (
            <h3 className="font-display font-700 text-lg text-ink-900">{client.name}</h3>
          )}
          <p className="text-sm text-ink-500">{client.company ?? 'Sin empresa'}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {client.tags.map((t) => (
              <Badge key={t} tone="brand">{t}</Badge>
            ))}
          </div>
        </div>
        <button
          onClick={() => (editing ? save() : setEditing(true))}
          className={editing ? 'btn-primary text-xs' : 'btn-outline text-xs'}
        >
          {editing ? 'Guardar' : 'Editar'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Teléfono" icon={<Phone size={13} />}>
          {editing ? <input className="input" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /> : <span className="text-sm text-ink-800">{client.phone ?? '—'}</span>}
        </Field>
        <Field label="Email" icon={<Mail size={13} />}>
          {editing ? <input className="input" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /> : <span className="text-sm text-ink-800">{client.email ?? '—'}</span>}
        </Field>
        <Field label="Empresa" icon={<Building2 size={13} />}>
          {editing ? <input className="input" value={form.company ?? ''} onChange={(e) => setForm({ ...form, company: e.target.value })} /> : <span className="text-sm text-ink-800">{client.company ?? '—'}</span>}
        </Field>
        <Field label="Ciudad" icon={<MapPin size={13} />}>
          {editing ? <input className="input" value={form.city ?? ''} onChange={(e) => setForm({ ...form, city: e.target.value })} /> : <span className="text-sm text-ink-800">{client.city ?? '—'}</span>}
        </Field>
        <Field label="Ubicación / Google Maps" icon={<MapPin size={13} />}>
          {editing ? (
            <input
              className="input"
              value={form.location_url ?? ''}
              onChange={(e) => setForm({ ...form, location_url: e.target.value })}
              placeholder="https://maps.google.com/... o coordenadas"
            />
          ) : client.location_url ? (
            <a
              href={client.location_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand-600 hover:text-brand-700 underline inline-flex items-center gap-1 break-all"
            >
              Ver en mapa <ExternalLink size={11} className="shrink-0" />
            </a>
          ) : (
            <span className="text-sm text-ink-800">—</span>
          )}
        </Field>
        <Field label="WhatsApp ID" icon={<MessageCircle size={13} />}>
          {editing ? (
            <input
              className="input"
              value={form.whatsapp_id ?? ''}
              onChange={(e) => setForm({ ...form, whatsapp_id: e.target.value })}
              placeholder="Ej. 5215512345678"
            />
          ) : (
            <span className="text-sm text-ink-800 font-mono">{client.whatsapp_id ?? '—'}</span>
          )}
        </Field>
        <Field label="Facebook ID" icon={<MessageCircle size={13} />}>
          {editing ? (
            <input
              className="input"
              value={form.facebook_id ?? ''}
              onChange={(e) => setForm({ ...form, facebook_id: e.target.value })}
              placeholder="PSID de Messenger"
            />
          ) : (
            <span className="text-sm text-ink-800 font-mono">{client.facebook_id ?? '—'}</span>
          )}
        </Field>
        <Field label="Industria" icon={<Tag size={13} />}>
          {editing ? <input className="input" value={form.industry ?? ''} onChange={(e) => setForm({ ...form, industry: e.target.value })} /> : <span className="text-sm text-ink-800">{client.industry ?? '—'}</span>}
        </Field>
        <Field label="Canal de origen" icon={<MessageCircle size={13} />}>
          {editing ? (
            <select className="input" value={form.channel_id ?? ''} onChange={(e) => setForm({ ...form, channel_id: e.target.value || null })}>
              <option value="">Sin canal</option>
              {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : (
            <span className="text-sm font-600" style={{ color: channel?.color ?? '#1e6091' }}>{channel?.name ?? '—'}</span>
          )}
        </Field>
        <Field label="Asesor asignado" icon={<Users size={13} />}>
          {editing ? (
            <select className="input" value={form.advisor_id ?? ''} onChange={(e) => setForm({ ...form, advisor_id: e.target.value || null })}>
              <option value="">Sin asignar</option>
              {advisors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          ) : (
            <span className="text-sm text-ink-800">{advisor?.name ?? 'Sin asignar'}</span>
          )}
        </Field>
        <Field label="LTV" icon={<TrendingUp size={13} />}>
          <span className="text-sm font-700 text-ink-900">{formatCurrency(client.lifetime_value)}</span>
        </Field>
      </div>

      <div>
        <p className="label">Notas comerciales</p>
        {editing ? (
          <textarea className="input" rows={3} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        ) : (
          <p className="text-sm text-ink-700 bg-ink-50 rounded-lg p-3 border border-ink-100">{client.notes ?? 'Sin notas.'}</p>
        )}
      </div>

      <div>
        <p className="label">Cotizaciones ({quotes.length})</p>
        <div className="space-y-2">
          {quotes.length === 0 ? (
            <p className="text-sm text-ink-400 py-2">Sin cotizaciones registradas.</p>
          ) : (
            quotes.map((q) => (
              <div key={q.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-ink-50 border border-ink-100">
                <FileText size={16} className="text-ink-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-600 text-ink-900">{q.quote_number}</p>
                  <p className="text-xs text-ink-500">{formatDate(q.created_at)}</p>
                </div>
                <Badge tone={q.status === 'aceptada' ? 'success' : q.status === 'rechazada' ? 'danger' : q.status === 'enviada' ? 'brand' : 'muted'}>
                  {q.status}
                </Badge>
                <span className="text-sm font-700 tabular-nums">{formatCurrency(q.total)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-ink-400 font-600 flex items-center gap-1 mb-1">
        {icon} {label}
      </p>
      {children}
    </div>
  );
}

function ClientCreateModal({
  open,
  onClose,
  onCreate,
  advisors,
  channels,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: Partial<Client>) => void;
  advisors: Advisor[];
  channels: Channel[];
}) {
  const [form, setForm] = useState<Partial<Client>>({
    name: '',
    company: '',
    email: '',
    phone: '',
    industry: '',
    city: '',
    location_url: '',
    whatsapp_id: '',
    facebook_id: '',
    stage: 'contacto_inicial',
    tags: [],
    notes: '',
  });
  const [tagInput, setTagInput] = useState('');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo cliente"
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button onClick={() => onCreate(form)} className="btn-primary" disabled={!form.name}>
            Crear cliente
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Nombre *</label>
          <input className="input" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre del cliente" />
        </div>
        <div>
          <label className="label">Empresa</label>
          <input className="input" value={form.company ?? ''} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        </div>
        <div>
          <label className="label">Industria</label>
          <input className="input" value={form.industry ?? ''} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label">Teléfono</label>
          <input className="input" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="label">Ciudad</label>
          <input className="input" value={form.city ?? ''} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <div className="col-span-2">
          <label className="label">Ubicación / Google Maps</label>
          <input
            className="input"
            value={form.location_url ?? ''}
            onChange={(e) => setForm({ ...form, location_url: e.target.value })}
            placeholder="Enlace de Google Maps o coordenadas de entrega"
          />
        </div>
        <div>
          <label className="label">WhatsApp ID</label>
          <input
            className="input"
            value={form.whatsapp_id ?? ''}
            onChange={(e) => setForm({ ...form, whatsapp_id: e.target.value })}
            placeholder="Ej. 5215512345678"
          />
        </div>
        <div>
          <label className="label">Facebook ID</label>
          <input
            className="input"
            value={form.facebook_id ?? ''}
            onChange={(e) => setForm({ ...form, facebook_id: e.target.value })}
            placeholder="PSID de Messenger"
          />
        </div>
        <div>
          <label className="label">Canal de origen</label>
          <select className="input" value={form.channel_id ?? ''} onChange={(e) => setForm({ ...form, channel_id: e.target.value || null })}>
            <option value="">Sin canal</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Asesor asignado</label>
          <select className="input" value={form.advisor_id ?? ''} onChange={(e) => setForm({ ...form, advisor_id: e.target.value || null })}>
            <option value="">Sin asignar</option>
            {advisors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Etapa inicial</label>
          <select className="input" value={form.stage ?? 'contacto_inicial'} onChange={(e) => setForm({ ...form, stage: e.target.value as ClientStage })}>
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Etiquetas</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(form.tags ?? []).map((t) => (
              <span key={t} className="chip bg-brand-50 text-brand-700">
                {t}
                <button onClick={() => setForm({ ...form, tags: (form.tags ?? []).filter((x) => x !== t) })}>
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagInput.trim()) {
                  e.preventDefault();
                  setForm({ ...form, tags: Array.from(new Set([...(form.tags ?? []), tagInput.trim()])) });
                  setTagInput('');
                }
              }}
              placeholder="Escribe una etiqueta y presiona Enter"
            />
          </div>
        </div>
        <div className="col-span-2">
          <label className="label">Notas</label>
          <textarea className="input" rows={2} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
    </Modal>
  );
}
