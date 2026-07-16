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

const PRO_FEATURES: FeatureFlag[] = ['administration', 'inventoryBasic', 'accountsPayable'];

export function hasFeature(restaurant: FeatureCheckRestaurant | null | undefined, feature: FeatureFlag): boolean {
  if (!restaurant) return false;
  if (restaurant.subscriptionPlan === 'PREMIUM') return true;
  if (restaurant.subscriptionPlan === 'PRO') return PRO_FEATURES.includes(feature);
  if (restaurant.subscriptionPlan === 'CUSTOM') return Boolean(restaurant[CUSTOM_FLAG_FIELD[feature]]);
  return false;
}
