

// -----------------------------------------------------------------------------
//  Historial de pedidos — compartido por Administración → Historial y por
//  Delivery → Historial (mismos filtros, métricas, exportación y detalle).
// -----------------------------------------------------------------------------

export type Range = 'day' | 'week' | 'month' | 'year' | 'all';

export type Channel = 'DINE_IN' | 'DELIVERY' | 'PICKUP' | 'BAR' | 'EXPRESS';

export type HistoryPaymentMethod = 'MOBILE_PAYMENT' | 'ZELLE' | 'CASH' | 'CARD';


export const RANGE_LABELS: Record<Range, string> = {
  day: 'Hoy',
  week: 'Semana',
  month: 'Este mes',
  year: 'Este año',
  all: 'Todo',
};

export const CHANNEL_ROW_LABELS: Record<Channel, string> = {
  DINE_IN: 'Mesa',
  DELIVERY: 'Delivery',
  PICKUP: 'Pickup',
  BAR: 'Barra',
  EXPRESS: 'Express',
};

export const HISTORY_PAYMENT_LABELS: Record<HistoryPaymentMethod, string> = {
  MOBILE_PAYMENT: 'Pago Móvil',
  ZELLE: 'Zelle',
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
};
