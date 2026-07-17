import { Menu, Search, Bell, ChevronDown, LogOut, UserCircle } from 'lucide-react';
import { useState } from 'react';
import { useSession } from '../lib/store';
import { Avatar } from './ui';

const TITLES: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard Gerencial', subtitle: 'Visión 360° del desempeño comercial' },
  inbox: { title: 'Bandeja Omnicanal', subtitle: 'WhatsApp · Messenger · Instagram en un solo lugar' },
  clients: { title: 'Clientes y Leads', subtitle: 'Ficha única, embudo y segmentación' },
  quotes: { title: 'Cotizaciones', subtitle: 'Generación, envío y automatización de seguimiento' },
  activities: { title: 'Agenda Compartida', subtitle: 'Llamadas, visitas y reuniones del equipo' },
  field: { title: 'Campo y Rutas', subtitle: 'Check-in GPS y optimización de visitas' },
  reports: { title: 'Inteligencia de Negocio', subtitle: 'KPIs, embudo y análisis para Power BI' },
  admin: { title: 'Auditoría y Roles', subtitle: 'Control de seguridad y registro inmutable' },
};

export function Topbar({
  view,
  onToggleSidebar,
}: {
  view: string;
  onToggleSidebar: () => void;
}) {
  const { user, signOut } = useSession();
  const [openMenu, setOpenMenu] = useState(false);
  const meta = TITLES[view] ?? { title: 'Nexus CRM', subtitle: '' };

  return (
    <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-ink-200">
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 h-16">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg hover:bg-ink-100 text-ink-600 transition shrink-0"
          aria-label="Menú"
        >
          <Menu size={18} />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="font-display font-700 text-ink-900 text-[15px] sm:text-[17px] leading-tight truncate">
            {meta.title}
          </h1>
          <p className="text-xs text-ink-500 truncate hidden sm:block">{meta.subtitle}</p>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-lg bg-ink-50 border border-ink-200 text-sm text-ink-500 w-72">
            <Search size={15} className="text-ink-400" />
            <input
              className="bg-transparent outline-none flex-1 placeholder:text-ink-400 text-ink-700"
              placeholder="Buscar clientes, cotizaciones…"
            />
            <kbd className="text-[10px] font-600 text-ink-400 bg-white border border-ink-200 rounded px-1.5 py-0.5">
              ⌘K
            </kbd>
          </div>

          <button className="relative p-2 rounded-lg hover:bg-ink-100 text-ink-600 transition">
            <Bell size={18} />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
          </button>

          <div className="relative">
            <button
              onClick={() => setOpenMenu((v) => !v)}
              className="flex items-center gap-2 pl-1.5 pr-2 py-1.5 rounded-lg hover:bg-ink-100 transition"
            >
              <Avatar name={user?.name ?? '—'} color={user?.avatar_color} size={30} />
              <div className="hidden sm:block text-left leading-tight">
                <p className="text-sm font-600 text-ink-900">{user?.name ?? '—'}</p>
                <p className="text-[11px] text-ink-500">{user?.role ?? ''}</p>
              </div>
              <ChevronDown size={14} className="text-ink-400" />
            </button>
            {openMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(false)} />
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-pop border border-ink-200 z-20 py-1.5 animate-fade-in">
                  <div className="px-3 py-2 border-b border-ink-100 mb-1">
                    <p className="text-sm font-600 text-ink-900 truncate">{user?.name}</p>
                    <p className="text-[11px] text-ink-500 truncate">{user?.email}</p>
                    <p className="text-[10px] text-ink-400 uppercase tracking-wide mt-1 capitalize">
                      {user?.role}
                    </p>
                  </div>
                  <button
                    onClick={() => setOpenMenu(false)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-ink-50 transition text-left text-sm text-ink-700"
                  >
                    <UserCircle size={16} className="text-ink-400" />
                    Mi perfil
                  </button>
                  <button
                    onClick={() => {
                      setOpenMenu(false);
                      signOut();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-rose-50 transition text-left text-sm text-rose-600"
                  >
                    <LogOut size={16} />
                    Cerrar sesión
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
