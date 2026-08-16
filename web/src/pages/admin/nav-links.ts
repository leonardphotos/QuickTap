import {
  Bike,
  Boxes,
  Building2,
  CalendarDays,
  ChefHat,
  CircleDot,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Grid2x2,
  LayoutDashboard,
  QrCode,
  Receipt,
  Settings,
  ShoppingCart,
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
  ELITE: 'Plan Elite',
  SHOP: 'QuickTap Shop',
  ELITE_SHOP: 'Elite Shop',
  CLUB: 'QuickTap Club',
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
// Módulo de Gastos: ya no va en el menú (vive como pestaña de Administración), pero la ruta
// sigue viva para los enlaces guardados y para abrirlo embebido.
export const EXPENSES_NAV_LINK: AdminNavLink = { to: '/admin/expenses', label: 'Gastos', icon: Receipt };
// Módulo de Compras: registro de compras con reabastecimiento, cotizaciones, proveedores,
// libro de compras y calificación de proveedores. Mismo flag que Administración.
export const PURCHASES_NAV_LINK: AdminNavLink = { to: '/admin/purchases', label: 'Compras', icon: ShoppingCart };
// Visible solo con Plan Sucursales / Delivery Sucursales (crear sucursales + reporte consolidado).
export const SUCURSALES_NAV_LINK: AdminNavLink = { to: '/admin/sucursales', label: 'Sucursales', icon: Building2 };
// Reservas hechas desde el botón "Mesa" del menú público: solo dueño/admin/cajero, que son quienes las aceptan.
export const RESERVATIONS_NAV_LINK: AdminNavLink = { to: '/admin/reservations', label: 'Reservas', icon: CalendarDays };
// Presupuestos/cotizaciones: un total para aprobar sin cobrar ni tocar cocina todavía. Fuera
// del menú desde que vive dentro de Compras; la ruta se conserva para enlaces ya repartidos.
export const QUOTES_NAV_LINK: AdminNavLink = { to: '/admin/quotes', label: 'Cotizaciones', icon: FileText };
// Pedidos que llegan desde las canchas de un club vinculado (Ajustes → Vincular canchas).
// Solo aparece si hay al menos un club vinculado (Restaurant.linkedClubs).
export const CLUB_ORDERS_NAV_LINK: AdminNavLink = { to: '/admin/canchas', label: 'Canchas', icon: CircleDot };

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
  /** Cuántos clubes deportivos le mandan sus pedidos a este restaurante. */
  linkedClubs?: number;
}

export function visibleNavLinks(
  role: UserRole | null | undefined,
  restaurant?: NavRestaurant | null,
  canAccessInventory?: boolean,
  cashierFullAccess?: boolean,
): AdminNavLink[] {
  if (isScreenRole(role)) return [];
  let links = ADMIN_NAV_LINKS;
  // Cajero sin acceso completo cuenta como restringido (mismo nav que Mesero) — con el flag
  // activo se comporta como el resto de este archivo (isAdminCashier de abajo).
  const isRestricted = !!(role && (RESTRICTED_ROLES.includes(role) || (role === 'CASHIER' && !cashierFullAccess)));
  if (isRestricted) {
    links = links.filter((l) => RESTRICTED_VISIBLE.has(l.to));
    if (canAccessInventory && restaurant && (hasFeature(restaurant, 'inventoryBasic') || hasFeature(restaurant, 'inventoryRecipe'))) {
      links = [...links, INVENTORY_NAV_LINK];
    }
  }
  if (isDeliveryTierPlan(restaurant?.subscriptionPlan)) {
    links = links.filter((l) => !DELIVERY_HIDDEN.has(l.to));
  }
  // "Canchas" va justo al lado de Delivery: las dos son colas de pedidos que
  // salen del local. Solo existe si algún club canjeó el código de vinculación.
  if (!isRestricted && (restaurant?.linkedClubs ?? 0) > 0) {
    const deliveryIndex = links.findIndex((l) => l.to === '/admin/delivery');
    const at = deliveryIndex >= 0 ? deliveryIndex + 1 : links.length;
    links = [...links.slice(0, at), CLUB_ORDERS_NAV_LINK, ...links.slice(at)];
  }
  if (!isRestricted && !isAdminCashier(role, cashierFullAccess)) {
    links = links.filter((l) => !STAFF_HIDDEN.has(l.to));
  }
  if (!isRestricted && restaurant) {
    const extra: AdminNavLink[] = [];
    if (isAdminCashier(role, cashierFullAccess)) extra.push(RESERVATIONS_NAV_LINK);
    // Gastos, Cotizaciones y Compras no se listan en el menú: son pestañas de Administración
    // (Compras vive dentro de Administración → Compras) — repetirlas acá solo alargaba la lista.
    if (isAdminCashier(role, cashierFullAccess) && hasFeature(restaurant, 'administration')) {
      extra.push(ADMINISTRATION_NAV_LINK);
    }
    if (hasFeature(restaurant, 'inventoryBasic') || hasFeature(restaurant, 'inventoryRecipe')) {
      extra.push(INVENTORY_NAV_LINK);
    }
    // Solo visible desde la sede principal: una sucursal no puede tener sus propias sucursales.
    if (isAdminCashier(role, cashierFullAccess) && !restaurant.parentRestaurantId && allowsBranches(restaurant.subscriptionPlan)) {
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
  cashierFullAccess?: boolean,
): AdminNavLink[] {
  return visibleNavLinks(role, restaurant, canAccessInventory, cashierFullAccess).filter(
    (l) => l.to !== '/admin/settings' && l.to !== '/admin' && l.to !== '/admin/comandas',
  );
}
