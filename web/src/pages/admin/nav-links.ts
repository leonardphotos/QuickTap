import { ChefHat, Grid2x2, QrCode, Settings, UtensilsCrossed } from 'lucide-react';
import { RESTRICTED_ROLES, isScreenRole } from '../../utils/roles';
import type { UserRole } from '../../types';

export interface AdminNavLink {
  to: string;
  label: string;
  icon: typeof ChefHat;
}

// Todas las pestañas del panel. Mesero/Cocina solo ven las dos primeras.
export const ADMIN_NAV_LINKS: AdminNavLink[] = [
  { to: '/admin/kitchen', label: 'Cocina', icon: ChefHat },
  { to: '/admin/table-orders', label: 'Órdenes de Mesa', icon: Grid2x2 },
  { to: '/admin/products', label: 'Productos', icon: UtensilsCrossed },
  { to: '/admin/tables', label: 'Mesas / QR', icon: QrCode },
  { to: '/admin/settings', label: 'Ajustes', icon: Settings },
];

const RESTRICTED_VISIBLE = new Set(['/admin/kitchen', '/admin/table-orders']);

export function visibleNavLinks(role: UserRole | null | undefined): AdminNavLink[] {
  if (isScreenRole(role)) return [];
  if (role && RESTRICTED_ROLES.includes(role)) {
    return ADMIN_NAV_LINKS.filter((l) => RESTRICTED_VISIBLE.has(l.to));
  }
  return ADMIN_NAV_LINKS;
}

// Secciones para la cuadrícula del Dashboard (todo menos Ajustes, que vive
// arriba en el icono de configuración).
export function dashboardSectionLinks(role: UserRole | null | undefined): AdminNavLink[] {
  return visibleNavLinks(role).filter((l) => l.to !== '/admin/settings');
}
