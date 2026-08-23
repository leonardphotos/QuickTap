import { BillingCycle } from '@prisma/client';
import { prisma } from '../config/prisma';

export const TRIAL_DAYS = 15;
// Al llegar a 0 días, el restaurante tiene 12h de gracia antes de bloquearse.
export const GRACE_HOURS = 12;

const CYCLE_DAYS: Record<BillingCycle, number> = {
  MONTHLY: 30,
  QUARTERLY: 90,
  SEMIANNUAL: 180,
  ANNUAL: 365,
};

/**
 * Meses que cubre cada ciclo. El precio de un plan siempre se guarda como
 * MENSUALIDAD EQUIVALENTE (lo que sale el mes al pagar por adelantado), así
 * que el monto a cobrar es mensualidad x estos meses.
 */
export const CYCLE_MONTHS: Record<BillingCycle, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
};

export function trialPeriodEnd(from: Date = new Date()): Date {
  return new Date(from.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

/** Próximo `periodEnd` al activar/renovar un ciclo, extendiendo desde el vencimiento vigente si aún no pasó. */
export function nextPeriodEnd(cycle: BillingCycle, currentPeriodEnd?: Date | null): Date {
  const base = currentPeriodEnd && currentPeriodEnd.getTime() > Date.now() ? currentPeriodEnd : new Date();
  return new Date(base.getTime() + CYCLE_DAYS[cycle] * 24 * 60 * 60 * 1000);
}

/**
 * Bloqueado = suspendido manualmente desde el Dashboard maestro, O pasó el
 * `periodEnd` + las 12h de gracia. El vencimiento se calcula siempre en
 * vivo (nunca se persiste); `suspended` sí se persiste, como override manual.
 */
export function isLocked(restaurant: { periodEnd: Date; suspended?: boolean }): boolean {
  if (restaurant.suspended) return true;
  const graceDeadline = restaurant.periodEnd.getTime() + GRACE_HOURS * 60 * 60 * 1000;
  return Date.now() > graceDeadline;
}

/**
 * Igual que `isLocked`, pero para una sucursal (Restaurant.parentRestaurantId
 * seteado) resuelve el bloqueo con el `periodEnd`/`suspended` de la SEDE
 * PRINCIPAL, no los propios: una sucursal nunca se bloquea de forma
 * independiente, depende de que la cuenta principal esté al día.
 */
export async function isLockedAsync(restaurant: {
  periodEnd: Date;
  suspended?: boolean;
  parentRestaurantId?: string | null;
}): Promise<boolean> {
  if (!restaurant.parentRestaurantId) return isLocked(restaurant);
  const parent = await prisma.restaurant.findUnique({
    where: { id: restaurant.parentRestaurantId },
    select: { periodEnd: true, suspended: true },
  });
  if (!parent) return isLocked(restaurant);
  return isLocked(parent);
}

/** Días completos restantes hasta `periodEnd` (0 el día que vence, negativo ya en gracia/bloqueado). */
export function daysRemaining(restaurant: { periodEnd: Date }): number {
  const diffMs = restaurant.periodEnd.getTime() - Date.now();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

/** Horas de gracia restantes una vez vencido `periodEnd` (null si aún no vence o ya bloqueado). */
export function graceHoursRemaining(restaurant: { periodEnd: Date }): number | null {
  const graceDeadline = restaurant.periodEnd.getTime() + GRACE_HOURS * 60 * 60 * 1000;
  const now = Date.now();
  if (now < restaurant.periodEnd.getTime() || now > graceDeadline) return null;
  return Math.ceil((graceDeadline - now) / (60 * 60 * 1000));
}

/**
 * Funciones "premium" que no dependen de un solo plan fijo: Premium las trae
 * todas, Pro trae un subconjunto (todo menos inventario por receta), y en
 * CUSTOM se activan una por una según lo que el restaurante haya contratado
 * (campos customAdministration/customInventoryBasic/... en Restaurant).
 */
/**
 * - administration: Administración básica (Resumen, Estadísticas, Productos, Delivery,
 *   Métodos de pago) + Gastos.
 * - inventoryBasic / inventoryRecipe: Inventario por stock / por receta.
 * - accountsPayable: cuentas por cobrar a clientes (deuda en pedidos, ventas fiadas).
 * - accounting: contabilidad avanzada — órdenes de pago, libro de movimientos con Excel,
 *   cuentas bancarias, proveedores, libros fiscales, historial de pedidos y margen de utilidad.
 * - crm: CRM (directorio con segmentos y promociones con código canjeable).
 */
export type FeatureFlag = 'administration' | 'inventoryBasic' | 'inventoryRecipe' | 'accountsPayable' | 'accounting' | 'crm';

interface FeatureCheckRestaurant {
  subscriptionPlan?: string | null;
  customAdministration?: boolean;
  customInventoryBasic?: boolean;
  customInventoryRecipe?: boolean;
  customAccountsPayable?: boolean;
  /** Locales con plan Shop pagado antes de existir Elite Shop: conservan todo hasta esta fecha. */
  legacyFullAccessUntil?: Date | string | null;
}

const CUSTOM_FLAG_FIELD: Partial<Record<FeatureFlag, keyof FeatureCheckRestaurant>> = {
  administration: 'customAdministration',
  inventoryBasic: 'customInventoryBasic',
  inventoryRecipe: 'customInventoryRecipe',
  accountsPayable: 'customAccountsPayable',
  // accounting/crm no tienen adicional en CUSTOM: van con accountsPayable/administration.
  accounting: 'customAccountsPayable',
  crm: 'customAdministration',
};

/**
 * Plan con el que arranca la prueba de 15 días según el vertical. Cada vertical
 * que no es restaurante tiene un plan único (no hay nada a lo que mejorar), así
 * que se le asigna directo; el restaurante arranca en el más completo para que
 * pruebe TODO el producto antes de elegir. Vive aquí y no repetido en
 * auth.service porque se usa en los dos caminos de registro (normal y Google).
 */
export function trialPlanFor(businessType?: string | null): 'ELITE_SHOP' | 'CLUB' | 'ELITE' | 'OFFICE' {
  // El local arranca en Elite Shop por la misma razón que el restaurante en Elite: que
  // pruebe TODO (contabilidad, bancos, sucursales) antes de elegir.
  if (businessType === 'SHOP') return 'ELITE_SHOP';
  if (businessType === 'SPORTS_CLUB') return 'CLUB';
  if (businessType === 'ADMIN_OFFICE') return 'OFFICE';
  return 'ELITE';
}

/** Planes "completos" (todos los beneficios de Administración/Inventario/etc.), con o sin sucursales. */
export function isFullTierPlan(plan?: string | null): boolean {
  return plan === 'PRO' || plan === 'PREMIUM' || plan === 'SUCURSALES' || plan === 'ELITE';
}

/** Un local con plan Shop base que todavía está dentro de su ventana de acceso completo heredado. */
function hasLegacyFullAccess(restaurant: FeatureCheckRestaurant): boolean {
  if (restaurant.subscriptionPlan !== 'SHOP' || !restaurant.legacyFullAccessUntil) return false;
  return new Date(restaurant.legacyFullAccessUntil).getTime() > Date.now();
}

/** Planes "Solo Delivery" (sin mesas/QR, acceso directo a Cocina), con o sin sucursales. */
export function isDeliveryTierPlan(plan?: string | null): boolean {
  return plan === 'DELIVERY' || plan === 'DELIVERY_SUCURSALES';
}

/**
 * Planes que habilitan crear sucursales. Desde la reestructuración a 3 planes
 * (Delivery/Pro/Elite), Delivery y Elite traen sucursales ILIMITADAS (Pro ya no incluye) —
 * SUCURSALES/DELIVERY_SUCURSALES son planes legados (ya no se ofrecen a
 * clientes nuevos, ver maxBranchesFor) que siguen topados en 5.
 */
export function allowsBranches(plan?: string | null): boolean {
  // Pro ya no incluye sucursales (quedan para Elite y los planes legados de sucursales).
  return (
    plan === 'DELIVERY' ||
    plan === 'ELITE' ||
    plan === 'ELITE_SHOP' ||
    plan === 'SUCURSALES' ||
    plan === 'DELIVERY_SUCURSALES'
  );
}

/** [Legado] Tope de sucursales de SUCURSALES/DELIVERY_SUCURSALES, los únicos planes que aún limitan. */
export const MAX_BRANCHES = 5;

/** Tope de sucursales según el plan — null significa sin límite (Delivery/Elite). */
export function maxBranchesFor(plan?: string | null): number | null {
  if (plan === 'SUCURSALES' || plan === 'DELIVERY_SUCURSALES') return MAX_BRANCHES;
  return null;
}

export function hasFeature(restaurant: FeatureCheckRestaurant, feature: FeatureFlag): boolean {
  const plan = restaurant.subscriptionPlan;
  // Plan Pro (restaurante): Administración básica (Resumen, Estadísticas, Productos, Delivery,
  // Métodos de pago), Gastos e inventario por stock. Lo demás — recetas, cuentas por cobrar,
  // contabilidad avanzada, CRM — es de Elite.
  if (plan === 'PRO') return feature === 'administration' || feature === 'inventoryBasic';
  // Premium/Sucursales (legados) y Elite: todos los beneficios.
  if (isFullTierPlan(plan)) return true;
  // Locales: Shop base = operación diaria (Administración básica, inventario, cuentas por
  // cobrar, CRM); Elite Shop suma la contabilidad avanzada y las sucursales. Un Shop pagado
  // antes de la separación conserva todo hasta que venza (legacyFullAccessUntil).
  if (plan === 'ELITE_SHOP') return true;
  if (plan === 'SHOP') return feature !== 'accounting' || hasLegacyFullAccess(restaurant);
  // QuickTap Club: plan único con todo incluido.
  if (plan === 'CLUB') return true;
  // Administración: plan único. Las banderas de esta lista son de los otros verticales (menú,
  // inventario, CRM…) y no aplican acá — el vertical vive entero bajo /office, que no está
  // gateado por feature. Se devuelve true para no dejarlo a mitad de camino si alguna pantalla
  // compartida las consulta.
  if (plan === 'OFFICE') return true;
  if (plan === 'CUSTOM') {
    const field = CUSTOM_FLAG_FIELD[feature];
    return field ? Boolean(restaurant[field]) : false;
  }
  return false;
}
