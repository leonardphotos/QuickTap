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
  return { orderId: verification.orderId, restaurantId: verification.restaurantId, customerPhone: verification.customerPhone };
}

/** El verificador respondió "Rechazado": vuelve a pedir el comprobante, mismo pedido. */
async function reject(verificationId: string) {
  const verification = await prisma.orderPaymentVerification.update({
    where: { id: verificationId },
    data: {
      status: 'AWAITING_PROOF',
      proofImageUrl: null,
      forwardedToVerifierAt: null,
      verifierRepliedAt: new Date(),
    },
  });
  return { orderId: verification.orderId, restaurantId: verification.restaurantId, customerPhone: verification.customerPhone };
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
  matchAwaitingProofOrder,
  recordProofImage,
  resolveVerifierReply,
  approve,
  reject,
  dequeueNext,
  sweepTimeouts,
};
