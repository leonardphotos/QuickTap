/**
 * Espejo 1:1 de src/utils/cost-structure.ts (backend) para que la calculadora de
 * Administración → Estructura de costo responda en vivo sin ir al servidor. El servidor
 * vuelve a correr la misma aritmética al guardar; si cambias una fórmula acá, cámbiala allá.
 *
 *   materia prima  = Σ cantidad × costo unitario
 *   variables      = precio × Σ % variables habilitados
 *   fijos          = precio × Σ % fijos habilitados
 *   costo total    = MP + variables + fijos
 *   utilidad neta  = precio − costo total
 *   precio sugerido para utilidad T = MP / (1 − (var% + fijo% + T%)/100)
 */

export type CostItemKind = 'FIXED' | 'VARIABLE';

export interface CostStructureItem {
  id: string;
  label: string;
  kind: CostItemKind;
  percent: number;
  enabled: boolean;
}

export interface MaterialLine {
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
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
  suggestedPrice: number | null;
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
