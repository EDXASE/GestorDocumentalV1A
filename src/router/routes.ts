import type { ComponentType } from 'react';
import type { RoleName } from '../types/database';

export interface RouteConfig {
  path: string;
  label: string;
  component: () => Promise<{ [key: string]: ComponentType }>;
  allowedRoles?: RoleName[];
  showInMenu?: boolean;
  icon?: string;
  group?: string;
}

export const ROUTES: RouteConfig[] = [
  {
    path: '/dashboard',
    label: 'Panel Principal',
    component: () => import('../pages/DashboardPage'),
    showInMenu: true,
    icon: 'LayoutDashboard',
    group: 'general',
  },
  {
    path: '/caja-general',
    label: 'Caja General',
    component: () => import('../pages/CajaGeneralPage'),
    allowedRoles: ['ADMINISTRADOR', 'CARGADOR', 'PROCESADOR', 'CONSULTOR'],
    showInMenu: true,
    icon: 'FolderOpen',
    group: 'documentos',
  },
  {
    path: '/caja-chica',
    label: 'Caja Chica',
    component: () => import('../pages/CajaChicaPage'),
    allowedRoles: ['ADMINISTRADOR', 'CARGADOR', 'PROCESADOR', 'CONSULTOR'],
    showInMenu: true,
    icon: 'Wallet',
    group: 'documentos',
  },
  {
    path: '/facturas',
    label: 'Facturas',
    component: () => import('../pages/FacturasPage'),
    allowedRoles: ['ADMINISTRADOR', 'CARGADOR'],
    showInMenu: true,
    icon: 'FileText',
    group: 'documentos',
  },
  {
    path: '/mis-documentos',
    label: 'Mis Documentos',
    component: () => import('../pages/MisDocumentosPage'),
    allowedRoles: ['CARGADOR'],
    showInMenu: true,
    icon: 'ClipboardList',
    group: 'documentos',
  },
  {
    path: '/procesamiento',
    label: 'Procesamiento',
    component: () => import('../pages/ProcesadorPage'),
    allowedRoles: ['PROCESADOR'],
    showInMenu: true,
    icon: 'ScanLine',
    group: 'documentos',
  },
  {
    path: '/seguimiento',
    label: 'Seguimiento Documental',
    component: () => import('../pages/SeguimientoPage'),
    allowedRoles: ['CONSULTOR', 'ADMINISTRADOR'],
    showInMenu: true,
    icon: 'BookOpen',
    group: 'documentos',
  },
  {
    path: '/documentos/:id',
    label: 'Detalle de Documento',
    component: () => import('../pages/DocumentDetailPage'),
    showInMenu: false,
  },
  {
    path: '/usuarios',
    label: 'Usuarios',
    component: () => import('../pages/UsersPage'),
    allowedRoles: ['ADMINISTRADOR'],
    showInMenu: true,
    icon: 'Users',
    group: 'administracion',
  },
  {
    path: '/sucursales',
    label: 'Sucursales',
    component: () => import('../pages/BranchesPage'),
    allowedRoles: ['ADMINISTRADOR'],
    showInMenu: true,
    icon: 'Building2',
    group: 'administracion',
  },
  {
    path: '/asignaciones',
    label: 'Asignaciones',
    component: () => import('../pages/AssignmentsPage'),
    allowedRoles: ['ADMINISTRADOR'],
    showInMenu: true,
    icon: 'Network',
    group: 'administracion',
  },
  {
    path: '/auditoria',
    label: 'Auditoria',
    component: () => import('../pages/AuditPage'),
    allowedRoles: ['ADMINISTRADOR'],
    showInMenu: true,
    icon: 'ScrollText',
    group: 'administracion',
  },
  {
    path: '/descargas',
    label: 'Descargas Masivas',
    component: () => import('../pages/DescargasPage'),
    allowedRoles: ['ADMINISTRADOR'],
    showInMenu: true,
    icon: 'FolderArchive',
    group: 'administracion',
  },
];

export const MENU_GROUPS: { key: string; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'documentos', label: 'Documentos' },
  { key: 'administracion', label: 'Administracion' },
];
