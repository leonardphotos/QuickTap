import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { bsToBase, round2, toDecimal } from '../../utils/money';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import { bankLedgerService } from '../bank-accounts/bank-ledger.service';
import type { CreatePaymentOrderInput, PayPaymentOrderInput } from './payment-order.dto';

/**
 * ============================================================================
 *  Órdenes de pago a proveedor
 * ============================================================================
 *  Una cuenta por pagar es un gasto tomado a crédito (`Movement.isCredit` sin
 *  `creditPaidAt`). La orden de pago agrupa varias de esas en un solo documento
 *  con correlativo, para autorizar y registrar el pago de una vez.
 *
 *  Existe aparte de marcar cada gasto como pagado porque eso no deja rastro de
 *  CÓMO se pagó ni de que varias facturas se saldaron en una sola transferencia
 *  — que es justo lo que hay que poder mostrarle a un contador.
 *
 *  No confundir con `accountsPayable` (el feature flag), que en este código es
 *  al revés: lo que los CLIENTES le deben al negocio.
 */

const ORDER_INCLUDE = {
  supplier: { select: { id: true, name: true, taxId: true } },
  createdByUser: { select: { name: true } },
  paidByUser: { select: { name: true } },
  movements: {
    select: {
      id: true,
      description: true,
      amountBase: true,
      expenseDate: true,
      createdAt: true,
      referenceNumber: true,
      creditPaidAt: true,
    },
  },
} as const;

/** Deudas con proveedores todavía sin saldar y sin orden emitida — lo que se puede meter
 * en una orden nueva. Un gasto ya incluido en otra orden no aparece: estaría por pagarse dos veces. */
