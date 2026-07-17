import type { RoleName } from './database';

export const ROLES: Record<RoleName, RoleName> = {
  ADMINISTRADOR: 'ADMINISTRADOR',
  CARGADOR: 'CARGADOR',
  PROCESADOR: 'PROCESADOR',
  CONSULTOR: 'CONSULTOR',
};

export const ROLE_LABELS: Record<RoleName, string> = {
  ADMINISTRADOR: 'Administrador',
  CARGADOR: 'Cargador',
  PROCESADOR: 'Procesador',
  CONSULTOR: 'Consultor',
};

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  ADMINISTRADOR:
    'Acceso total: usuarios, sucursales, asignaciones, configuracion y auditoria',
  CARGADOR: 'Carga documentos de Caja General y Caja Chica, sube PDFs',
  PROCESADOR:
    'Procesa y revisa documentos asignados a sus sucursales, cambia estados',
  CONSULTOR: 'Consulta documentos y reportes, sin permisos de modificacion',
};

export const ALL_ROLES = Object.keys(ROLES) as RoleName[];

export function hasRole(
  userRole: RoleName | undefined,
  ...allowed: RoleName[]
): boolean {
  if (!userRole) return false;
  return allowed.includes(userRole);
}

export function isAdmin(role: RoleName | undefined): boolean {
  return role === 'ADMINISTRADOR';
}

export function isCargador(role: RoleName | undefined): boolean {
  return role === 'CARGADOR';
}

export function isProcesador(role: RoleName | undefined): boolean {
  return role === 'PROCESADOR';
}

export function isConsultor(role: RoleName | undefined): boolean {
  return role === 'CONSULTOR';
}
