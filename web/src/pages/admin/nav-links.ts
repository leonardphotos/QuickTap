import {
  Bike,
  Boxes,
  Building2,
  CalendarDays,
  ChefHat,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Grid2x2,
  LayoutDashboard,
  QrCode,
  Receipt,
  Settings,
  UtensilsCrossed,
} from 'lucide-react';
import { RESTRICTED_ROLES, isAdminCashier, isScreenRole } from '../../utils/roles';
import { allowsBranches, hasFeature, isDeliveryTierPlan } from '../../utils/subscription';
import type { UserRole } from '../../types';

export interface AdminNavLink {
  to: string;
  label: string;
  icon: typeof ChefHat;
}

export const PLAN_LABELS: Record<string, string> = {
  DELIVERY: 'Solo Delivery',
  STARTER: 'Plan Inicial',
  PRO: 'Plan Pro',
  PREMIUM: 'Plan Premium',
  CUSTOM: 'Plan Personalizado',
  SUCURSALES: 'Plan Sucursales',
  DELIVERY_SUCURSALES: 'Delivery Sucursales',
};

// Todas las pestañas del panel. Mesero/Cocina solo ven Comandas, Cocina y Órdenes de Mesa.
export const ADMIN_NAV_LINKS: AdminNavLink[] = [
  { to: '/admin', label: 'Resumen', icon: LayoutDashboard },
  { to: '/admin/comandas', label: 'Comandas', icon: ClipboardList },
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
// Visible solo con Plan Sucursales / Delivery Sucursales (crear sucursales + reporte consolidado).
export const SUCURSALES_NAV_LINK: AdminNavLink = { to: '/admin/sucursales', label: 'Sucursales', icon: Building2 };
// Reservas hechas desde el botón "Mesa" del menú público: solo dueño/admin/cajero, que son quienes las aceptan.
export const RESERVATIONS_NAV_LINK: AdminNavLink = { to: '/admin/reservations', label: 'Reservas', icon: CalendarDays };
// Presupuestos/cotizaciones: un total para aprobar sin cobrar ni tocar cocina todavía.
export const QUOTES_NAV_LINK: AdminNavLink = { to: '/admin/quotes', label: 'Cotizaciones', icon: FileText };

const RESTRICTED_VISIBLE = new Set(['/admin/comandas', '/admin/kitchen', '/admin/table-orders']);
// Plan Solo Delivery: sin mesas, así que estas pestañas no aportan nada.
const DELIVERY_HIDDEN = new Set(['/admin/tables', '/admin/table-orders']);
// STAFF (Personal) conserva acceso total al resto del panel, pero no a Productos/Mesas.
const STAFF_HIDDEN = new Set(['/admin/products', '/admin/tables']);

interface NavRestaurant {
  subscriptionPlan?: string | null;
  customAdministration?: boolean;
  customInventoryBasic?: boolean;
  customInventoryRecipe?: boolean;
  customAccountsPayable?: boolean;
  parentRestaurantId?: string | null;
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
  if (isDeliveryTierPlan(restaurant?.subscriptionPlan)) {
    links = links.filter((l) => !DELIVERY_HIDDEN.has(l.to));
  }
  if (!isRestricted && !isAdminCashier(role)) {
    links = links.filter((l) => !STAFF_HIDDEN.has(l.to));
  }
  if (!isRestricted && restaurant) {
    const extra: AdminNavLink[] = [];
    if (isAdminCashier(role)) extra.push(RESERVATIONS_NAV_LINK, QUOTES_NAV_LINK);
    if (isAdminCashier(role) && hasFeature(restaurant, 'administration')) extra.push(ADMINISTRATION_NAV_LINK, EXPENSES_NAV_LINK);
    if (hasFeature(restaurant, 'inventoryBasic') || hasFeature(restaurant, 'inventoryRecipe')) {
      extra.push(INVENTORY_NAV_LINK);
    }
    // Solo visible desde la sede principal: una sucursal no puede tener sus propias sucursales.
    if (isAdminCashier(role) && !restaurant.parentRestaurantId && allowsBranches(restaurant.subscriptionPlan)) {
      extra.push(SUCURSALES_NAV_LINK);
    }
    if (extra.length > 0) {
      const settingsIndex = links.findIndex((l) => l.to === '/admin/settings');
      links = [...links.slice(0, settingsIndex), ...extra, ...links.slice(settingsIndex)];
    }
  }
  return links;
}

// Secciones para la cuadrícula del Dashboard (todo menos Ajustes, que vive arriba en el
// ícono de configuración, y Resumen/Comandas, que ya son el contenido de esta misma
// pantalla en celular — un acceso rápido a sí misma sería redundante).
export function dashboardSectionLinks(
  role: UserRole | null | undefined,
  restaurant?: NavRestaurant | null,
  canAccessInventory?: boolean,
): AdminNavLink[] {
  return visibleNavLinks(role, restaurant, canAccessInventory).filter(
    (l) => l.to !== '/admin/settings' && l.to !== '/admin' && l.to !== '/admin/comandas',
  );
}
