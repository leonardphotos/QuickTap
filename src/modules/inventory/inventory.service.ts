import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { notFound } from '../../utils/http-error';
import { bsToBase, round2, toDecimal } from '../../utils/money';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import { emitToKitchen, SocketEvents } from '../../sockets';
import { caracasPartsOf } from '../../utils/timezone';
import { CreateInventoryItemInput, InventoryAlertsQuery, UpdateInventoryItemInput } from './inventory.dto';
import { inventoryCategoryService } from './inventory-category.service';
import { effectiveInventoryRestaurantId } from './inventory-scope';

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
    const rate = await exchangeRateService.getRate(restaurant!.baseCurrency, restaurantId);
    priceBase = bsToBase(price, rate.rateBs);
  }
  return priceBase.div(quantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}


/** Suma días a una fecha "YYYY-MM-DD" sin salir del calendario (nada de husos). */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** Días que faltan para `dateStr` desde hoy (negativo = ya venció). */
function daysUntil(today: string, dateStr: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(dateStr) - toUtc(today)) / 86_400_000);
}

/** Insumos de inventario (solo plan Premium). Aislado por restaurantId como el resto del
 * dominio, salvo que el grupo (sede principal + sucursales) tenga inventoryMode = "SHARED"
 * (ver inventory-scope.ts) o el scope pedido sea "CASA_MATRIZ" — en ambos casos el
 * restaurantId "efectivo" puede no ser el de la sesión actual. */
