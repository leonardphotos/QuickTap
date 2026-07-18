import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { round2, toDecimal } from '../../utils/money';
import { resolveDateFilter } from '../../utils/date-range';
import { CreateMovementInput, MovementQuery } from './movement.dto';

export const movementService = {
  /** Botón "Añadir movimiento" / módulo de Gastos: ingreso/egreso manual, opcionalmente con
   * categoría, proveedor, reabastecimiento de inventario y marca de "a crédito". */
  async create(restaurantId: string, userId: string | undefined, input: CreateMovementInput) {
    return prisma.$transaction(async (tx) => {
      const movement = await tx.movement.create({
        data: {
          restaurantId,
          type: input.type,
          amountBase: input.amountBase,
          description: input.description,
          createdByUserId: userId,
          category: input.category,
          supplierId: input.supplierId,
          inventoryItemId: input.inventoryItemId,
          inventoryQuantity: input.inventoryQuantity,
          isCredit: input.isCredit,
        },
        include: { createdByUser: { select: { name: true } }, supplier: true, inventoryItem: true },
      });

      // Reabastecimiento automático: llegó el insumo, se suma a la cantidad disponible.
      if (input.inventoryItemId && input.inventoryQuantity) {
        const item = await tx.inventoryItem.findFirst({ where: { id: input.inventoryItemId, restaurantId } });
        if (!item) throw notFound('El insumo no existe o no pertenece a este restaurante.');
        await tx.inventoryItem.update({
          where: { id: input.inventoryItemId },
          data: { quantity: { increment: input.inventoryQuantity } },
        });
      }

      return movement;
    });
  },

  /** Lista de movimientos + totales del período, para Administración → Resumen y el módulo de Gastos. */
  async list(restaurantId: string, query: MovementQuery) {
    const where = query.onlyPendingCredit
      ? { restaurantId, isCredit: true, creditPaidAt: null }
      : { restaurantId, createdAt: resolveDateFilter({ range: query.range, date: query.date }) };

    const movements = await prisma.movement.findMany({
      where,
      orderBy: { createdAt: query.onlyPendingCredit ? 'asc' : 'desc' },
      include: { createdByUser: { select: { name: true } }, supplier: true, inventoryItem: true },
    });

    const totalIncome = round2(
      movements.filter((m) => m.type === 'INCOME').reduce((acc, m) => acc.add(m.amountBase), toDecimal(0)),
    );
    const totalExpense = round2(
      movements.filter((m) => m.type === 'EXPENSE').reduce((acc, m) => acc.add(m.amountBase), toDecimal(0)),
    );

    return {
      totalIncome: totalIncome.toFixed(2),
      totalExpense: totalExpense.toFixed(2),
      net: round2(totalIncome.sub(totalExpense)).toFixed(2),
      movements: movements.map((m) => ({
        id: m.id,
        type: m.type,
        amountBase: m.amountBase.toFixed(2),
        description: m.description,
        category: m.category,
        supplier: m.supplier ? { id: m.supplier.id, name: m.supplier.name } : null,
        inventoryItem: m.inventoryItem ? { id: m.inventoryItem.id, name: m.inventoryItem.name } : null,
        inventoryQuantity: m.inventoryQuantity?.toFixed(2) ?? null,
        isCredit: m.isCredit,
        creditPaidAt: m.creditPaidAt,
        createdByName: m.createdByUser?.name ?? null,
        createdAt: m.createdAt,
      })),
    };
  },

  /** Marca un gasto a crédito como ya pagado al proveedor. */
  async markCreditPaid(restaurantId: string, id: string) {
    const existing = await prisma.movement.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Movimiento no encontrado.');
    if (!existing.isCredit) throw badRequest('Este movimiento no es un gasto a crédito.');
    if (existing.creditPaidAt) throw badRequest('Ya estaba marcado como pagado.');
    return prisma.movement.update({ where: { id }, data: { creditPaidAt: new Date() } });
  },

  async remove(restaurantId: string, id: string) {
    await prisma.movement.deleteMany({ where: { id, restaurantId } });
    return { deleted: true };
  },
};
