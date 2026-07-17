import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  FileText,
  Send,
  Download,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
  X,
  MessageCircle,
} from 'lucide-react';
import {
  supabase,
  type Quote,
  type QuoteItem,
  type Client,
  type Product,
  type Advisor,
  type QuoteStatus,
} from '../lib/supabase';
import { useSession } from '../lib/store';
import { Avatar, Badge, Card, Drawer, EmptyState, Modal, Spinner } from '../components/ui';
import { cn, formatCurrency, formatDate, formatDateTime, openPrint } from '../lib/utils';
import { logAudit } from '../lib/audit';
import { isVendedor } from '../lib/permissions';

const STATUS_META: Record<QuoteStatus, { label: string; tone: any; icon: any }> = {
  borrador: { label: 'Borrador', tone: 'muted', icon: FileText },
  enviada: { label: 'Enviada', tone: 'brand', icon: Send },
  aceptada: { label: 'Aceptada', tone: 'success', icon: CheckCircle2 },
  rechazada: { label: 'Rechazada', tone: 'danger', icon: XCircle },
  vencida: { label: 'Vencida', tone: 'warning', icon: AlertCircle },
};

const REJECTION_REASONS = [
  'Precio por encima del competidor',
  'Presupuesto no aprobado',
  'No hubo seguimiento',
  'Producto no cumple requisitos',
  'Elegió otra marca',
  'Sin respuesta del cliente',
];

