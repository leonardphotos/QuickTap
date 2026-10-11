import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { baseToBs, round2, toDecimal } from '../../utils/money';
import { bankLedgerService } from '../bank-accounts/bank-ledger.service';
import type { RecordRefundInput } from './order.dto';

const refundSelect = {
  id: true,
  orderId: true,
  amountBase: true,
  amountBs: true,
  method: true,
  reason: true,
  referenceNumber: true,
  fiscalCreditNoteRef: true,
  createdByName: true,
  createdAt: true,
} satisfies Prisma.OrderRefundSelect;

export const orderRefundService = {
  /** Permite buscar también comandas que ya salieron de Pedidos al cerrar caja. */
  async lookup(restaurantId: string, target: number | { orderNumber?: number; orderId?: string }) {
    const where: Prisma.OrderWhereInput = { restaurantId };
    if (typeof target === 'number') {
      where.orderNumber = target;
    } else if (target.orderId) {
      where.id = target.orderId;
    } else if (target.orderNumber) {
      where.orderNumber = target.orderNumber;
    } else {
      throw badRequest('Indica una comanda válida.');
    }

    const order = await prisma.order.findFirst({
      where,
      select: {
        id: true, orderNumber: true, customerName: true, totalBase: true, currency: true,
        exchangeRate: true, fiscalPrintedAt: true, fiscalPrinterInvoice: true,
        payments: { select: { amountBase: true } },
        refunds: { select: refundSelect, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!order) throw notFound('No se encontró esa comanda.');
    const collected = round2(order.payments.reduce((sum, p) => sum.add(p.amountBase), toDecimal(0)));
    const returned = round2(order.refunds.reduce((sum, r) => sum.add(r.amountBase), toDecimal(0)));
    return {
      ...order,
      payments: undefined,
      collectedBase: collected.toFixed(2),
      refundedBase: returned.toFixed(2),
      refundableBase: round2(collected.sub(returned)).toFixed(2),
    };
  },

  async list(restaurantId: string) {
    return prisma.orderRefund.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { ...refundSelect, order: { select: { orderNumber: true, customerName: true, currency: true } } },
    });
  },

  /** Registra un reembolso YA realizado; jamás mueve dinero ni emite nota fiscal por sí mismo. */
  async create(restaurantId: string, orderId: string, actorId: string, input: RecordRefundInput) {
    const existing = await prisma.orderRefund.findUnique({ where: { requestKey: input.requestKey } });
    if (existing) {
      if (existing.restaurantId !== restaurantId || existing.orderId !== orderId) throw badRequest('La operación ya fue utilizada.');
      return existing;
    }

    return prisma.$transaction(async (tx) => {
      // El mismo candado que addPayment: cobro y devolución no pueden calcular el saldo
      // simultáneamente sobre versiones distintas de la cuenta.
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtext(${'order-payment:' + orderId})) AS locked
      `;
      if (!locked) throw badRequest('Hay otra operación en esta comanda. Intenta de nuevo en unos segundos.');

      const repeated = await tx.orderRefund.findUnique({ where: { requestKey: input.requestKey } });
      if (repeated) {
        if (repeated.restaurantId !== restaurantId || repeated.orderId !== orderId) throw badRequest('La operación ya fue utilizada.');
        return repeated;
      }

      const [order, actor] = await Promise.all([
        tx.order.findFirst({
          where: { id: orderId, restaurantId },
          select: {
            orderNumber: true, exchangeRate: true, fiscalPrintedAt: true,
            payments: { select: { amountBase: true } },
            refunds: { select: { amountBase: true } },
          },
        }),
        tx.user.findFirst({ where: { id: actorId, restaurantId, isActive: true }, select: { name: true } }),
      ]);
      if (!order) throw notFound('Comanda no encontrada.');
      if (!actor) throw badRequest('La sesión de usuario ya no está activa.');

      const amountBase = round2(toDecimal(input.amountBase));
      const collected = order.payments.reduce((sum, p) => sum.add(p.amountBase), toDecimal(0));
      const returned = order.refunds.reduce((sum, r) => sum.add(r.amountBase), toDecimal(0));
      const remaining = round2(collected.sub(returned));
      if (remaining.lte(0)) throw badRequest('Esta comanda no tiene dinero cobrado pendiente de devolver.');
      if (amountBase.gt(remaining)) throw badRequest(`Solo se pueden devolver ${remaining.toFixed(2)} de esta comanda.`);

      const account = input.bankAccountId
        ? await tx.bankAccount.findFirst({ where: { id: input.bankAccountId, restaurantId, paymentMethods: { has: input.method } }, select: { id: true } })
        : null;
      if (input.bankAccountId && !account) throw badRequest('La cuenta de salida no está vinculada a ese medio de pago.');

      const amountBs = input.amountBs == null
        ? baseToBs(amountBase, order.exchangeRate)
        : round2(toDecimal(input.amountBs));
      const refund = await tx.orderRefund.create({
        data: {
          requestKey: input.requestKey,
          restaurantId,
          orderId,
          amountBase,
          amountBs,
          method: input.method,
          reason: input.reason,
          referenceNumber: input.referenceNumber || null,
          // Referencia declarada por el usuario, no constancia de que QuickTap emitió una NC.
          fiscalCreditNoteRef: input.fiscalCreditNoteRef || null,
          createdByUserId: actorId,
          createdByName: actor.name,
        },
      });
      await bankLedgerService.applyMethodPayment(tx, {
        restaurantId,
        method: input.method,
        direction: 'DEBIT',
        amountBase,
        bsAmount: amountBs,
        rateBs: order.exchangeRate,
        bankAccountId: input.bankAccountId,
        description: `Devolución pedido #${order.orderNumber}: ${input.reason}`,
        sourceRef: refund.id,
        createdByUserId: actorId,
      });
      return refund;
    });
  },
};
