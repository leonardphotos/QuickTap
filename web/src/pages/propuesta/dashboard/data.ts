// Datos de ejemplo para la propuesta de diseño del Resumen. No tocan la API: la idea es poder
// revisar el layout sin sesión ni backend. Al implementarlo de verdad, cada bloque se alimenta
// de su endpoint actual (/orders/summary/today, /orders/live, etc.).

export const BCV_RATE = 98.45;

export const restaurant = {
  name: 'La Casona Grill',
  plan: 'Plan Premium',
  daysLeft: 12,
  user: 'Leonard',
  role: 'Dueño',
};

export interface Kpi {
  id: string;
  label: string;
  valueUsd: number;
  format: 'money' | 'count';
  deltaPct: number;
  trend: number[];
  hint: string;
}

export const kpis: Kpi[] = [
  {
    id: 'sales',
    label: 'Ventas de hoy',
    valueUsd: 1284.5,
    format: 'money',
    deltaPct: 12.4,
    trend: [180, 240, 210, 320, 410, 380, 520, 610, 700, 860, 980, 1120, 1284],
    hint: 'vs. mismo día semana pasada',
  },
  {
    id: 'orders',
    label: 'Pedidos',
    valueUsd: 86,
    format: 'count',
    deltaPct: 8.1,
    trend: [6, 9, 8, 12, 15, 14, 19, 22, 26, 31, 36, 41, 46],
    hint: '72 cobrados · 14 abiertos',
  },
  {
    id: 'ticket',
    label: 'Ticket promedio',
    valueUsd: 14.94,
    format: 'money',
    deltaPct: 3.9,
    trend: [12, 13, 12.6, 13.4, 13.1, 14, 13.8, 14.2, 14.6, 14.4, 14.9, 15.1, 14.9],
    hint: 'por pedido cobrado',
  },
  {
    id: 'tips',
    label: 'Propinas',
    valueUsd: 96.2,
    format: 'money',
    deltaPct: -4.2,
    trend: [12, 18, 15, 22, 30, 28, 40, 46, 52, 64, 72, 84, 96],
    hint: '7,5 % de las ventas',
  },
];

export interface HourPoint {
  hour: number;
  today: number | null;
  lastWeek: number;
}

// 20:00 es la hora en curso: de ahí en adelante "hoy" todavía no tiene datos.
export const CURRENT_HOUR = 20;

export const hourlySales: HourPoint[] = [
  { hour: 11, today: 42, lastWeek: 38 },
  { hour: 12, today: 118, lastWeek: 96 },
  { hour: 13, today: 196, lastWeek: 174 },
  { hour: 14, today: 154, lastWeek: 162 },
  { hour: 15, today: 62, lastWeek: 70 },
  { hour: 16, today: 48, lastWeek: 44 },
  { hour: 17, today: 74, lastWeek: 66 },
  { hour: 18, today: 132, lastWeek: 118 },
  { hour: 19, today: 238, lastWeek: 204 },
  { hour: 20, today: 220, lastWeek: 246 },
  { hour: 21, today: null, lastWeek: 228 },
  { hour: 22, today: null, lastWeek: 150 },
  { hour: 23, today: null, lastWeek: 72 },
];

export type OrderStatus = 'new' | 'kitchen' | 'ready' | 'onTheWay';
export type OrderChannel = 'table' | 'delivery' | 'whatsapp' | 'takeaway';

export interface LiveOrder {
  id: string;
  code: string;
  channel: OrderChannel;
  where: string;
  items: number;
  totalUsd: number;
  status: OrderStatus;
  minutes: number;
}

export const liveOrders: LiveOrder[] = [
  { id: '1', code: '#1042', channel: 'whatsapp', where: 'Carla M. · Altamira', items: 3, totalUsd: 28.5, status: 'new', minutes: 1 },
  { id: '2', code: '#1041', channel: 'table', where: 'Mesa 7', items: 5, totalUsd: 46, status: 'new', minutes: 3 },
  { id: '3', code: '#1039', channel: 'table', where: 'Mesa 3', items: 4, totalUsd: 32.4, status: 'kitchen', minutes: 14 },
  { id: '4', code: '#1038', channel: 'delivery', where: 'José R. · Chacao', items: 2, totalUsd: 19.9, status: 'kitchen', minutes: 22 },
  { id: '5', code: '#1036', channel: 'takeaway', where: 'Para llevar · Ana', items: 1, totalUsd: 8.5, status: 'ready', minutes: 18 },
  { id: '6', code: '#1034', channel: 'delivery', where: 'Luis P. · Los Palos Grandes', items: 6, totalUsd: 61.2, status: 'onTheWay', minutes: 31 },
];

