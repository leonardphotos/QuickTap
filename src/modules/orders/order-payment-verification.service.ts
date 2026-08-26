import { OrderPaymentVerificationStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { formatVenezuelanWhatsappPhone } from '../../utils/whatsapp';
import { orderService } from './order.service';

/**
 * ============================================================================
 *  Verificación de pago por chatbot de WhatsApp (comprobante -> Aprobado/Rechazado)
 * ============================================================================
 *  Ver OrderPaymentVerification en prisma/schema.prisma para el modelo. Reglas
 *  de negocio centrales de este archivo:
 *
 *  - Solo puede haber UNA verificación en estado AWAITING_VERIFIER por restaurante
 *    a la vez: es lo que permite que el verificador (un cajero/dueño mirando
 *    WhatsApp) responda simplemente "Aprobado" sin tener que citar un número de
 *    pedido — nunca hay ambigüedad sobre a cuál comprobante se refiere. Si llega
 *    un segundo comprobante mientras el primero está pendiente, se encola
 *    (PENDING_FORWARD) y se reenvía automáticamente al resolverse el anterior.
 *  - Un rechazo no crea un estado nuevo: la misma fila vuelve a AWAITING_PROOF
 *    para que el cliente pueda reenviar la foto y el ciclo siga igual.
 */

function normalizePhone(phone: string): string {
  return formatVenezuelanWhatsappPhone(phone).replace(/\D/g, '');
}

/** Crea la verificación al mandar el mensaje de "cómo pagar" (ver order.service.ts -> checkoutDelivery). */
async function create(restaurantId: string, orderId: string, customerPhone: string) {
  return prisma.orderPaymentVerification.create({
    data: { restaurantId, orderId, customerPhone: normalizePhone(customerPhone), status: 'AWAITING_PROOF' },
  });
}

/** El pedido sin pagar más reciente de ese teléfono con una solicitud de comprobante abierta. */
async function matchAwaitingProofOrder(restaurantId: string, phoneDigits: string) {
  return prisma.orderPaymentVerification.findFirst({
    where: { restaurantId, customerPhone: phoneDigits, status: 'AWAITING_PROOF' },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Modo FULL_ORDER (ver whatsapp-bot.service.ts): no hay foto que esperar, el pedido
 * completo YA es lo que se reenvía al verificador — así que arranca directo en
 * AWAITING_VERIFIER (o PENDING_FORWARD si ya hay otra verificación en curso), nunca en
 * AWAITING_PROOF. Mismo criterio de "solo una AWAITING_VERIFIER a la vez" que
 * recordProofImage.
 */
async function createAwaitingVerifierOrQueue(restaurantId: string, orderId: string, customerPhone: string) {
  const hasActiveVerification = await prisma.orderPaymentVerification.findFirst({
    where: { restaurantId, status: 'AWAITING_VERIFIER' },
  });
  const shouldForwardNow = !hasActiveVerification;
  const verification = await prisma.orderPaymentVerification.create({
    data: {
      restaurantId,
      orderId,
      customerPhone: normalizePhone(customerPhone),
      status: shouldForwardNow ? 'AWAITING_VERIFIER' : 'PENDING_FORWARD',
      ...(shouldForwardNow ? { forwardedToVerifierAt: new Date() } : {}),
    },
  });
  return { shouldForwardNow, verification };
}

/** Guarda la foto recibida; decide si se reenvía ya al verificador o si queda en cola. */
async function recordProofImage(verificationId: string, imageUrl: string) {
  const restaurantId = (await prisma.orderPaymentVerification.findUniqueOrThrow({ where: { id: verificationId } }))
    .restaurantId;
  const hasActiveVerification = await prisma.orderPaymentVerification.findFirst({
    where: { restaurantId, status: 'AWAITING_VERIFIER' },
  });
  const shouldForwardNow = !hasActiveVerification;
  const verification = await prisma.orderPaymentVerification.update({
    where: { id: verificationId },
    data: {
      proofImageUrl: imageUrl,
      proofReceivedAt: new Date(),
      status: shouldForwardNow ? 'AWAITING_VERIFIER' : 'PENDING_FORWARD',
      ...(shouldForwardNow ? { forwardedToVerifierAt: new Date() } : {}),
    },
  });
  return { shouldForwardNow, verification };
}

const APPROVE_RE = /^aprobad[oa]\b/i;
const REJECT_RE = /^rechazad[oa]\b/i;

/**
 * Interpreta la respuesta del verificador. Solo puede haber una verificación
 * AWAITING_VERIFIER por restaurante (ver comentario del encabezado), así que
 * un "Aprobado"/"Rechazado" siempre resuelve exactamente esa, sin ambigüedad.
 */
async function resolveVerifierReply(
  restaurantId: string,
  text: string,
): Promise<{ action: 'approve' | 'reject' | 'ignore'; verification?: { id: string } }> {
  const action = APPROVE_RE.test(text) ? 'approve' : REJECT_RE.test(text) ? 'reject' : 'ignore';
  if (action === 'ignore') return { action };
  const verification = await prisma.orderPaymentVerification.findFirst({
    where: { restaurantId, status: 'AWAITING_VERIFIER' },
  });
  if (!verification) return { action: 'ignore' };
  return { action, verification };
}

/** El verificador respondió "Aprobado": marca la verificación y dispara el paso a cocina. */
async function approve(verificationId: string) {
  const verification = await prisma.orderPaymentVerification.update({
    where: { id: verificationId },
    data: { status: 'APPROVED', verifierRepliedAt: new Date(), resolvedAt: new Date() },
  });
  await orderService.autoAcceptAfterPaymentApproved(verification.restaurantId, verification.orderId);

  // Aprobar CON comprobante también registra el cobro en el pedido, con la foto como
  // soporte: el verificador acaba de dar el pago por bueno — sin esto, la cuenta seguía
  // figurando impaga en Pedidos, la caja y los bancos, y el comprobante quedaba enterrado
  // en la verificación. Pasa por addPayment (no por un insert directo) para que el asiento
  // bancario y el candado anti-doble-cobro apliquen igual que si lo registrara el cajero.
  // FULL_ORDER (sin foto) queda fuera: ahí no hay método ni soporte documentado — el cobro
  // lo registra caja como siempre. A la mejor suerte: si el cajero se adelantó y ya cobró,
  // el "excede el saldo" de addPayment lo frena sin tumbar la aprobación.
  if (verification.proofImageUrl) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: verification.orderId },
        include: { payments: true },
      });
      if (order?.paymentMethod) {
        const saldado = order.payments.reduce(
          (acc, p) => acc + Number(p.amountBase) + Number(p.discountBase ?? 0) + Number(p.serviceChargeDiscountBase ?? 0),
          0,
        );
        const saldo = Math.round((Number(order.totalBase) - saldado) * 100) / 100;
        if (saldo > 0.009) {
          await orderService.addPayment(verification.restaurantId, verification.orderId, {
            amountBase: saldo,
            method: order.paymentMethod,
            proofImageUrl: verification.proofImageUrl,
          } as never);
        }
      }
    } catch (err) {
      console.error('[order-payment-verification] pago aprobado pero no se pudo registrar el cobro:', err);
    }
  }
  return {
    orderId: verification.orderId,
    restaurantId: verification.restaurantId,
    customerPhone: verification.customerPhone,
    isFullOrder: !verification.proofImageUrl,
  };
}

