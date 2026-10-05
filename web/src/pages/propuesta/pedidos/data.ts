export type OrderStatus = 'new' | 'kitchen' | 'ready' | 'paid';
export type OrderChannel = 'Mesa' | 'Delivery' | 'Pickup' | 'Barra';

export interface ProposalOrder {
  id: string;
  customer: string;
  table: string;
  channel: OrderChannel;
  status: OrderStatus;
  time: string;
  items: string[];
  total: string;
  initials: string;
}

export const proposalOrders: ProposalOrder[] = [
  { id: '#1048', customer: 'María González', table: 'Mesa 12', channel: 'Mesa', status: 'new', time: 'Hace 2 min', items: ['2 Hamburguesas clásicas', '1 Papas trufadas'], total: 'USD 28,50', initials: 'MG' },
  { id: '#1047', customer: 'Carlos Rivas', table: 'Delivery', channel: 'Delivery', status: 'kitchen', time: 'Hace 8 min', items: ['Pizza Diavola', '2 Refrescos'], total: 'USD 22,00', initials: 'CR' },
  { id: '#1046', customer: 'Ana Pérez', table: 'Mesa 4', channel: 'Mesa', status: 'ready', time: 'Hace 12 min', items: ['Pasta Alfredo', 'Agua mineral'], total: 'USD 16,75', initials: 'AP' },
  { id: '#1045', customer: 'Luis Moreno', table: 'Pickup', channel: 'Pickup', status: 'paid', time: 'Hace 18 min', items: ['2 Bowls de pollo', 'Té frío'], total: 'USD 31,00', initials: 'LM' },
  { id: '#1044', customer: 'Sofía Díaz', table: 'Barra', channel: 'Barra', status: 'kitchen', time: 'Hace 21 min', items: ['Cheesecake', 'Café latte'], total: 'USD 11,50', initials: 'SD' },
  { id: '#1043', customer: 'Diego Torres', table: 'Mesa 8', channel: 'Mesa', status: 'paid', time: 'Hace 29 min', items: ['Steak sandwich', 'Papas clásicas'], total: 'USD 24,00', initials: 'DT' },
];

export const statusMeta: Record<OrderStatus, { label: string; tone: string }> = {
  new: { label: 'Nuevo', tone: 'new' }, kitchen: { label: 'En cocina', tone: 'kitchen' }, ready: { label: 'Listo para entregar', tone: 'ready' }, paid: { label: 'Pagado', tone: 'paid' },
};

export const channelMeta: Record<OrderChannel, string> = { Mesa: 'Mesa', Delivery: 'Delivery', Pickup: 'Pickup', Barra: 'Barra' };
export const orderStats = [
  { label: 'Pedidos activos', value: '18', detail: '+4 desde ayer', tone: 'blue' },
  { label: 'Por preparar', value: '07', detail: 'Tiempo medio 14 min', tone: 'amber' },
  { label: 'Listos para entregar', value: '05', detail: 'Todo bajo control', tone: 'green' },
  { label: 'Ventas de hoy', value: 'USD 486', detail: '+12,4% vs. ayer', tone: 'navy' },
];

export const orderTabs = ['Todos', 'Nuevos', 'En cocina', 'Listos', 'Pagados'] as const;
export type OrderTab = typeof orderTabs[number];
export const tabStatus: Record<Exclude<OrderTab, 'Todos'>, OrderStatus> = { Nuevos: 'new', 'En cocina': 'kitchen', Listos: 'ready', Pagados: 'paid' };
