/**
 * Cálculo de la estructura de costo de un producto (Administración → Estructura de costo).
 *
 * Todo se expresa sobre el precio de venta base (lo que el restaurante fija en Product.price,
 * que ya es base imponible: servicio e IVA se cobran encima y no son costo del plato):
 *
 *   materia prima  = suma de las líneas de material (cantidad × costo unitario)
 *   variables      = precio × Σ % variables habilitados   (comisiones, empaque, merma…)
 *   fijos          = precio × Σ % fijos habilitados       (arriendo, nómina, servicios… prorrateados)
 *   costo total    = materia prima + variables + fijos
 *   utilidad neta  = precio − costo total
 *   margen neto %  = utilidad neta / precio
 *   food cost %    = materia prima / precio
 *
 * Precio sugerido para una utilidad objetivo T (%): como variables, fijos y utilidad son todos
 * % del precio, precio = materia prima / (1 − (var% + fijo% + T%)/100). Si esa suma llega al
 * 100 % no hay precio que cierre — se devuelve null y la pantalla lo explica.
 *
 * Es aritmética pura (sin Prisma) para que el frontend la refleje 1:1 en
 * web/src/utils/cost-structure.ts y la calculadora responda en vivo sin ir al servidor; el
 * backend la vuelve a correr al guardar para que el snapshot sea el que manda.
 */

export type CostItemKind = 'FIXED' | 'VARIABLE';

export interface CostStructureItem {
  id: string;
  label: string;
  kind: CostItemKind;
  /** % sobre el precio de venta. */
  percent: number;
  enabled: boolean;
}

export interface MaterialLine {
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
  /** Insumo del inventario del que salió la línea (si vino de la receta). Solo informativo. */
  inventoryItemId?: string | null;
  /** Preparación (sub-receta) de la que salió la línea, si aplica. Solo informativo. */
  preparationId?: string | null;
}

export interface CostStructureResult {
  materialsCost: number;
  variablePercent: number;
  fixedPercent: number;
  variableCost: number;
  fixedCost: number;
  totalCost: number;
  netProfit: number;
  netMarginPercent: number;
  foodCostPercent: number;
  /** Precio que deja exactamente la utilidad objetivo; null si los % no dejan espacio. */
  suggestedPrice: number | null;
  /** Precio que deja utilidad 0 (solo cubre MP + variables + fijos); null en el mismo caso. */
  breakEvenPrice: number | null;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function sumPercent(items: CostStructureItem[], kind: CostItemKind): number {
  return round2(items.filter((i) => i.kind === kind && i.enabled).reduce((acc, i) => acc + (Number(i.percent) || 0), 0));
}

export function materialsTotal(lines: MaterialLine[]): number {
  return round2(lines.reduce((acc, l) => acc + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0));
}

export function computeCostStructure(input: {
  salePrice: number;
  materials: MaterialLine[];
  items: CostStructureItem[];
  targetNetMarginPercent: number;
}): CostStructureResult {
  const price = Math.max(0, Number(input.salePrice) || 0);
  const materialsCost = materialsTotal(input.materials);
  const variablePercent = sumPercent(input.items, 'VARIABLE');
  const fixedPercent = sumPercent(input.items, 'FIXED');
  const variableCost = round2((price * variablePercent) / 100);
  const fixedCost = round2((price * fixedPercent) / 100);
  const totalCost = round2(materialsCost + variableCost + fixedCost);
  const netProfit = round2(price - totalCost);
  const netMarginPercent = price > 0 ? round2((netProfit / price) * 100) : 0;
  const foodCostPercent = price > 0 ? round2((materialsCost / price) * 100) : 0;

  const overheadPercent = variablePercent + fixedPercent;
  const target = Math.max(0, Number(input.targetNetMarginPercent) || 0);
  const suggestedDenominator = 1 - (overheadPercent + target) / 100;
  const breakEvenDenominator = 1 - overheadPercent / 100;

  return {
    materialsCost,
    variablePercent,
    fixedPercent,
    variableCost,
    fixedCost,
    totalCost,
    netProfit,
    netMarginPercent,
    foodCostPercent,
    suggestedPrice: suggestedDenominator > 0 && materialsCost > 0 ? round2(materialsCost / suggestedDenominator) : null,
    breakEvenPrice: breakEvenDenominator > 0 && materialsCost > 0 ? round2(materialsCost / breakEvenDenominator) : null,
  };
}

/**
 * Elementos fundamentales de un restaurante, precargados la primera vez. Los % son puntos de
 * partida razonables para un local promedio — el dueño los ajusta a su realidad (y la
 * calculadora le sugiere el % fijo real a partir de sus gastos recurrentes).
 */
export const DEFAULT_COST_STRUCTURE_ITEMS: CostStructureItem[] = [
  { id: 'rent', label: 'Arriendo / alquiler', kind: 'FIXED', percent: 8, enabled: true },
  { id: 'payroll', label: 'Nómina', kind: 'FIXED', percent: 20, enabled: true },
  { id: 'utilities', label: 'Servicios (luz, agua, gas, internet)', kind: 'FIXED', percent: 4, enabled: true },
  { id: 'admin', label: 'Administrativos y otros fijos', kind: 'FIXED', percent: 3, enabled: true },
  { id: 'card-fee', label: 'Comisión punto de venta / pasarela', kind: 'VARIABLE', percent: 3, enabled: true },
  { id: 'packaging', label: 'Empaque y desechables', kind: 'VARIABLE', percent: 2, enabled: true },
  { id: 'waste', label: 'Merma y desperdicio', kind: 'VARIABLE', percent: 3, enabled: true },
  { id: 'marketing', label: 'Mercadeo y publicidad', kind: 'VARIABLE', percent: 2, enabled: true },
  { id: 'delivery-fee', label: 'Comisión delivery / plataformas', kind: 'VARIABLE', percent: 0, enabled: false },
];
