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
} from './shop.dto';

/**
 * Persistencia de QuickTap Shop (businessType = SHOP): catálogo, ventas, compras, ajustes de
 * stock, caja y categorías — contraparte de web/src/pages/admin/shop/shopSession.ts. Cada
 * mutación del hook de frontend dispara una llamada aquí; el frontend mantiene su propio
 * estado local optimista y reconcilia con lo que devuelve el servidor (ver shopSession.ts).
 */
export const shopService = {
  /** Carga inicial única: todo lo que ShopLayout necesita para hidratar la sesión. */
  async getState(restaurantId: string) {
    const [products, sales, purchases, adjustments, categories, subcategories, till, closedTills] = await Promise.all([
      prisma.shopProduct.findMany({ where: { restaurantId }, include: { variants: true }, orderBy: { createdAt: 'asc' } }),
      prisma.shopSale.findMany({ where: { restaurantId }, include: { items: true }, orderBy: { time: 'desc' } }),
      prisma.shopPurchase.findMany({ where: { restaurantId }, orderBy: { time: 'desc' } }),
      prisma.shopStockAdjustment.findMany({ where: { restaurantId }, orderBy: { time: 'desc' } }),
      prisma.shopCategory.findMany({ where: { restaurantId }, orderBy: { name: 'asc' } }),
      prisma.shopSubcategory.findMany({ where: { restaurantId }, orderBy: { name: 'asc' } }),
      prisma.shopCashSession.findFirst({ where: { restaurantId, closedAt: null } }),
      prisma.shopCashSession.findMany({ where: { restaurantId, closedAt: { not: null } }, orderBy: { closedAt: 'desc' } }),
    ]);

    const subcategoriesByCategory: Record<string, string[]> = {};
    for (const s of subcategories) {
      (subcategoriesByCategory[s.category] ??= []).push(s.name);
    }

    return { products, sales, purchases, adjustments, categories: categories.map((c) => c.name), subcategories: subcategoriesByCategory, till, closedTills };
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

  // --- Ventas ---

  async recordSale(restaurantId: string, input: CreateShopSaleInput) {
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
              })),
            },
          },
        },
        include: { items: true },
      });

      // Descuenta stock de cada variante vendida (best-effort por productId+v1+v2 — si el
      // producto ya no existe o el id era temporal del frontend, la venta queda igual registrada).
      for (const item of input.items) {
        if (!item.productId) continue;
        // stockQty manda cuando existe: en impresión de gran formato del rollo se consumen
        // metros lineales (0,80), no los m² que se le cobran al cliente (1,096).
        await tx.shopProductVariant.updateMany({
          where: { productId: item.productId, v1: item.v1, v2: item.v2 },
          data: { stock: { decrement: item.stockQty ?? item.qty } },
        });
      }
      // Piso en 0 (updateMany con decrement puede dejar negativo si había menos stock del esperado).
      await tx.shopProductVariant.updateMany({
        where: { productId: { in: input.items.map((it) => it.productId).filter((v): v is string => !!v) }, stock: { lt: 0 } },
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
      for (const item of sale.items) {
        if (!item.productId) continue;
        // Se devuelve exactamente lo que se descontó al vender (ver recordSale).
        await tx.shopProductVariant.updateMany({
          where: { productId: item.productId, v1: item.v1, v2: item.v2 },
          data: { stock: { increment: item.stockQty ?? item.qty } },
        });
      }
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
