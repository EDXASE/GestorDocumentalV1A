import type { ViewKey } from '../components/Sidebar';

export type Role = 'asesor' | 'gerente' | 'admin';

export const isAdmin = (role: Role | undefined | null): boolean => role === 'admin' || role === 'gerente';

export const isVendedor = (role: Role | undefined | null): boolean => role === 'asesor';

export const canAccess = (role: Role | undefined | null, view: ViewKey): boolean => {
  if (!role) return false;
  if (isAdmin(role)) return true;
  // Vendedores: acceso restringido
  switch (view) {
    case 'dashboard':
    case 'inbox':
    case 'clients':
    case 'quotes':
    case 'activities':
    case 'field':
      return true;
    case 'reports':
      return false;
    case 'admin':
      return false;
    default:
      return false;
  }
};

export const VIEWS_FOR_ROLE: Record<Role, ViewKey[]> = {
  admin: ['dashboard', 'inbox', 'clients', 'quotes', 'activities', 'field', 'reports', 'admin'],
  gerente: ['dashboard', 'inbox', 'clients', 'quotes', 'activities', 'field', 'reports', 'admin'],
  asesor: ['dashboard', 'inbox', 'clients', 'quotes', 'activities', 'field'],
};

export const canEditPrices = (role: Role | undefined | null): boolean => isAdmin(role);

export const canSeeGlobalMetrics = (role: Role | undefined | null): boolean => isAdmin(role);

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  asesor: 'Vendedor',
};
