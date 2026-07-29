import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

/**
 * Pista de auditoría fiscal. Providencia 102 exige un registro automático de
 * quién emitió, anuló o intentó modificar un documento fiscal, y cuándo.
 *
 * Reglas de esta capa:
 *  - Solo INSERT. No hay update ni delete de logs en ninguna parte del código.
 *  - Nunca lanza: si el log falla, no puede tumbar la emisión ni el cobro. Pero
 *    el fallo se imprime, porque perder la pista de auditoría es un incidente.
 */

export type FiscalAuditEvent =
  | 'ISSUE_ATTEMPT'
  | 'ISSUED'
  | 'ISSUE_FAILED'
  | 'CONTROL_NUMBER_ASSIGNED'
  | 'VOID_REQUESTED'
  | 'VOIDED'
  | 'CREDIT_NOTE_ISSUED'
  | 'MODIFY_BLOCKED'
  | 'DELETE_BLOCKED'
  | 'CONFIG_CHANGED';

export interface FiscalActor {
  actorType: 'USER' | 'PLATFORM_ADMIN' | 'SYSTEM';
  actorId?: string | null;
  actorName?: string | null;
}

/** Actor por defecto de los jobs automáticos (reintentos, números de control). */
export const SYSTEM_ACTOR: FiscalActor = { actorType: 'SYSTEM', actorName: 'QuickTap (automático)' };

export async function writeFiscalAudit(entry: {
  restaurantId: string;
  invoiceId?: string | null;
  orderId?: string | null;
  event: FiscalAuditEvent;
  actor: FiscalActor;
  detail?: Prisma.InputJsonValue;
}) {
  try {
    await prisma.fiscalAuditLog.create({
      data: {
        restaurantId: entry.restaurantId,
        invoiceId: entry.invoiceId ?? null,
        orderId: entry.orderId ?? null,
        event: entry.event,
        actorType: entry.actor.actorType,
        actorId: entry.actor.actorId ?? null,
        actorName: entry.actor.actorName ?? null,
        detail: entry.detail,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[fiscal-audit] No se pudo escribir la pista de auditoría:', entry.event, err);
  }
}
