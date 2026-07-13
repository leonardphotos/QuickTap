import type { UserRole } from '../types';

/**
 * Espejo manual de la matriz de permisos del backend (src/utils/roles.ts).
 * Debe mantenerse sincronizado con esa fuente de verdad.
 */
export const FULL_ACCESS_ROLES: UserRole[] = ['OWNER', 'ADMIN', 'CASHIER', 'STAFF'];
export const RESTRICTED_ROLES: UserRole[] = ['WAITER', 'KITCHEN'];
// Pantalla: un único monitor/TV con Mesas + Cocina en formato horizontal.
export const SCREEN_ROLES: UserRole[] = ['SCREEN'];
export const TEAM_MANAGER_ROLES: UserRole[] = ['OWNER', 'ADMIN'];
export const ASSIGNABLE_TEAM_ROLES: UserRole[] = ['ADMIN', 'CASHIER', 'WAITER', 'KITCHEN', 'SCREEN'];

export const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Dueño',
  STAFF: 'Personal',
  ADMIN: 'Administrador',
  CASHIER: 'Cajero',
  WAITER: 'Mesero',
  KITCHEN: 'Cocina',
  SCREEN: 'Pantalla',
};

// Rutas visibles según el rol. "*" habilita todas las rutas del admin.
const RESTRICTED_PATHS = ['/admin/kitchen', '/admin/table-orders'];
const SCREEN_PATH = '/admin/screen';

export function hasFullAccess(role?: UserRole | null): boolean {
  if (!role) return false;
  return FULL_ACCESS_ROLES.includes(role);
}

export function isScreenRole(role?: UserRole | null): boolean {
  if (!role) return false;
  return SCREEN_ROLES.includes(role);
}

export function canManageTeam(role?: UserRole | null): boolean {
  if (!role) return false;
  return TEAM_MANAGER_ROLES.includes(role);
}

export function canAccessPath(role: UserRole | null | undefined, pathname: string): boolean {
  if (hasFullAccess(role)) return true;
  if (isScreenRole(role)) return pathname.startsWith(SCREEN_PATH);
  return RESTRICTED_PATHS.some((p) => pathname.startsWith(p));
}

/** Ruta de aterrizaje por defecto según el rol (a dónde redirigir tras login). */
export function defaultPathFor(role?: UserRole | null): string {
  if (isScreenRole(role)) return SCREEN_PATH;
  return '/admin/kitchen';
}
