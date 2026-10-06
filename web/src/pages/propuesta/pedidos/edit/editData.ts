import type { Channel } from '../../pedido/data';
import type { OrderChannel } from '../data';

export type SentState = 'preparing' | 'served';

export interface SentLine {
  key: string;
  productId: string;
  quantity: number;
  state: SentState;
  note?: string;
  voided?: boolean;
}

export const SENT_BY_ORDER: Record<string, SentLine[]> = {
  '#1048': [
    { key: 's1', productId: 'p1', quantity: 2, state: 'preparing', note: 'Una sin cebolla' },
    { key: 's2', productId: 'p9', quantity: 1, state: 'preparing' },
  ],
  '#1047': [
    { key: 's1', productId: 'p6', quantity: 1, state: 'preparing' },
    { key: 's2', productId: 'p12', quantity: 2, state: 'served' },
  ],
  '#1046': [
    { key: 's1', productId: 'p5', quantity: 1, state: 'served' },
    { key: 's2', productId: 'p14', quantity: 1, state: 'served' },
    { key: 's3', productId: 'p8', quantity: 1, state: 'served' },
  ],
  '#1045': [
    { key: 's1', productId: 'p3', quantity: 2, state: 'served' },
    { key: 's2', productId: 'p11', quantity: 1, state: 'served' },
  ],
  '#1044': [
    { key: 's1', productId: 'p15', quantity: 1, state: 'preparing' },
    { key: 's2', productId: 'p13', quantity: 1, state: 'served' },
  ],
  '#1043': [
    { key: 's1', productId: 'p2', quantity: 1, state: 'served' },
    { key: 's2', productId: 'p9', quantity: 1, state: 'served' },
  ],
};

/** Abonos ya registrados en USD; `'full'` = pedido cobrado por completo. */
export const PAID_BY_ORDER: Record<string, number | 'full'> = {
  '#1046': 10,
  '#1045': 'full',
  '#1043': 'full',
};

export const CHANNEL_FROM_ORDER: Record<OrderChannel, Channel> = {
  Mesa: 'DINE_IN',
  Delivery: 'DELIVERY',
  Pickup: 'PICKUP',
  Barra: 'BAR',
};

export const CHANNEL_OPTIONS: { value: Channel; label: string }[] = [
  { value: 'DINE_IN', label: 'Mesa' },
  { value: 'EXPRESS', label: 'Express' },
  { value: 'BAR', label: 'Barra' },
  { value: 'DELIVERY', label: 'Delivery' },
  { value: 'PICKUP', label: 'Pick-up' },
];
