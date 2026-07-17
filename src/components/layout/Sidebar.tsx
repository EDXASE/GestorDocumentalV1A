import {
  LayoutDashboard,
  FolderOpen,
  Wallet,
  ClipboardList,
  ScanLine,
  BookOpen,
  Users,
  Building2,
  Network,
  ScrollText,
  FolderArchive,
  FileText,
  X,
  ChevronRight,
} from 'lucide-react';
import { Link, useRouter } from '../../router/Router';
import { ROUTES, MENU_GROUPS } from '../../router/routes';
import { useAuth } from '../../context/AuthContext';
import { ROLE_LABELS } from '../../types/roles';
import type { RoleName } from '../../types/database';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  FolderOpen,
  Wallet,
  ClipboardList,
  ScanLine,
  BookOpen,
  Users,
  Building2,
  Network,
  ScrollText,
  FolderArchive,
  FileText,
};

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { path } = useRouter();
  const { profile, assignedBranches } = useAuth();
  const userRole = profile?.role?.name as RoleName | undefined;

  const menuRoutes = ROUTES.filter((r) => {
    if (!r.showInMenu) return false;
    if (r.allowedRoles && userRole) {
      if (!r.allowedRoles.includes(userRole)) return false;
    }
    // For PROCESADOR: hide sections they don't have access to in any branch
    if (userRole === 'PROCESADOR' && assignedBranches !== null) {
      if (r.path === '/caja-general' && !assignedBranches.some((b) => b.can_caja_general)) return false;
      if (r.path === '/caja-chica' && !assignedBranches.some((b) => b.can_caja_chica)) return false;
    }
    return true;
  });

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-30 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-tight">
                GESTOR
              </p>
              <p className="text-xs text-slate-400 leading-tight">
                DOCUMENTAL
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
          {MENU_GROUPS.map((group) => {
            const groupRoutes = menuRoutes.filter((r) => r.group === group.key);
            if (groupRoutes.length === 0) return null;
            return (
              <div key={group.key}>
                <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {groupRoutes.map((route) => {
                    const Icon = route.icon ? ICONS[route.icon] : ChevronRight;
                    const isActive =
                      path === route.path || path.startsWith(`${route.path}/`);
                    return (
                      <Link
                        key={route.path}
                        to={route.path}
                        onClick={onClose}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActive
                            ? 'bg-blue-600 text-white font-medium'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <Icon className="w-4.5 h-4.5 flex-shrink-0" />
                        <span>{route.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800">
          <div className="px-3 py-2 rounded-lg bg-slate-800/50">
            <p className="text-xs text-slate-400">Rol actual</p>
            <p className="text-sm font-medium text-white">
              {userRole ? ROLE_LABELS[userRole] : 'Sin rol'}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
