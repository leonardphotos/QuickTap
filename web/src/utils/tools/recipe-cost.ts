/** Estimaciones públicas: sin redondear pasos intermedios; redondear solo al mostrar. */
export const UNITS = { kg: { label: 'kg', factor: 1000, dimension: 'mass' }, g: { label: 'g', factor: 1, dimension: 'mass' }, l: { label: 'litros', factor: 1000, dimension: 'volume' }, ml: { label: 'ml', factor: 1, dimension: 'volume' }, unit: { label: 'unidades', factor: 1, dimension: 'count' } } as const;
export type Unit = keyof typeof UNITS;
export interface Ingredient { id: string; name: string; price: string; purchased: string; purchaseUnit: Unit; used: string; usedUnit: Unit; waste: string }
export interface RecipeDraft { name: string; currency: 'USD' | 'VES'; rate: string; portions: string; packaging: string; other: string; sale: string; target: string; monthly: string; ingredients: Ingredient[] }
export const newIngredient = (): Ingredient => ({ id: crypto.randomUUID(), name: '', price: '', purchased: '', purchaseUnit: 'kg', used: '', usedUnit: 'g', waste: '' });
export const newRecipe = (): RecipeDraft => ({ name: '', currency: 'USD', rate: '', portions: '1', packaging: '0', other: '0', sale: '', target: '30', monthly: '', ingredients: [newIngredient()] });
export interface CostResult { ingredientCosts: { id: string; usableQuantity: number; usableUnitCost: number; cost: number }[]; ingredientsTotal: number; recipeTotal: number; portionCost: number; profit: number; margin: number | null; foodCost: number | null; recommended: number; monthlyProfit: number | null; rate: number | null; status: 'healthy' | 'tight' | 'risk' }
export type Calculation = { ok: true; result: CostResult } | { ok: false; errors: Record<string, string> };
export function calculateRecipe(draft: RecipeDraft): Calculation {
  const errors: Record<string, string> = {};
  function number(raw: string, key: string, min: number, max = 1e9, optional = false) {
    const clean = raw.trim().replace(',', '.');
    if (!clean && optional) return 0;
    const n = Number(clean);
    if (!clean || !/^\d+(\.\d+)?$/.test(clean) || !Number.isFinite(n) || n < min || n > max) { errors[key] = `Ingresa un número entre ${min} y ${max}.`; return 0; }
    return n;
  }
  const portions = number(draft.portions, 'portions', 1, 1e6);
  if (!Number.isInteger(portions)) errors.portions = 'Usa un número entero de porciones.';
  const packaging = number(draft.packaging, 'packaging', 0);
  const other = number(draft.other, 'other', 0);
  const sale = number(draft.sale, 'sale', 0);
  const target = number(draft.target, 'target', 0.01, 100);
  const monthly = number(draft.monthly, 'monthly', 0, 1e9, true);
  if (!Number.isInteger(monthly)) errors.monthly = 'Usa un número entero de ventas.';
  const rate = draft.rate.trim() ? number(draft.rate, 'rate', 0.000001) : null;
  if (!draft.ingredients.length || draft.ingredients.length > 100) errors.ingredients = 'Agrega entre 1 y 100 ingredientes.';
  const ingredientCosts = draft.ingredients.map((i) => {
    const prefix = `ingredients.${i.id}.`;
    if (!i.name.trim()) errors[prefix + 'name'] = 'Escribe el nombre del ingrediente.';
    const price = number(i.price, prefix + 'price', 0);
    const purchased = number(i.purchased, prefix + 'purchased', 0.000001);
    const used = number(i.used, prefix + 'used', 0.000001);
    const waste = number(i.waste, prefix + 'waste', 0, 99.99, true);
    const from = UNITS[i.purchaseUnit], to = UNITS[i.usedUnit];
    if (!from || !to || from.dimension !== to.dimension) { errors[prefix + 'usedUnit'] = 'Usa unidades compatibles con la compra.'; return { id: i.id, usableQuantity: 0, usableUnitCost: 0, cost: 0 }; }
    const usableQuantity = purchased * (1 - waste / 100);
    const usableUnitCost = usableQuantity > 0 ? price / usableQuantity : 0;
    return { id: i.id, usableQuantity, usableUnitCost, cost: usableUnitCost * used * to.factor / from.factor };
  });
  if (Object.keys(errors).length) return { ok: false, errors };
  const ingredientsTotal = ingredientCosts.reduce((sum, i) => sum + i.cost, 0);
  const recipeTotal = ingredientsTotal + portions * (packaging + other);
  const portionCost = recipeTotal / portions;
  const profit = sale - portionCost;
  const margin = sale > 0 ? profit / sale * 100 : null;
  const foodCost = sale > 0 ? portionCost / sale * 100 : null;
  const recommended = portionCost / (target / 100);
  const monthlyProfit = draft.monthly.trim() ? profit * monthly : null;
  if (![ingredientsTotal, recipeTotal, portionCost, profit, recommended, monthlyProfit ?? 0].every(Number.isFinite)) return { ok: false, errors: { ingredients: 'Los importes son demasiado grandes. Revisa las cantidades.' } };
  return { ok: true, result: { ingredientCosts, ingredientsTotal, recipeTotal, portionCost, profit, margin, foodCost, recommended, monthlyProfit, rate, status: foodCost === null || profit <= 0 || foodCost > target + 5 ? 'risk' : foodCost > target ? 'tight' : 'healthy' } };
}

/** Validación del borrador persistido; nunca confiar en JSON del navegador. */
export function isRecipeDraft(value: unknown): value is RecipeDraft {
  if (!value || typeof value !== 'object') return false;
  const d = value as RecipeDraft;
  const strings = ['name', 'rate', 'portions', 'packaging', 'other', 'sale', 'target', 'monthly'] as const;
  return strings.every(k => typeof d[k] === 'string' && d[k].length < 300) && ['USD', 'VES'].includes(d.currency) && Array.isArray(d.ingredients) && d.ingredients.length > 0 && d.ingredients.length <= 100 && new Set(d.ingredients.map(i => i?.id)).size === d.ingredients.length && d.ingredients.every(i => i && ['id', 'name', 'price', 'purchased', 'used', 'waste'].every(k => typeof i[k as keyof Ingredient] === 'string' && i[k as keyof Ingredient].length < 300) && Object.hasOwn(UNITS, i.purchaseUnit) && Object.hasOwn(UNITS, i.usedUnit));
}
