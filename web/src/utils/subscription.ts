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

/** Planes "completos" (todos los beneficios de Administración/Inventario/etc.), con o sin sucursales. */
export function isFullTierPlan(plan?: string | null): boolean {
  return plan === 'PRO' || plan === 'PREMIUM' || plan === 'SUCURSALES' || plan === 'ELITE';
}

/** Planes "Solo Delivery" (sin mesas/QR, acceso directo a Cocina), con o sin sucursales. */
export function isDeliveryTierPlan(plan?: string | null): boolean {
  return plan === 'DELIVERY' || plan === 'DELIVERY_SUCURSALES';
}

/**
 * Planes que habilitan crear sucursales. Los 3 planes vigentes (Delivery/Pro/Elite) traen
 * sucursales ILIMITADAS; SUCURSALES/DELIVERY_SUCURSALES son legados (ya no se ofrecen a
 * clientes nuevos) que se mantienen topados en 5, ver MAX_BRANCHES en el backend.
 */
export function allowsBranches(plan?: string | null): boolean {
  return (
    plan === 'DELIVERY' ||
    plan === 'PRO' ||
    plan === 'ELITE' ||
    plan === 'SUCURSALES' ||
    plan === 'DELIVERY_SUCURSALES'
  );
}

export function hasFeature(restaurant: FeatureCheckRestaurant | null | undefined, feature: FeatureFlag): boolean {
  if (!restaurant) return false;
  // Sucursales trae exactamente los mismos beneficios que Pro, más sucursales.
  if (isFullTierPlan(restaurant.subscriptionPlan)) return true;
  // QuickTap Shop y QuickTap Club: plan único, incluye todo lo que el negocio necesita (ver el
  // mismo caso en src/utils/subscription.ts del backend — los dos tienen que decir lo mismo).
  if (restaurant.subscriptionPlan === 'SHOP' || restaurant.subscriptionPlan === 'CLUB') return true;
  if (restaurant.subscriptionPlan === 'CUSTOM') return Boolean(restaurant[CUSTOM_FLAG_FIELD[feature]]);
  return false;
}
