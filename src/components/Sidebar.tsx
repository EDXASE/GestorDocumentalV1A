import {
  LayoutDashboard,
  MessagesSquare,
  Users,
  FileText,
  CalendarDays,
  MapPin,
  BarChart3,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useSession } from '../lib/store';
import { canAccess, ROLE_LABEL, type Role } from '../lib/permissions';

export type ViewKey =
  | 'dashboard'
  | 'inbox'
  | 'clients'
  | 'quotes'
  | 'activities'
  | 'field'
  | 'reports'
  | 'admin';

const NAV: { key: ViewKey; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Operación' },
  { key: 'inbox', label: 'Bandeja Omnicanal', icon: MessagesSquare, group: 'Operación' },
  { key: 'clients', label: 'Clientes y Leads', icon: Users, group: 'Operación' },
  { key: 'quotes', label: 'Cotizaciones', icon: FileText, group: 'Ventas' },
  { key: 'activities', label: 'Agenda', icon: CalendarDays, group: 'Ventas' },
  { key: 'field', label: 'Campo y Rutas', icon: MapPin, group: 'Ventas' },
  { key: 'reports', label: 'Inteligencia', icon: BarChart3, group: 'Dirección' },
  { key: 'admin', label: 'Auditoría y Roles', icon: ShieldCheck, group: 'Dirección' },
];

function SidebarContent({
  current,
  onNavigate,
  collapsed,
  user,
  role,
}: {
  current: ViewKey;
  onNavigate: (v: ViewKey) => void;
  collapsed: boolean;
  user: { name: string; avatar_color: string } | null;
  role: Role | undefined;
}) {
  const groups = Array.from(new Set(NAV.map((n) => n.group)));
  const visibleNav = NAV.filter((n) => canAccess(role, n.key));

  return (
    <>
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-4 px-2.5">
        {groups.map((group) => {
          const items = visibleNav.filter((n) => n.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="mb-5">
              {!collapsed && (
                <p className="px-2.5 mb-1.5 text-[10px] font-700 uppercase tracking-widest text-ink-500">
                  {group}
                </p>
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = current === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => onNavigate(item.key)}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-500 transition-all duration-150 group relative',
                        active
                          ? 'bg-brand-600 text-white shadow-sm'
                          : 'text-ink-300 hover:bg-ink-900 hover:text-white',
                        collapsed && 'justify-center'
                      )}
                    >
                      <Icon size={18} className="shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {active && !collapsed && (
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/80" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="px-2.5 py-3 border-t border-ink-900/80">
        <div className={cn('flex items-center gap-2.5 px-2 py-2 rounded-lg', !collapsed && 'bg-ink-900/60')}>
          <div
            className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-700 shrink-0"
            style={{ backgroundColor: user?.avatar_color ?? '#1e6091' }}
          >
            {user ? user.name.split(' ').slice(0, 2).map((p) => p[0]).join('') : '··'}
          </div>
          {!collapsed && (
            <div className="leading-tight min-w-0">
              <p className="text-sm font-600 text-white truncate">{user?.name ?? 'Cargando…'}</p>
              <p className="text-[11px] text-ink-400">{role ? ROLE_LABEL[role] : ''}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function Sidebar({
  current,
  onNavigate,
  collapsed,
  mobileOpen,
  onCloseMobile,
}: {
  current: ViewKey;
  onNavigate: (v: ViewKey) => void;
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const { user } = useSession();
  const role = user?.role as Role | undefined;

  const handleNavigate = (v: ViewKey) => {
    onNavigate(v);
    onCloseMobile();
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden lg:flex h-screen sticky top-0 bg-ink-950 text-ink-100 flex-col transition-all duration-300 border-r border-ink-900',
          collapsed ? 'w-[68px]' : 'w-[244px]'
        )}
      >
        <div className="flex items-center gap-2.5 px-4 h-16 border-b border-ink-900/80">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 flex items-center justify-center shadow-lg shrink-0">
            <Sparkles size={18} className="text-white" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <p className="font-display font-800 text-white text-[15px] tracking-tight">Nexus CRM</p>
              <p className="text-[10px] text-ink-400 uppercase tracking-widest">Omnicanal · BI</p>
            </div>
          )}
        </div>
        <SidebarContent current={current} onNavigate={handleNavigate} collapsed={collapsed} user={user} role={role} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex animate-fade-in">
          <div className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm" onClick={onCloseMobile} />
          <aside className="relative w-[260px] max-w-[80vw] h-full bg-ink-950 text-ink-100 flex flex-col border-r border-ink-900 animate-slide-in">
            <div className="flex items-center justify-between gap-2.5 px-4 h-16 border-b border-ink-900/80">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 flex items-center justify-center shadow-lg shrink-0">
                  <Sparkles size={18} className="text-white" />
                </div>
                <div className="leading-tight">
                  <p className="font-display font-800 text-white text-[15px] tracking-tight">Nexus CRM</p>
                  <p className="text-[10px] text-ink-400 uppercase tracking-widest">Omnicanal · BI</p>
                </div>
              </div>
              <button
                onClick={onCloseMobile}
                className="p-2 rounded-lg text-ink-300 hover:bg-ink-900 hover:text-white transition"
                aria-label="Cerrar menú"
              >
                <X size={18} />
              </button>
            </div>
            <SidebarContent current={current} onNavigate={handleNavigate} collapsed={false} user={user} role={role} />
          </aside>
        </div>
      )}
    </>
  );
}
