import { Prisma } from '../node_modules/.prisma/relay-client/index.js';
import { relayDb } from './db.js';

/**
 * Descuento de stock al servir un pedido, con el mapa de consumo que precalculó la nube.
 *
 * Es una PROYECCIÓN para que el salón vea qué se está acabando durante un corte — no es la
 * contabilidad definitiva. La nube descuenta de verdad al sincronizar los pedidos, y el
 * siguiente snapshot pisa estos números con los reales. Por eso una diferencia acá nunca se
 * acumula: se corrige sola en la próxima sincronización.
 *
 * El pedido queda marcado (`stockDeductedLocally`) para no descontar dos veces si alguien
 * vuelve a marcarlo servido.
 */

export async function deductStockForOrder(orderId: string): Promise<{ deducted: boolean; items: number }> {
  const db = relayDb();

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { modifiers: true } } },
  });
  if (!order) throw new Error('Pedido no encontrado en el relé.');
  if (order.stockDeductedLocally) return { deducted: false, items: 0 };

  const [productMap, modifierMap] = await Promise.all([
    db.productConsumption.findMany({ where: { restaurantId: order.restaurantId } }),
    db.modifierConsumption.findMany({ where: { restaurantId: order.restaurantId } }),
  ]);

  // Cuánto se consume de cada insumo, sumando todas las líneas del pedido.
  const used = new Map<string, Prisma.Decimal>();
  const add = (inventoryItemId: string, qty: Prisma.Decimal) => {
    used.set(inventoryItemId, (used.get(inventoryItemId) ?? new Prisma.Decimal(0)).add(qty));
  };

  for (const item of order.items) {
    if (item.productId) {
      // Línea de la variante exacta si existe; si no, la del producto sin variante.
      const exact = productMap.filter((c) => c.productId === item.productId && c.variantName === item.variantName);
      const fallback = productMap.filter((c) => c.productId === item.productId && c.variantName === null);
      const lines = exact.length > 0 ? exact : fallback;
      for (const l of lines) {
        add(l.inventoryItemId, l.quantity.mul(item.quantity));
      }
    }
    for (const mod of item.modifiers) {
      if (!mod.modifierId) continue;
      for (const l of modifierMap.filter((c) => c.modifierId === mod.modifierId)) {
        // Escala por las dos cantidades: cuántas veces se eligió el modificador POR cuántas
        // unidades del producto se vendieron — mismo criterio que producción.
        add(l.inventoryItemId, l.quantity.mul(mod.quantity).mul(item.quantity));
      }
    }
  }

  if (used.size === 0) {
    await db.order.update({ where: { id: orderId }, data: { stockDeductedLocally: true } });
    return { deducted: false, items: 0 };
  }

  await db.$transaction(async (tx) => {
    for (const [inventoryItemId, qty] of used) {
      const item = await tx.inventoryItem.findUnique({ where: { id: inventoryItemId } });
      if (!item) continue;
      // Nunca baja de 0, igual que en producción.
      const next = Prisma.Decimal.max(0, item.quantity.sub(qty));
      await tx.inventoryItem.update({ where: { id: inventoryItemId }, data: { quantity: next } });
    }
    await tx.order.update({ where: { id: orderId }, data: { stockDeductedLocally: true } });
  });

  return { deducted: true, items: used.size };
}

/** Insumos con su stock local, para que el salón vea qué se está acabando. */
export async function listInventory(restaurantId: string) {
  const db = relayDb();
  const items = await db.inventoryItem.findMany({
    where: { restaurantId },
    orderBy: { name: 'asc' },
  });
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    quantity: i.quantity.toString(),
    minQuantity: i.minQuantity.toString(),
    // Mismo criterio que la pantalla de Inventario: agotado manda sobre "por agotarse".
    status: i.quantity.lte(0) ? 'OUT' : i.quantity.lt(i.minQuantity) ? 'LOW' : 'OK',
  }));
}
