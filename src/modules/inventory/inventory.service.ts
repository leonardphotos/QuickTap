import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { notFound } from '../../utils/http-error';
import { bsToBase, round2, toDecimal } from '../../utils/money';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import { emitToKitchen, SocketEvents } from '../../sockets';
import { CreateInventoryItemInput, UpdateInventoryItemInput } from './inventory.dto';

/**
 * Calcula el costo por unidad (kg/lt/unidad) a partir del costo de la
 * cantidad cargada. Ej: 5 kg costaron 15000 Bs -> 3000 Bs/kg -> convertido a
 * la moneda base del restaurante con la tasa BCV vigente.
 */
async function resolvePricePerUnit(
  restaurantId: string,
  price: number | undefined,
  priceCurrency: 'BASE' | 'BS' | undefined,
  quantity: number | undefined,
) {
  if (price == null || !quantity || quantity <= 0) return undefined;
  let priceBase = toDecimal(price);
  if (priceCurrency === 'BS') {
    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { baseCurrency: true } });
    const rate = await exchangeRateService.getRate(restaurant!.baseCurrency);
    priceBase = bsToBase(price, rate.rateBs);
  }
  return priceBase.div(quantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

/** Insumos de inventario (solo plan Premium). Aislado por restaurantId como el resto del dominio. */
export const inventoryService = {
  async list(restaurantId: string) {
    return prisma.inventoryItem.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
    });
  },

  async create(restaurantId: string, input: CreateInventoryItemInput) {
    const { price, priceCurrency, ...rest } = input;
    const pricePerUnitBase = await resolvePricePerUnit(restaurantId, price, priceCurrency, input.quantity);
    return prisma.inventoryItem.create({
      data: { restaurantId, ...rest, ...(pricePerUnitBase !== undefined ? { pricePerUnitBase } : {}) },
    });
  },

  async update(restaurantId: string, id: string, input: UpdateInventoryItemInput) {
    const existing = await prisma.inventoryItem.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Insumo no encontrado.');
    const { price, priceCurrency, ...rest } = input;
    const quantityForPricing = input.quantity ?? Number(existing.quantity);
    const pricePerUnitBase = await resolvePricePerUnit(restaurantId, price, priceCurrency, quantityForPricing);

    // Si el proveedor cambió el precio del insumo, el costo de cada receta que lo usa se
    // recalcula automáticamente (costBase = nuevo precio por unidad * cantidad de la receta).
    const priceChanged = pricePerUnitBase !== undefined && !pricePerUnitBase.equals(existing.pricePerUnitBase ?? 0);

    const item = await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.update({
        where: { id },
        data: { ...rest, ...(pricePerUnitBase !== undefined ? { pricePerUnitBase } : {}) },
      });

      if (priceChanged) {
        const lines = await tx.recipeIngredient.findMany({ where: { restaurantId, inventoryItemId: id } });
        for (const line of lines) {
          const costBase = round2(pricePerUnitBase!.mul(line.quantity));
          await tx.recipeIngredient.update({ where: { id: line.id }, data: { costBase } });
        }
      }

      return item;
    });

    // Cambió el stock a mano (no solo precio/nombre): recalcula el aviso de "se está agotando".
    if ('quantity' in input) {
      emitToKitchen(restaurantId, SocketEvents.INVENTORY_LOW_STOCK, {});
    }

    return item;
  },

  async remove(restaurantId: string, id: string) {
    const existing = await prisma.inventoryItem.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Insumo no encontrado.');
    await prisma.inventoryItem.delete({ where: { id } });
    return { deleted: true };
  },

  /** Botón "Imprimir lista de insumos": envía la lista completa (con cantidad disponible) a la
   * estación de impresión, para saber qué falta comprar. */
  async printList(restaurantId: string) {
    const [items, restaurant] = await Promise.all([
      prisma.inventoryItem.findMany({ where: { restaurantId }, orderBy: { name: 'asc' } }),
      prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
    ]);

    emitToKitchen(restaurantId, SocketEvents.PRINT_REQUEST, {
      type: 'insumos',
      restaurantName: restaurant?.name ?? '',
      items: items.map((i) => ({
        name: i.name,
        quantity: i.quantity.toFixed(2),
        unit: i.unit,
        low: Number(i.quantity) < Number(i.minQuantity),
      })),
    });

    return { sent: true };
  },
};
