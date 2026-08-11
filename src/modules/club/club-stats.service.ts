import { prisma } from '../../config/prisma';
import { round2, toDecimal } from '../../utils/money';
import { atTimeCaracas, caracasPartsOf, startOfDayCaracas } from '../../utils/timezone';

/**
 * ============================================================================
 *  Estadísticas de ocupación de canchas
 * ============================================================================
 *  Ocupación = minutos vendidos / minutos disponibles. Lo que un club necesita
 *  saber no es cuánto facturó, sino cuánta de su capacidad quedó sin vender:
 *  dos días con la misma facturación pueden tener ocupación muy distinta si uno
 *  fue con precio de hora pico.
 *
 *  El disponible NO se saca sumando las franjas de ClubSchedule: pueden
 *  solaparse sobre la misma cancha (un tramo cargado a 60 min y otro a 90 min
 *  sobre el mismo horario, ver el comentario del modelo). Sumarlas contaría el
 *  mismo tiempo dos veces y daría ocupaciones imposibles por debajo de lo real.
 *  Por eso se unen los intervalos antes de medirlos.
 */

interface Interval {
  start: number; // minutos desde medianoche
  end: number;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Une intervalos solapados o pegados y devuelve los minutos totales que cubren. */
function unionMinutes(intervals: Interval[]): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let total = 0;
  let { start, end } = sorted[0];
  for (const cur of sorted.slice(1)) {
    if (cur.start <= end) {
      end = Math.max(end, cur.end);
    } else {
      total += end - start;
      ({ start, end } = cur);
    }
  }
  return total + (end - start);
}

/**
 * Ocupación día por día en un rango. `days` cuenta hacia atrás incluyendo hoy.
 *
 * Devuelve por día los minutos vendidos, los disponibles, el % y la facturación,
 * más el detalle por cancha del período — para poder ver no solo cuánto se vendió
 * sino cuál cancha se está quedando vacía.
 */
async function occupancy(restaurantId: string, days: number) {
  const today = caracasPartsOf(new Date()).dateStr;
  const start = startOfDayCaracas(today);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  // Fin exclusivo: el arranque del día siguiente a hoy.
  const endExclusive = startOfDayCaracas(today);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  const [courts, schedules, blocks] = await Promise.all([
    prisma.clubCourt.findMany({
      where: { restaurantId, active: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.clubSchedule.findMany({
      where: { restaurantId, active: true },
      select: { courtId: true, weekday: true, startTime: true, endTime: true },
    }),
    prisma.clubCourtBlock.findMany({
      where: {
        restaurantId,
        status: 'ACTIVE',
        kind: 'BOOKING',
        startsAt: { gte: start, lt: endExclusive },
      },
      select: {
        courtId: true,
        startsAt: true,
        endsAt: true,
        booking: { select: { totalBase: true, status: true } },
      },
    }),
  ]);

  /** Minutos vendibles de una cancha en un día de la semana, sin contar dos veces
   * las franjas que se solapan. */
  const availableFor = (courtId: string, weekday: number) =>
    unionMinutes(
      schedules
        .filter((s) => s.weekday === weekday && (s.courtId === null || s.courtId === courtId))
        .map((s) => ({ start: toMinutes(s.startTime), end: toMinutes(s.endTime) })),
    );

  // Un día a la vez, en hora de Caracas: el club abre y cierra por su reloj, no por UTC.
  const byDay: {
    date: string;
    weekday: number;
    bookedMinutes: number;
    availableMinutes: number;
    occupancyPercent: number;
    bookings: number;
    revenueBase: string;
  }[] = [];
  const byCourt = new Map<string, { courtId: string; name: string; bookedMinutes: number; availableMinutes: number }>();
  for (const c of courts) byCourt.set(c.id, { courtId: c.id, name: c.name, bookedMinutes: 0, availableMinutes: 0 });

  for (let i = 0; i < days; i += 1) {
    const dayStart = new Date(start);
    dayStart.setUTCDate(dayStart.getUTCDate() + i);
    const { dateStr, dayOfWeek: weekday } = caracasPartsOf(dayStart);
    const dayFrom = atTimeCaracas(dateStr, '00:00');
    const dayTo = new Date(dayFrom.getTime() + 24 * 60 * 60 * 1000);

    let availableMinutes = 0;
    for (const court of courts) {
      const mins = availableFor(court.id, weekday);
      availableMinutes += mins;
      byCourt.get(court.id)!.availableMinutes += mins;
    }

    const dayBlocks = blocks.filter((b) => b.startsAt >= dayFrom && b.startsAt < dayTo);
    // Una reserva cancelada no ocupó la cancha; su bloque queda CANCELLED y ya está
    // filtrado, pero el booking puede haberse marcado cancelado sin tocar el bloque.
    const counted = dayBlocks.filter((b) => b.booking?.status !== 'CANCELLED');

    let bookedMinutes = 0;
    for (const b of counted) {
      const mins = Math.max(0, Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60000));
      bookedMinutes += mins;
      const entry = byCourt.get(b.courtId);
      if (entry) entry.bookedMinutes += mins;
    }

    const revenue = round2(counted.reduce((acc, b) => acc.add(b.booking?.totalBase ?? 0), toDecimal(0)));

    byDay.push({
      date: dateStr,
      weekday,
      bookedMinutes,
      availableMinutes,
      // Sin horarios cargados no hay capacidad contra la cual medir: 0 y no una división por cero.
      occupancyPercent: availableMinutes > 0 ? Math.round((bookedMinutes / availableMinutes) * 100) : 0,
      bookings: counted.length,
      revenueBase: revenue.toFixed(2),
    });
  }

  const totalBooked = byDay.reduce((acc, d) => acc + d.bookedMinutes, 0);
  const totalAvailable = byDay.reduce((acc, d) => acc + d.availableMinutes, 0);

  return {
    byDay,
    byCourt: [...byCourt.values()].map((c) => ({
      ...c,
      occupancyPercent: c.availableMinutes > 0 ? Math.round((c.bookedMinutes / c.availableMinutes) * 100) : 0,
    })),
    totals: {
      bookedMinutes: totalBooked,
      availableMinutes: totalAvailable,
      occupancyPercent: totalAvailable > 0 ? Math.round((totalBooked / totalAvailable) * 100) : 0,
      bookings: byDay.reduce((acc, d) => acc + d.bookings, 0),
      revenueBase: round2(byDay.reduce((acc, d) => acc.add(d.revenueBase), toDecimal(0))).toFixed(2),
    },
  };
}

export const clubStatsService = { occupancy };
