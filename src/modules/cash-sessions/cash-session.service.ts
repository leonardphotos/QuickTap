import { BusinessType, PaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { round2, toDecimal } from '../../utils/money';
import { badRequest, notFound } from '../../utils/http-error';
import { emitToKitchen, SocketEvents } from '../../sockets';
import { PAYMENT_METHODS, shopMethodToEnum } from '../../utils/payment-method';
import { OpenCashSessionInput } from './cash-session.dto';

/** Un cobro ya normalizado, venga de donde venga. Es lo que el arqueo suma.
 * `method` en null = no se pudo atribuir a un método conocido (ver shopMethodToEnum). */
interface CollectedPayment {
  amountBase: Prisma.Decimal;
  method: PaymentMethod | null;
}

/**
 * De dónde sale la plata cobrada en el turno, según el vertical.
 *
 * El restaurante cobra por `OrderPayment` y ya. El CLUB no tiene pedidos: cobra las canchas
 * en `ClubBookingPayment` y la barra en `ShopSale`/`ShopSalePayment` — tres tablas que no se
 * hablan entre sí. Sin esto el arqueo de un club daba 0 en canchas, que es justo su negocio
 * principal: contaba solo los movimientos manuales.
 */
async function collectPayments(
  restaurantId: string,
  businessType: BusinessType,
  since: Date,
): Promise<CollectedPayment[]> {
  if (businessType !== 'SPORTS_CLUB') {
    const rows = await prisma.orderPayment.findMany({
      where: { order: { restaurantId }, createdAt: { gte: since } },
      select: { amountBase: true, method: true },
    });
    return rows.map((p) => ({ amountBase: p.amountBase, method: p.method }));
  }

  const [courtPayments, storeSales, storeInstallments, academyPayments] = await Promise.all([
    prisma.clubBookingPayment.findMany({
      where: { booking: { restaurantId }, createdAt: { gte: since } },
      select: { amountBase: true, method: true },
    }),
    // Una venta devuelta no dejó plata en la caja. Y en una venta fiada solo entró el abono
    // inicial (`amountPaidNow`); el resto llega después como ShopSalePayment.
    prisma.shopSale.findMany({
      where: { restaurantId, time: { gte: since }, returned: false },
      select: { total: true, paymentMethod: true, creditTerms: true, amountPaidNow: true },
    }),
    prisma.shopSalePayment.findMany({
      where: { shopSale: { restaurantId }, createdAt: { gte: since } },
      select: { amount: true, method: true },
    }),
    // Cuarta fuente: la academia (lotes, mensualidades y clases sueltas). Sin
    // esto el club cierra la caja con menos de lo que entró y el arqueo acusa
    // diferencia todos los días — el mismo fallo que tuvo la tienda en su día.
    prisma.clubAcademyPayment.findMany({
      where: { restaurantId, createdAt: { gte: since } },
      select: { amountBase: true, method: true },
    }),
  ]);

  const collected: CollectedPayment[] = courtPayments.map((p) => ({ amountBase: p.amountBase, method: p.method }));
  for (const payment of academyPayments) {
    collected.push({ amountBase: payment.amountBase, method: payment.method });
  }

  for (const sale of storeSales) {
    const amount = sale.creditTerms ? (sale.amountPaidNow ?? 0) : sale.total;
    if (!amount || amount <= 0) continue;
    collected.push({ amountBase: toDecimal(amount), method: shopMethodToEnum(sale.paymentMethod) });
  }
  for (const payment of storeInstallments) {
    if (!payment.amount || payment.amount <= 0) continue;
    collected.push({ amountBase: toDecimal(payment.amount), method: shopMethodToEnum(payment.method) });
  }

  return collected;
}

/**
 * Movimiento del turno desde `openedAt` hasta ahora: lo cobrado por método de pago (según el
 * vertical, ver collectPayments) + movimientos manuales (`Movement`). Mismo patrón de fetch +
 * reduce que `movementService.list`, sin `groupBy` de Prisma.
 */
async function computeSummary(
  restaurantId: string,
  businessType: BusinessType,
  since: Date,
  openingBalances?: Record<string, unknown> | null,
) {
  const [payments, movements] = await Promise.all([
    collectPayments(restaurantId, businessType, since),
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

  // Lo que DEBERÍA haber por método al cerrar: lo declarado al abrir + lo cobrado + los
  // movimientos manuales de ese método (un ingreso suma, un egreso resta). Es contra esto que
  // se compara el conteo físico del arqueo. Un movimiento sin método cargado no se puede
  // atribuir a ninguna gaveta, así que no entra acá (sí en el total neto del turno).
  const expectedByMethod = Object.fromEntries(
    PAYMENT_METHODS.map((method) => {
      const opening = toDecimal(String((openingBalances as Record<string, string> | null | undefined)?.[method] ?? 0) || 0);
      const collected = toDecimal(paymentsByMethod[method].amountBase);
      const manual = movements
        .filter((m) => m.paymentMethod === method)
        .reduce((acc, m) => (m.type === 'INCOME' ? acc.add(m.amountBase) : acc.sub(m.amountBase)), toDecimal(0));
      return [method, round2(opening.add(collected).add(manual)).toFixed(2)];
    }),
  );

  return {
    paymentsByMethod,
    expectedByMethod,
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

/**
 * Al cerrar caja, saca de la pantalla de Pedidos las comandas del turno que ya
 * quedaron saldadas, y deja las que aún deben algo: el cajero del turno siguiente
 * abre con la pantalla limpia y solo con lo que hay por cobrar.
 *
 * No borra ni cancela nada — solo sella `clearedAt`; el pedido completo sigue en
 * Administración. Una comanda sin ningún pago cuenta como deuda y se queda: es
 * plata sin cobrar, justo lo que no se debe perder de vista.
 */
async function clearSettledOrders(tx: Prisma.TransactionClient, restaurantId: string, closedAt: Date) {
  const candidates = await tx.order.findMany({
    where: {
      restaurantId,
      clearedAt: null,
      status: { notIn: ['SERVED', 'CANCELLED'] },
      awaitingPayment: false,
      createdAt: { lte: closedAt },
    },
    select: {
      id: true,
      totalBase: true,
      payments: { select: { amountBase: true, discountBase: true, serviceChargeDiscountBase: true } },
    },
  });

  // Mismo criterio de saldo que addPayment (order.service.ts): descuento y ajuste
  // de servicio perdonan parte de la deuda, así que cuentan como saldado.
  const settledIds = candidates
    .filter((o) => {
      const paid = o.payments.reduce(
        (acc, p) => acc.add(p.amountBase).add(p.discountBase ?? 0).add(p.serviceChargeDiscountBase ?? 0),
        toDecimal(0),
      );
      return round2(o.totalBase.sub(paid)).lte(0.01);
    })
    .map((o) => o.id);

  if (settledIds.length === 0) return 0;
  await tx.order.updateMany({ where: { id: { in: settledIds } }, data: { clearedAt: closedAt } });
  return settledIds.length;
}

/** El vertical decide de dónde salen los cobros del turno (ver collectPayments). */
async function businessTypeOf(restaurantId: string): Promise<BusinessType> {
  const row = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { businessType: true } });
  return row?.businessType ?? 'RESTAURANT';
}

/**
 * Sobrante/faltante por método: lo contado menos lo esperado. Solo se arma cuando el cajero
 * de verdad contó — un cierre sin conteo sigue siendo válido y no inventa un descuadre de 0.
 */
function buildArqueo(
  expectedByMethod: Record<string, string>,
  countedBalances: Record<string, string> | null | undefined,
) {
  if (!countedBalances) return null;
  const byMethod = Object.fromEntries(
    PAYMENT_METHODS.map((method) => {
      const expected = toDecimal(expectedByMethod[method] ?? 0);
      const counted = toDecimal(String(countedBalances[method] ?? 0) || 0);
      return [
        method,
        {
          expected: expected.toFixed(2),
          counted: counted.toFixed(2),
          difference: round2(counted.sub(expected)).toFixed(2),
        },
      ];
    }),
  );
  const totalDifference = round2(
    PAYMENT_METHODS.reduce((acc, m) => acc.add(toDecimal(byMethod[m].difference)), toDecimal(0)),
  );
  return { byMethod, totalDifference: totalDifference.toFixed(2) };
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
    const businessType = await businessTypeOf(restaurantId);
    return {
      session,
      summary: await computeSummary(
        restaurantId,
        businessType,
        session.openedAt,
        session.openingBalances as Record<string, unknown> | null,
      ),
    };
  },

  /** Botón "Confirmar cierre": congela el resumen del turno y asigna el número de cierre. */
  async close(restaurantId: string, id: string, userId: string | undefined, countedBalances?: Record<string, string> | null) {
    const businessType = await businessTypeOf(restaurantId);
    const { closed, clearedCount } = await prisma.$transaction(async (tx) => {
      const session = await tx.cashSession.findFirst({ where: { id, restaurantId, status: 'OPEN' } });
      if (!session) throw notFound('Caja abierta no encontrada.');

      const base = await computeSummary(
        restaurantId,
        businessType,
        session.openedAt,
        session.openingBalances as Record<string, unknown> | null,
      );
      // El arqueo se congela DENTRO del snapshot: el recibo del cierre tiene que seguir
      // mostrando el mismo descuadre aunque después se registren movimientos tardíos.
      const summary = { ...base, arqueo: buildArqueo(base.expectedByMethod, countedBalances) };

      const last = await tx.cashSession.findFirst({
        where: { restaurantId, closeNumber: { not: null } },
        orderBy: { closeNumber: 'desc' },
      });
      const closeNumber = (last?.closeNumber ?? 0) + 1;
      const closedAt = new Date();

      const clearedCount = await clearSettledOrders(tx, restaurantId, closedAt);

      const closed = await tx.cashSession.update({
        where: { id: session.id },
        data: {
          status: 'CLOSED',
          closedByUserId: userId,
          closedAt,
          closeNumber,
          closingSummary: summary,
          countedBalances: countedBalances ?? undefined,
        },
        include: { openedByUser: { select: { name: true, role: true } }, closedByUser: { select: { name: true, role: true } } },
      });

      return { closed, clearedCount };
    });

    // Fuera de la transacción: los paneles abiertos (Pedidos, cocina) recargan solos
    // en vez de quedarse mostrando comandas que ya salieron de la pantalla.
    if (clearedCount > 0) emitToKitchen(restaurantId, SocketEvents.ORDERS_CLEARED, { clearedCount });

    return closed;
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