async function listPayables(restaurantId: string, supplierId?: string) {
  const movements = await prisma.movement.findMany({
    where: {
      restaurantId,
      type: 'EXPENSE',
      isCredit: true,
      creditPaidAt: null,
      paymentOrderId: null,
      ...(supplierId ? { supplierId } : {}),
    },
    orderBy: [{ expenseDate: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      description: true,
      amountBase: true,
      category: true,
      expenseDate: true,
      invoiceDueDate: true,
      createdAt: true,
      referenceNumber: true,
      supplier: { select: { id: true, name: true } },
    },
  });

  const totalBase = round2(movements.reduce((acc, m) => acc.add(m.amountBase), toDecimal(0)));
  return { movements, totalBase: totalBase.toFixed(2) };
}

async function list(restaurantId: string, status?: string) {
  return prisma.paymentOrder.findMany({
    where: { restaurantId, ...(status ? { status: status as Prisma.EnumPaymentOrderStatusFilter } : {}) },
    orderBy: { orderNumber: 'desc' },
    take: 100,
    include: ORDER_INCLUDE,
  });
}

async function getById(restaurantId: string, id: string) {
  const order = await prisma.paymentOrder.findFirst({ where: { id, restaurantId }, include: ORDER_INCLUDE });
  if (!order) throw notFound('Orden de pago no encontrada.');
  return order;
}

/**
 * Emite la orden con los gastos elegidos. El monto se congela acá: el documento tiene que
 * seguir diciendo lo que se autorizó aunque después alguien edite un gasto.
 */
async function create(restaurantId: string, userId: string | undefined, input: CreatePaymentOrderInput) {
  return prisma.$transaction(async (tx) => {
    // Se re-leen del servidor y se valida que sigan siendo deuda libre: entre que el usuario
    // abrió la pantalla y confirmó, otro pudo haberlas metido en otra orden o marcado pagadas.
    const movements = await tx.movement.findMany({
      where: {
        id: { in: input.movementIds },
        restaurantId,
        type: 'EXPENSE',
        isCredit: true,
        creditPaidAt: null,
        paymentOrderId: null,
      },
      select: { id: true, amountBase: true, supplierId: true },
    });

    if (movements.length !== input.movementIds.length) {
      throw badRequest('Alguna de las cuentas ya fue pagada o incluida en otra orden. Vuelve a intentarlo.');
    }

    const suppliers = [...new Set(movements.map((m) => m.supplierId).filter(Boolean))];
    if (suppliers.length > 1) {
      throw badRequest('Una orden de pago es de un solo proveedor. Emite una por cada uno.');
    }

    const amountBase = round2(movements.reduce((acc, m) => acc.add(m.amountBase), toDecimal(0)));
    const last = await tx.paymentOrder.findFirst({
      where: { restaurantId },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });

    const order = await tx.paymentOrder.create({
      data: {
        restaurantId,
        orderNumber: (last?.orderNumber ?? 0) + 1,
        supplierId: suppliers[0] ?? input.supplierId ?? null,
        amountBase,
        note: input.note ?? null,
        createdByUserId: userId,
      },
    });

    await tx.movement.updateMany({
      where: { id: { in: movements.map((m) => m.id) } },
      data: { paymentOrderId: order.id },
    });

    return tx.paymentOrder.findFirstOrThrow({ where: { id: order.id }, include: ORDER_INCLUDE });
  });
}

/** Marca la orden pagada y salda de una vez todos sus gastos, con el detalle fiscal del pago. */
async function pay(restaurantId: string, id: string, userId: string | undefined, input: PayPaymentOrderInput) {
  // Conversión Bs → base ANTES de la transacción (getRate puede salir a la red): lo pagado en
  // bolívares se congela a la tasa BCV del momento del pago, no a la de cuando se emitió.
  let paidAmountBase: Prisma.Decimal | null = null;
  let paidAmountBs: Prisma.Decimal | null = null;
  if (input.paidAmount != null) {
    if (input.paidCurrency === 'BS') {
      const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { baseCurrency: true } });
      const rate = await exchangeRateService.getRate(restaurant?.baseCurrency ?? 'USD', restaurantId);
      paidAmountBs = round2(toDecimal(input.paidAmount));
      paidAmountBase = bsToBase(input.paidAmount, rate.rateBs);
    } else {
      paidAmountBase = round2(toDecimal(input.paidAmount));
    }
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.paymentOrder.findFirst({ where: { id, restaurantId } });
    if (!order) throw notFound('Orden de pago no encontrada.');
    if (order.status === 'PAID') throw badRequest('Esta orden ya fue pagada.');
    if (order.status === 'CANCELLED') throw badRequest('Esta orden fue anulada.');

    const paidAt = new Date();
    await tx.movement.updateMany({ where: { paymentOrderId: order.id }, data: { creditPaidAt: paidAt } });

    await tx.paymentOrder.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        paidAt,
        paidByUserId: userId,
        paymentMethod: input.paymentMethod ?? null,
        referenceNumber: input.referenceNumber ?? null,
        paidAmountBase,
        paidAmountBs,
        islrRetentionBase: input.islrRetentionBase ?? null,
        ivaRetentionBase: input.ivaRetentionBase ?? null,
        creditNoteBase: input.creditNoteBase ?? null,
        ivaAmountBase: input.ivaAmountBase ?? null,
        totalWithIvaBase: input.totalWithIvaBase ?? null,
      },
    });

    // Cuentas bancarias: pagar la orden resta de la cuenta vinculada al método. Se usa lo
    // REALMENTE pagado (y el Bs exacto si el pago fue en bolívares), no el monto autorizado.
    if (input.paymentMethod) {
      await bankLedgerService.applyMethodPayment(tx, {
        restaurantId,
        method: input.paymentMethod,
        direction: 'DEBIT',
        amountBase: paidAmountBase ?? order.amountBase,
        bsAmount: paidAmountBs,
        bankAccountId: input.bankAccountId,
        description: `Orden de pago #${order.orderNumber}`,
        sourceRef: order.id,
        createdByUserId: userId ?? null,
      });
    }

    return tx.paymentOrder.findFirstOrThrow({ where: { id: order.id }, include: ORDER_INCLUDE });
  });
}

/** Anula una orden todavía sin pagar: sus gastos vuelven a ser deuda suelta, disponibles
 * para otra orden. Una orden ya pagada no se anula — eso sería reabrir una deuda saldada. */
async function cancel(restaurantId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.paymentOrder.findFirst({ where: { id, restaurantId } });
    if (!order) throw notFound('Orden de pago no encontrada.');
    if (order.status === 'PAID') throw badRequest('Una orden ya pagada no se puede anular.');
    if (order.status === 'CANCELLED') throw badRequest('Esta orden ya estaba anulada.');

    await tx.movement.updateMany({ where: { paymentOrderId: order.id }, data: { paymentOrderId: null } });
    await tx.paymentOrder.update({
      where: { id: order.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    return tx.paymentOrder.findFirstOrThrow({ where: { id: order.id }, include: ORDER_INCLUDE });
  });
}

export const paymentOrderService = { listPayables, list, getById, create, pay, cancel };
