import { prisma } from '../config/prisma';
import { atTimeCaracas, caracasPartsOf } from './timezone';

/**
 * Mantiene vivo el club de demostración.
 *
 * EL PROBLEMA: la tablet solo abre un QR entre 30 minutos antes y 60 después de
 * la reserva (ver OPEN_BEFORE/AFTER_MINUTES en club-tablet.service.ts). Un seed
 * estático deja de funcionar en unas horas: al día siguiente, escanear el QR de
 * la demo responde "esta reserva ya terminó" y la demo queda rota justo cuando
 * alguien la va a mostrar.
 *
 * LA SOLUCIÓN: no se recrean las reservas, se DESLIZAN. Hay una reserva "en
 * vivo" por cancha con un `accessToken` FIJO y conocido; cuando su horario
 * queda atrás, esta función mueve su bloque para que vuelva a cubrir el momento
 * actual. Así un QR impreso o guardado en el teléfono sirve para siempre —
 * recrearlas daría un token nuevo cada vez y el QR de ayer no abriría nada.
 *
 * Se llama de forma perezosa desde las pantallas del club, igual que
 * settlePastBookings: este proyecto no tiene cron.
 */

/** Tokens fijos de las reservas en vivo. El QR de la demo apunta siempre acá. */
export const DEMO_LIVE_TOKENS = ['demolive1', 'demolive2'];

/** Cada cuánto se revisa, para no golpear la base en cada request. */
const CHECK_EVERY_MS = 60_000;
const lastCheck = new Map<string, number>();

/**
 * Desliza las reservas en vivo del club demo para que siempre haya una en curso
 * en cada cancha. No hace nada si el club no es demo.
 */
export async function refreshClubDemo(restaurantId: string, force = false): Promise<void> {
  // `force` lo usa el escaneo de un QR de demo: ahí el throttle no puede aplicar.
  // Si alguien escanea justo dentro de la ventana de un minuto, saltarse el
  // refresco haría fallar el QR — que es exactamente el problema que este
  // archivo existe para evitar.
  const last = lastCheck.get(restaurantId) ?? 0;
  if (!force && Date.now() - last < CHECK_EVERY_MS) return;
  lastCheck.set(restaurantId, Date.now());

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { isDemo: true, businessType: true },
  });
  if (!restaurant?.isDemo || restaurant.businessType !== 'SPORTS_CLUB') return;

  const bookings = await prisma.clubBooking.findMany({
    where: { restaurantId, accessToken: { in: DEMO_LIVE_TOKENS } },
    include: { block: true },
  });
  if (!bookings.length) return;

  const now = new Date();

  for (const booking of bookings) {
    if (!booking.block) continue;
    const startsAt = booking.block.startsAt;
    const endsAt = booking.block.endsAt;

    // Sigue cubriendo el momento actual (con el margen que acepta la tablet):
    // no hay nada que hacer.
    if (now >= new Date(startsAt.getTime() - 25 * 60_000) && now <= new Date(endsAt.getTime() + 55 * 60_000)) {
      continue;
    }

    // Se recoloca centrada en ahora: empezó hace 20 minutos y le queda ~1 hora.
    // Así la tablet la abre siempre y además muestra tiempo restante, que es lo
    // que se quiere enseñar en una demostración.
    const newStart = new Date(now.getTime() - 20 * 60_000);
    const newEnd = new Date(now.getTime() + 70 * 60_000);

    await prisma.$transaction(async (tx) => {
      // El bloque compite con la restricción EXCLUDE contra cualquier otra cosa
      // en esa cancha. Se cancela cualquier bloque que estorbe ANTES de mover —
      // en la demo, pisarlos es justo lo que se quiere.
      await tx.clubCourtBlock.updateMany({
        where: {
          restaurantId,
          courtId: booking.block!.courtId,
          id: { not: booking.blockId },
          status: 'ACTIVE',
          startsAt: { lt: newEnd },
          endsAt: { gt: newStart },
        },
        data: { status: 'CANCELLED' },
      });

      await tx.clubCourtBlock.update({
        where: { id: booking.blockId },
        data: { startsAt: newStart, endsAt: newEnd, status: 'ACTIVE' },
      });

      // Vuelve a estar en curso: ni jugada ni ausente, y con el check-in puesto
      // para que la tablet la deje entrar sin pasar por recepción.
      await tx.clubBooking.update({
        where: { id: booking.id },
        data: { status: 'CONFIRMED', checkedInAt: newStart, cancelledAt: null, cancelReason: null },
      });
    });
  }
}

/** Fecha de hoy en Caracas, para los seeds. */
export function todayCaracas(): string {
  return caracasPartsOf(new Date()).dateStr;
}

export { atTimeCaracas };
