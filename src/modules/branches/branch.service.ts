import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, forbidden, notFound } from '../../utils/http-error';
import { signToken } from '../auth/auth.service';
import { allowsBranches, maxBranchesFor, trialPeriodEnd } from '../../utils/subscription';
import { round2, toDecimal } from '../../utils/money';
import { resolveDateFilter, ReportRange } from '../../utils/date-range';
import { CreateBranchInput } from './branch.dto';

const BRANCH_SELECT = {
  id: true,
  name: true,
  whatsappPhone: true,
  baseCurrency: true,
  isActive: true,
  createdAt: true,
} as const;

/**
 * Slug público de una sucursal a partir de su nombre ("All Grill Viñedo" →
 * "all-grill-vinedo"), con sufijo numérico si ya está tomado. Antes era
 * aleatorio (`branch-a1b2c3d4-1785386788190`), y como el slug no se puede
 * editar desde ningún panel, la sucursal quedaba para siempre con un enlace
 * de menú impresentable — que es justo el que se imprime en el QR.
 */
async function buildBranchSlug(name: string): Promise<string> {
  const base =
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'sucursal';

  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const taken = await prisma.restaurant.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/**
 * Copia categorías/productos/variantes/modificadores de `sourceRestaurantId`
 * a `targetRestaurantId` (sucursal recién creada). El inventario NUNCA se
 * copia — cada sucursal arranca con su propio InventoryItem vacío, tal como
 * el resto del modelo de datos (todo cuelga de restaurantId).
 */
async function cloneCatalog(tx: Prisma.TransactionClient, sourceRestaurantId: string, targetRestaurantId: string) {
  const kitchens = await tx.kitchen.findMany({ where: { restaurantId: sourceRestaurantId } });
  const kitchenIdMap = new Map<string, string>();
  for (const k of kitchens) {
    const created = await tx.kitchen.create({
      data: { restaurantId: targetRestaurantId, name: k.name, priority: k.priority },
    });
    kitchenIdMap.set(k.id, created.id);
  }

  const modifierCategories = await tx.modifierCategory.findMany({
    where: { restaurantId: sourceRestaurantId },
    include: { modifiers: true },
  });
  const modifierCategoryIdMap = new Map<string, string>();
  for (const mc of modifierCategories) {
    const createdCategory = await tx.modifierCategory.create({
      data: {
        restaurantId: targetRestaurantId,
        name: mc.name,
        isRequired: mc.isRequired,
        allowMultiple: mc.allowMultiple,
        priority: mc.priority,
      },
    });
    modifierCategoryIdMap.set(mc.id, createdCategory.id);
    for (const m of mc.modifiers) {
      await tx.modifier.create({
        data: {
          restaurantId: targetRestaurantId,
          categoryId: createdCategory.id,
          name: m.name,
          priceBase: m.priceBase,
          costBase: m.costBase,
          discountBase: m.discountBase,
          isAvailable: m.isAvailable,
          priority: m.priority,
        },
      });
    }
  }

  const categories = await tx.category.findMany({ where: { restaurantId: sourceRestaurantId } });
  for (const category of categories) {
    const createdCategory = await tx.category.create({
      data: { restaurantId: targetRestaurantId, name: category.name, priority: category.priority, isActive: category.isActive },
    });

    const products = await tx.product.findMany({
      where: { restaurantId: sourceRestaurantId, categoryId: category.id },
      include: { variants: true, modifierCategories: true },
    });

    for (const product of products) {
      const createdProduct = await tx.product.create({
        data: {
          restaurantId: targetRestaurantId,
          categoryId: createdCategory.id,
          kitchenId: product.kitchenId ? kitchenIdMap.get(product.kitchenId) ?? null : null,
          name: product.name,
          description: product.description,
          price: product.price,
          photoUrl: product.photoUrl,
          prepTimeMinutes: product.prepTimeMinutes,
          costSource: product.costSource,
          costBase: product.costBase,
          isAvailable: product.isAvailable,
          isStar: product.isStar,
          isPromo: product.isPromo,
          isHouseSpecial: product.isHouseSpecial,
          priority: product.priority,
          pricingMode: product.pricingMode,
        },
      });

      for (const variant of product.variants) {
        await tx.productVariant.create({
          data: {
            restaurantId: targetRestaurantId,
            productId: createdProduct.id,
            name: variant.name,
            priceBase: variant.priceBase,
            packagingFeeBase: variant.packagingFeeBase,
            costBase: variant.costBase,
            discountBase: variant.discountBase,
            isAvailable: variant.isAvailable,
            priority: variant.priority,
          },
        });
      }

      for (const link of product.modifierCategories) {
        const newModifierCategoryId = modifierCategoryIdMap.get(link.modifierCategoryId);
        if (!newModifierCategoryId) continue;
        await tx.productModifierCategory.create({
          data: { productId: createdProduct.id, modifierCategoryId: newModifierCategoryId, priority: link.priority },
        });
      }
    }
  }
}

export const branchService = {
  /** Sucursales de la sede principal (restaurantId = sede principal). */
  async list(restaurantId: string) {
    return prisma.restaurant.findMany({
      where: { parentRestaurantId: restaurantId },
      orderBy: { createdAt: 'asc' },
      select: BRANCH_SELECT,
    });
  },

  /**
   * Crea una sucursal: otra fila de Restaurant enlazada por parentRestaurantId,
   * con el mismo plan/ciclo/adicionales que la sede principal (no paga ni se
   * bloquea de forma independiente, ver isLockedAsync). Reutiliza al mismo
   * dueño (mismo email/contraseña) como User OWNER de la nueva sucursal, para
   * poder cambiar entre sedes sin crear una cuenta nueva.
   */
  async create(restaurantId: string, callerUserId: string, input: CreateBranchInput) {
    const [restaurant, branchCount] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          subscriptionPlan: true,
          billingCycle: true,
          customAdministration: true,
          customInventoryBasic: true,
          customInventoryRecipe: true,
          customAccountsPayable: true,
          parentRestaurantId: true,
        },
      }),
      prisma.restaurant.count({ where: { parentRestaurantId: restaurantId } }),
    ]);
    if (!restaurant) throw notFound('Restaurante no encontrado.');
    if (restaurant.parentRestaurantId) {
      throw badRequest('Una sucursal no puede tener sus propias sucursales.');
    }
    if (!allowsBranches(restaurant.subscriptionPlan)) {
      throw badRequest('Tu plan no incluye sucursales. Mejora tu plan para agregar una.');
    }
    const maxBranches = maxBranchesFor(restaurant.subscriptionPlan);
    if (maxBranches !== null && branchCount >= maxBranches) {
      throw badRequest(`Ya alcanzaste el máximo de ${maxBranches} sucursales de tu plan.`);
    }

    const owner = await prisma.user.findUnique({ where: { id: callerUserId } });
    if (!owner) throw notFound('Usuario no encontrado.');

    const branchSlug = await buildBranchSlug(input.name);

    const branch = await prisma.$transaction(async (tx) => {
      const created = await tx.restaurant.create({
        data: {
          slug: branchSlug,
          name: input.name,
          whatsappPhone: input.whatsappPhone,
          baseCurrency: input.baseCurrency,
          parentRestaurantId: restaurantId,
          periodEnd: trialPeriodEnd(),
          subscriptionStatus: 'ACTIVE',
          subscriptionPlan: restaurant.subscriptionPlan,
          billingCycle: restaurant.billingCycle,
          customAdministration: restaurant.customAdministration,
          customInventoryBasic: restaurant.customInventoryBasic,
          customInventoryRecipe: restaurant.customInventoryRecipe,
          customAccountsPayable: restaurant.customAccountsPayable,
          users: {
            create: {
              email: owner.email,
              passwordHash: owner.passwordHash,
              name: owner.name,
              role: 'OWNER',
            },
          },
        },
        select: BRANCH_SELECT,
      });

      if (input.copyCatalog) {
        await cloneCatalog(tx, restaurantId, created.id);
      }

      return created;
    });

    return branch;
  },

  /**
   * Cambia la sesión activa hacia una sucursal (u OWNER/ADMIN de la sede
   * principal validando que la sucursal le pertenezca). Reutiliza o crea
   * perezosamente el User del mismo email en la sucursal, y firma un token
   * nuevo con `parentRestaurantId` para poder volver.
   */
  async switchToBranch(callerRestaurantId: string, callerUserId: string, branchId: string) {
    const branch = await prisma.restaurant.findUnique({ where: { id: branchId } });
    if (!branch || branch.parentRestaurantId !== callerRestaurantId) {
      throw forbidden('Esa sucursal no pertenece a tu cuenta.');
    }

    const caller = await prisma.user.findUnique({ where: { id: callerUserId } });
    if (!caller) throw notFound('Usuario no encontrado.');

    let branchUser = await prisma.user.findFirst({
      where: { restaurantId: branchId, email: { equals: caller.email, mode: 'insensitive' } },
    });
    if (!branchUser) {
      branchUser = await prisma.user.create({
        data: { restaurantId: branchId, email: caller.email, passwordHash: caller.passwordHash, name: caller.name, role: 'OWNER' },
      });
    }

    const token = signToken({
      userId: branchUser.id,
      restaurantId: branchId,
      role: branchUser.role,
      parentRestaurantId: callerRestaurantId,
    });
    return { token };
  },

  /** Inverso de switchToBranch: vuelve de una sucursal a su sede principal. */
  async switchToParent(callerRestaurantId: string, callerUserId: string) {
    const branch = await prisma.restaurant.findUnique({ where: { id: callerRestaurantId } });
    if (!branch?.parentRestaurantId) throw badRequest('Esta cuenta no es una sucursal.');

    const caller = await prisma.user.findUnique({ where: { id: callerUserId } });
    if (!caller) throw notFound('Usuario no encontrado.');

    const parentUser = await prisma.user.findFirst({
      where: { restaurantId: branch.parentRestaurantId, email: { equals: caller.email, mode: 'insensitive' } },
    });
    if (!parentUser) throw notFound('No se encontró tu usuario en la sede principal.');

    const token = signToken({ userId: parentUser.id, restaurantId: branch.parentRestaurantId, role: parentUser.role });
    return { token };
  },

  /** ids [sede principal, ...sucursales] + nombre de cada uno, reutilizado por los 5 reportes. */
  async resolveScope(restaurantId: string) {
    const [self, branches] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true, name: true } }),
      prisma.restaurant.findMany({ where: { parentRestaurantId: restaurantId }, select: { id: true, name: true } }),
    ]);
    if (!self) throw notFound('Restaurante no encontrado.');
    const scope = [self, ...branches];
    return { ids: scope.map((s) => s.id), names: new Map(scope.map((s) => [s.id, s.name])), mainId: self.id };
  },

  /** Ventas totales de la sede principal + todas sus sucursales juntas. */
  async getConsolidatedSummary(restaurantId: string, range: ReportRange, date?: string) {
    const { ids } = await this.resolveScope(restaurantId);
    const orders = await prisma.order.findMany({
      where: { restaurantId: { in: ids }, status: { not: 'CANCELLED' }, createdAt: resolveDateFilter({ range, date }) },
      select: { totalBase: true, totalBs: true },
    });
    return {
      branchCount: ids.length - 1,
      ordersCount: orders.length,
      totalBase: round2(orders.reduce((acc, o) => acc.add(o.totalBase), toDecimal(0))).toFixed(2),
      totalBs: round2(orders.reduce((acc, o) => acc.add(o.totalBs), toDecimal(0))).toFixed(2),
    };
  },

  /** Ventas desglosadas por sede (principal + cada sucursal). */
  async getSalesByBranch(restaurantId: string, range: ReportRange, date?: string) {
    const { ids, names, mainId } = await this.resolveScope(restaurantId);
    const orders = await prisma.order.findMany({
      where: { restaurantId: { in: ids }, status: { not: 'CANCELLED' }, createdAt: resolveDateFilter({ range, date }) },
      select: { restaurantId: true, totalBase: true, totalBs: true },
    });

    return ids.map((id) => {
      const own = orders.filter((o) => o.restaurantId === id);
      return {
        branchId: id,
        name: names.get(id) ?? id,
        isMain: id === mainId,
        ordersCount: own.length,
        totalBase: round2(own.reduce((acc, o) => acc.add(o.totalBase), toDecimal(0))).toFixed(2),
        totalBs: round2(own.reduce((acc, o) => acc.add(o.totalBs), toDecimal(0))).toFixed(2),
      };
    });
  },

  /** Inventario completo (con bandera de bajo stock) de cada sede. */
  async getInventoryByBranch(restaurantId: string) {
    const { ids, names, mainId } = await this.resolveScope(restaurantId);
    const items = await prisma.inventoryItem.findMany({ where: { restaurantId: { in: ids } }, orderBy: { name: 'asc' } });

    return ids.map((id) => {
      const own = items.filter((item) => item.restaurantId === id);
      return {
        branchId: id,
        name: names.get(id) ?? id,
        isMain: id === mainId,
        items: own.map((item) => ({
          id: item.id,
          name: item.name,
          unit: item.unit,
          quantity: item.quantity.toFixed(3),
          minQuantity: item.minQuantity.toFixed(3),
          pricePerUnitBase: item.pricePerUnitBase?.toFixed(4) ?? null,
          low: item.quantity.lt(item.minQuantity),
        })),
      };
    });
  },

  /** Top 5 productos más vendidos en cada sede, con unidades, ingresos y utilidad (ingresos - costo). */
  async getTopProductsByBranch(restaurantId: string, range: ReportRange, date?: string) {
    const { ids, names, mainId } = await this.resolveScope(restaurantId);
    const items = await prisma.orderItem.findMany({
      where: {
        order: { restaurantId: { in: ids }, status: { not: 'CANCELLED' }, createdAt: resolveDateFilter({ range, date }) },
      },
      select: {
        productId: true,
        productName: true,
        variantName: true,
        quantity: true,
        lineTotal: true,
        order: { select: { restaurantId: true } },
      },
    });

    const productIds = Array.from(new Set(items.map((i) => i.productId).filter((id): id is string => !!id)));
    const [products, recipeSums] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, costBase: true, costSource: true },
      }),
      prisma.recipeIngredient.groupBy({ by: ['productId'], where: { productId: { in: productIds } }, _sum: { costBase: true } }),
    ]);
    const recipeCostByProduct = new Map(recipeSums.map((r) => [r.productId, toDecimal(r._sum.costBase ?? 0)]));
    const costByProduct = new Map(
      products.map((p) => [
        p.id,
        p.costSource === 'RECIPE' ? (recipeCostByProduct.get(p.id) ?? toDecimal(0)) : toDecimal(p.costBase ?? 0),
      ]),
    );

    return ids.map((id) => {
      const byProduct = new Map<
        string,
        { name: string; quantity: number; revenueBase: Prisma.Decimal; costBase: Prisma.Decimal }
      >();
      for (const item of items) {
        if (item.order.restaurantId !== id) continue;
        const name = item.variantName ? `${item.productName} (${item.variantName})` : item.productName;
        const unitCost = item.productId ? costByProduct.get(item.productId) ?? toDecimal(0) : toDecimal(0);
        const lineCost = unitCost.mul(item.quantity);
        const entry = byProduct.get(name);
        if (entry) {
          entry.quantity += item.quantity;
          entry.revenueBase = entry.revenueBase.add(item.lineTotal);
          entry.costBase = entry.costBase.add(lineCost);
        } else {
          byProduct.set(name, { name, quantity: item.quantity, revenueBase: toDecimal(item.lineTotal), costBase: lineCost });
        }
      }

      return {
        branchId: id,
        name: names.get(id) ?? id,
        isMain: id === mainId,
        topProducts: Array.from(byProduct.values())
          .map((p) => ({
            name: p.name,
            quantity: p.quantity,
            revenueBase: round2(p.revenueBase).toFixed(2),
            profitBase: round2(p.revenueBase.sub(p.costBase)).toFixed(2),
          }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5),
      };
    });
  },

  /**
   * Detalle de ventas de UNA sede (comandas completas con items+pagos) + el
   * desglose de montos por método de pago — drill-down al presionar una fila
   * en "Ventas por sucursal", mismo patrón que getSalesStatsUserOrders.
   */
  async getBranchSalesDetail(restaurantId: string, branchId: string, range: ReportRange, date?: string) {
    const { ids, names } = await this.resolveScope(restaurantId);
    if (!ids.includes(branchId)) throw notFound('Esa sede no pertenece a tu cuenta.');

    const orders = await prisma.order.findMany({
      where: { restaurantId: branchId, status: { not: 'CANCELLED' }, createdAt: resolveDateFilter({ range, date }) },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        channel: true,
        status: true,
        paymentMethod: true,
        totalBase: true,
        totalBs: true,
        currency: true,
        customerName: true,
        createdAt: true,
        table: { select: { number: true } },
        items: { select: { productName: true, variantName: true, quantity: true, unitPrice: true, lineTotal: true } },
        payments: { select: { method: true, referenceNumber: true, amountBase: true, discountBase: true, createdAt: true } },
      },
    });

    const paymentTotals = new Map<string, Prisma.Decimal>();
    for (const o of orders) {
      for (const p of o.payments) {
        paymentTotals.set(p.method, (paymentTotals.get(p.method) ?? toDecimal(0)).add(p.amountBase));
      }
    }

    return {
      branchId,
      name: names.get(branchId) ?? branchId,
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        channel: o.channel,
        status: o.status,
        paymentMethod: o.paymentMethod,
        totalBase: o.totalBase.toFixed(2),
        totalBs: o.totalBs.toFixed(2),
        currency: o.currency,
        customerName: o.customerName,
        table: o.table?.number ?? null,
        createdAt: o.createdAt,
        items: o.items.map((i) => ({
          productName: i.variantName ? `${i.productName} (${i.variantName})` : i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice.toFixed(2),
          lineTotal: i.lineTotal.toFixed(2),
        })),
        payments: o.payments.map((p) => ({
          method: p.method,
          referenceNumber: p.referenceNumber,
          amountBase: p.amountBase.toFixed(2),
          discountBase: p.discountBase?.toFixed(2) ?? null,
          createdAt: p.createdAt,
        })),
      })),
      paymentTotals: Array.from(paymentTotals.entries())
        .map(([method, amountBase]) => ({ method, amountBase: round2(amountBase).toFixed(2) }))
        .sort((a, b) => Number(b.amountBase) - Number(a.amountBase)),
    };
  },

  /** Equipo de cada sede (sin el OWNER, igual que team.service.ts). */
  async getEmployeesByBranch(restaurantId: string) {
    const { ids, names, mainId } = await this.resolveScope(restaurantId);
    const users = await prisma.user.findMany({
      where: { restaurantId: { in: ids }, role: { not: 'OWNER' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true, role: true, isActive: true, restaurantId: true },
    });

    return ids.map((id) => ({
      branchId: id,
      name: names.get(id) ?? id,
      isMain: id === mainId,
      employees: users.filter((u) => u.restaurantId === id).map(({ restaurantId: _r, ...u }) => u),
    }));
  },
};
