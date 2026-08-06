import { BillingCycle, SubscriptionPaymentVerificationStatus, SubscriptionPlan } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { formatVenezuelanWhatsappPhone } from '../../utils/whatsapp';
import { planRequestService } from '../plan-requests/plan-request.service';

/**
 * ============================================================================
 *  Verificación de pago de RENOVACIÓN de plan (chatbot maestro de WhatsApp)
 * ============================================================================
 *  Mismo patrón que order-payment-verification.service.ts, pero a nivel
 *  PLATAFORMA en vez de por restaurante: hay un solo número verificador para
 *  todo QuickTap (PlatformSettings.subscriptionVerifierPhone), así que la regla
 *  "solo una fila en AWAITING_VERIFIER a la vez" aplica GLOBAL, no por
 *  restaurante — es lo que permite que el verificador responda "Aprobado" sin
 *  tener que decir a qué restaurante se refiere.
 */

function normalizePhone(phone: string): string {
  return formatVenezuelanWhatsappPhone(phone).replace(/\D/g, '');
}

/** Crea la verificación al mandar el recordatorio de renovación (ver subscription-reminder.service.ts). */
async function create(
  restaurantId: string,
  ownerPhone: string,
  plan: SubscriptionPlan,
  billingCycle: BillingCycle,
  amountUsd?: number,
) {
  return prisma.subscriptionPaymentVerification.create({
    data: {
      restaurantId,
      ownerPhone: normalizePhone(ownerPhone),
      plan,
      billingCycle,
      amountUsd,
      status: 'AWAITING_PROOF',
    },
  });
}

/** La verificación AWAITING_PROOF más reciente de ese teléfono (el dueño mandó una foto). */
async function matchAwaitingProof(phoneDigits: string) {
  return prisma.subscriptionPaymentVerification.findFirst({
    where: { ownerPhone: phoneDigits, status: 'AWAITING_PROOF' },
    orderBy: { createdAt: 'desc' },
  });
}

/** Guarda la foto recibida; decide si se reenvía ya al verificador o si queda en cola. */
async function recordProofImage(verificationId: string, imageUrl: string) {
  const hasActiveVerification = await prisma.subscriptionPaymentVerification.findFirst({
    where: { status: 'AWAITING_VERIFIER' },
  });
  const shouldForwardNow = !hasActiveVerification;
  const verification = await prisma.subscriptionPaymentVerification.update({
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

/** Interpreta la respuesta del verificador — solo puede haber una fila AWAITING_VERIFIER
 * a la vez (ver comentario del encabezado), así que nunca hay ambigüedad. */
async function resolveVerifierReply(
  text: string,
): Promise<{ action: 'approve' | 'reject' | 'ignore'; verification?: { id: string } }> {
  const action = APPROVE_RE.test(text) ? 'approve' : REJECT_RE.test(text) ? 'reject' : 'ignore';
  if (action === 'ignore') return { action };
  const verification = await prisma.subscriptionPaymentVerification.findFirst({ where: { status: 'AWAITING_VERIFIER' } });
  if (!verification) return { action: 'ignore' };
  return { action, verification };
}

/** El verificador respondió "Aprobado": marca la verificación y renueva el plan vigente. */
async function approve(verificationId: string) {
  const verification = await prisma.subscriptionPaymentVerification.update({
    where: { id: verificationId },
    data: { status: 'APPROVED', verifierRepliedAt: new Date(), resolvedAt: new Date() },
  });
  const restaurant = await planRequestService.renewCurrentPlan(verification.restaurantId);
  return { restaurantId: verification.restaurantId, ownerPhone: verification.ownerPhone, restaurant };
}

/** El verificador respondió "Rechazado": vuelve a AWAITING_PROOF para que el dueño reenvíe el comprobante. */
async function reject(verificationId: string) {
  const verification = await prisma.subscriptionPaymentVerification.update({
    where: { id: verificationId },
    data: {
      status: 'AWAITING_PROOF',
      proofImageUrl: null,
      forwardedToVerifierAt: null,
      verifierRepliedAt: new Date(),
    },
  });
  return { restaurantId: verification.restaurantId, ownerPhone: verification.ownerPhone };
}

/** Tras resolver una verificación, avanza la siguiente en cola (si hay). */
async function dequeueNext() {
  const next = await prisma.subscriptionPaymentVerification.findFirst({
    where: { status: 'PENDING_FORWARD' },
    orderBy: { proofReceivedAt: 'asc' },
  });
  if (!next) return null;
  return prisma.subscriptionPaymentVerification.update({
    where: { id: next.id },
    data: { status: 'AWAITING_VERIFIER', forwardedToVerifierAt: new Date() },
  });
}

/** Barrido periódico (ver server.ts): marca como vencidas las que el verificador nunca respondió. */
async function sweepTimeouts(timeoutMs: number) {
  const cutoff = new Date(Date.now() - timeoutMs);
  const stale = await prisma.subscriptionPaymentVerification.findMany({
    where: { status: 'AWAITING_VERIFIER', forwardedToVerifierAt: { lt: cutoff } },
  });
  if (stale.length === 0) return [];
  await prisma.subscriptionPaymentVerification.updateMany({
    where: { id: { in: stale.map((s) => s.id) } },
    data: { status: 'TIMED_OUT' as SubscriptionPaymentVerificationStatus, resolvedAt: new Date() },
  });
  return stale;
}

export const subscriptionPaymentVerificationService = {
  create,
  matchAwaitingProof,
  recordProofImage,
  resolveVerifierReply,
  approve,
  reject,
  dequeueNext,
  sweepTimeouts,
};
