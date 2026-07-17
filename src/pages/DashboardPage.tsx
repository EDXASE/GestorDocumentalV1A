import {
  FolderOpen,
  Wallet,
  Users,
  Building2,
  Network,
  ScrollText,
  Clock,
  CheckCircle2,
  XCircle,
  Ban,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Link } from '../router/Router';
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from '../types/roles';
import type { RoleName } from '../types/database';

const QUICK_ACTIONS: Record<
  RoleName,
  { label: string; to: string; icon: React.ComponentType<{ className?: string }> }[]
> = {
  ADMINISTRADOR: [
    { label: 'Gestionar Usuarios', to: '/usuarios', icon: Users },
    { label: 'Gestionar Sucursales', to: '/sucursales', icon: Building2 },
    { label: 'Asignaciones', to: '/asignaciones', icon: Network },
    { label: 'Ver Auditoria', to: '/auditoria', icon: ScrollText },
  ],
  CARGADOR: [
    { label: 'Caja General', to: '/caja-general', icon: FolderOpen },
    { label: 'Caja Chica', to: '/caja-chica', icon: Wallet },
  ],
  PROCESADOR: [
    { label: 'Caja General', to: '/caja-general', icon: FolderOpen },
    { label: 'Caja Chica', to: '/caja-chica', icon: Wallet },
  ],
  CONSULTOR: [
    { label: 'Caja General', to: '/caja-general', icon: FolderOpen },
    { label: 'Caja Chica', to: '/caja-chica', icon: Wallet },
  ],
};

const STATE_CARDS = [
  {
    code: 'PENDIENTE',
    label: 'Pendientes',
    icon: Clock,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  {
    code: 'APROBADO',
    label: 'Aprobados',
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
  },
  {
    code: 'RECHAZADO',
    label: 'Rechazados',
    icon: XCircle,
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
  },
  {
    code: 'ANULADO',
    label: 'Anulados',
    icon: Ban,
    color: 'text-slate-600',
    bg: 'bg-slate-100',
    border: 'border-slate-200',
  },
];

export function DashboardPage() {
  const { profile } = useAuth();
  const roleName = profile?.role?.name;

  if (!roleName) return null;

  const actions = QUICK_ACTIONS[roleName];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 text-white shadow-sm">
        <h1 className="text-2xl font-bold">
          Bienvenido, {profile?.full_name}
        </h1>
        <p className="mt-1 text-blue-100">
          Rol: {ROLE_LABELS[roleName]} - {ROLE_DESCRIPTIONS[roleName]}
        </p>
        {profile?.branch && (
          <p className="mt-0.5 text-sm text-blue-200">
            Sucursal: {profile.branch.name}
          </p>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-3">
          Resumen de Documentos
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATE_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.code}
                className={`rounded-xl border ${card.border} ${card.bg} p-5`}
              >
                <div className="flex items-center justify-between">
                  <Icon className={`w-7 h-7 ${card.color}`} />
                  <span className="text-2xl font-bold text-slate-800">0</span>
                </div>
                <p className="mt-2 text-sm font-medium text-slate-600">
                  {card.label}
                </p>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Los contadores se actualizaran cuando se carguen documentos.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-3">
          Accesos Rapidos
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.to}
                to={action.to}
                className="group bg-white rounded-xl border border-slate-200 p-5 hover:border-blue-300 hover:shadow-md transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Icon className="w-5 h-5" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-700 group-hover:text-blue-700">
                  {action.label}
                </p>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-slate-800">
            Estado del Sistema
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-slate-500">Arquitectura</p>
            <p className="font-medium text-slate-700">Base lista</p>
          </div>
          <div>
            <p className="text-slate-500">Base de datos</p>
            <p className="font-medium text-emerald-600">Conectada</p>
          </div>
          <div>
            <p className="text-slate-500">Autenticacion</p>
            <p className="font-medium text-emerald-600">Activa</p>
          </div>
        </div>
      </div>
    </div>
  );
}
