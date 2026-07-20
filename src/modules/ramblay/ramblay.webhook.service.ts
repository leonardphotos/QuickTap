import crypto from 'crypto';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { notFound } from '../../utils/http-error';
import { planRequestService } from '../plan-requests/plan-request.service';
import { ramblayWebhookSchema } from './ramblay.dto';

/**
 * Verifica la firma del webhook. Confirmado en https://ramblay.com/webhooks/:
 * header `X-Webhook-Signature-256`, formato `t=<timestamp>,v1=<hmac_hex>`,
 * HMAC-SHA256 en hex sobre `"{timestamp}.{raw_body}"` (nunca sobre un JSON
 * re-serializado — deben ser los bytes exactos que llegaron).
 */
export function verifyRamblaySignature(rawBody: Buffer | undefined, signatureHeader: string | undefined): boolean {
  if (!env.ramblay.webhookSecret) {
    throw new Error('RAMBLAY_WEBHOOK_SECRET no está configurada en el servidor.');
  }
  if (!rawBody || !signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader
      .split(',')
      .map((p) => p.split('=') as [string, string]),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const signedContent = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', env.ramblay.webhookSecret).update(signedContent).digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const receivedBuf = Buffer.from(signature, 'utf8');
  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

// Confirmado: "payframe.completed" (status pasa a "complete"). El evento de
// vencimiento/abandono no está confirmado en la doc — payframe.expired es
// una suposición razonable por el mismo patrón de nombres (AJUSTAR si difiere).
const APPROVED_EVENT_TYPES = ['payframe.completed'];
const EXPIRED_EVENT_TYPES = ['payframe.expired'];

export const ramblayWebhookService = {
  /**
   * Traduce el evento de Ramblay a una aprobación/rechazo del PlanRequest
   * correspondiente. Cruza primero por client_reference_id (nuestro propio
   * PlanRequest.id, que Ramblay devuelve tal cual) y, si no viene, por el id
   * del Payframe guardado como ramblayPaymentId al crear el pago. Idempotente
   * a propósito: un reintento del mismo webhook no debe romper nada.
   */
  async handle(rawPayload: unknown) {
    const event = ramblayWebhookSchema.parse(rawPayload);
    const { id: objectId, client_reference_id: clientReferenceId } = event.data.object;

    const planRequest = clientReferenceId
      ? await prisma.planRequest.findUnique({ where: { id: clientReferenceId } })
      : await prisma.planRequest.findUnique({ where: { ramblayPaymentId: objectId } });

    if (!planRequest) {
      throw notFound(`No se encontró la solicitud de plan para el pago de Ramblay ${objectId}.`);
    }

    if (APPROVED_EVENT_TYPES.includes(event.type)) {
      if (planRequest.status !== 'APPROVED') {
        await planRequestService.approve(planRequest.id);
      }
    } else if (EXPIRED_EVENT_TYPES.includes(event.type)) {
      // Checkout abandonado/vencido, no un rechazo activo del banco — encaja
      // mejor con "Pago no recibido" que con "Rechazado".
      if (planRequest.status === 'PENDING') {
        await planRequestService.reject(planRequest.id, 'PAYMENT_NOT_RECEIVED');
      }
    }
    // Cualquier otro `type` (ej. charge.failed de un intento fallido dentro de
    // un Payframe que sigue abierto para reintentar): no hay nada que cambiar
    // todavía, solo se confirma recepción (200) para que Ramblay no reintente de más.
  },
};
