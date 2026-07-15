import { Bike, Boxes, ChefHat, CircleDollarSign, Grid2x2, QrCode, Settings, UtensilsCrossed } from 'lucide-react';
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
  { to: '/admin/delivery', label: 'Delivery', icon: Bike },
  { to: '/admin/products', label: 'Productos', icon: UtensilsCrossed },
  { to: '/admin/tables', label: 'Mesas / QR', icon: QrCode },
  { to: '/admin/settings', label: 'Ajustes', icon: Settings },
];

// Solo visibles con plan Premium.
export const PREMIUM_NAV_LINKS: AdminNavLink[] = [
  { to: '/admin/administration', label: 'Administración', icon: CircleDollarSign },
  { to: '/admin/inventory', label: 'Inventario', icon: Boxes },
];

const RESTRICTED_VISIBLE = new Set(['/admin/kitchen', '/admin/table-orders']);
// Plan Solo Delivery: sin mesas, así que estas pestañas no aportan nada.
const DELIVERY_HIDDEN = new Set(['/admin/tables', '/admin/table-orders']);

export function visibleNavLinks(
  role: UserRole | null | undefined,
  subscriptionPlan?: string | null,
): AdminNavLink[] {
  if (isScreenRole(role)) return [];
  let links = ADMIN_NAV_LINKS;
  if (role && RESTRICTED_ROLES.includes(role)) {
    links = links.filter((l) => RESTRICTED_VISIBLE.has(l.to));
  }
  if (subscriptionPlan === 'DELIVERY') {
    links = links.filter((l) => !DELIVERY_HIDDEN.has(l.to));
  }
  if (subscriptionPlan === 'PREMIUM' && !(role && RESTRICTED_ROLES.includes(role))) {
    const settingsIndex = links.findIndex((l) => l.to === '/admin/settings');
    links = [...links.slice(0, settingsIndex), ...PREMIUM_NAV_LINKS, ...links.slice(settingsIndex)];
  }
  return links;
}

// Secciones para la cuadrícula del Dashboard (todo menos Ajustes, que vive
// arriba en el icono de configuración).
export function dashboardSectionLinks(
  role: UserRole | null | undefined,
  subscriptionPlan?: string | null,
): AdminNavLink[] {
  return visibleNavLinks(role, subscriptionPlan).filter((l) => l.to !== '/admin/settings');
}
