import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import type {
  CreateShopProductInput,
  UpdateShopProductInput,
  CreateShopSaleInput,
  CreateShopPurchaseInput,
  CreateShopAdjustmentInput,
  OpenShopTillInput,
  CloseShopTillInput,
  SetShopServiceSuppliesInput,
} from './shop.dto';

/**
 * Persistencia de QuickTap Shop (businessType = SHOP): catálogo, ventas, compras, ajustes de
 * stock, caja y categorías — contraparte de web/src/pages/admin/shop/shopSession.ts. Cada
 * mutación del hook de frontend dispara una llamada aquí; el frontend mantiene su propio
 * estado local optimista y reconcilia con lo que devuelve el servidor (ver shopSession.ts).
 */

/**
 * Aplica (o revierte) el consumo de insumos de los servicios de un ticket.
 *
 * `sign` = -1 al vender (descuenta) y +1 al devolver (repone), para que ambos caminos usen
 * exactamente el mismo cálculo y no puedan desalinearse. Es best-effort: si un insumo ya no
 * existe, la venta se registra igual — nunca se bloquea un cobro por el inventario. El stock
 * nunca queda negativo.
 */
async function applySupplyConsumption(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  items: { productId?: string | null; qty: number }[],
  sign: 1 | -1,
) {
  const serviceIds = [...new Set(items.map((it) => it.productId).filter((v): v is string => !!v))];
  if (serviceIds.length === 0) return;

  const recipes = await tx.shopServiceSupply.findMany({
    where: { restaurantId, serviceProductId: { in: serviceIds } },
  });
  if (recipes.length === 0) return;

  // Cuántas veces se vendió cada servicio en este ticket (sumando líneas repetidas — el mismo
  // corte puede aparecer dos veces, con barberos distintos).
  const soldByService = new Map<string, number>();
  for (const it of items) {
    if (!it.productId) continue;
    soldByService.set(it.productId, (soldByService.get(it.productId) ?? 0) + it.qty);
  }

  // Consumo total por insumo+variante, acumulando todos los servicios del ticket.
  const usedByVariant = new Map<string, { productId: string; v1: string; v2: string; qty: number }>();
  for (const line of recipes) {
    const sold = soldByService.get(line.serviceProductId) ?? 0;
    if (sold <= 0) continue;
    const key = `${line.supplyProductId}|${line.supplyV1}|${line.supplyV2}`;
    const prev = usedByVariant.get(key);
    const qty = (prev?.qty ?? 0) + line.quantity * sold;
    usedByVariant.set(key, { productId: line.supplyProductId, v1: line.supplyV1, v2: line.supplyV2, qty });
  }

  for (const u of usedByVariant.values()) {
    await tx.shopProductVariant.updateMany({
      where: { productId: u.productId, v1: u.v1, v2: u.v2 },
      data: { stock: { increment: sign * u.qty } },
    });
    await tx.shopProductVariant.updateMany({
      where: { productId: u.productId, v1: u.v1, v2: u.v2, stock: { lt: 0 } },
      data: { stock: 0 },
    });
  }
}

