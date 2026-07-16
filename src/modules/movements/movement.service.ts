import { prisma } from '../../config/prisma';
import { round2, toDecimal } from '../../utils/money';
import { rangeFilter } from '../../utils/date-range';
import { CreateMovementInput, MovementQuery } from './movement.dto';

export const movementService = {
  /** Botón "Añadir movimiento": ingreso/egreso/propina manual, no ligado a un pedido. */
  async create(restaurantId: string, userId: string | undefined, input: CreateMovementInput) {
    return prisma.movement.create({
      data: {
        restaurantId,
        type: input.type,
        amountBase: input.amountBase,
        description: input.description,
        createdByUserId: userId,
      },
      include: { createdByUser: { select: { name: true } } },
    });
  },

  /** Lista de movimientos + totales del período, para Administración → Resumen. */
  async list(restaurantId: string, query: MovementQuery) {
    const where = { restaurantId, createdAt: rangeFilter(query.range) };
    const movements = await prisma.movement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { createdByUser: { select: { name: true } } },
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
        createdByName: m.createdByUser?.name ?? null,
        createdAt: m.createdAt,
      })),
    };
  },

  async remove(restaurantId: string, id: string) {
    await prisma.movement.deleteMany({ where: { id, restaurantId } });
    return { deleted: true };
  },
};
