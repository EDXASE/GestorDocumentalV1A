import { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  Users,
  FileText,
  Target,
  Clock,
  Download,
  Database,
  ExternalLink,
  BarChart3,
  PieChart,
  Activity as ActivityIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/store';
import { Card, SectionTitle, Badge, Spinner, StatCard } from '../components/ui';
import { AreaChart, BarList, Donut, Funnel } from '../components/charts';
import { formatCurrency, formatNumber, formatPercent } from '../lib/utils';

const POWERBI_VIEWS = [
  { name: 'v_client_summary', label: 'Ficha de clientes', desc: 'Datos demográficos, canal, asesor, LTV y etapa.', icon: Users },
  { name: 'v_quote_summary', label: 'Cotizaciones', desc: 'Detalle de cotizaciones con cliente, asesor y totales.', icon: FileText },
  { name: 'v_sales_monthly', label: 'Ventas mensuales', desc: 'Agregado mensual de ingresos y tratos cerrados.', icon: TrendingUp },
  { name: 'v_pipeline_funnel', label: 'Embudo de ventas', desc: 'Distribución de clientes por etapa del pipeline.', icon: Target },
  { name: 'v_advisor_performance', label: 'Desempeño de asesores', desc: 'KPIs individuales: clientes, cotizaciones, ingresos.', icon: ActivityIcon },
  { name: 'v_channel_performance', label: 'Canales digitales', desc: 'Volumen de prospectos y conversaciones por canal.', icon: BarChart3 },
  { name: 'v_product_quoted', label: 'Productos cotizados', desc: 'Ranking de productos más cotizados y su valor.', icon: PieChart },
  { name: 'v_rejection_reasons', label: 'Motivos de rechazo', desc: 'Clasificación estadística de negocios perdidos.', icon: Clock },
];

export function Reports() {
  const { advisors } = useSession();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [cl, q, qi, pr, ch, cv, ms] = await Promise.all([
        supabase.from('clients').select('*'),
        supabase.from('quotes').select('*'),
        supabase.from('quote_items').select('*'),
        supabase.from('products').select('*'),
        supabase.from('channels').select('*'),
        supabase.from('conversations').select('*'),
        supabase.from('messages').select('*'),
      ]);
      setClients(cl.data ?? []);
      setQuotes(q.data ?? []);
      setItems(qi.data ?? []);
      setProducts(pr.data ?? []);
      setChannels(ch.data ?? []);
      setConversations(cv.data ?? []);
      setMessages(ms.data ?? []);
      setLoading(false);
    })();
  }, []);

  // KPIs
  const kpis = useMemo(() => {
    const won = quotes.filter((q) => q.status === 'aceptada');
    const lost = quotes.filter((q) => q.status === 'rechazada');
    const revenue = won.reduce((s, q) => s + Number(q.total), 0);
    const lostValue = lost.reduce((s, q) => s + Number(q.total), 0);
    const conversion = won.length + lost.length > 0 ? (won.length / (won.length + lost.length)) * 100 : 0;
    const avgTicket = won.length > 0 ? revenue / won.length : 0;
    const avgCycleDays = 14; // simulated
    return { revenue, lostValue, conversion, avgTicket, avgCycleDays, wonCount: won.length, lostCount: lost.length };
  }, [quotes]);

  // Sales by month
  const salesByMonth = useMemo(() => {
    const months: { label: string; value: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString('es-MX', { month: 'short' });
      const value = quotes
        .filter((q) => {
          if (q.status !== 'aceptada' || !q.responded_at) return false;
          const r = new Date(q.responded_at);
          return r.getFullYear() === d.getFullYear() && r.getMonth() === d.getMonth();
        })
        .reduce((s, q) => s + Number(q.total), 0);
      months.push({ label, value });
    }
    return months;
  }, [quotes]);

  // Pipeline funnel
  const funnel = useMemo(() => {
    const order = ['contacto_inicial', 'cotizacion_enviada', 'negociacion', 'cerrado_ganado'];
    const labels: Record<string, string> = {
      contacto_inicial: 'Contacto Inicial',
      cotizacion_enviada: 'Cotización Enviada',
      negociacion: 'Negociación',
      cerrado_ganado: 'Cerrado / Ganado',
    };
    const colors: Record<string, string> = {
      contacto_inicial: '#3282b8',
      cotizacion_enviada: '#f4a261',
      negociacion: '#2a9d8f',
      cerrado_ganado: '#10b981',
    };
    return order.map((s) => ({
      label: labels[s],
      value: clients.filter((c) => c.stage === s).length,
      color: colors[s],
    }));
  }, [clients]);

  // Top products
  const topProducts = useMemo(() => {
    return products
      .map((p) => {
        const productItems = items.filter((i) => i.product_id === p.id);
        const timesQuoted = new Set(productItems.map((i) => i.quote_id)).size;
        const totalValue = productItems.reduce((s, i) => s + Number(i.line_total), 0);
        return { label: p.name, value: timesQuoted, sub: `${formatCurrency(totalValue)} · ${p.category}`, color: '#1e6091' };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [products, items]);

  // Rejection reasons
  const rejectionData = useMemo(() => {
    const reasons: Record<string, number> = {};
    quotes
      .filter((q) => q.status === 'rechazada' && q.rejection_reason)
      .forEach((q) => {
        reasons[q.rejection_reason] = (reasons[q.rejection_reason] ?? 0) + 1;
      });
    return Object.entries(reasons).map(([label, value]) => ({ label, value }));
  }, [quotes]);

  // Channel performance
  const channelPerf = useMemo(() => {
    return channels.map((ch) => {
      const channelClients = clients.filter((c) => c.channel_id === ch.id);
      const channelConvs = conversations.filter((c) => c.channel_id === ch.id);
      const channelMsgs = messages.filter((m) => channelConvs.some((c) => c.id === m.conversation_id));
      return {
        label: ch.name.split(' ')[0],
        prospects: channelClients.length,
        conversations: channelConvs.length,
        messages: channelMsgs.length,
        color: ch.color ?? '#3282b8',
      };
    });
  }, [channels, clients, conversations, messages]);

  // Advisor performance
  const advisorPerf = useMemo(() => {
    return advisors
      .map((a) => {
        const aQuotes = quotes.filter((q) => q.advisor_id === a.id);
        const won = aQuotes.filter((q) => q.status === 'aceptada');
        const revenue = won.reduce((s, q) => s + Number(q.total), 0);
        const assigned = clients.filter((c) => c.advisor_id === a.id).length;
        return {
          label: a.name,
          revenue,
          won: won.length,
          quotes: aQuotes.length,
          assigned,
          color: a.avatar_color ?? '#1e6091',
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [advisors, quotes, clients]);

  if (loading) {
    return <div className="flex justify-center py-24"><Spinner className="h-6 w-6" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Ingresos cerrados" value={formatCurrency(kpis.revenue)} icon={<TrendingUp size={18} />} tone="success" delta={{ value: `${kpis.wonCount} tratos`, positive: true }} />
        <StatCard label="Tasa de conversión" value={formatPercent(kpis.conversion)} icon={<Target size={18} />} tone="brand" />
        <StatCard label="Ticket promedio" value={formatCurrency(kpis.avgTicket)} icon={<FileText size={18} />} tone="ink" />
        <StatCard label="Valor perdido" value={formatCurrency(kpis.lostValue)} icon={<Clock size={18} />} tone="danger" delta={{ value: `${kpis.lostCount} tratos`, positive: false }} />
      </div>

      {/* Sales trend */}
      <Card className="p-5">
        <SectionTitle
          title="Tendencia de ingresos"
          subtitle="Últimos 12 meses · cotizaciones aceptadas"
          action={<Badge tone="success">+8.4% MoM</Badge>}
        />
        <AreaChart data={salesByMonth} height={260} formatValue={(v) => formatCurrency(v)} color="#10b981" />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline funnel */}
        <Card className="p-5">
          <SectionTitle title="Embudo de conversión" subtitle="Tasa de conversión por etapa" />
          <Funnel stages={funnel} />
          <div className="mt-4 pt-4 border-t border-ink-100 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-ink-500">Leads</p>
              <p className="font-display font-700 text-lg text-ink-900">{clients.length}</p>
            </div>
            <div>
              <p className="text-xs text-ink-500">Cerrados</p>
              <p className="font-display font-700 text-lg text-emerald-600">{kpis.wonCount}</p>
            </div>
            <div>
              <p className="text-xs text-ink-500">Conv. total</p>
              <p className="font-display font-700 text-lg text-brand-700">{formatPercent(kpis.conversion)}</p>
            </div>
          </div>
        </Card>

        {/* Top products */}
        <Card className="p-5">
          <SectionTitle title="Productos más cotizados" subtitle="Ranking por frecuencia" />
          {topProducts.length > 0 ? (
            <BarList data={topProducts} formatValue={(v) => `${v}×`} />
          ) : (
            <p className="text-sm text-ink-500 py-8 text-center">Sin datos.</p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Channels */}
        <Card className="p-5">
          <SectionTitle title="Canales digitales" subtitle="Prospectos por canal" />
          <div className="flex justify-center mb-4">
            <Donut
              data={channelPerf.map((c) => ({ label: c.label, value: c.prospects, color: c.color }))}
              centerLabel="Prospectos"
              centerValue={formatNumber(channelPerf.reduce((s, c) => s + c.prospects, 0))}
            />
          </div>
          <div className="space-y-2">
            {channelPerf.map((c) => (
              <div key={c.label} className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                <span className="font-600 text-ink-700 flex-1">{c.label}</span>
                <span className="text-ink-500 text-xs">{c.prospects} prospectos · {c.messages} msg</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Rejection reasons */}
        <Card className="p-5">
          <SectionTitle title="Motivos de rechazo" subtitle="Análisis de pérdidas" />
          {rejectionData.length > 0 ? (
            <BarList
              data={rejectionData.map((r) => ({ label: r.label, value: r.value, color: '#ef4444' }))}
              formatValue={(v) => `${v}×`}
            />
          ) : (
            <p className="text-sm text-ink-500 py-8 text-center">Sin rechazos registrados.</p>
          )}
        </Card>

        {/* Advisor performance */}
        <Card className="p-5">
          <SectionTitle title="Productividad por asesor" subtitle="Ingresos cerrados" />
          <BarList
            data={advisorPerf.map((a) => ({ label: a.label, value: a.revenue, sub: `${a.won} cerrados · ${a.assigned} clientes`, color: a.color }))}
            formatValue={(v) => formatCurrency(v)}
          />
        </Card>
      </div>

      {/* Power BI integration */}
      <Card className="p-5 border-brand-200 bg-gradient-to-br from-white to-brand-50/40">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-display font-700 text-ink-900 flex items-center gap-2">
              <Database size={18} className="text-brand-600" /> Integración con Power BI
            </h3>
            <p className="text-sm text-ink-500 mt-1 max-w-2xl">
              Vistas SQL precalculadas listas para sincronización directa con Power BI.
              Conecta tu Power BI Desktop vía Postgres connector usando la cadena de conexión de tu proyecto Supabase.
            </p>
          </div>
          <Badge tone="brand"><Database size={11} /> 8 vistas disponibles</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {POWERBI_VIEWS.map((v) => {
            const Icon = v.icon;
            return (
              <div key={v.name} className="p-3 rounded-xl border border-ink-200 bg-white hover:border-brand-300 hover:shadow-soft transition group">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="h-8 w-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center group-hover:bg-brand-600 group-hover:text-white transition">
                    <Icon size={15} />
                  </div>
                  <ExternalLink size={12} className="text-ink-300 ml-auto" />
                </div>
                <p className="font-600 text-sm text-ink-900">{v.label}</p>
                <p className="text-[11px] text-ink-500 mt-0.5 leading-snug">{v.desc}</p>
                <code className="text-[10px] text-brand-700 font-mono bg-brand-50 px-1.5 py-0.5 rounded mt-2 inline-block">{v.name}</code>
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-4 border-t border-ink-100 flex flex-wrap items-center gap-2">
          <button className="btn-outline text-xs">
            <Download size={13} /> Exportar catálogo de vistas (JSON)
          </button>
          <span className="text-xs text-ink-500">
            Modelo en estrella · 4 dimensiones · 9 tablas de hechos · RLS habilitado
          </span>
        </div>
      </Card>
    </div>
  );
}
