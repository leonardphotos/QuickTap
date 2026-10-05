

export type IncomeCategory = 'TIP' | 'DEBT' | 'OTHER';


export const INCOME_CATEGORY_LABELS: Record<IncomeCategory, string> = {
  TIP: 'Propina',
  DEBT: 'Deuda',
  OTHER: 'Otro',
};