export const statusMeta: Record<OrderStatus, { label: string; dot: string; chip: string }> = {
  new: { label: 'Nuevos', dot: 'bg-brand-500', chip: 'bg-brand-500/10 text-brand-600' },
  kitchen: { label: 'En cocina', dot: 'bg-amber-500', chip: 'bg-amber-100 text-amber-800' },
  ready: { label: 'Listos', dot: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-800' },
  onTheWay: { label: 'En camino', dot: 'bg-brand-900', chip: 'bg-brand-950/[0.07] text-brand-900' },
};

export const channelMeta: Record<OrderChannel, { label: string; color: string }> = {
  table: { label: 'Mesa', color: 'bg-brand-500' },
  delivery: { label: 'Delivery', color: 'bg-brand-900' },
  whatsapp: { label: 'WhatsApp', color: 'bg-emerald-500' },
  takeaway: { label: 'Para llevar', color: 'bg-amber-400' },
};

export const channelSales: { channel: OrderChannel; usd: number; orders: number }[] = [
  { channel: 'table', usd: 612.4, orders: 38 },
  { channel: 'delivery', usd: 348.2, orders: 21 },
  { channel: 'whatsapp', usd: 236.4, orders: 19 },
  { channel: 'takeaway', usd: 87.5, orders: 8 },
];

export const paymentMethods: { id: string; label: string; usd: number; count: number }[] = [
  { id: 'pm', label: 'Pago móvil', usd: 486.3, count: 31 },
  { id: 'cash', label: 'Efectivo $', usd: 352, count: 22 },
  { id: 'pos', label: 'Punto de venta', usd: 268.7, count: 14 },
  { id: 'zelle', label: 'Zelle', usd: 177.5, count: 5 },
];

export const topProducts: { name: string; category: string; sold: number; usd: number }[] = [
  { name: 'Parrilla mixta para 2', category: 'Parrillas', sold: 18, usd: 414 },
  { name: 'Hamburguesa La Casona', category: 'Hamburguesas', sold: 26, usd: 247 },
  { name: 'Tequeños (12 und.)', category: 'Entradas', sold: 22, usd: 165 },
  { name: 'Limonada de coco', category: 'Bebidas', sold: 41, usd: 143.5 },
  { name: 'Quesillo', category: 'Postres', sold: 15, usd: 67.5 },
];

export type TableState = 'free' | 'busy' | 'bill' | 'reserved';

export const tables: { id: number; state: TableState; minutes?: number; guests?: number }[] = [
  { id: 1, state: 'busy', minutes: 42, guests: 4 },
  { id: 2, state: 'free' },
  { id: 3, state: 'busy', minutes: 18, guests: 2 },
  { id: 4, state: 'bill', minutes: 64, guests: 6 },
  { id: 5, state: 'free' },
  { id: 6, state: 'reserved' },
  { id: 7, state: 'busy', minutes: 5, guests: 3 },
  { id: 8, state: 'free' },
  { id: 9, state: 'busy', minutes: 27, guests: 2 },
  { id: 10, state: 'bill', minutes: 71, guests: 4 },
  { id: 11, state: 'free' },
  { id: 12, state: 'reserved' },
];

export const tableStateMeta: Record<TableState, { label: string; tile: string; legend: string }> = {
  free: { label: 'Libre', tile: 'bg-white border-border text-brand-950/40', legend: 'bg-white border border-border' },
  busy: { label: 'Ocupada', tile: 'bg-brand-500/10 border-brand-500/30 text-brand-900', legend: 'bg-brand-500/30' },
  bill: { label: 'Pide cuenta', tile: 'bg-amber-100 border-amber-300 text-amber-900', legend: 'bg-amber-300' },
  reserved: { label: 'Reservada', tile: 'bg-brand-950/[0.04] border-dashed border-brand-950/25 text-brand-950/60', legend: 'border border-dashed border-brand-950/40' },
};

export interface Alert {
  id: string;
  tone: 'danger' | 'warning' | 'info';
  title: string;
  detail: string;
  action: string;
}

export const alerts: Alert[] = [
  { id: 'stock', tone: 'danger', title: '3 insumos por agotarse', detail: 'Carne molida, pan de hamburguesa y queso de mano', action: 'Ver inventario' },
  { id: 'res', tone: 'warning', title: '2 reservas por confirmar', detail: 'Hoy 20:30 (4 pers.) y 21:00 (6 pers.)', action: 'Revisar' },
  { id: 'kitchen', tone: 'warning', title: 'Pedido #1038 lleva 22 min', detail: 'Supera el tiempo objetivo de cocina (18 min)', action: 'Ver comanda' },
  { id: 'plan', tone: 'info', title: 'Tu plan renueva en 12 días', detail: 'Plan Premium · pago automático desactivado', action: 'Facturación' },
];