export function Quotes() {
  const { user, advisors } = useSession();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | 'all'>('all');
  const [selected, setSelected] = useState<Quote | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const vendedor = isVendedor(user?.role);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [q, qi, cl, pr] = await Promise.all([
      supabase.from('quotes').select('*').order('created_at', { ascending: false }),
      supabase.from('quote_items').select('*'),
      supabase.from('clients').select('*'),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
    ]);
    setQuotes((q.data as Quote[]) ?? []);
    setItems((qi.data as QuoteItem[]) ?? []);
    setClients((cl.data as Client[]) ?? []);
    setProducts((pr.data as Product[]) ?? []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return quotes.filter((q) => {
      // Vendedores solo ven sus propias cotizaciones
      if (vendedor && user && q.advisor_id !== user.id) return false;
      if (statusFilter !== 'all' && q.status !== statusFilter) return false;
      if (search) {
        const client = clients.find((c) => c.id === q.client_id);
        const s = search.toLowerCase();
        if (!q.quote_number.toLowerCase().includes(s) && !client?.name.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [quotes, statusFilter, search, clients, vendedor, user]);

  async function updateStatus(quote: Quote, status: QuoteStatus, rejectionReason?: string) {
    const patch: Partial<Quote> = { status };
    if (status === 'enviada' && !quote.sent_at) patch.sent_at = new Date().toISOString();
    if (status === 'aceptada' || status === 'rechazada') patch.responded_at = new Date().toISOString();
    if (rejectionReason) patch.rejection_reason = rejectionReason;
    setQuotes((prev) => prev.map((q) => (q.id === quote.id ? { ...q, ...patch } as Quote : q)));
    await supabase.from('quotes').update(patch).eq('id', quote.id);
    await logAudit({
      actor_id: user?.id,
      actor_name: user?.name,
      action: 'update',
      entity: 'quote',
      entity_id: quote.id,
      entity_label: quote.quote_number,
      changes: { status: [quote.status, status], rejection_reason: rejectionReason } as any,
    });
    if (status === 'enviada') {
      // Schedule 48h follow-up trigger
      await supabase.from('followup_triggers').insert({
        quote_id: quote.id,
        client_id: quote.client_id,
        trigger_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        message: `Hola, le doy seguimiento a la cotización ${quote.quote_number}. ¿Tiene alguna duda?`,
        status: 'programado',
      });
    }
    load();
  }

  function exportPdf(quote: Quote) {
    const client = clients.find((c) => c.id === quote.client_id);
    const advisor = advisors.find((a) => a.id === quote.advisor_id);
    const quoteItems = items.filter((i) => i.quote_id === quote.id);
    const html = renderQuoteHtml(quote, client, advisor, quoteItems);
    openPrint(html);
  }

  function sendWhatsApp(quote: Quote) {
    const client = clients.find((c) => c.id === quote.id);
    const phone = (client?.phone ?? '').replace(/[^0-9]/g, '');
    const msg = `Hola ${client?.name ?? ''}, le comparto la cotización ${quote.quote_number} por un total de ${formatCurrency(quote.total)}. Quedo atento a sus comentarios.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    updateStatus(quote, 'enviada');
  }

  if (loading) {
    return <div className="flex justify-center py-24"><Spinner className="h-6 w-6" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ink-50 border border-ink-200 flex-1 min-w-[200px]">
            <Search size={15} className="text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por folio o cliente…"
              className="bg-transparent outline-none flex-1 text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as QuoteStatus | 'all')}
            className="input w-auto"
          >
            <option value="all">Todos los estados</option>
            {(Object.keys(STATUS_META) as QuoteStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_META[s].label}</option>
            ))}
          </select>
          <button onClick={() => setCreateOpen(true)} className="btn-primary ml-auto">
            <Plus size={15} /> Nueva cotización
          </button>
        </div>
      </Card>

      {/* Quotes grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((q) => {
          const client = clients.find((c) => c.id === q.client_id);
          const advisor = advisors.find((a) => a.id === q.advisor_id);
          const quoteItems = items.filter((i) => i.quote_id === q.id);
          const meta = STATUS_META[q.status];
          const Icon = meta.icon;
          return (
            <Card key={q.id} className="p-4 card-hover cursor-pointer" onClick={() => setSelected(q)}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-display font-700 text-ink-900">{q.quote_number}</p>
                  <p className="text-xs text-ink-500">{formatDate(q.created_at)}</p>
                </div>
                <Badge tone={meta.tone}>
                  <Icon size={11} /> {meta.label}
                </Badge>
              </div>
              <div className="flex items-center gap-2.5 mb-3">
                <Avatar name={client?.name ?? '?'} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-600 text-ink-900 truncate">{client?.name ?? '—'}</p>
                  <p className="text-xs text-ink-500 truncate">{client?.company ?? advisor?.name ?? '—'}</p>
                </div>
              </div>
              <div className="border-t border-ink-100 pt-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-ink-400 font-600">{quoteItems.length} artículos</p>
                  <p className="font-display font-800 text-lg text-ink-900">{formatCurrency(q.total)}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); exportPdf(q); }}
                    className="p-2 rounded-lg hover:bg-ink-100 text-ink-500 transition"
                    title="Exportar PDF"
                  >
                    <Download size={15} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); sendWhatsApp(q); }}
                    className="p-2 rounded-lg hover:bg-emerald-50 text-emerald-600 transition"
                    title="Enviar por WhatsApp"
                  >
                    <MessageCircle size={15} />
                  </button>
                </div>
              </div>
              {q.status === 'enviada' && q.sent_at && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-500">
                  <Clock size={11} /> Enviada {formatDateTime(q.sent_at)}
                  {Date.now() - new Date(q.sent_at).getTime() > 48 * 3600 * 1000 && (
                    <Badge tone="warning" className="ml-auto">Sin respuesta 48h</Badge>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <Card>
          <EmptyState
            icon={<FileText size={28} />}
            title="Sin cotizaciones"
            description="Crea tu primera cotización seleccionando productos del catálogo."
            action={<button onClick={() => setCreateOpen(true)} className="btn-primary"><Plus size={15} /> Nueva cotización</button>}
          />
        </Card>
      )}

      {/* Detail drawer */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Cotización"
        width={560}
      >
        {selected && (
          <QuoteDetail
            quote={selected}
            items={items.filter((i) => i.quote_id === selected.id)}
            client={clients.find((c) => c.id === selected.client_id)}
            advisor={advisors.find((a) => a.id === selected.advisor_id)}
            onStatus={(s, reason) => updateStatus(selected, s, reason)}
            onExport={() => exportPdf(selected)}
            onWhatsApp={() => sendWhatsApp(selected)}
          />
        )}
      </Drawer>

      {/* Create modal */}
      <QuoteCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        clients={vendedor && user ? clients.filter((c) => c.advisor_id === user.id) : clients}
        products={products}
        user={user}
        onCreated={() => { setCreateOpen(false); load(); }}
      />
    </div>
  );
}

function QuoteDetail({
  quote,
  items,
  client,
  advisor,
  onStatus,
  onExport,
  onWhatsApp,
}: {
  quote: Quote;
  items: QuoteItem[];
  client?: Client;
  advisor?: Advisor;
  onStatus: (s: QuoteStatus, reason?: string) => void;
  onExport: () => void;
  onWhatsApp: () => void;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState(REJECTION_REASONS[0]);

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display font-800 text-xl text-ink-900">{quote.quote_number}</p>
          <p className="text-sm text-ink-500">Creada {formatDate(quote.created_at)}</p>
        </div>
        <Badge tone={STATUS_META[quote.status].tone} className="text-sm">
          {STATUS_META[quote.status].label}
        </Badge>
      </div>

      <div className="flex items-center gap-3 p-3 rounded-xl bg-ink-50 border border-ink-100">
        <Avatar name={client?.name ?? '?'} size={40} />
        <div className="flex-1 min-w-0">
          <p className="font-600 text-ink-900 truncate">{client?.name ?? '—'}</p>
          <p className="text-xs text-ink-500 truncate">{client?.company ?? '—'} · {advisor?.name ?? 'Sin asesor'}</p>
        </div>
      </div>

      <div>
        <p className="label">Artículos</p>
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-ink-100">
              <div className="h-9 w-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center text-xs font-700">
                {it.quantity}×
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-600 text-ink-900 truncate">{it.product_name}</p>
                <p className="text-xs text-ink-500">
                  {formatCurrency(it.unit_price)}
                  {it.discount > 0 && <span className="text-amber-600"> · -{it.discount}%</span>}
                </p>
              </div>
              <span className="text-sm font-700 tabular-nums">{formatCurrency(it.line_total)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-ink-100 pt-3 space-y-1.5 text-sm">
        <div className="flex justify-between text-ink-600">
          <span>Subtotal</span><span className="tabular-nums">{formatCurrency(quote.subtotal)}</span>
        </div>
        <div className="flex justify-between text-ink-600">
          <span>IVA ({(quote.tax_rate * 100).toFixed(0)}%)</span><span className="tabular-nums">{formatCurrency(quote.tax)}</span>
        </div>
        <div className="flex justify-between font-700 text-ink-900 text-base pt-1">
          <span>Total</span><span className="tabular-nums">{formatCurrency(quote.total)}</span>
        </div>
      </div>

      {quote.rejection_reason && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-100 text-sm text-rose-700">
          <strong className="font-700">Motivo de rechazo:</strong> {quote.rejection_reason}
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onExport} className="btn-outline">
          <Download size={15} /> Exportar PDF
        </button>
        <button onClick={onWhatsApp} className="btn-outline text-emerald-700 border-emerald-200 hover:bg-emerald-50">
          <MessageCircle size={15} /> Enviar WhatsApp
        </button>
        {quote.status === 'borrador' && (
          <button onClick={() => onStatus('enviada')} className="btn-primary col-span-2">
            <Send size={15} /> Marcar como enviada
          </button>
        )}
        {quote.status === 'enviada' && (
          <>
            <button onClick={() => onStatus('aceptada')} className="btn-primary col-span-2 bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 size={15} /> Marcar aceptada
            </button>
            <button onClick={() => setRejectOpen(true)} className="btn-danger col-span-2">
              <XCircle size={15} /> Marcar rechazada
            </button>
          </>
        )}
      </div>

      {rejectOpen && (
        <Modal
          open={rejectOpen}
          onClose={() => setRejectOpen(false)}
          title="Motivo de rechazo"
          footer={
            <>
              <button onClick={() => setRejectOpen(false)} className="btn-ghost">Cancelar</button>
              <button onClick={() => { onStatus('rechazada', reason); setRejectOpen(false); }} className="btn-danger">
                Confirmar rechazo
              </button>
            </>
          }
        >
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REJECTION_REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </Modal>
      )}
    </div>
  );
}

function QuoteCreateModal({
  open,
  onClose,
  clients,
  products,
  user,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  clients: Client[];
  products: Product[];
  user: any;
  onCreated: () => void;
}) {
  const [clientId, setClientId] = useState('');
  const [lineItems, setLineItems] = useState<{ product_id: string; quantity: number; discount: number }[]>([]);
  const [search, setSearch] = useState('');

  const subtotal = useMemo(() => {
    return lineItems.reduce((s, li) => {
      const p = products.find((p) => p.id === li.product_id);
      return s + (p ? p.price * li.quantity * (1 - li.discount / 100) : 0);
    }, 0);
  }, [lineItems, products]);

  const tax = subtotal * 0.16;
  const total = subtotal + tax;

  async function save() {
    if (!clientId || lineItems.length === 0) return;
    const count = await supabase.from('quotes').select('id', { count: 'exact', head: true });
    const num = (count.count ?? 0) + 1;
    const quoteNumber = `COT-2026-${String(num).padStart(4, '0')}`;
    const { data, error } = await supabase
      .from('quotes')
      .insert({
        quote_number: quoteNumber,
        client_id: clientId,
        advisor_id: user?.id,
        status: 'borrador',
        subtotal,
        tax_rate: 0.16,
        tax,
        total,
      })
      .select()
      .single();
    if (error || !data) return;
    const quoteId = data.id;
    const itemRows = lineItems.map((li) => {
      const p = products.find((p) => p.id === li.product_id);
      return {
        quote_id: quoteId,
        product_id: li.product_id,
        product_name: p?.name ?? '',
        quantity: li.quantity,
        unit_price: p?.price ?? 0,
        discount: li.discount,
      };
    });
    await supabase.from('quote_items').insert(itemRows);
    await logAudit({
      actor_id: user?.id,
      actor_name: user?.name,
      action: 'create',
      entity: 'quote',
      entity_id: quoteId,
      entity_label: quoteNumber,
      changes: { total } as any,
    });
    onCreated();
  }

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva cotización"
      size="xl"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button onClick={save} className="btn-primary" disabled={!clientId || lineItems.length === 0}>
            <Sparkles size={15} /> Crear cotización · {formatCurrency(total)}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Cliente *</label>
          <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Selecciona un cliente…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name} · {c.company ?? 'Sin empresa'}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Catálogo de productos</label>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ink-50 border border-ink-200 mb-2">
            <Search size={14} className="text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto por nombre o SKU…"
              className="bg-transparent outline-none flex-1 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto scrollbar-thin">
            {filteredProducts.map((p) => {
              const added = lineItems.some((li) => li.product_id === p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    if (added) {
                      setLineItems(lineItems.filter((li) => li.product_id !== p.id));
                    } else {
                      setLineItems([...lineItems, { product_id: p.id, quantity: 1, discount: 0 }]);
                    }
                  }}
                  className={cn(
                    'text-left p-2.5 rounded-lg border transition',
                    added ? 'border-brand-400 bg-brand-50' : 'border-ink-200 hover:border-ink-300 bg-white'
                  )}
                >
                  <p className="text-sm font-600 text-ink-900 truncate">{p.name}</p>
                  <p className="text-xs text-ink-500">{p.sku} · {formatCurrency(p.price)}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="label">Artículos agregados ({lineItems.length})</label>
          {lineItems.length === 0 ? (
            <p className="text-sm text-ink-400 py-4 text-center bg-ink-50 rounded-lg border border-dashed border-ink-200">
              Selecciona productos del catálogo para agregarlos.
            </p>
          ) : (
            <div className="space-y-2">
              {lineItems.map((li) => {
                const p = products.find((p) => p.id === li.product_id);
                if (!p) return null;
                const lineTotal = p.price * li.quantity * (1 - li.discount / 100);
                return (
                  <div key={li.product_id} className="flex items-center gap-2 p-2.5 rounded-lg border border-ink-200">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-600 text-ink-900 truncate">{p.name}</p>
                      <p className="text-xs text-ink-500">{formatCurrency(p.price)} c/u</p>
                    </div>
                    <input
                      type="number"
                      min={1}
                      value={li.quantity}
                      onChange={(e) => setLineItems(lineItems.map((x) => x.product_id === li.product_id ? { ...x, quantity: Math.max(1, Number(e.target.value)) } : x))}
                      className="input w-16 text-center"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={li.discount}
                      onChange={(e) => setLineItems(lineItems.map((x) => x.product_id === li.product_id ? { ...x, discount: Math.min(100, Math.max(0, Number(e.target.value))) } : x))}
                      className="input w-16 text-center"
                      placeholder="%"
                    />
                    <span className="text-sm font-700 tabular-nums w-24 text-right">{formatCurrency(lineTotal)}</span>
                    <button
                      onClick={() => setLineItems(lineItems.filter((x) => x.product_id !== li.product_id))}
                      className="p-1.5 rounded-md text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-ink-100 pt-3 space-y-1.5 text-sm">
          <div className="flex justify-between text-ink-600"><span>Subtotal</span><span className="tabular-nums">{formatCurrency(subtotal)}</span></div>
          <div className="flex justify-between text-ink-600"><span>IVA 16%</span><span className="tabular-nums">{formatCurrency(tax)}</span></div>
          <div className="flex justify-between font-700 text-ink-900 text-base pt-1"><span>Total</span><span className="tabular-nums">{formatCurrency(total)}</span></div>
        </div>
      </div>
    </Modal>
  );
}

function renderQuoteHtml(quote: Quote, client?: Client, advisor?: Advisor, items: QuoteItem[] = []) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${quote.quote_number}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, sans-serif; color: #1f2430; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e6091; padding-bottom: 20px; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: 800; color: #1e6091; }
    .meta { text-align: right; font-size: 13px; color: #67738a; }
    .meta strong { color: #1f2430; font-size: 18px; display: block; }
    .client { background: #f6f7f9; padding: 16px 20px; border-radius: 12px; margin-bottom: 24px; }
    .client h3 { margin: 0 0 4px; font-size: 16px; }
    .client p { margin: 2px 0; font-size: 13px; color: #67738a; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { text-align: left; font-size: 11px; text-transform: uppercase; color: #67738a; border-bottom: 2px solid #eceef2; padding: 8px; }
    td { padding: 12px 8px; border-bottom: 1px solid #eceef2; font-size: 13px; }
    .right { text-align: right; }
    .totals { margin-left: auto; width: 280px; }
    .totals div { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
    .totals .grand { border-top: 2px solid #1f2430; padding-top: 12px; font-weight: 800; font-size: 18px; color: #1e6091; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eceef2; font-size: 11px; color: #8593a8; text-align: center; }
  </style></head><body>
    <div class="header">
      <div>
        <div class="logo">Nexus CRM</div>
        <p style="font-size:12px;color:#67738a;margin:4px 0 0;">Cotización comercial</p>
      </div>
      <div class="meta">
        <strong>${quote.quote_number}</strong>
        Fecha: ${formatDate(quote.created_at)}<br>
        Asesor: ${advisor?.name ?? '—'}<br>
        Estado: ${STATUS_META[quote.status].label}
      </div>
    </div>
    <div class="client">
      <h3>${client?.name ?? 'Cliente'}</h3>
      <p>${client?.company ?? ''} ${client?.industry ? '· ' + client.industry : ''}</p>
      <p>${client?.email ?? ''} ${client?.phone ? ' · ' + client.phone : ''}</p>
      <p>${client?.city ?? ''}</p>
    </div>
    <table>
      <thead><tr><th>Producto</th><th class="right">Cant.</th><th class="right">P. Unit.</th><th class="right">Desc.</th><th class="right">Total</th></tr></thead>
      <tbody>
        ${items.map((it) => `<tr><td>${it.product_name}</td><td class="right">${it.quantity}</td><td class="right">${formatCurrency(it.unit_price)}</td><td class="right">${it.discount}%</td><td class="right">${formatCurrency(it.line_total)}</td></tr>`).join('')}
      </tbody>
    </table>
    <div class="totals">
      <div><span>Subtotal</span><span>${formatCurrency(quote.subtotal)}</span></div>
      <div><span>IVA ${(quote.tax_rate * 100).toFixed(0)}%</span><span>${formatCurrency(quote.tax)}</span></div>
      <div class="grand"><span>Total</span><span>${formatCurrency(quote.total)}</span></div>
    </div>
    <div class="footer">
      Esta cotización es válida por 30 días. Para cualquier duda, contacte a su asesor comercial.<br>
      Generado por Nexus CRM Omnicanal · ${formatDateTime(new Date())}
    </div>
  </body></html>`;
}
