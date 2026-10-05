/** Oferta 2026-09. Los identificadores anteriores conservan sus permisos históricos. */
export const COMMERCIAL_PLANS = {
  ESSENTIAL: { name: 'Esencial', monthly: 24.99, outcome: 'Recibe y organiza tus pedidos.', users: 3, tables: 15, products: 100, kitchens: 1, sites: 1 },
  OPERATIONS: { name: 'Operación', monthly: 39.99, outcome: 'Maneja el local completo.', users: 8, tables: 40, products: 300, kitchens: null, sites: 1 },
  CONTROL: { name: 'Control', monthly: 59.99, outcome: 'Conoce y controla toda tu operación.', users: 15, tables: null, products: null, kitchens: null, sites: 2 },
} as const;
export type CommercialPlan = keyof typeof COMMERCIAL_PLANS;
export const isCommercialPlan = (plan?: string | null): plan is CommercialPlan =>
  !!plan && Object.prototype.hasOwnProperty.call(COMMERCIAL_PLANS, plan);
export function commercialTerms(plan: CommercialPlan) {
  return { version: '2026-09', currency: 'EUR', plan, monthlyPrice: COMMERCIAL_PLANS[plan].monthly, limits: COMMERCIAL_PLANS[plan], inherited: false };
}