export const shopService = {
  /** Carga inicial única: todo lo que ShopLayout necesita para hidratar la sesión. */
  async getState(restaurantId: string) {
    const [products, sales, purchases, adjustments, categories, subcategories, till, closedTills, serviceSupplies] = await Promise.all([
      prisma.shopProduct.findMany({ where: { restaurantId }, include: { variants: true }, orderBy: { createdAt: 'asc' } }),
      prisma.shopSale.findMany({ where: { restaurantId }, include: { items: true }, orderBy: { time: 'desc' } }),
      prisma.shopPurchase.findMany({ where: { restaurantId }, orderBy: { time: 'desc' } }),
      prisma.shopStockAdjustment.findMany({ where: { restaurantId }, orderBy: { time: 'desc' } }),
      prisma.shopCategory.findMany({ where: { restaurantId }, orderBy: { name: 'asc' } }),
      prisma.shopSubcategory.findMany({ where: { restaurantId }, orderBy: { name: 'asc' } }),
      prisma.shopCashSession.findFirst({ where: { restaurantId, closedAt: null } }),
      prisma.shopCashSession.findMany({ where: { restaurantId, closedAt: { not: null } }, orderBy: { closedAt: 'desc' } }),
      prisma.shopServiceSupply.findMany({ where: { restaurantId } }),
    ]);

    const subcategoriesByCategory: Record<string, string[]> = {};
    for (const s of subcategories) {
      (subcategoriesByCategory[s.category] ??= []).push(s.name);
    }

    return { products, sales, purchases, adjustments, categories: categories.map((c) => c.name), subcategories: subcategoriesByCategory, till, closedTills, serviceSupplies };
  },

  // --- Catálogo ---

  async createProduct(restaurantId: string, input: CreateShopProductInput) {
    const product = await prisma.shopProduct.create({
      data: {
        restaurantId,
        name: input.name,
        category: input.category,
        subcategory: input.subcategory ?? '',
        brand: input.brand ?? '',
        sku: input.sku ?? '',
        location: input.location ?? '',
        price: input.price,
        cost: input.cost,
        minStock: input.minStock,
        wholesalePrice: input.wholesalePrice,
        wholesaleMinQty: input.wholesaleMinQty,
        promoPrice: input.promoPrice,
        expiryDate: input.expiryDate,
        photoUrl: input.photoUrl,
        pricingMode: input.pricingMode ?? 'UNIT',
        rollWidths: input.rollWidths ?? undefined,
        rollLengthM: input.rollLengthM,
        variants: { createMany: { data: input.variants } },
      },
      include: { variants: true },
    });
    await this.ensureCategory(restaurantId, input.category, input.subcategory);
    return product;
  },

  async updateProduct(restaurantId: string, id: string, input: UpdateShopProductInput) {
    const existing = await prisma.shopProduct.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Producto no encontrado.');

    const { variants, ...fields } = input;
    const product = await prisma.$transaction(async (tx) => {
      if (variants) {
        await tx.shopProductVariant.deleteMany({ where: { productId: id } });
      }
      return tx.shopProduct.update({
        where: { id },
        data: {
          ...fields,
          ...(variants ? { variants: { createMany: { data: variants } } } : {}),
        },
        include: { variants: true },
      });
    });

    if (input.category) await this.ensureCategory(restaurantId, input.category, input.subcategory);
    return product;
  },

  /** Publica/despublica varios productos de una en la tienda virtual. El filtro por
   * restaurantId no es decorativo: sin él, un id de otro local publicaría su catálogo. */
  async setProductsPublished(restaurantId: string, productIds: string[], isPublished: boolean) {
    const result = await prisma.shopProduct.updateMany({
      where: { id: { in: productIds }, restaurantId },
      data: { isPublished },
    });
    return { updated: result.count, isPublished };
  },

  /**
   * Elimina un producto del inventario. El historial NO se pierde: ventas, compras y ajustes
   * guardan `productId` como texto suelto (sin FK) más un snapshot del nombre y el precio,
   * justo para que sobreviva a esto — ver el comentario en schema.prisma sobre ShopSaleItem.
   * Se van en cascada sus variantes y los insumos que consume; aparte hay que limpiar a mano
   * las recetas de OTROS productos que lo usaban como insumo, porque `supplyProductId`
   * tampoco tiene FK y quedarían apuntando a un producto que ya no existe.
   */
  async deleteProduct(restaurantId: string, id: string) {
    const existing = await prisma.shopProduct.findFirst({ where: { id, restaurantId }, select: { id: true, name: true } });
    if (!existing) throw notFound('Producto no encontrado.');

    return prisma.$transaction(async (tx) => {
      const usedAsSupply = await tx.shopServiceSupply.deleteMany({ where: { supplyProductId: id } });
      await tx.shopProduct.delete({ where: { id: existing.id } });
      return { deleted: true, name: existing.name, removedFromRecipes: usedAsSupply.count };
    });
  },

  async ensureCategory(restaurantId: string, category: string, subcategory?: string) {
    const trimmed = category.trim();
    if (trimmed) {
      await prisma.shopCategory.upsert({
        where: { restaurantId_name: { restaurantId, name: trimmed } },
        create: { restaurantId, name: trimmed },
        update: {},
      });
    }
    const trimmedSub = subcategory?.trim();
    if (trimmed && trimmedSub) {
      await prisma.shopSubcategory.upsert({
        where: { restaurantId_category_name: { restaurantId, category: trimmed, name: trimmedSub } },
        create: { restaurantId, category: trimmed, name: trimmedSub },
        update: {},
      });
    }
  },

  async addCategory(restaurantId: string, name: string) {
    await this.ensureCategory(restaurantId, name);
  },

  async addSubcategory(restaurantId: string, category: string, name: string) {
    await this.ensureCategory(restaurantId, category, name);
  },

  // --- Insumos que consume un servicio (barbería/salón) ---

  /** Reemplaza la receta completa de un servicio, igual que se reemplazan sus variantes. */
  async setServiceSupplies(restaurantId: string, serviceProductId: string, input: SetShopServiceSuppliesInput) {
    const service = await prisma.shopProduct.findFirst({ where: { id: serviceProductId, restaurantId }, select: { id: true } });
    if (!service) throw notFound('Servicio no encontrado.');

    // Los insumos tienen que ser productos del MISMO local: si no, se estaría descontando el
    // inventario de otro inquilino.
    const supplyIds = [...new Set(input.supplies.map((x) => x.supplyProductId))];
    if (supplyIds.length > 0) {
      const owned = await prisma.shopProduct.count({ where: { id: { in: supplyIds }, restaurantId } });
      if (owned !== supplyIds.length) throw badRequest('Alguno de los insumos no pertenece a este local.');
    }

    return prisma.$transaction(async (tx) => {
      await tx.shopServiceSupply.deleteMany({ where: { restaurantId, serviceProductId } });
      if (input.supplies.length > 0) {
        await tx.shopServiceSupply.createMany({
          data: input.supplies.map((x) => ({ restaurantId, serviceProductId, ...x })),
        });
      }
      return tx.shopServiceSupply.findMany({ where: { restaurantId, serviceProductId } });
    });
  },

  // --- Ventas ---

  async recordSale(restaurantId: string, input: CreateShopSaleInput) {
    // Comisión de cada profesional que aparece en el ticket, congelada al momento de vender:
    // si mañana le cambian el %, lo ya liquidado no se mueve.
    const staffIds = [...new Set(input.items.map((it) => it.staffUserId).filter((v): v is string => !!v))];
    const staff = staffIds.length
      ? await prisma.user.findMany({ where: { id: { in: staffIds }, restaurantId }, select: { id: true, commissionPercent: true } })
      : [];
    const commissionByUser = new Map(staff.map((u) => [u.id, u.commissionPercent ?? 0]));
    const commissionFor = (it: { staffUserId?: string | null; price: number; qty: number }) => {
      if (!it.staffUserId) return null;
      const pct = commissionByUser.get(it.staffUserId) ?? 0;
      return Math.round((it.price * it.qty * (pct / 100) + Number.EPSILON) * 100) / 100;
    };

    return prisma.$transaction(async (tx) => {
      const sale = await tx.shopSale.create({
        data: {
          restaurantId,
          total: input.total,
          customerName: input.customerName ?? null,
          customerPhone: input.customerPhone ?? null,
          paymentMethod: input.paymentMethod ?? null,
          paymentMeta: input.paymentMeta ?? undefined,
          creditTerms: input.creditTerms ?? null,
          amountPaidNow: input.amountPaidNow ?? null,
          dueDate: input.creditTerms ? (input.dueDate ?? null) : null,
          items: {
            createMany: {
              data: input.items.map((it) => ({
                productId: it.productId,
                v1: it.v1,
                v2: it.v2,
                name: it.name,
                category: it.category ?? null,
                qty: it.qty,
                price: it.price,
                cost: it.cost,
                soldByWeight: it.soldByWeight,
                detail: it.detail ?? null,
                stockQty: it.stockQty ?? null,
                staffUserId: it.staffUserId ?? null,
                commissionPercent: commissionByUser.get(it.staffUserId ?? '') ?? null,
                commissionBase: commissionFor(it),
              })),
            },
          },
        },
        include: { items: true },
      });

      // Descuenta stock de cada variante vendida (best-effort por productId+v1+v2 — si el
      // producto ya no existe o el id era temporal del frontend, la venta queda igual registrada).
      // productId viene del cliente: antes de tocar stock hay que confirmar que ese producto es
      // de ESTE restaurante — si no, un id de otro tenant (adivinado o filtrado) podría usarse
      // para descontarle/vaciarle el stock a un local ajeno sin tocar sus propios datos.
      const requestedProductIds = [...new Set(input.items.map((it) => it.productId).filter((v): v is string => !!v))];
      const ownedProducts = requestedProductIds.length
        ? await tx.shopProduct.findMany({ where: { id: { in: requestedProductIds }, restaurantId }, select: { id: true } })
        : [];
      const ownedProductIds = new Set(ownedProducts.map((p) => p.id));

      for (const item of input.items) {
        if (!item.productId || !ownedProductIds.has(item.productId)) continue;
        // stockQty manda cuando existe: en impresión de gran formato del rollo se consumen
        // metros lineales (0,80), no los m² que se le cobran al cliente (1,096).
        await tx.shopProductVariant.updateMany({
          where: { productId: item.productId, v1: item.v1, v2: item.v2 },
          data: { stock: { decrement: item.stockQty ?? item.qty } },
        });
      }
      // Insumos que consume cada servicio vendido (ej. un corte gasta 0,025 potes de cera).
      // Se descuentan del mismo inventario del local, sin que el barbero registre nada aparte.
      await applySupplyConsumption(tx, restaurantId, input.items, -1);

      // Piso en 0 (updateMany con decrement puede dejar negativo si había menos stock del esperado).
      await tx.shopProductVariant.updateMany({
        where: { productId: { in: [...ownedProductIds] }, stock: { lt: 0 } },
        data: { stock: 0 },
      });

      return sale;
    });
  },

  async returnSale(restaurantId: string, id: string) {
    const sale = await prisma.shopSale.findFirst({ where: { id, restaurantId }, include: { items: true } });
    if (!sale) throw notFound('Venta no encontrada.');
    if (sale.returned) throw badRequest('Esta venta ya fue devuelta.');

    return prisma.$transaction(async (tx) => {
      // Mismo chequeo de pertenencia que en recordSale — sale.items ya venía de una venta de
      // este restaurante, pero el productId que guarda cada línea es el que mandó el cliente al
      // vender, así que igual puede apuntar a un producto de otro tenant si no se validó antes.
      const requestedProductIds = [...new Set(sale.items.map((it) => it.productId).filter((v): v is string => !!v))];
      const ownedProducts = requestedProductIds.length
        ? await tx.shopProduct.findMany({ where: { id: { in: requestedProductIds }, restaurantId }, select: { id: true } })
        : [];
      const ownedProductIds = new Set(ownedProducts.map((p) => p.id));

      for (const item of sale.items) {
        if (!item.productId || !ownedProductIds.has(item.productId)) continue;
        // Se devuelve exactamente lo que se descontó al vender (ver recordSale).
        await tx.shopProductVariant.updateMany({
          where: { productId: item.productId, v1: item.v1, v2: item.v2 },
          data: { stock: { increment: item.stockQty ?? item.qty } },
        });
      }
      // Y devuelve al inventario los insumos que esos servicios habían consumido.
      await applySupplyConsumption(tx, restaurantId, sale.items, 1);
      return tx.shopSale.update({ where: { id }, data: { returned: true }, include: { items: true } });
    });
  },

  // --- Compras (reponen stock) ---

  async recordPurchase(restaurantId: string, input: CreateShopPurchaseInput) {
    const product = await prisma.shopProduct.findFirst({ where: { id: input.productId, restaurantId }, include: { variants: true } });
    if (!product) throw notFound('Producto no encontrado.');
    const variant = product.variants.find((v) => v.v1 === input.v1 && v.v2 === input.v2);
    if (!variant) throw badRequest('Variante no encontrada.');

    return prisma.$transaction(async (tx) => {
      await tx.shopProductVariant.update({ where: { id: variant.id }, data: { stock: { increment: input.qty } } });
      return tx.shopPurchase.create({
        data: {
          restaurantId,
          supplier: input.supplier,
          productId: product.id,
          productName: product.name,
          v1: variant.v1,
          v2: variant.v2,
          qty: input.qty,
          cost: input.cost,
        },
      });
    });
  },

  // --- Ajustes de stock (fijan el valor contado) ---

  async recordAdjustment(restaurantId: string, input: CreateShopAdjustmentInput) {
    const product = await prisma.shopProduct.findFirst({ where: { id: input.productId, restaurantId }, include: { variants: true } });
    if (!product) throw notFound('Producto no encontrado.');
    const variant = product.variants.find((v) => v.v1 === input.v1 && v.v2 === input.v2);
    if (!variant) throw badRequest('Variante no encontrada.');

    const before = variant.stock;
    return prisma.$transaction(async (tx) => {
      await tx.shopProductVariant.update({ where: { id: variant.id }, data: { stock: input.counted } });
      return tx.shopStockAdjustment.create({
        data: {
          restaurantId,
          productId: product.id,
          productName: product.name,
          v1: variant.v1,
          v2: variant.v2,
          before,
          after: input.counted,
          diff: input.counted - before,
          reason: input.reason || 'Recuento físico',
        },
      });
    });
  },

  // --- Caja ---

  async openTill(restaurantId: string, input: OpenShopTillInput) {
    const existing = await prisma.shopCashSession.findFirst({ where: { restaurantId, closedAt: null } });
    if (existing) throw badRequest('Ya hay una caja abierta.');
    return prisma.shopCashSession.create({ data: { restaurantId, opening: input.opening } });
  },

  async closeTill(restaurantId: string, input: CloseShopTillInput) {
    const till = await prisma.shopCashSession.findFirst({ where: { restaurantId, closedAt: null } });
    if (!till) throw badRequest('No hay una caja abierta.');

    const salesSinceOpen = await prisma.shopSale.findMany({
      where: { restaurantId, returned: false, time: { gte: till.openedAt } },
    });
    const totalSales = salesSinceOpen.reduce((a, s) => a + s.total, 0);
    const expected = till.opening + totalSales;

    return prisma.shopCashSession.update({
      where: { id: till.id },
      data: {
        closedAt: new Date(),
        salesCount: salesSinceOpen.length,
        totalSales,
        expected,
        counted: input.counted,
        diff: input.counted - expected,
      },
    });
  },

  // --- Cuentas por Cobrar (ventas fiadas: creditTerms FULL o INSTALLMENT) ---

  /** Ventas fiadas con su saldo pendiente ya calculado — solo las que aún no se saldaron. */
  async listReceivables(restaurantId: string) {
    const sales = await prisma.shopSale.findMany({
      where: { restaurantId, creditTerms: { not: null }, settledAt: null },
      include: { payments: { orderBy: { createdAt: 'asc' } } },
      orderBy: [{ dueDate: 'asc' }, { time: 'asc' }],
    });
    return sales.map((s) => {
      const paid = (s.amountPaidNow ?? 0) + s.payments.reduce((a, p) => a + p.amount, 0);
      return { ...s, paid, balance: Math.max(0, round(s.total - paid)) };
    });
  },

  /** Historial completo (saldadas incluidas) — para el "estado de cuenta" de un cliente. */
  async listAllCredit(restaurantId: string) {
    const sales = await prisma.shopSale.findMany({
      where: { restaurantId, creditTerms: { not: null } },
      include: { payments: { orderBy: { createdAt: 'asc' } } },
      orderBy: { time: 'desc' },
    });
    return sales.map((s) => {
      const paid = (s.amountPaidNow ?? 0) + s.payments.reduce((a, p) => a + p.amount, 0);
      return { ...s, paid, balance: Math.max(0, round(s.total - paid)) };
    });
  },

  /**
   * Registra un abono contra una venta fiada. Si el abono cubre todo lo que faltaba, marca
   * settledAt — de ahí en adelante la venta deja de aparecer en listReceivables().
   */
  async addSalePayment(restaurantId: string, saleId: string, input: { amount: number; method?: string }) {
    const sale = await prisma.shopSale.findFirst({ where: { id: saleId, restaurantId }, include: { payments: true } });
    if (!sale) throw notFound('Venta no encontrada.');
    if (!sale.creditTerms) throw badRequest('Esta venta no es una venta fiada.');
    if (sale.settledAt) throw badRequest('Esta venta ya está saldada.');

    const paidSoFar = (sale.amountPaidNow ?? 0) + sale.payments.reduce((a, p) => a + p.amount, 0);
    const balance = round(sale.total - paidSoFar);
    if (input.amount > balance + 0.01) {
      throw badRequest(`El abono no puede superar el saldo pendiente (${balance.toFixed(2)}).`);
    }

    return prisma.$transaction(async (tx) => {
      const payment = await tx.shopSalePayment.create({
        data: { shopSaleId: saleId, amount: input.amount, method: input.method },
      });
      const newBalance = round(balance - input.amount);
      if (newBalance <= 0.01) {
        await tx.shopSale.update({ where: { id: saleId }, data: { settledAt: new Date() } });
      }
      return payment;
    });
  },

  async setSaleDueDate(restaurantId: string, saleId: string, dueDate: string | null) {
    const sale = await prisma.shopSale.findFirst({ where: { id: saleId, restaurantId } });
    if (!sale) throw notFound('Venta no encontrada.');
    if (!sale.creditTerms) throw badRequest('Esta venta no es una venta fiada.');
    return prisma.shopSale.update({ where: { id: saleId }, data: { dueDate } });
  },
};

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
