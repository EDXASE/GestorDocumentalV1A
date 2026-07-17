import { useEffect, useMemo, useState } from 'react';
import {
  Users,
  FileText,
  TrendingUp,
  Clock,
  MessagesSquare,
  Target,
  AlertTriangle,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/store';
import { Card, SectionTitle, StatCard, Badge, Avatar, Spinner } from '../components/ui';
import { AreaChart, BarList, Donut, Funnel } from '../components/charts';
import { formatCurrency, formatNumber, timeAgo, formatPercent } from '../lib/utils';
import { isVendedor } from '../lib/permissions';

type Kpis = {
  totalClients: number;
  wonClients: number;
  openQuotes: number;
  revenue: number;
  conversionRate: number;
  avgResponseMin: number;
  pendingFollowups: number;
  activeAlerts: number;
};

const STAGE_LABELS: Record<string, string> = {
  contacto_inicial: 'Contacto Inicial',
  cotizacion_enviada: 'Cotización Enviada',
  negociacion: 'Negociación',
  cerrado_ganado: 'Cerrado / Ganado',
  cerrado_perdido: 'Cerrado / Perdido',
};

const STAGE_COLORS: Record<string, string> = {
  contacto_inicial: '#3282b8',
  cotizacion_enviada: '#f4a261',
  negociacion: '#2a9d8f',
  cerrado_ganado: '#10b981',
  cerrado_perdido: '#ef4444',
};

export function Dashboard({ onNavigate }: { onNavigate: (v: 'inbox' | 'clients' | 'quotes' | 'reports') => void }) {
  const { user, advisors } = useSession();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Record<string, any>[]>([]);
  const [quotes, setQuotes] = useState<Record<string, any>[]>([]);
  const [conversations, setConversations] = useState<Record<string, any>[]>([]);
  const [messages, setMessages] = useState<Record<string, any>[]>([]);
  const [channels, setChannels] = useState<Record<string, any>[]>([]);
  const [alerts, setAlerts] = useState<Record<string, any>[]>([]);
  const [followups, setFollowups] = useState<Record<string, any>[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [cl, q, cv, ms, ch, al, fu] = await Promise.all([
        supabase.from('clients').select('*'),
        supabase.from('quotes').select('*'),
        supabase.from('conversations').select('*'),
        supabase.from('messages').select('*'),
        supabase.from('channels').select('*'),
        supabase.from('repurchase_alerts').select('*'),
        supabase.from('followup_triggers').select('*'),
      ]);
      setClients(cl.data ?? []);
      setQuotes(q.data ?? []);
      setConversations(cv.data ?? []);
      setMessages(ms.data ?? []);
      setChannels(ch.data ?? []);
      setAlerts(al.data ?? []);
      setFollowups(fu.data ?? []);
      setLoading(false);
    })();
  }, []);

  const vendedor = isVendedor(user?.role);
  const myClientIds = useMemo(() => {
    if (!vendedor || !user) return null;
    return new Set(clients.filter((c) => c.advisor_id === user.id).map((c) => c.id));
  }, [clients, vendedor, user]);

  const scopedClients = useMemo(() => {
    if (!myClientIds) return clients;
    return clients.filter((c) => myClientIds.has(c.id));
  }, [clients, myClientIds]);

  const scopedQuotes = useMemo(() => {
    if (!vendedor || !user) return quotes;
    return quotes.filter((q) => q.advisor_id === user.id);
  }, [quotes, vendedor, user]);

  const scopedConversations = useMemo(() => {
    if (!vendedor || !user) return conversations;
    return conversations.filter((c) => c.advisor_id === user.id);
  }, [conversations, vendedor, user]);

  const scopedAlerts = useMemo(() => {
    if (!myClientIds) return alerts;
    return alerts.filter((a) => myClientIds.has(a.client_id));
  }, [alerts, myClientIds]);

  const scopedFollowups = useMemo(() => {
    if (!myClientIds) return followups;
    return followups.filter((f) => myClientIds.has(f.client_id));
  }, [followups, myClientIds]);

  const kpis = useMemo<Kpis>(() => {
    const won = scopedClients.filter((c) => c.stage === 'cerrado_ganado').length;
    const lost = scopedClients.filter((c) => c.stage === 'cerrado_perdido').length;
    const revenue = scopedQuotes.filter((q) => q.status === 'aceptada').reduce((s, q) => s + Number(q.total), 0);
    const openQuotes = scopedQuotes.filter((q) => q.status === 'enviada').length;
    const conv = won + lost > 0 ? (won / (won + lost)) * 100 : 0;
    const pendingFollowups = scopedFollowups.filter((f) => f.status === 'programado').length;
    const activeAlerts = scopedAlerts.filter((a) => a.status === 'activa').length;
    return {
      totalClients: scopedClients.length,
      wonClients: won,
      openQuotes,
      revenue,
      conversionRate: conv,
      avgResponseMin: 14,
      pendingFollowups,
      activeAlerts,
    };
  }, [scopedClients, scopedQuotes, scopedFollowups, scopedAlerts]);

  const funnelData = useMemo(() => {
    const order = ['contacto_inicial', 'cotizacion_enviada', 'negociacion', 'cerrado_ganado'];
    return order.map((s) => ({
      label: STAGE_LABELS[s],
      value: scopedClients.filter((c) => c.stage === s).length,
      color: STAGE_COLORS[s],
    }));
  }, [scopedClients]);

  const revenueByMonth = useMemo(() => {
    const months: { label: string; value: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString('es-MX', { month: 'short' });
      const value = scopedQuotes
        .filter((q) => {
          if (q.status !== 'aceptada' || !q.responded_at) return false;
          const r = new Date(q.responded_at);
          return r.getFullYear() === d.getFullYear() && r.getMonth() === d.getMonth();
        })
        .reduce((s, q) => s + Number(q.total), 0);
      months.push({ label, value });
    }
    return months;
  }, [scopedQuotes]);

  const channelData = useMemo(() => {
    return channels.map((ch) => {
      const convs = scopedConversations.filter((c) => c.channel_id === ch.id);
      const msgCount = messages.filter((m) =>
        convs.some((c) => c.id === m.conversation_id)
      ).length;
      return {
        label: ch.name.split(' ')[0],
        value: convs.length,
        color: ch.color ?? '#3282b8',
        sub: `${msgCount} mensajes`,
      };
    });
  }, [channels, scopedConversations, messages]);

  const advisorRanking = useMemo(() => {
    if (vendedor) {
      // Vendedores ven solo su propio desempeño
      const me = advisors.find((a) => a.id === user?.id);
      if (!me) return [];
      const won = scopedQuotes.filter((q) => q.status === 'aceptada');
      const revenue = won.reduce((s, q) => s + Number(q.total), 0);
      const assigned = scopedClients.length;
      return [{
        label: me.name,
        value: revenue,
        sub: `${assigned} clientes · ${won.length} cerrados`,
        color: me.avatar_color ?? '#1e6091',
      }];
    }
    return advisors
      .map((a) => {
        const won = quotes.filter(
          (q) => q.advisor_id === a.id && q.status === 'aceptada'
        );
        const revenue = won.reduce((s, q) => s + Number(q.total), 0);
        const assigned = clients.filter((c) => c.advisor_id === a.id).length;
        return {
          label: a.name,
          value: revenue,
          sub: `${assigned} clientes · ${won.length} cerrados`,
          color: a.avatar_color ?? '#1e6091',
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [advisors, quotes, clients, vendedor, user, scopedQuotes, scopedClients]);

  const recentMessages = useMemo(() => {
    const scopedMsgs = vendedor
      ? messages.filter((m) => {
          const conv = conversations.find((c) => c.id === m.conversation_id);
          return conv && conv.advisor_id === user?.id;
        })
      : messages;
    return scopedMsgs
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)
      .map((m: Record<string, any>) => {
        const conv = conversations.find((c) => c.id === m.conversation_id);
        const client = conv ? clients.find((c) => c.id === conv.client_id) : null;
        return {
          id: m.id as string,
          body: m.body as string,
          ai_suggested: m.ai_suggested as boolean,
          created_at: m.created_at as string,
          client,
          channel: conv ? channels.find((c) => c.id === conv.channel_id) : null,
        };
      });
  }, [messages, conversations, clients, channels, vendedor, user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero banner */}
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 text-white p-5 sm:p-6">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute right-20 bottom-0 h-32 w-32 rounded-full bg-accent-400/20 blur-2xl" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/15 text-xs font-600 mb-3">
              <Sparkles size={12} /> {vendedor ? 'Mi panel' : 'Resumen ejecutivo'} · {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <h2 className="font-display text-2xl font-800 leading-tight">
              Bienvenido, {user?.name?.split(' ')[0] ?? 'equipo'}.
            </h2>
            <p className="text-brand-100 text-sm mt-1 max-w-xl">
              {vendedor ? 'Tienes' : 'Tienes'} <strong className="text-white">{kpis.openQuotes} cotizaciones</strong> enviadas esperando respuesta
              y <strong className="text-white">{kpis.activeAlerts} alertas</strong> de re-compra activas.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => onNavigate('inbox')} className="btn bg-white text-brand-700 hover:bg-brand-50 font-600">
              <MessagesSquare size={15} /> Ver bandeja
            </button>
            {!vendedor && (
              <button onClick={() => onNavigate('reports')} className="btn bg-white/15 text-white hover:bg-white/25 font-600">
                <BarChart3Icon /> Inteligencia
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label={vendedor ? 'Mis clientes' : 'Clientes activos'}
          value={formatNumber(kpis.totalClients)}
          delta={{ value: '+12% vs mes anterior', positive: true }}
          icon={<Users size={18} />}
          tone="brand"
        />
        <StatCard
          label="Ingresos cerrados"
          value={formatCurrency(kpis.revenue)}
          delta={{ value: '+8.4% MoM', positive: true }}
          icon={<TrendingUp size={18} />}
          tone="success"
        />
        <StatCard
          label="Tasa de conversión"
          value={formatPercent(kpis.conversionRate)}
          delta={{ value: '-2.1% vs meta', positive: false }}
          icon={<Target size={18} />}
          tone="warning"
        />
        <StatCard
          label="Cotizaciones abiertas"
          value={formatNumber(kpis.openQuotes)}
          delta={{ value: `${kpis.pendingFollowups} seguimientos`, positive: false }}
          icon={<FileText size={18} />}
          tone="ink"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue trend */}
        <Card className="p-5 lg:col-span-2">
          <SectionTitle
            title="Ingresos cerrados"
            subtitle="Últimos 6 meses · cotizaciones aceptadas"
            action={<Badge tone="success">+8.4% MoM</Badge>}
          />
          <AreaChart
            data={revenueByMonth}
            height={240}
            formatValue={(v) => formatCurrency(v)}
          />
        </Card>

        {/* Pipeline funnel */}
        <Card className="p-5">
          <SectionTitle title="Embudo de ventas" subtitle="Distribución por etapa" />
          <Funnel stages={funnelData} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Channels */}
        <Card className="p-5">
          <SectionTitle title="Canales digitales" subtitle="Conversaciones por canal" />
          <div className="flex items-center justify-center mb-4">
            <Donut
              data={channelData.map((c) => ({ label: c.label, value: c.value, color: c.color }))}
              centerLabel="Convers."
              centerValue={formatNumber(channelData.reduce((s, c) => s + c.value, 0))}
            />
          </div>
          <BarList data={channelData} formatValue={(v) => `${v} conv.`} />
        </Card>

        {/* Advisor ranking */}
        <Card className="p-5">
          <SectionTitle title={vendedor ? 'Mi desempeño' : 'Ranking de asesores'} subtitle="Por ingresos cerrados" />
          {advisorRanking.length === 0 ? (
            <p className="text-sm text-ink-500 py-8 text-center">Sin datos aún.</p>
          ) : (
            <BarList data={advisorRanking} formatValue={(v) => formatCurrency(v)} />
          )}
        </Card>

        {/* Recent activity */}
        <Card className="p-5">
          <SectionTitle
            title="Mensajes recientes"
            subtitle="Actividad omnicanal"
            action={
              <button onClick={() => onNavigate('inbox')} className="text-xs font-600 text-brand-600 hover:text-brand-700 inline-flex items-center gap-1">
                Ver todo <ArrowUpRight size={12} />
              </button>
            }
          />
          <div className="space-y-3">
            {recentMessages.map((m) => (
              <div key={m.id} className="flex items-start gap-3">
                <Avatar name={m.client?.name ?? '?'} size={32} color={m.channel?.color ?? '#1e6091'} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-600 text-ink-900 truncate">{m.client?.name ?? 'Cliente'}</p>
                    <span className="text-[11px] text-ink-400 shrink-0">{timeAgo(m.created_at)}</span>
                  </div>
                  <p className="text-xs text-ink-500 truncate">{m.body}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] font-600 uppercase tracking-wide" style={{ color: m.channel?.color ?? '#1e6091' }}>
                      {m.channel?.name ?? 'Canal'}
                    </span>
                    {m.ai_suggested && <Badge tone="brand">IA</Badge>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Alerts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-5">
          <SectionTitle
            title="Alertas de re-compra"
            subtitle="Patrones históricos anticipados"
            action={<Badge tone="warning">{kpis.activeAlerts} activas</Badge>}
          />
          <div className="space-y-2.5">
            {scopedAlerts.filter((a) => a.status === 'activa').slice(0, 4).map((a) => {
              const client = clients.find((c) => c.id === a.client_id);
              return (
                <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-ink-50 transition">
                  <div className="h-9 w-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <AlertTriangle size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-600 text-ink-900 truncate">{client?.name ?? 'Cliente'}</p>
                    <p className="text-xs text-ink-500 truncate">
                      {a.product_name} · esperada {a.expected_date ? new Date(a.expected_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—'}
                    </p>
                  </div>
                  <Badge tone="warning">{a.cycle_days}d</Badge>
                </div>
              );
            })}
            {scopedAlerts.filter((a) => a.status === 'activa').length === 0 && (
              <p className="text-sm text-ink-500 py-4 text-center">Sin alertas activas.</p>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle
            title="Seguimientos programados"
            subtitle="Automatización 48h sin respuesta"
            action={<Badge tone="brand">{kpis.pendingFollowups} programados</Badge>}
          />
          <div className="space-y-2.5">
            {scopedFollowups.filter((f) => f.status === 'programado').map((f) => {
              const client = clients.find((c) => c.id === f.client_id);
              const overdue = new Date(f.trigger_at).getTime() < Date.now();
              return (
                <div key={f.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-ink-50 transition">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${overdue ? 'bg-rose-50 text-rose-600' : 'bg-brand-50 text-brand-600'}`}>
                    <Clock size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-600 text-ink-900 truncate">{client?.name ?? 'Cliente'}</p>
                    <p className="text-xs text-ink-500 truncate">{f.message}</p>
                  </div>
                  <Badge tone={overdue ? 'danger' : 'ink'}>
                    {overdue ? 'Vencido' : timeAgo(f.trigger_at)}
                  </Badge>
                </div>
              );
            })}
            {scopedFollowups.filter((f) => f.status === 'programado').length === 0 && (
              <p className="text-sm text-ink-500 py-4 text-center">Sin seguimientos programados.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function BarChart3Icon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <rect x="7" y="11" width="3" height="6" />
      <rect x="12" y="7" width="3" height="10" />
      <rect x="17" y="13" width="3" height="4" />
    </svg>
  );
}