export const inventoryService = {
  async list(restaurantId: string, parentRestaurantId: string | null | undefined, locationScope: 'LOCAL' | 'CASA_MATRIZ') {
    const effectiveId = await effectiveInventoryRestaurantId(restaurantId, parentRestaurantId, locationScope);
    return prisma.inventoryItem.findMany({
      where: { restaurantId: effectiveId, locationScope },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  },

  /** Insumos marcados como envase (packagingType no nulo) — para el picker del formulario
   * de productos ("Vincular con stock"). Siempre scope LOCAL: un producto nunca vive en
   * Casa Matriz. */
  async listPackaging(restaurantId: string, parentRestaurantId: string | null | undefined) {
    const effectiveId = await effectiveInventoryRestaurantId(restaurantId, parentRestaurantId, 'LOCAL');
    return prisma.inventoryItem.findMany({
      where: { restaurantId: effectiveId, locationScope: 'LOCAL', packagingType: { not: null } },
      orderBy: [{ packagingType: 'asc' }, { name: 'asc' }],
    });
  },

  async create(restaurantId: string, parentRestaurantId: string | null | undefined, input: CreateInventoryItemInput) {
    const effectiveId = await effectiveInventoryRestaurantId(restaurantId, parentRestaurantId, input.locationScope ?? 'LOCAL');
    if (input.categoryId) await inventoryCategoryService.assertBelongs(effectiveId, input.categoryId);
    const { price, priceCurrency, salePrice, ...rest } = input;
    const pricePerUnitBase = await resolvePricePerUnit(effectiveId, price, priceCurrency, input.quantity);
    return prisma.inventoryItem.create({
      data: {
        restaurantId: effectiveId,
        ...rest,
        ...(pricePerUnitBase !== undefined ? { pricePerUnitBase } : {}),
        ...(salePrice !== undefined ? { salePriceBase: salePrice } : {}),
      },
    });
  },

  async update(
    restaurantId: string,
    parentRestaurantId: string | null | undefined,
    id: string,
    input: UpdateInventoryItemInput,
  ) {
    // El scope del insumo ya existente manda para resolver el restaurantId efectivo — el
    // body puede traer locationScope si se está reasignando (caso raro, no expuesto en la UI).
    const probe = await prisma.inventoryItem.findUnique({ where: { id }, select: { restaurantId: true, locationScope: true } });
    if (!probe) throw notFound('Insumo no encontrado.');
    const scope = (input.locationScope ?? probe.locationScope) as 'LOCAL' | 'CASA_MATRIZ';
    const effectiveId = await effectiveInventoryRestaurantId(restaurantId, parentRestaurantId, scope);

    const existing = await prisma.inventoryItem.findFirst({ where: { id, restaurantId: effectiveId } });
    if (!existing) throw notFound('Insumo no encontrado.');
    if (input.categoryId) await inventoryCategoryService.assertBelongs(effectiveId, input.categoryId);
    const { price, priceCurrency, salePrice, ...rest } = input;
    const quantityForPricing = input.quantity ?? Number(existing.quantity);
    const pricePerUnitBase = await resolvePricePerUnit(effectiveId, price, priceCurrency, quantityForPricing);

    // Si el proveedor cambió el precio del insumo, el costo de cada receta que lo usa se
    // recalcula automáticamente (costBase = nuevo precio por unidad * cantidad de la receta).
    const priceChanged = pricePerUnitBase !== undefined && !pricePerUnitBase.equals(existing.pricePerUnitBase ?? 0);

    const item = await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.update({
        where: { id },
        data: {
          ...rest,
          ...(pricePerUnitBase !== undefined ? { pricePerUnitBase } : {}),
          ...(salePrice !== undefined ? { salePriceBase: salePrice } : {}),
        },
      });

      if (priceChanged) {
        const lines = await tx.recipeIngredient.findMany({ where: { restaurantId: effectiveId, inventoryItemId: id } });
        for (const line of lines) {
          const costBase = round2(pricePerUnitBase!.mul(line.quantity));
          await tx.recipeIngredient.update({ where: { id: line.id }, data: { costBase } });
        }
      }

      return item;
    });

    // Cambió el stock a mano (no solo precio/nombre): recalcula el aviso de "se está agotando".
    if ('quantity' in input) {
      emitToKitchen(effectiveId, SocketEvents.INVENTORY_LOW_STOCK, {});
    }

    return item;
  },


  /**
   * Alertas de inventario: lo que está por vencerse y lo que está por agotarse,
   * mezclando insumos y productos en una sola respuesta.
   *
   * Se calcula acá y no en el cliente porque la pestaña de Insumos no tiene
   * cargados los productos (ni al revés), y porque comparar fechas "YYYY-MM-DD"
   * contra el hoy de Caracas es justo el tipo de cosa que se rompe en el
   * navegador de un dispositivo con otro huso horario.
   */
  async alerts(
    restaurantId: string,
    parentRestaurantId: string | null | undefined,
    query: InventoryAlertsQuery,
  ) {
    const effectiveId = await effectiveInventoryRestaurantId(restaurantId, parentRestaurantId, query.locationScope);
    const today = caracasPartsOf(new Date()).dateStr;
    const limit = addDays(today, query.days);

    const [items, products] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: { restaurantId: effectiveId, locationScope: query.locationScope },
        include: { category: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      // Los productos son siempre de la sede en sesión (no se comparten entre
      // sedes como los insumos), y en la ventana de Casa Matriz no existen.
      query.locationScope === 'LOCAL'
        ? prisma.product.findMany({
            where: { restaurantId },
            include: { category: { select: { name: true } } },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([]),
    ]);

    const expiring = [
      ...items
        .filter((i) => i.expiryDate && i.expiryDate <= limit)
        .map((i) => ({
          kind: 'INSUMO' as const,
          id: i.id,
          name: i.name,
          categoryName: i.category?.name ?? null,
          photoUrl: i.photoUrl,
          expiryDate: i.expiryDate!,
          daysLeft: daysUntil(today, i.expiryDate!),
          quantity: i.quantity.toString(),
          unit: i.unit,
        })),
      ...products
        .filter((p) => p.expiryDate && p.expiryDate <= limit)
        .map((p) => ({
          kind: 'PRODUCTO' as const,
          id: p.id,
          name: p.name,
          categoryName: p.category?.name ?? null,
          photoUrl: p.photoUrl,
          expiryDate: p.expiryDate!,
          daysLeft: daysUntil(today, p.expiryDate!),
          quantity: p.stockControlEnabled ? String(p.stockQuantity ?? 0) : null,
          unit: 'unidad',
        })),
    ].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.name.localeCompare(b.name));

    const lowStock = [
      ...items
        .map((i) => {
          const qty = Number(i.quantity);
          const min = Number(i.minQuantity);
          // Agotado manda sobre "por agotarse" aunque no haya mínimo cargado.
          const status = qty <= 0 ? ('OUT' as const) : qty < min ? ('LOW' as const) : null;
          if (!status) return null;
          return {
            kind: 'INSUMO' as const,
            id: i.id,
            name: i.name,
            categoryName: i.category?.name ?? null,
            photoUrl: i.photoUrl,
            status,
            quantity: i.quantity.toString(),
            minQuantity: i.minQuantity.toString(),
            unit: i.unit,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
      ...products
        .map((p) => {
          // Sin control de stock no hay nada que avisar: el producto siempre está.
          if (!p.stockControlEnabled) return null;
          const qty = p.stockQuantity ?? 0;
          const min = p.stockMinQuantity ?? 0;
          const status = qty <= 0 ? ('OUT' as const) : min > 0 && qty <= min ? ('LOW' as const) : null;
          if (!status) return null;
          return {
            kind: 'PRODUCTO' as const,
            id: p.id,
            name: p.name,
            categoryName: p.category?.name ?? null,
            photoUrl: p.photoUrl,
            status,
            quantity: String(qty),
            minQuantity: String(min),
            unit: 'unidad',
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    ].sort(
      (a, b) =>
        // Primero lo que ya no queda, después lo que está por acabarse.
        (a.status === b.status ? 0 : a.status === 'OUT' ? -1 : 1) || a.name.localeCompare(b.name),
    );

    return { today, days: query.days, expiring, lowStock };
  },

  async remove(restaurantId: string, parentRestaurantId: string | null | undefined, id: string) {
    const probe = await prisma.inventoryItem.findUnique({ where: { id }, select: { locationScope: true } });
    if (!probe) throw notFound('Insumo no encontrado.');
    const effectiveId = await effectiveInventoryRestaurantId(
      restaurantId,
      parentRestaurantId,
      probe.locationScope as 'LOCAL' | 'CASA_MATRIZ',
    );
    const existing = await prisma.inventoryItem.findFirst({ where: { id, restaurantId: effectiveId } });
    if (!existing) throw notFound('Insumo no encontrado.');
    await prisma.inventoryItem.delete({ where: { id } });
    return { deleted: true };
  },

  /** Borrado masivo: cada insumo puede tener un locationScope distinto (LOCAL/CASA_MATRIZ),
   * así que se resuelve el restaurantId efectivo por insumo antes de borrar — no se puede
   * hacer un deleteMany directo por restaurantId como en otros módulos. */
  async bulkRemove(restaurantId: string, parentRestaurantId: string | null | undefined, ids: string[]) {
    const items = await prisma.inventoryItem.findMany({
      where: { id: { in: ids } },
      select: { id: true, restaurantId: true, locationScope: true },
    });
    const ownedIds: string[] = [];
    for (const item of items) {
      const effectiveId = await effectiveInventoryRestaurantId(
        restaurantId,
        parentRestaurantId,
        item.locationScope as 'LOCAL' | 'CASA_MATRIZ',
      );
      if (item.restaurantId === effectiveId) ownedIds.push(item.id);
    }
    if (ownedIds.length > 0) {
      await prisma.inventoryItem.deleteMany({ where: { id: { in: ownedIds } } });
    }
    return { deleted: ownedIds.length };
  },

  /** Botón "Imprimir lista de insumos": envía la lista completa (con cantidad disponible) a la
   * estación de impresión, para saber qué falta comprar. Siempre los insumos LOCAL de la sede
   * que imprime (Casa Matriz no tiene estación de impresión propia). */
  async printList(restaurantId: string, parentRestaurantId: string | null | undefined) {
    const effectiveId = await effectiveInventoryRestaurantId(restaurantId, parentRestaurantId, 'LOCAL');
    const [items, restaurant] = await Promise.all([
      prisma.inventoryItem.findMany({ where: { restaurantId: effectiveId, locationScope: 'LOCAL' }, orderBy: { name: 'asc' } }),
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
