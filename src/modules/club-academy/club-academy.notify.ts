import { whatsappBotService } from '../whatsapp-bot/whatsapp-bot.service';
import { caracasPartsOf } from '../../utils/timezone';

/**
 * Avisos por WhatsApp de la academia.
 *
 * Todo lo de acá se llama SIEMPRE fuera de la transacción y nunca se propaga un
 * error hacia arriba: que WhatsApp esté caído no puede tumbar una inscripción ya
 * cobrada ni dejar una clase a medio crear. Si falla, se registra y sigue.
 */
async function send(restaurantId: string, phone: string | null | undefined, message: string): Promise<boolean> {
  if (!phone) return false;
  try {
    return await whatsappBotService.sendMessage(restaurantId, phone, message);
  } catch (err) {
    console.error('[academia] no se pudo avisar por WhatsApp:', (err as Error).message);
    return false;
  }
}

function when(date: Date): string {
  const { dateStr, hhmm } = caracasPartsOf(date);
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y} a las ${hhmm}`;
}

interface CoachLike {
  displayName: string;
  phone: string;
}

interface SessionLike {
  startsAt: Date;
  endsAt: Date;
}

export const academyNotifier = {
  /** El profesor tiene una clase nueva asignada. */
  async coachAssigned(restaurantId: string, coach: CoachLike, session: SessionLike) {
    return send(
      restaurantId,
      coach.phone,
      `Hola ${coach.displayName}, te asignaron una clase el ${when(session.startsAt)}.`,
    );
  },

  /** Se inscribió un alumno en su grupo. */
  async studentEnrolled(restaurantId: string, coach: CoachLike, groupName: string, studentName: string) {
    return send(
      restaurantId,
      coach.phone,
      `Hola ${coach.displayName}, ${studentName} se inscribió en tu grupo "${groupName}".`,
    );
  },

  /** La clase se liberó por no llegar al cupo mínimo. */
  async sessionReleased(restaurantId: string, coach: CoachLike, session: SessionLike, seats: number) {
    return send(
      restaurantId,
      coach.phone,
      `Hola ${coach.displayName}, se canceló tu clase del ${when(session.startsAt)} porque solo había ${seats} alumno(s) y no se llegó al mínimo.`,
    );
  },

  async sessionCancelled(restaurantId: string, coach: CoachLike, session: SessionLike, reason: string | null) {
    return send(
      restaurantId,
      coach.phone,
      `Hola ${coach.displayName}, se canceló tu clase del ${when(session.startsAt)}.${reason ? ` Motivo: ${reason}.` : ''}`,
    );
  },

  /** Aviso de cobro al alumno, en $ y en Bs — nunca solo en $: obligar al
   * cliente a hacer la cuenta es el mismo error que ya se corrigió en el
   * recordatorio de mensualidad de la plataforma. */
  async chargeDue(
    restaurantId: string,
    phone: string,
    studentName: string,
    amountBase: string,
    amountBs: string | null,
    symbol: string,
  ) {
    const bs = amountBs ? ` (Bs ${amountBs})` : '';
    return send(
      restaurantId,
      phone,
      `Hola ${studentName}, tienes pendiente la mensualidad de la academia: ${symbol}${amountBase}${bs}. Cuando pagues, envíanos el número de referencia.`,
    );
  },

  /** Se liberó un puesto en un grupo donde estaba en lista de espera. */
  async waitlistSeatFree(restaurantId: string, phone: string, studentName: string, groupName: string) {
    return send(
      restaurantId,
      phone,
      `Hola ${studentName}, se liberó un puesto en "${groupName}". Escríbenos para confirmar tu inscripción antes de que lo tome alguien más.`,
    );
  },

  /** Solicitud de inscripción entrada desde el enlace público. */
  async enrollmentRequested(restaurantId: string, phone: string, studentName: string, groupName: string, waitlisted: boolean) {
    return send(
      restaurantId,
      phone,
      waitlisted
        ? `Hola ${studentName}, el grupo "${groupName}" está lleno, así que te anotamos en la lista de espera. Te avisamos apenas se libere un puesto.`
        : `Hola ${studentName}, quedaste inscrito en "${groupName}". ¡Nos vemos en la cancha!`,
    );
  },

  async studentSessionCancelled(restaurantId: string, phone: string, studentName: string, session: SessionLike) {
    return send(
      restaurantId,
      phone,
      `Hola ${studentName}, tu clase del ${when(session.startsAt)} fue cancelada. Se te acreditó una ficha para recuperarla.`,
    );
  },
};
