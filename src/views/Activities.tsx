import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Phone,
  MapPin,
  Users as UsersIcon,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CheckCircle2,
} from 'lucide-react';
import {
  supabase,
  type Activity,
  type Client,
  type Advisor,
} from '../lib/supabase';
import { useSession } from '../lib/store';
import { Avatar, Badge, Card, EmptyState, Modal, Spinner } from '../components/ui';
import { cn, formatDate, formatDateTime } from '../lib/utils';
import { logAudit } from '../lib/audit';
import { isVendedor } from '../lib/permissions';

const TYPE_META: Record<Activity['type'], { label: string; color: string; icon: any }> = {
  llamada: { label: 'Llamada', color: '#3282b8', icon: Phone },
  visita: { label: 'Visita', color: '#e76f51', icon: MapPin },
  reunion: { label: 'Reunión', color: '#6a4c93', icon: UsersIcon },
  tarea: { label: 'Tarea', color: '#2a9d8f', icon: CheckSquare },
};

export function Activities() {
  const { user, advisors } = useSession();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
  const [createOpen, setCreateOpen] = useState(false);
  const [filterAdvisor, setFilterAdvisor] = useState<string | null>(null);
  const vendedor = isVendedor(user?.role);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [a, c] = await Promise.all([
      supabase.from('activities').select('*').order('scheduled_at', { ascending: true }),
      supabase.from('clients').select('id, name, company'),
    ]);
    setActivities((a.data as Activity[]) ?? []);
    setClients((c.data as Client[]) ?? []);
    setLoading(false);
  }

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const filtered = useMemo(() => {
    return activities.filter((a) => {
      // Vendedores solo ven sus propias actividades
      if (vendedor && user && a.advisor_id !== user.id) return false;
      if (filterAdvisor && a.advisor_id !== filterAdvisor) return false;
      return true;
    });
  }, [activities, filterAdvisor, vendedor, user]);

  const byDay = useMemo(() => {
    const map: Record<string, Activity[]> = {};
    weekDays.forEach((d) => (map[d.toISOString().slice(0, 10)] = []));
    filtered.forEach((a) => {
      const key = new Date(a.scheduled_at).toISOString().slice(0, 10);
      if (map[key]) map[key].push(a);
    });
    return map;
  }, [weekDays, filtered]);

  const todayKey = new Date().toISOString().slice(0, 10);

  async function setStatus(activity: Activity, status: Activity['status']) {
    setActivities((prev) => prev.map((a) => (a.id === activity.id ? { ...a, status } : a)));
    await supabase.from('activities').update({ status }).eq('id', activity.id);
    await logAudit({
      actor_id: user?.id,
      actor_name: user?.name,
      action: 'update',
      entity: 'activity',
      entity_id: activity.id,
      entity_label: activity.title,
      changes: { status: [activity.status, status] } as any,
    });
  }

  async function createActivity(data: Partial<Activity>) {
    const { error } = await supabase.from('activities').insert({
      title: data.title,
      type: data.type ?? 'llamada',
      client_id: data.client_id,
      advisor_id: data.advisor_id,
      scheduled_at: data.scheduled_at,
      duration_min: data.duration_min ?? 30,
      location: data.location,
      notes: data.notes,
      status: 'pendiente',
    });
    if (!error) {
      await logAudit({
        actor_id: user?.id,
        actor_name: user?.name,
        action: 'create',
        entity: 'activity',
        entity_label: data.title,
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
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * 86400000))} className="btn-ghost p-2">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => setWeekStart(getWeekStart(new Date()))} className="btn-outline text-xs">
              Hoy
            </button>
            <button onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * 86400000))} className="btn-ghost p-2">
              <ChevronRight size={16} />
            </button>
          </div>
          <p className="font-display font-700 text-ink-900 ml-2">
            {formatDate(weekDays[0], { day: 'numeric', month: 'short' })} — {formatDate(weekDays[6], { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          {!vendedor && (
            <select
              value={filterAdvisor ?? ''}
              onChange={(e) => setFilterAdvisor(e.target.value || null)}
              className="input w-auto ml-auto hidden sm:block"
            >
              <option value="">Todo el equipo</option>
              {advisors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          <button onClick={() => setCreateOpen(true)} className="btn-primary">
            <Plus size={15} /> Nueva actividad
          </button>
        </div>
      </Card>

      {/* Week grid */}
      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        <div className="grid grid-cols-7 gap-2 sm:gap-3 min-w-[700px]">
        {weekDays.map((d) => {
          const key = d.toISOString().slice(0, 10);
          const items = byDay[key] ?? [];
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              className={cn(
                'rounded-2xl border bg-ink-50/40 min-h-[200px]',
                isToday ? 'border-brand-400 ring-1 ring-brand-200' : 'border-ink-200'
              )}
            >
              <div className="px-3 py-2.5 border-b border-ink-100 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-ink-400 font-600">
                    {d.toLocaleDateString('es-MX', { weekday: 'short' })}
                  </p>
                  <p className={cn('font-display font-700 text-lg', isToday ? 'text-brand-700' : 'text-ink-900')}>
                    {d.getDate()}
                  </p>
                </div>
                <span className="text-[10px] font-700 text-ink-500 bg-white px-1.5 py-0.5 rounded border border-ink-200">
                  {items.length}
                </span>
              </div>
              <div className="p-2 space-y-1.5">
                {items.length === 0 ? (
                  <p className="text-[11px] text-ink-400 text-center py-4">Sin actividades</p>
                ) : (
                  items.map((a) => {
                    const meta = TYPE_META[a.type];
                    const Icon = meta.icon;
                    const client = clients.find((c) => c.id === a.client_id);
                    const advisor = advisors.find((ad) => ad.id === a.advisor_id);
                    return (
                      <div
                        key={a.id}
                        className={cn(
                          'p-2 rounded-lg border bg-white text-xs space-y-1',
                          a.status === 'completada' && 'opacity-60',
                          a.status === 'cancelada' && 'line-through opacity-50'
                        )}
                        style={{ borderLeft: `3px solid ${meta.color}` }}
                      >
                        <div className="flex items-center gap-1.5">
                          <Icon size={11} style={{ color: meta.color }} />
                          <span className="font-600 text-ink-900 truncate flex-1">{a.title}</span>
                        </div>
                        <p className="text-ink-500">
                          {new Date(a.scheduled_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · {a.duration_min}min
                        </p>
                        {client && <p className="text-ink-600 truncate">· {client.name}</p>}
                        <div className="flex items-center justify-between gap-1">
                          {advisor && (
                            <div className="flex items-center gap-1">
                              <Avatar name={advisor.name} color={advisor.avatar_color ?? '#1e6091'} size={18} />
                              <span className="text-[10px] text-ink-500">{advisor.name.split(' ')[0]}</span>
                            </div>
                          )}
                          {a.status === 'pendiente' && (
                            <button
                              onClick={() => setStatus(a, 'completada')}
                              className="p-1 rounded hover:bg-emerald-50 text-ink-400 hover:text-emerald-600 transition"
                              title="Marcar completada"
                            >
                              <CheckCircle2 size={13} />
                            </button>
                          )}
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
      </div>

      {/* Upcoming list */}
      <Card className="p-5">
        <h3 className="font-display font-700 text-ink-900 mb-3">Próximas actividades</h3>
        <div className="space-y-2">
          {filtered
            .filter((a) => new Date(a.scheduled_at).getTime() >= Date.now() && a.status === 'pendiente')
            .slice(0, 8)
            .map((a) => {
              const meta = TYPE_META[a.type];
              const Icon = meta.icon;
              const client = clients.find((c) => c.id === a.client_id);
              const advisor = advisors.find((ad) => ad.id === a.advisor_id);
              return (
                <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-ink-50 transition">
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${meta.color}15`, color: meta.color }}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-600 text-ink-900 truncate">{a.title}</p>
                    <p className="text-xs text-ink-500 truncate">
                      {formatDateTime(a.scheduled_at)} · {a.duration_min}min
                      {client ? ` · ${client.name}` : ''}
                      {a.location ? ` · ${a.location}` : ''}
                    </p>
                  </div>
                  {advisor && <Avatar name={advisor.name} color={advisor.avatar_color ?? '#1e6091'} size={24} />}
                  <Badge tone="warning">Pendiente</Badge>
                </div>
              );
            })}
          {filtered.filter((a) => new Date(a.scheduled_at).getTime() >= Date.now() && a.status === 'pendiente').length === 0 && (
            <EmptyState icon={<CalendarDays size={24} />} title="Sin actividades próximas" />
          )}
        </div>
      </Card>

      <ActivityCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={createActivity}
        clients={clients}
        advisors={advisors}
        defaultAdvisorId={user?.id}
      />
    </div>
  );
}

function ActivityCreateModal({
  open,
  onClose,
  onCreate,
  clients,
  advisors,
  defaultAdvisorId,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: Partial<Activity>) => void;
  clients: Client[];
  advisors: Advisor[];
  defaultAdvisorId?: string;
}) {
  const [form, setForm] = useState<Partial<Activity>>({
    title: '',
    type: 'llamada',
    scheduled_at: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
    duration_min: 30,
    advisor_id: defaultAdvisorId,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva actividad"
      size="md"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button onClick={() => onCreate(form)} className="btn-primary" disabled={!form.title}>
            Crear actividad
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">Título *</label>
          <input className="input" value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ej. Llamada de seguimiento" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Activity['type'] })}>
              {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Duración (min)</label>
            <input type="number" min={5} className="input" value={form.duration_min ?? 30} onChange={(e) => setForm({ ...form, duration_min: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Fecha y hora</label>
            <input type="datetime-local" className="input" value={form.scheduled_at as string} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
          </div>
          <div>
            <label className="label">Asesor</label>
            <select className="input" value={form.advisor_id ?? ''} onChange={(e) => setForm({ ...form, advisor_id: e.target.value || null })}>
              <option value="">Sin asignar</option>
              {advisors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Cliente</label>
            <select className="input" value={form.client_id ?? ''} onChange={(e) => setForm({ ...form, client_id: e.target.value || null })}>
              <option value="">Sin cliente</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Ubicación</label>
            <input className="input" value={form.location ?? ''} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Dirección o enlace" />
          </div>
          <div className="col-span-2">
            <label className="label">Notas</label>
            <textarea className="input" rows={2} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function getWeekStart(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
