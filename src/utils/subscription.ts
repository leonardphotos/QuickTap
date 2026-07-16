import { BillingCycle } from '@prisma/client';

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

// Plan Pro: Administración + Inventario "normal" (solo productos, sin receta) + Cuentas por pagar.
const PRO_FEATURES: FeatureFlag[] = ['administration', 'inventoryBasic', 'accountsPayable'];

export function hasFeature(restaurant: FeatureCheckRestaurant, feature: FeatureFlag): boolean {
  if (restaurant.subscriptionPlan === 'PREMIUM') return true;
  if (restaurant.subscriptionPlan === 'PRO') return PRO_FEATURES.includes(feature);
  if (restaurant.subscriptionPlan === 'CUSTOM') return Boolean(restaurant[CUSTOM_FLAG_FIELD[feature]]);
  return false;
}
