import { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  Search,
  Plus,
  PlusCircle,
  MinusCircle,
  Edit3,
  Lock,
  Users,
  ScrollText,
  Shield,
  Webhook,
  MessageCircle,
  KeyRound,
  CheckCircle2,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { supabase, type AuditLog, type Advisor } from '../lib/supabase';
import { useSession } from '../lib/store';
import { Avatar, Badge, Card, EmptyState, Modal, Spinner } from '../components/ui';
import { cn, formatDateTime } from '../lib/utils';

const ACTION_META: Record<string, { tone: any; icon: any; label: string }> = {
  create: { tone: 'success', icon: PlusCircle, label: 'Creación' },
  update: { tone: 'brand', icon: Edit3, label: 'Modificación' },
  delete: { tone: 'danger', icon: MinusCircle, label: 'Eliminación' },
};

const ENTITY_LABELS: Record<string, string> = {
  client: 'Cliente',
  quote: 'Cotización',
  message: 'Mensaje',
  conversation: 'Conversación',
  activity: 'Actividad',
  checkin: 'Check-in',
  advisor: 'Asesor',
};

const PERMISSIONS = [
  { module: 'Clientes', asesor: 'Solo los suyos', gerente: 'Todo el equipo', admin: 'Todo' },
  { module: 'Cotizaciones', asesor: 'Propias', gerente: 'Todo el equipo', admin: 'Todo' },
  { module: 'Bandeja', asesor: 'Chats asignados', gerente: 'Toda la bandeja', admin: 'Todo' },
  { module: 'Reportes', asesor: 'Individuales', gerente: 'Completos', admin: 'Todo' },
  { module: 'Auditoría', asesor: 'Sin acceso', gerente: 'Lectura', admin: 'Lectura/Escritura' },
  { module: 'Configuración', asesor: 'Sin acceso', gerente: 'Limitada', admin: 'Completa' },
];

export function Admin() {
  const { user, advisors, refresh } = useSession();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [createAdvisorOpen, setCreateAdvisorOpen] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setLogs((data as AuditLog[]) ?? []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (actionFilter !== 'all' && l.action !== actionFilter) return false;
      if (entityFilter !== 'all' && l.entity !== entityFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!l.actor_name?.toLowerCase().includes(s) && !l.entity_label?.toLowerCase().includes(s) && !l.entity.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [logs, actionFilter, entityFilter, search]);

  async function createAdvisor(data: { name: string; email: string; phone: string; role: Advisor['role'] }) {
    const { error } = await supabase.from('advisors').insert({
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: data.role,
      avatar_color: ['#1e6091', '#2a9d8f', '#e76f51', '#6a4c93', '#f4a261'][Math.floor(Math.random() * 5)],
    });
    if (!error) {
      await supabase.from('audit_logs').insert({
        actor_id: user?.id,
        actor_name: user?.name,
        action: 'create',
        entity: 'advisor',
        entity_label: data.name,
      });
      setCreateAdvisorOpen(false);
      refresh();
    }
  }

  if (loading) {
    return <div className="flex justify-center py-24"><Spinner className="h-6 w-6" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Role overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        <Card className="p-5 border-l-4 border-l-brand-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
              <Users size={18} />
            </div>
            <div>
              <p className="font-display font-700 text-ink-900">Asesor comercial</p>
              <p className="text-xs text-ink-500">Acceso limitado a sus propios datos</p>
            </div>
          </div>
          <p className="text-sm text-ink-600">
            Ve solo sus clientes, chats asignados y cotizaciones propias. Reportes individuales.
          </p>
          <Badge tone="brand" className="mt-3">{advisors.filter((a) => a.role === 'asesor').length} usuarios</Badge>
        </Card>
        <Card className="p-5 border-l-4 border-l-emerald-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck size={18} />
            </div>
            <div>
              <p className="font-display font-700 text-ink-900">Gerente</p>
              <p className="text-xs text-ink-500">Acceso a todo el equipo</p>
            </div>
          </div>
          <p className="text-sm text-ink-600">
            Acceso total a clientes, cotizaciones y bandeja del equipo. Reportes completos y auditoría de lectura.
          </p>
          <Badge tone="success" className="mt-3">{advisors.filter((a) => a.role === 'gerente').length} usuarios</Badge>
        </Card>
        <Card className="p-5 border-l-4 border-l-ink-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-ink-100 text-ink-700 flex items-center justify-center">
              <Lock size={18} />
            </div>
            <div>
              <p className="font-display font-700 text-ink-900">Administrador</p>
              <p className="text-xs text-ink-500">Control total del sistema</p>
            </div>
          </div>
          <p className="text-sm text-ink-600">
            Configuración completa, gestión de usuarios, auditoría con escritura y acceso a toda la información.
          </p>
          <Badge tone="ink" className="mt-3">{advisors.filter((a) => a.role === 'admin').length} usuarios</Badge>
        </Card>
      </div>

      {/* Permissions matrix */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-700 text-ink-900 flex items-center gap-2">
              <Shield size={16} className="text-brand-600" /> Matriz de permisos por rol
            </h3>
            <p className="text-xs text-ink-500 mt-0.5">Seguridad por roles aplicada en capa de presentación y base de datos.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2.5 font-600">Módulo</th>
                <th className="text-left px-3 py-2.5 font-600">Asesor</th>
                <th className="text-left px-3 py-2.5 font-600">Gerente</th>
                <th className="text-left px-3 py-2.5 font-600">Admin</th>
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p.module} className="border-t border-ink-100">
                  <td className="px-3 py-2.5 font-600 text-ink-900">{p.module}</td>
                  <td className="px-3 py-2.5 text-ink-600">{p.asesor}</td>
                  <td className="px-3 py-2.5 text-ink-600">{p.gerente}</td>
                  <td className="px-3 py-2.5 text-ink-900 font-600">{p.admin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Meta API integration */}
      <MetaIntegrationCard />

      {/* Advisors management */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-700 text-ink-900 flex items-center gap-2">
              <Users size={16} className="text-brand-600" /> Usuarios del sistema
            </h3>
            <p className="text-xs text-ink-500 mt-0.5">{advisors.length} asesores activos</p>
          </div>
          <button onClick={() => setCreateAdvisorOpen(true)} className="btn-primary text-xs">
            <Plus size={13} /> Nuevo asesor
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {advisors.map((a) => (
            <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border border-ink-200 hover:border-ink-300 transition">
              <Avatar name={a.name} color={a.avatar_color ?? '#1e6091'} size={40} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-600 text-ink-900 truncate">{a.name}</p>
                <p className="text-xs text-ink-500 truncate">{a.email}</p>
              </div>
              <Badge tone={a.role === 'admin' ? 'ink' : a.role === 'gerente' ? 'success' : 'brand'} className="capitalize">
                {a.role}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* Audit logs */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="font-display font-700 text-ink-900 flex items-center gap-2">
              <ScrollText size={16} className="text-brand-600" /> Registro de auditoría
            </h3>
            <p className="text-xs text-ink-500 mt-0.5">Historial inmutable de cambios · {logs.length} eventos</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-ink-50 border border-ink-200">
              <Search size={13} className="text-ink-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar…"
                className="bg-transparent outline-none text-sm w-40"
              />
            </div>
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="input w-auto text-xs py-1.5">
              <option value="all">Todas las acciones</option>
              <option value="create">Creación</option>
              <option value="update">Modificación</option>
              <option value="delete">Eliminación</option>
            </select>
            <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className="input w-auto text-xs py-1.5">
              <option value="all">Todas las entidades</option>
              {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-1.5 max-h-[480px] overflow-y-auto scrollbar-thin">
          {filtered.length === 0 ? (
            <EmptyState icon={<ScrollText size={24} />} title="Sin eventos" description="No hay eventos que coincidan con los filtros." />
          ) : (
            filtered.map((l) => {
              const meta = ACTION_META[l.action];
              const Icon = meta.icon;
              return (
                <div key={l.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-ink-50 transition border border-transparent hover:border-ink-100">
                  <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
                    l.action === 'create' ? 'bg-emerald-50 text-emerald-600' :
                    l.action === 'update' ? 'bg-brand-50 text-brand-600' :
                    'bg-rose-50 text-rose-600'
                  )}>
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-600 text-ink-900">{l.actor_name ?? 'Sistema'}</span>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="text-xs text-ink-500">{ENTITY_LABELS[l.entity] ?? l.entity}</span>
                      {l.entity_label && <span className="text-sm text-ink-700 truncate">· {l.entity_label}</span>}
                    </div>
                    {l.changes && (
                      <pre className="text-[11px] text-ink-500 mt-1 bg-ink-50 rounded p-1.5 overflow-x-auto font-mono">
                        {JSON.stringify(l.changes).slice(0, 200)}
                      </pre>
                    )}
                  </div>
                  <span className="text-xs text-ink-400 shrink-0">{formatDateTime(l.created_at)}</span>
                </div>
              );
            })
          )}
        </div>
      </Card>

      <AdvisorCreateModal
        open={createAdvisorOpen}
        onClose={() => setCreateAdvisorOpen(false)}
        onCreate={createAdvisor}
      />
    </div>
  );
}

function MetaIntegrationCard() {
  const [copied, setCopied] = useState<string | null>(null);
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-webhook`;

  const tokens = [
    { key: 'META_WHATSAPP_TOKEN', label: 'WhatsApp Cloud API Token', desc: 'Access token de Meta para enviar mensajes por WhatsApp Business Cloud API.' },
    { key: 'META_FACEBOOK_PAGE_TOKEN', label: 'Facebook Page Access Token', desc: 'Token de acceso de la página de Facebook para Messenger.' },
    { key: 'META_WEBHOOK_VERIFY_TOKEN', label: 'Webhook Verify Token', desc: 'Token personalizado para verificar la suscripción del webhook en Meta.' },
  ];

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <Card className="p-5 border-brand-200 bg-gradient-to-br from-white to-brand-50/40">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="font-display font-700 text-ink-900 flex items-center gap-2">
            <Webhook size={18} className="text-brand-600" /> Integración con APIs de Meta
          </h3>
          <p className="text-sm text-ink-500 mt-1 max-w-2xl">
            Configuración técnica para recibir mensajes entrantes de WhatsApp y Facebook Messenger
            vía webhook, y enviar respuestas a través de las APIs oficiales de Meta.
          </p>
        </div>
        <Badge tone="brand"><MessageCircle size={11} /> WhatsApp + Messenger</Badge>
      </div>

      {/* Webhook URL */}
      <div className="mb-5">
        <p className="label flex items-center gap-1.5"><Webhook size={12} /> URL del Webhook (Endpoint de entrada)</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2.5 rounded-lg bg-ink-950 text-brand-300 text-xs font-mono break-all border border-ink-800">
            {webhookUrl}
          </code>
          <button
            onClick={() => copy(webhookUrl, 'webhook')}
            className="btn-outline shrink-0"
            title="Copiar URL"
          >
            {copied === 'webhook' ? <CheckCircle2 size={15} className="text-emerald-600" /> : <Copy size={15} />}
          </button>
        </div>
        <p className="text-xs text-ink-500 mt-2 leading-relaxed">
          Registra esta URL en Meta for Developers. En WhatsApp: Configuración {'>'} Webhook.
          En Facebook: Productos {'>'} Webhooks. Usa <code className="text-brand-700 font-mono bg-brand-50 px-1 rounded">META_WEBHOOK_VERIFY_TOKEN</code> como verify token.
        </p>
      </div>

      {/* API Tokens */}
      <div className="mb-4">
        <p className="label flex items-center gap-1.5"><KeyRound size={12} /> Access Tokens de Meta</p>
        <div className="space-y-2.5">
          {tokens.map((t) => (
            <div key={t.key} className="flex items-start gap-3 p-3 rounded-xl border border-ink-200 bg-white">
              <div className="h-9 w-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                <KeyRound size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-600 text-ink-900">{t.label}</p>
                  <code className="text-[10px] text-brand-700 font-mono bg-brand-50 px-1.5 py-0.5 rounded">{t.key}</code>
                </div>
                <p className="text-xs text-ink-500 mt-0.5 leading-snug">{t.desc}</p>
              </div>
              <a
                href="https://supabase.com/dashboard/project/cwaoiezbpinauohbtmsv/settings/functions/Secrets"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline text-xs shrink-0"
              >
                Configurar <ExternalLink size={12} />
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Setup steps */}
      <div className="pt-4 border-t border-ink-100">
        <p className="text-xs font-700 uppercase tracking-wide text-ink-400 mb-2">Pasos de configuración</p>
        <ol className="space-y-1.5 text-sm text-ink-600">
          <li className="flex gap-2"><span className="font-700 text-brand-600">1.</span> Configura los 3 tokens como secrets en Supabase Edge Functions.</li>
          <li className="flex gap-2"><span className="font-700 text-brand-600">2.</span> Registra la URL del webhook en Meta for Developers con el verify token.</li>
          <li className="flex gap-2"><span className="font-700 text-brand-600">3.</span> Suscríbete a los eventos <code className="text-brand-700 font-mono bg-brand-50 px-1 rounded">messages</code> (WhatsApp) y <code className="text-brand-700 font-mono bg-brand-50 px-1 rounded">messages</code> (Messenger).</li>
          <li className="flex gap-2"><span className="font-700 text-brand-600">4.</span> Los mensajes entrantes crearán clientes y conversaciones automáticamente.</li>
        </ol>
      </div>
    </Card>
  );
}

function AdvisorCreateModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; email: string; phone: string; role: Advisor['role'] }) => void;
}) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'asesor' as Advisor['role'] });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo asesor"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button onClick={() => onCreate(form)} className="btn-primary" disabled={!form.name || !form.email}>
            Crear asesor
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">Nombre *</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Email *</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label">Teléfono</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">Rol</label>
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Advisor['role'] })}>
            <option value="asesor">Asesor comercial</option>
            <option value="gerente">Gerente</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}
