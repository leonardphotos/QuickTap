

export type ExpenseCategory =
  | 'UTILITIES'
  | 'SUPPLIES'
  | 'RENT'
  | 'PAYROLL'
  | 'ADMINISTRATIVE'
  | 'MARKETING'
  | 'TRANSPORT'
  | 'MAINTENANCE'
  | 'FURNITURE'
  | 'FUEL'
  | 'TRAVEL'
  | 'MEALS'
  | 'LODGING'
  | 'OTHER';


export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  UTILITIES: 'Servicios públicos',
  SUPPLIES: 'Compra de producto e insumos',
  RENT: 'Arriendo',
  PAYROLL: 'Nómina',
  ADMINISTRATIVE: 'Gastos administrativos',
  MARKETING: 'Mercadeo y Publicidad',
  TRANSPORT: 'Transporte (fletes, taxis)',
  MAINTENANCE: 'Mantenimiento',
  FURNITURE: 'Muebles',
  FUEL: 'Combustible / gasolina',
  TRAVEL: 'Viáticos y viajes',
  MEALS: 'Comidas',
  LODGING: 'Hospedaje / hotel',
  OTHER: 'Otros',
};


export type ExpenseDocumentType = 'FISCAL_INVOICE' | 'DELIVERY_NOTE';


export const DOCUMENT_TYPE_LABELS: Record<ExpenseDocumentType, string> = {
  FISCAL_INVOICE: 'Factura fiscal',
  DELIVERY_NOTE: 'Nota de entrega',
};
