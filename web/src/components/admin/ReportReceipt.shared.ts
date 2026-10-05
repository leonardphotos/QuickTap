

export type ReportKind = 'general' | 'products' | 'delivery' | 'payments' | 'history';


export const REPORT_AREA_LABELS: Record<ReportKind, string> = {
  general: 'General',
  products: 'Productos',
  delivery: 'Delivery',
  payments: 'Métodos de pago',
  history: 'Historial de pedidos',
};
