import { Bike, Boxes, ChefHat, CircleDollarSign, Grid2x2, QrCode, Receipt, Settings, UtensilsCrossed } from 'lucide-react';
import { RESTRICTED_ROLES, isScreenRole } from '../../utils/roles';
import { hasFeature } from '../../utils/subscription';
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

// Visibles con Administración (Premium, Pro, o CUSTOM con el adicional).
export const ADMINISTRATION_NAV_LINK: AdminNavLink = {
  to: '/admin/administration',
  label: 'Administración',
  icon: CircleDollarSign,
};
// Visible con Inventario "normal" o "por receta" (cualquiera de los dos).
export const INVENTORY_NAV_LINK: AdminNavLink = { to: '/admin/inventory', label: 'Inventario', icon: Boxes };
// Módulo de Gastos: proveedores, categorías de egreso y balance. Mismo flag que Administración.
export const EXPENSES_NAV_LINK: AdminNavLink = { to: '/admin/expenses', label: 'Gastos', icon: Receipt };

const RESTRICTED_VISIBLE = new Set(['/admin/kitchen', '/admin/table-orders']);
// Plan Solo Delivery: sin mesas, así que estas pestañas no aportan nada.
const DELIVERY_HIDDEN = new Set(['/admin/tables', '/admin/table-orders']);

interface NavRestaurant {
  subscriptionPlan?: string | null;
  customAdministration?: boolean;
  customInventoryBasic?: boolean;
  customInventoryRecipe?: boolean;
  customAccountsPayable?: boolean;
}

export function visibleNavLinks(
  role: UserRole | null | undefined,
  restaurant?: NavRestaurant | null,
  canAccessInventory?: boolean,
): AdminNavLink[] {
  if (isScreenRole(role)) return [];
  let links = ADMIN_NAV_LINKS;
  const isRestricted = !!(role && RESTRICTED_ROLES.includes(role));
  if (isRestricted) {
    links = links.filter((l) => RESTRICTED_VISIBLE.has(l.to));
    if (canAccessInventory && restaurant && (hasFeature(restaurant, 'inventoryBasic') || hasFeature(restaurant, 'inventoryRecipe'))) {
      links = [...links, INVENTORY_NAV_LINK];
    }
  }
  if (restaurant?.subscriptionPlan === 'DELIVERY') {
    links = links.filter((l) => !DELIVERY_HIDDEN.has(l.to));
  }
  if (!isRestricted && restaurant) {
    const extra: AdminNavLink[] = [];
    if (hasFeature(restaurant, 'administration')) extra.push(ADMINISTRATION_NAV_LINK, EXPENSES_NAV_LINK);
    if (hasFeature(restaurant, 'inventoryBasic') || hasFeature(restaurant, 'inventoryRecipe')) {
      extra.push(INVENTORY_NAV_LINK);
    }
    if (extra.length > 0) {
      const settingsIndex = links.findIndex((l) => l.to === '/admin/settings');
      links = [...links.slice(0, settingsIndex), ...extra, ...links.slice(settingsIndex)];
    }
  }
  return links;
}

// Secciones para la cuadrícula del Dashboard (todo menos Ajustes, que vive
// arriba en el icono de configuración).
export function dashboardSectionLinks(
  role: UserRole | null | undefined,
  restaurant?: NavRestaurant | null,
  canAccessInventory?: boolean,
): AdminNavLink[] {
  return visibleNavLinks(role, restaurant, canAccessInventory).filter((l) => l.to !== '/admin/settings');
}
