// Espejo del backend (src/utils/subscription.ts). El servidor sigue siendo la
// única fuente de verdad (bloquea el acceso real); esto solo pinta la cuenta
// regresiva y el aviso sin depender de otra llamada a la API.
export const GRACE_HOURS = 12;

export function daysRemaining(periodEnd: string): number {
  const diffMs = new Date(periodEnd).getTime() - Date.now();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

export function graceHoursRemaining(periodEnd: string): number | null {
  const end = new Date(periodEnd).getTime();
  const graceDeadline = end + GRACE_HOURS * 60 * 60 * 1000;
  const now = Date.now();
  if (now < end || now > graceDeadline) return null;
  return Math.ceil((graceDeadline - now) / (60 * 60 * 1000));
}

/** Espejo de hasFeature() del backend (src/utils/subscription.ts) — solo para pintar la UI. */
export type FeatureFlag = 'administration' | 'inventoryBasic' | 'inventoryRecipe' | 'accountsPayable' | 'accounting' | 'crm';

interface FeatureCheckRestaurant {
  subscriptionPlan?: string | null;
  customAdministration?: boolean;
  customInventoryBasic?: boolean;
  customInventoryRecipe?: boolean;
  customAccountsPayable?: boolean;
  /** Locales con plan Shop pagado antes de existir Elite Shop: conservan todo hasta esta fecha. */
  legacyFullAccessUntil?: string | null;
}

const CUSTOM_FLAG_FIELD: Partial<Record<FeatureFlag, keyof FeatureCheckRestaurant>> = {
  administration: 'customAdministration',
  inventoryBasic: 'customInventoryBasic',
  inventoryRecipe: 'customInventoryRecipe',
  accountsPayable: 'customAccountsPayable',
  accounting: 'customAccountsPayable',
  crm: 'customAdministration',
};

function hasLegacyFullAccess(restaurant: FeatureCheckRestaurant): boolean {
  if (restaurant.subscriptionPlan !== 'SHOP' || !restaurant.legacyFullAccessUntil) return false;
  return new Date(restaurant.legacyFullAccessUntil).getTime() > Date.now();
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
 * Planes que habilitan crear sucursales. Delivery y Elite traen
 * sucursales ILIMITADAS; SUCURSALES/DELIVERY_SUCURSALES son legados (ya no se ofrecen a
 * clientes nuevos) que se mantienen topados en 5, ver MAX_BRANCHES en el backend.
 */
export function allowsBranches(plan?: string | null): boolean {
  // Pro ya no incluye sucursales (espejo del backend).
  return (
    plan === 'DELIVERY' ||
    plan === 'ELITE' ||
    plan === 'ELITE_SHOP' ||
    plan === 'SUCURSALES' ||
    plan === 'DELIVERY_SUCURSALES'
  );
}

export function hasFeature(restaurant: FeatureCheckRestaurant | null | undefined, feature: FeatureFlag): boolean {
  if (!restaurant) return false;
  const plan = restaurant.subscriptionPlan;
  // Espejo exacto de hasFeature() del backend — los dos tienen que decir lo mismo.
  // Pro: Administración básica (Resumen, Estadísticas, Productos, Delivery, Métodos de
  // pago), Gastos e inventario por stock; el resto es de Elite.
  if (plan === 'PRO') return feature === 'administration' || feature === 'inventoryBasic';
  if (isFullTierPlan(plan)) return true;
  // Locales: Shop = operación diaria + cuentas por cobrar + CRM; Elite Shop suma la
  // contabilidad avanzada y sucursales. Un Shop pagado antes conserva todo hasta vencer.
  if (plan === 'ELITE_SHOP') return true;
  if (plan === 'SHOP') return feature !== 'accounting' || hasLegacyFullAccess(restaurant);
  if (plan === 'CLUB') return true;
  if (plan === 'CUSTOM') {
    const field = CUSTOM_FLAG_FIELD[feature];
    return field ? Boolean(restaurant[field]) : false;
  }
  return false;
}