/**
 * El verificador respondió "Rechazado". En modo PAYMENT_VERIFICATION (tenía foto) vuelve
 * a pedir el comprobante, mismo pedido. En modo FULL_ORDER (nunca tuvo foto, ver
 * createAwaitingVerifierOrQueue) no hay nada que reenviar — queda REJECTED, terminal.
 */
async function reject(verificationId: string) {
  const current = await prisma.orderPaymentVerification.findUniqueOrThrow({ where: { id: verificationId } });
  const isFullOrder = !current.proofImageUrl;
  const verification = await prisma.orderPaymentVerification.update({
    where: { id: verificationId },
    data: isFullOrder
      ? { status: 'REJECTED', verifierRepliedAt: new Date(), resolvedAt: new Date() }
      : {
          status: 'AWAITING_PROOF',
          proofImageUrl: null,
          forwardedToVerifierAt: null,
          verifierRepliedAt: new Date(),
        },
  });
  return {
    orderId: verification.orderId,
    restaurantId: verification.restaurantId,
    customerPhone: verification.customerPhone,
    isFullOrder,
  };
}

/** Tras resolver una verificación (aprobada/rechazada/timeout), avanza la siguiente en cola. */
async function dequeueNext(restaurantId: string) {
  const next = await prisma.orderPaymentVerification.findFirst({
    where: { restaurantId, status: 'PENDING_FORWARD' },
    orderBy: { proofReceivedAt: 'asc' },
  });
  if (!next) return null;
  return prisma.orderPaymentVerification.update({
    where: { id: next.id },
    data: { status: 'AWAITING_VERIFIER', forwardedToVerifierAt: new Date() },
  });
}

/** Barrido periódico (ver server.ts): marca como vencidas las que el verificador nunca respondió. */
async function sweepTimeouts(timeoutMs: number) {
  const cutoff = new Date(Date.now() - timeoutMs);
  const stale = await prisma.orderPaymentVerification.findMany({
    where: { status: 'AWAITING_VERIFIER', forwardedToVerifierAt: { lt: cutoff } },
  });
  if (stale.length === 0) return [];
  await prisma.orderPaymentVerification.updateMany({
    where: { id: { in: stale.map((s) => s.id) } },
    data: { status: 'TIMED_OUT' as OrderPaymentVerificationStatus, resolvedAt: new Date() },
  });
  return stale.map((s) => ({ verification: s, orderId: s.orderId, restaurantId: s.restaurantId }));
}

export const orderPaymentVerificationService = {
  create,
  createAwaitingVerifierOrQueue,
  matchAwaitingProofOrder,
  recordProofImage,
  resolveVerifierReply,
  approve,
  reject,
  dequeueNext,
  sweepTimeouts,
};
