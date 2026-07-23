import { PaymentMethod } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { round2, toDecimal } from '../../utils/money';
import { badRequest, notFound } from '../../utils/http-error';
import { OpenCashSessionInput } from './cash-session.dto';

const PAYMENT_METHODS = Object.values(PaymentMethod);

/**
 * Movimiento del turno desde `openedAt` hasta ahora: ventas por método de
 * pago (`OrderPayment`) + movimientos manuales (`Movement`). Mismo patrón de
 * fetch + reduce que `movementService.list`, sin `groupBy` de Prisma.
 */
async function computeSummary(restaurantId: string, since: Date) {
  const [payments, movements] = await Promise.all([
    prisma.orderPayment.findMany({
      where: { order: { restaurantId }, createdAt: { gte: since } },
      select: { amountBase: true, method: true },
    }),
    prisma.movement.findMany({
      where: { restaurantId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      include: { createdByUser: { select: { name: true } } },
    }),
  ]);

  const paymentsByMethod = Object.fromEntries(
    PAYMENT_METHODS.map((method) => {
      const rows = payments.filter((p) => p.method === method);
      const amountBase = round2(rows.reduce((acc, p) => acc.add(p.amountBase), toDecimal(0)));
      return [method, { amountBase: amountBase.toFixed(2), count: rows.length }];
    }),
  );
  const totalPayments = round2(payments.reduce((acc, p) => acc.add(p.amountBase), toDecimal(0)));

  const totalIncome = round2(
    movements.filter((m) => m.type === 'INCOME').reduce((acc, m) => acc.add(m.amountBase), toDecimal(0)),
  );
  const totalExpense = round2(
    movements.filter((m) => m.type === 'EXPENSE').reduce((acc, m) => acc.add(m.amountBase), toDecimal(0)),
  );

  return {
    paymentsByMethod,
    totalPayments: totalPayments.toFixed(2),
    movements: {
      totalIncome: totalIncome.toFixed(2),
      totalExpense: totalExpense.toFixed(2),
      list: movements.map((m) => ({
        id: m.id,
        type: m.type,
        amountBase: m.amountBase.toFixed(2),
        description: m.description,
        incomeCategory: m.incomeCategory,
        paymentMethod: m.paymentMethod,
        createdByName: m.createdByUser?.name ?? null,
        createdAt: m.createdAt,
      })),
    },
    totalNet: round2(totalPayments.add(totalIncome).sub(totalExpense)).toFixed(2),
  };
}

export const cashSessionService = {
  async getCurrent(restaurantId: string) {
    return prisma.cashSession.findFirst({
      where: { restaurantId, status: 'OPEN' },
      include: { openedByUser: { select: { name: true, role: true } } },
    });
  },

  /** Botón "Abrir Caja": no puede haber dos sesiones abiertas a la vez. */
  async open(restaurantId: string, userId: string | undefined, input: OpenCashSessionInput) {
    const existing = await prisma.cashSession.findFirst({ where: { restaurantId, status: 'OPEN' } });
    if (existing) throw badRequest('Ya hay una caja abierta. Ciérrala antes de abrir una nueva.');

    return prisma.cashSession.create({
      data: {
        restaurantId,
        openedByUserId: userId,
        openingBalances: input.openingBalances,
      },
    });
  },

  /** Vista previa del cierre (sin persistir), para revisar antes de confirmar. */
  async previewClose(restaurantId: string, id: string) {
    const session = await prisma.cashSession.findFirst({ where: { id, restaurantId, status: 'OPEN' } });
    if (!session) throw notFound('Caja abierta no encontrada.');
    return { session, summary: await computeSummary(restaurantId, session.openedAt) };
  },

  /** Botón "Confirmar cierre": congela el resumen del turno y asigna el número de cierre. */
  async close(restaurantId: string, id: string, userId: string | undefined) {
    return prisma.$transaction(async (tx) => {
      const session = await tx.cashSession.findFirst({ where: { id, restaurantId, status: 'OPEN' } });
      if (!session) throw notFound('Caja abierta no encontrada.');

      const summary = await computeSummary(restaurantId, session.openedAt);

      const last = await tx.cashSession.findFirst({
        where: { restaurantId, closeNumber: { not: null } },
        orderBy: { closeNumber: 'desc' },
      });
      const closeNumber = (last?.closeNumber ?? 0) + 1;

      return tx.cashSession.update({
        where: { id: session.id },
        data: {
          status: 'CLOSED',
          closedByUserId: userId,
          closedAt: new Date(),
          closeNumber,
          closingSummary: summary,
        },
        include: { openedByUser: { select: { name: true, role: true } }, closedByUser: { select: { name: true, role: true } } },
      });
    });
  },

  async getById(restaurantId: string, id: string) {
    const session = await prisma.cashSession.findFirst({
      where: { id, restaurantId },
      include: { openedByUser: { select: { name: true, role: true } }, closedByUser: { select: { name: true, role: true } } },
    });
    if (!session) throw notFound('Cierre de caja no encontrado.');
    return session;
  },

  /** Historial de cierres pasados, más reciente primero. */
  async list(restaurantId: string) {
    return prisma.cashSession.findMany({
      where: { restaurantId, status: 'CLOSED' },
      orderBy: { closeNumber: 'desc' },
      select: { id: true, closeNumber: true, openedAt: true, closedAt: true, closingSummary: true },
    });
  },
};
