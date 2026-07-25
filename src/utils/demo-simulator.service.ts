import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { toDecimal } from './money';
import { DEMO_SLUG } from './seed-demo-restaurant';
import { orderService } from '../modules/orders/order.service';

/**
 * Entorno Demo Efímero → "movimiento en vivo": genera pedidos y consume
 * inventario del restaurante demo periódicamente (ver server.ts, dos
 * setInterval que llaman a tickOrder/tickInventory), para que quien esté
 * viendo el panel vea actividad real sin tener que operarlo él mismo.
 * Solo aplica al restaurante demo principal (no a sus sucursales) — se
 * busca fresco por slug en cada tick porque el reset borra y recrea el
 * restaurante (su id cambia).
 */

const CUSTOMER_NAMES = [
  'María González', 'Carlos Pérez', 'Ana Rodríguez', 'Luis Fernández', 'Valentina Torres',
  'José Ramírez', 'Camila Díaz', 'Andrés Silva', 'Isabella Castro', 'Miguel Ángel Rojas',
];
const DELIVERY_ADDRESSES = [
  'Av. Francisco de Miranda, Chacao', 'Calle Los Cedros, Las Mercedes', 'Av. Libertador, El Rosal',
  'Urb. La Trinidad, Caracas', 'Av. Principal de Los Palos Grandes',
];
const CHANNEL_CYCLE = ['DINE_IN', 'BAR', 'DELIVERY', 'PICKUP', 'KIOSK'] as const;
let cycleIndex = 0;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}
function pickMany<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

async function getDemoRestaurant() {
  return prisma.restaurant.findFirst({ where: { slug: DEMO_SLUG, isDemo: true } });
}

/** Avanza el pedido activo más viejo un paso en su flujo (pago -> cocina -> listo). */
async function advanceOldestOrder(restaurantId: string): Promise<boolean> {
  const order = await prisma.order.findFirst({
    where: { restaurantId, status: { in: ['NEEDS_PAYMENT', 'PENDING', 'KITCHEN'] } },
    orderBy: { createdAt: 'asc' },
  });
  if (!order) return false;

  try {
    if (order.status === 'NEEDS_PAYMENT') {
      await orderService.addPayment(restaurantId, order.id, { amountBase: Number(order.totalBase), method: 'CASH' });
    } else if (order.status === 'PENDING') {
      await orderService.updateStatus(restaurantId, order.id, 'KITCHEN');
    } else {
      await orderService.updateStatus(restaurantId, order.id, 'SERVED');
    }
    return true;
  } catch {
    return false;
  }
}

/** Crea un pedido nuevo, rotando el canal (mesa/barra/delivery/pickup/autoservicio). */
async function createSimulatedOrder(restaurantId: string): Promise<void> {
  const channel = CHANNEL_CYCLE[cycleIndex % CHANNEL_CYCLE.length];
  cycleIndex += 1;

  const [products, users] = await Promise.all([
    prisma.product.findMany({
      where: { restaurantId, isAvailable: true },
      select: { id: true, variants: { select: { id: true } } },
    }),
    prisma.user.findMany({ where: { restaurantId }, select: { id: true, role: true } }),
  ]);
  if (products.length === 0) return;

  const items = pickMany(products, randomInt(1, 3)).map((p) => ({
    productId: p.id,
    quantity: randomInt(1, 2),
    variantId: p.variants.length > 0 ? pick(p.variants).id : undefined,
    modifierIds: [] as string[],
  }));
  const byRole = (role: string) => users.find((u) => u.role === role);

  try {
    if (channel === 'DINE_IN' || channel === 'KIOSK') {
      const tables = await prisma.table.findMany({ where: { restaurantId, isActive: true } });
      if (tables.length === 0) return;
      const table = pick(tables);
      if (channel === 'KIOSK') {
        const comanda = byRole('COMANDA');
        if (!comanda) return;
        await orderService.createManualOrder(restaurantId, { channel: 'DINE_IN', tableId: table.id, items }, comanda.id, 'COMANDA');
      } else {
        const waiter = byRole('WAITER');
        if (!waiter) return;
        await orderService.createManualOrder(restaurantId, { channel: 'DINE_IN', tableId: table.id, items }, waiter.id, 'WAITER');
      }
      return;
    }

    const cashier = byRole('CASHIER') ?? byRole('ADMIN');
    if (!cashier) return;

    if (channel === 'BAR') {
      await orderService.createManualOrder(
        restaurantId,
        { channel: 'BAR', items, customerName: pick(CUSTOMER_NAMES) },
        cashier.id,
        cashier.role,
      );
      return;
    }

    if (channel === 'DELIVERY') {
      const order = await orderService.createManualOrder(
        restaurantId,
        {
          channel: 'DELIVERY',
          items,
          customerName: pick(CUSTOMER_NAMES),
          customerPhone: `0414${randomInt(1000000, 9999999)}`,
          customerAddress: pick(DELIVERY_ADDRESSES),
        },
        cashier.id,
        cashier.role,
      );
      const couriers = await prisma.deliveryCourier.findMany({ where: { restaurantId } });
      if (couriers.length > 0 && order?.id) {
        await orderService.dispatchToCourier(restaurantId, order.id, pick(couriers).id).catch(() => undefined);
      }
      return;
    }

    // PICKUP
    await orderService.createManualOrder(
      restaurantId,
      { channel: 'PICKUP', items, customerName: pick(CUSTOMER_NAMES), customerPhone: `0414${randomInt(1000000, 9999999)}` },
      cashier.id,
      cashier.role,
    );
  } catch {
    // Se reintenta en el próximo tick (ej. restaurante recién reseteado, catálogo aún cargando).
  }
}

export const demoSimulatorService = {
  /** Cada 20s (ver server.ts): 50% avanza el pedido más viejo, 50% crea uno nuevo. */
  async tickOrder(): Promise<void> {
    const restaurant = await getDemoRestaurant();
    if (!restaurant) return;

    if (Math.random() < 0.5 && (await advanceOldestOrder(restaurant.id))) return;
    await createSimulatedOrder(restaurant.id);
  },

  /** Cada 6s (ver server.ts): consume un poco de un insumo al azar; repone si queda muy bajo. */
  async tickInventory(): Promise<void> {
    const restaurant = await getDemoRestaurant();
    if (!restaurant) return;

    const items = await prisma.inventoryItem.findMany({ where: { restaurantId: restaurant.id } });
    if (items.length === 0) return;

    const item = pick(items);
    const delta = toDecimal(item.minQuantity).mul(randomInt(1, 6)).div(100);
    const newQuantity = Prisma.Decimal.max(0, item.quantity.sub(delta));

    if (newQuantity.lt(item.minQuantity.mul(0.15)) && Math.random() < 0.3) {
      await prisma.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: item.minQuantity.mul(randomInt(120, 200)).div(100) },
      });
    } else {
      await prisma.inventoryItem.update({ where: { id: item.id }, data: { quantity: newQuantity } });
    }
  },
};
