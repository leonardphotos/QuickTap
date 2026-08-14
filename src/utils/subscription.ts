import { BillingCycle } from '@prisma/client';
import { prisma } from '../config/prisma';

export const TRIAL_DAYS = 15;
// Al llegar a 0 días, el restaurante tiene 12h de gracia antes de bloquearse.
export const GRACE_HOURS = 12;

const CYCLE_DAYS: Record<BillingCycle, number> = {
  MONTHLY: 30,
  QUARTERLY: 90,
  SEMIANNUAL: 180,
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
export type FeatureFlag = 'administration' | 'inventoryBasic' | 'inventoryRecipe' | 'accountsPayable';

interface FeatureCheckRestaurant {
  subscriptionPlan?: string | null;
  customAdministration?: boolean;
  customInventoryBasic?: boolean;
  customInventoryRecipe?: boolean;
  customAccountsPayable?: boolean;
}

const CUSTOM_FLAG_FIELD: Record<FeatureFlag, keyof FeatureCheckRestaurant> = {
  administration: 'customAdministration',
  inventoryBasic: 'customInventoryBasic',
  inventoryRecipe: 'customInventoryRecipe',
  accountsPayable: 'customAccountsPayable',
};

/**
 * Plan con el que arranca la prueba de 15 días según el vertical. Cada vertical
 * que no es restaurante tiene un plan único (no hay nada a lo que mejorar), así
 * que se le asigna directo; el restaurante arranca en el más completo para que
 * pruebe TODO el producto antes de elegir. Vive aquí y no repetido en
 * auth.service porque se usa en los dos caminos de registro (normal y Google).
 */
export function trialPlanFor(businessType?: string | null): 'SHOP' | 'CLUB' | 'ELITE' {
  if (businessType === 'SHOP') return 'SHOP';
  if (businessType === 'SPORTS_CLUB') return 'CLUB';
  return 'ELITE';
}

/** Planes "completos" (todos los beneficios de Administración/Inventario/etc.), con o sin sucursales. */
export function isFullTierPlan(plan?: string | null): boolean {
  return plan === 'PRO' || plan === 'PREMIUM' || plan === 'SUCURSALES' || plan === 'ELITE';
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
  // Plan Pro: completo SALVO el inventario por receta (y con él, Producción/preparaciones,
  // que cuelga del mismo flag) — Pro incluye solo inventario por stock; recetas son de Elite.
  if (restaurant.subscriptionPlan === 'PRO') return feature !== 'inventoryRecipe';
  // Premium/Sucursales (legados) y Elite: todos los beneficios.
  if (isFullTierPlan(restaurant.subscriptionPlan)) return true;
  // QuickTap Shop y QuickTap Club tienen un plan único: no hay nada a lo que mejorar, así que
  // su plan incluye todo lo que el negocio necesita. Sin esto, el botón "Añadir egreso"
  // respondía 403 (Gastos y Proveedores viven en rutas marcadas como 'administration').
  if (restaurant.subscriptionPlan === 'SHOP' || restaurant.subscriptionPlan === 'CLUB') return true;
  if (restaurant.subscriptionPlan === 'CUSTOM') return Boolean(restaurant[CUSTOM_FLAG_FIELD[feature]]);
  return false;
}
