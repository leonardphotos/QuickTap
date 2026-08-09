import { nanoid } from 'nanoid';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, conflict, notFound } from '../../utils/http-error';
import { atTimeCaracas, caracasPartsOf } from '../../utils/timezone';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import { customerService } from '../customers/customer.service';
import { emitToKitchen, SocketEvents } from '../../sockets';
import { CURRENCY_SYMBOLS } from '../../utils/money';
import type {
  CreateBookingInput,
  CreateCourtInput,
  CreateMaintenanceInput,
  CreateScheduleInput,
  ListBookingsQuery,
  UpdateCourtInput,
  UpdateScheduleInput,
} from './club.dto';

/**
 * Nombre de la restricción EXCLUDE de PostgreSQL que impide dos bloques
 * solapados en la misma cancha (ver la migración club_vertical_courts_bookings).
 * Es la única defensa real contra el doble booking: dos jugadores que reservan
 * en el mismo instante pasan ambos cualquier chequeo previo en el servicio.
 */
const OVERLAP_CONSTRAINT = 'club_court_blocks_no_overlap';

function isOverlapError(err: unknown): boolean {
  return err instanceof Error && err.message.includes(OVERLAP_CONSTRAINT);
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutesToHhmm(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

async function resolveRestaurantBySlug(slug: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      businessType: true,
      baseCurrency: true,
      logoUrl: true,
      theme: true,
    },
  });
  if (!restaurant || !restaurant.isActive || restaurant.businessType !== 'SPORTS_CLUB') {
    throw notFound('Este club no existe o no está disponible.');
  }
  return restaurant;
}

export interface AvailabilitySlot {
  startTime: string;
  endTime: string;
  startsAt: Date;
  endsAt: Date;
  priceBase: string;
  isPeak: boolean;
  available: boolean;
  /** Por qué no está libre: reservada, en mantenimiento, clase, torneo o ya pasó. */
  reason: 'BOOKING' | 'MAINTENANCE' | 'CLASS' | 'TOURNAMENT' | 'PAST' | null;
}

export const clubService = {
  // ---------------------------------------------------------------- Canchas
  async listCourts(restaurantId: string) {
    return prisma.clubCourt.findMany({
      where: { restaurantId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  },

  async createCourt(restaurantId: string, input: CreateCourtInput) {
    return prisma.clubCourt.create({ data: { restaurantId, ...input } });
  },

  async updateCourt(restaurantId: string, id: string, input: UpdateCourtInput) {
    const court = await prisma.clubCourt.findFirst({ where: { id, restaurantId }, select: { id: true } });
    if (!court) throw notFound('La cancha no existe o no pertenece a este club.');
    return prisma.clubCourt.update({ where: { id }, data: input });
  },

  async deleteCourt(restaurantId: string, id: string) {
    const court = await prisma.clubCourt.findFirst({ where: { id, restaurantId }, select: { id: true } });
    if (!court) throw notFound('La cancha no existe o no pertenece a este club.');
    // Se desactiva en vez de borrar: las reservas ya jugadas son historial contable.
    return prisma.clubCourt.update({ where: { id }, data: { active: false } });
  },

  // --------------------------------------------------------------- Horarios
  async listSchedules(restaurantId: string) {
    return prisma.clubSchedule.findMany({
      where: { restaurantId },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });
  },

  async createSchedule(restaurantId: string, input: CreateScheduleInput) {
    if (input.courtId) {
      const court = await prisma.clubCourt.findFirst({
        where: { id: input.courtId, restaurantId },
        select: { id: true },
      });
      if (!court) throw notFound('La cancha no existe o no pertenece a este club.');
    }
    const span = hhmmToMinutes(input.endTime) - hhmmToMinutes(input.startTime);
    if (span < input.slotMinutes) {
      throw badRequest('La franja es más corta que la duración de un turno.');
    }
    return prisma.clubSchedule.create({
      data: { restaurantId, ...input, courtId: input.courtId ?? null, priceBase: new Prisma.Decimal(input.priceBase) },
    });
  },

  async updateSchedule(restaurantId: string, id: string, input: UpdateScheduleInput) {
    const schedule = await prisma.clubSchedule.findFirst({ where: { id, restaurantId }, select: { id: true } });
    if (!schedule) throw notFound('El horario no existe o no pertenece a este club.');
    return prisma.clubSchedule.update({
      where: { id },
      data: {
        ...input,
        priceBase: input.priceBase !== undefined ? new Prisma.Decimal(input.priceBase) : undefined,
      },
    });
  },

  async deleteSchedule(restaurantId: string, id: string) {
    const schedule = await prisma.clubSchedule.findFirst({ where: { id, restaurantId }, select: { id: true } });
    if (!schedule) throw notFound('El horario no existe o no pertenece a este club.');
    await prisma.clubSchedule.delete({ where: { id } });
    return { ok: true };
  },

  // --------------------------------------------------------- Disponibilidad
  /**
   * Parrilla de turnos de un día para una cancha (o todas). Expande cada franja
   * horaria del día de la semana en turnos de `slotMinutes` y marca cuáles ya
   * están ocupados por CUALQUIER tipo de bloque (reserva, mantenimiento, clase
   * o torneo) — de ahí que todos vivan en la misma tabla.
   *
   * Esto es solo la vista: quien de verdad impide el doble booking es la
   * restricción de la base de datos al insertar.
   */
  async getAvailability(restaurantId: string, date: string, courtId?: string) {
    const dayStart = atTimeCaracas(date, '00:00');
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekday = caracasPartsOf(dayStart).dayOfWeek;

    const [courts, schedules, blocks] = await Promise.all([
      prisma.clubCourt.findMany({
        where: { restaurantId, active: true, ...(courtId ? { id: courtId } : {}) },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.clubSchedule.findMany({ where: { restaurantId, weekday, active: true } }),
      prisma.clubCourtBlock.findMany({
        where: {
          restaurantId,
          status: 'ACTIVE',
          startsAt: { lt: dayEnd },
          endsAt: { gt: dayStart },
          ...(courtId ? { courtId } : {}),
        },
        select: { courtId: true, kind: true, startsAt: true, endsAt: true },
      }),
    ]);

    const now = Date.now();

    return courts.map((court) => {
      // Una franja sin courtId aplica a todas las canchas; una con courtId manda
      // sobre la general para esa cancha.
      const own = schedules.filter((s) => s.courtId === court.id);
      const applicable = own.length > 0 ? own : schedules.filter((s) => s.courtId === null);
      const courtBlocks = blocks.filter((b) => b.courtId === court.id);

      const slots: AvailabilitySlot[] = [];
      for (const schedule of applicable) {
        const from = hhmmToMinutes(schedule.startTime);
        const to = hhmmToMinutes(schedule.endTime);
        for (let m = from; m + schedule.slotMinutes <= to; m += schedule.slotMinutes) {
          const startTime = minutesToHhmm(m);
          const endTime = minutesToHhmm(m + schedule.slotMinutes);
          const startsAt = atTimeCaracas(date, startTime);
          const endsAt = new Date(startsAt.getTime() + schedule.slotMinutes * 60_000);

          const clash = courtBlocks.find((b) => startsAt < b.endsAt && endsAt > b.startsAt);
          const isPast = endsAt.getTime() <= now;

          slots.push({
            startTime,
            endTime,
            startsAt,
            endsAt,
            priceBase: schedule.priceBase.toString(),
            isPeak: schedule.isPeak,
            available: !clash && !isPast,
            reason: clash ? clash.kind : isPast ? 'PAST' : null,
          });
        }
      }
      slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
      return { court, slots };
    });
  },

  // ---------------------------------------------------------------- Reservas
  /**
   * Crea la reserva y su bloque en una sola transacción. El precio y la tasa se
   * congelan aquí: si mañana sube la tasa o cambia el precio de la hora pico,
   * esta reserva no cambia (mismo criterio que Order).
   */
  async createBooking(restaurantId: string, input: CreateBookingInput) {
    const court = await prisma.clubCourt.findFirst({
      where: { id: input.courtId, restaurantId, active: true },
      select: { id: true },
    });
    if (!court) throw notFound('La cancha no existe o no está disponible.');

    const startsAt = atTimeCaracas(input.date, input.startTime);
    const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
    if (endsAt.getTime() <= Date.now()) {
      throw badRequest('No se puede reservar un horario que ya pasó.');
    }

    // El precio sale del horario configurado, nunca del cliente.
    const slots = await this.getAvailability(restaurantId, input.date, input.courtId);
    const slot = slots[0]?.slots.find((s) => s.startTime === input.startTime && s.endTime === caracasPartsOf(endsAt).hhmm);
    if (!slot) {
      throw badRequest('Ese horario no corresponde a un turno configurado para esta cancha.');
    }
    if (!slot.available) {
      throw conflict(slot.reason === 'PAST' ? 'Ese horario ya pasó.' : 'Ese horario ya no está disponible.');
    }

    const restaurant = await prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { baseCurrency: true },
    });
    const rate = await exchangeRateService.getRate(restaurant.baseCurrency, restaurantId);
    const totalBase = new Prisma.Decimal(slot.priceBase);
    const totalBs = totalBase.mul(rate.rateBs);

    await customerService.upsertFromOrder(restaurantId, {
      name: input.playerName,
      phone: input.playerPhone,
      idNumber: input.playerIdNumber,
    });
    const customer = await prisma.customer.findUnique({
      where: { restaurantId_phone: { restaurantId, phone: input.playerPhone } },
      select: { id: true },
    });

    try {
      const booking = await prisma.$transaction(async (tx) => {
        const block = await tx.clubCourtBlock.create({
          data: { restaurantId, courtId: input.courtId, kind: 'BOOKING', startsAt, endsAt },
        });
        return tx.clubBooking.create({
          data: {
            restaurantId,
            blockId: block.id,
            customerId: customer?.id ?? null,
            playerName: input.playerName,
            playerPhone: input.playerPhone,
            playerIdNumber: input.playerIdNumber ?? null,
            playerCount: input.playerCount,
            requestedExtras: input.requestedExtras?.length ? input.requestedExtras : Prisma.DbNull,
            totalBase,
            exchangeRate: rate.rateBs,
            totalBs,
            accessToken: nanoid(14),
          },
          include: { block: { include: { court: true } } },
        });
      });

      emitToKitchen(restaurantId, SocketEvents.CLUB_BOOKING_NEW, { id: booking.id });
      return booking;
    } catch (err) {
      // La restricción de la base de datos ganó la carrera: otro jugador reservó
      // ese mismo hueco entre nuestra consulta y nuestro INSERT.
      if (isOverlapError(err)) {
        throw conflict('Ese horario acaba de ser reservado por otra persona. Elige otro.');
      }
      throw err;
    }
  },

  async listBookings(restaurantId: string, query: ListBookingsQuery) {
    const where: Prisma.ClubBookingWhereInput = { restaurantId };
    if (query.status) where.status = query.status;
    if (query.date) {
      const dayStart = atTimeCaracas(query.date, '00:00');
      where.block = { startsAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) } };
    }
    return prisma.clubBooking.findMany({
      where,
      include: { block: { include: { court: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  },

  async cancelBooking(restaurantId: string, id: string) {
    const booking = await prisma.clubBooking.findFirst({ where: { id, restaurantId }, select: { id: true, blockId: true } });
    if (!booking) throw notFound('La reserva no existe o no pertenece a este club.');

    // Cancelar el bloque es lo que libera el hueco: la restricción solo mira los
    // bloques que no están CANCELLED.
    const updated = await prisma.$transaction(async (tx) => {
      await tx.clubCourtBlock.update({ where: { id: booking.blockId }, data: { status: 'CANCELLED' } });
      return tx.clubBooking.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
        include: { block: { include: { court: true } } },
      });
    });
    emitToKitchen(restaurantId, SocketEvents.CLUB_BOOKING_UPDATED, { id });
    return updated;
  },

  // ------------------------------------------------------ QR de acceso
  /** Resuelve una reserva por su token de QR, sin exponer nada del resto del club. */
  async getByAccessToken(accessToken: string) {
    const booking = await prisma.clubBooking.findUnique({
      where: { accessToken },
      include: {
        block: { include: { court: true } },
        // El ticket se pinta con los colores del club, igual que la portada.
        restaurant: { select: { name: true, slug: true, logoUrl: true, theme: true } },
      },
    });
    if (!booking) throw notFound('Esta reserva no existe.');
    return booking;
  },

  /**
   * Check-in en recepción. Marcar la asistencia acá es lo que después permite
   * detectar ausencias sin que nadie tenga que registrarlas a mano.
   */
  async checkIn(restaurantId: string, accessToken: string) {
    const booking = await prisma.clubBooking.findUnique({
      where: { accessToken },
      include: { block: { include: { court: true } } },
    });
    if (!booking || booking.restaurantId !== restaurantId) {
      throw notFound('Esta reserva no existe o no pertenece a este club.');
    }
    if (booking.status === 'CANCELLED') throw badRequest('Esta reserva fue cancelada.');
    if (booking.checkedInAt) {
      return { booking, alreadyCheckedIn: true };
    }
    const updated = await prisma.clubBooking.update({
      where: { id: booking.id },
      data: { checkedInAt: new Date(), status: 'CONFIRMED' },
      include: { block: { include: { court: true } } },
    });
    emitToKitchen(restaurantId, SocketEvents.CLUB_BOOKING_UPDATED, { id: booking.id });
    return { booking: updated, alreadyCheckedIn: false };
  },

  /**
   * Cierra las reservas cuya hora ya pasó: quien hizo check-in queda COMPLETED,
   * quien no, NO_SHOW. Se llama al abrir el calendario en vez de con un cron,
   * para que el estado esté al día sin depender de un proceso aparte.
   */
  async settlePastBookings(restaurantId: string) {
    const now = new Date();
    const pending = await prisma.clubBooking.findMany({
      where: {
        restaurantId,
        status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] },
        block: { endsAt: { lt: now }, status: 'ACTIVE' },
      },
      select: { id: true, checkedInAt: true },
    });
    if (pending.length === 0) return { completed: 0, noShows: 0 };

    const completed = pending.filter((b) => b.checkedInAt).map((b) => b.id);
    const noShows = pending.filter((b) => !b.checkedInAt).map((b) => b.id);

    await prisma.$transaction([
      prisma.clubBooking.updateMany({ where: { id: { in: completed } }, data: { status: 'COMPLETED' } }),
      prisma.clubBooking.updateMany({ where: { id: { in: noShows } }, data: { status: 'NO_SHOW' } }),
    ]);
    return { completed: completed.length, noShows: noShows.length };
  },

  // ------------------------------------------------------- Mantenimiento
  async createMaintenance(restaurantId: string, input: CreateMaintenanceInput) {
    const court = await prisma.clubCourt.findFirst({
      where: { id: input.courtId, restaurantId },
      select: { id: true },
    });
    if (!court) throw notFound('La cancha no existe o no pertenece a este club.');

    const startsAt = atTimeCaracas(input.date, input.startTime);
    const endsAt = atTimeCaracas(input.date, input.endTime);
    if (endsAt <= startsAt) throw badRequest('La hora de fin debe ser posterior a la de inicio.');

    try {
      const block = await prisma.clubCourtBlock.create({
        data: { restaurantId, courtId: input.courtId, kind: 'MAINTENANCE', startsAt, endsAt, note: input.note },
        include: { court: true },
      });
      emitToKitchen(restaurantId, SocketEvents.CLUB_CALENDAR_CHANGED, {});
      return block;
    } catch (err) {
      // Misma restricción que protege las reservas: no se puede bloquear una
      // cancha encima de una reserva que ya existe.
      if (isOverlapError(err)) {
        throw conflict('Ese horario choca con una reserva o bloqueo existente.');
      }
      throw err;
    }
  },

  async removeBlock(restaurantId: string, id: string) {
    const block = await prisma.clubCourtBlock.findFirst({ where: { id, restaurantId }, select: { id: true, kind: true } });
    if (!block) throw notFound('El bloqueo no existe o no pertenece a este club.');
    if (block.kind === 'BOOKING') {
      throw badRequest('Para liberar una reserva usa la cancelación de la reserva, no el calendario.');
    }
    await prisma.clubCourtBlock.delete({ where: { id } });
    emitToKitchen(restaurantId, SocketEvents.CLUB_CALENDAR_CHANGED, {});
    return { ok: true };
  },

  // ------------------------------------------------------------ Calendario
  /** Todo lo que ocupa las canchas un día: la vista de recepción. */
  async getCalendar(restaurantId: string, date: string) {
    await this.settlePastBookings(restaurantId);
    const dayStart = atTimeCaracas(date, '00:00');
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);

    const [courts, blocks] = await Promise.all([
      prisma.clubCourt.findMany({
        where: { restaurantId, active: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.clubCourtBlock.findMany({
        where: { restaurantId, status: 'ACTIVE', startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
        include: { booking: true },
        orderBy: { startsAt: 'asc' },
      }),
    ]);
    return { date, courts, blocks };
  },

  // ------------------------------------------------------- Rutas públicas
  async getPublicClub(slug: string) {
    const restaurant = await resolveRestaurantBySlug(slug);
    const courts = await prisma.clubCourt.findMany({
      where: { restaurantId: restaurant.id, active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, sport: true, indoor: true },
    });
    return {
      club: {
        name: restaurant.name,
        slug: restaurant.slug,
        logoUrl: restaurant.logoUrl,
        // La portada se pinta con los colores del club, no con un azul fijo:
        // un club de marca verde no debería verse forzado a otra paleta.
        theme: restaurant.theme,
        currencySymbol: CURRENCY_SYMBOLS[restaurant.baseCurrency],
      },
      courts,
    };
  },

  /**
   * Qué está pasando ahora mismo en cada cancha: la pantalla "Jugar hoy".
   *
   * `current` es el bloque que contiene el instante actual (con cuánto lleva y
   * cuánto le queda) y `next` el siguiente bloque encadenado, para responder la
   * pregunta que de verdad importa al llegar sin reserva: "¿me puedo quedar
   * cuando terminen?". Se mira solo hasta el fin del día del club.
   */
  async getLiveStatus(slug: string) {
    const restaurant = await resolveRestaurantBySlug(slug);
    const now = new Date();
    const { dateStr } = caracasPartsOf(now);
    const dayEnd = new Date(atTimeCaracas(dateStr, '00:00').getTime() + 86_400_000);

    const [courts, blocks] = await Promise.all([
      prisma.clubCourt.findMany({
        where: { restaurantId: restaurant.id, active: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, sport: true, indoor: true },
      }),
      prisma.clubCourtBlock.findMany({
        where: { restaurantId: restaurant.id, status: 'ACTIVE', endsAt: { gt: now }, startsAt: { lt: dayEnd } },
        orderBy: { startsAt: 'asc' },
        select: {
          courtId: true,
          kind: true,
          startsAt: true,
          endsAt: true,
          note: true,
          booking: { select: { playerName: true } },
        },
      }),
    ]);

    const minutesBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));

    return {
      now,
      courts: courts.map((court) => {
        const mine = blocks.filter((b) => b.courtId === court.id);
        const current = mine.find((b) => b.startsAt <= now && b.endsAt > now) ?? null;
        // El siguiente arranca después del actual; si la cancha está libre, es el
        // próximo del día.
        const next = mine.find((b) => b.startsAt >= (current?.endsAt ?? now)) ?? null;

        return {
          court,
          busy: !!current,
          current: current
            ? {
                kind: current.kind,
                startsAt: current.startsAt,
                endsAt: current.endsAt,
                playedMinutes: minutesBetween(current.startsAt, now),
                remainingMinutes: minutesBetween(now, current.endsAt),
                // Solo el nombre de pila: la pantalla es pública y no hace falta
                // exponer el apellido completo de quien está jugando.
                playerFirstName: current.booking?.playerName?.split(' ')[0] ?? null,
                note: current.note,
              }
            : null,
          next: next
            ? {
                kind: next.kind,
                startsAt: next.startsAt,
                endsAt: next.endsAt,
                playerFirstName: next.booking?.playerName?.split(' ')[0] ?? null,
                note: next.note,
              }
            : null,
        };
      }),
    };
  },

  async getPublicAvailability(slug: string, date: string, courtId?: string) {
    const restaurant = await resolveRestaurantBySlug(slug);
    return this.getAvailability(restaurant.id, date, courtId);
  },

  async createPublicBooking(slug: string, input: CreateBookingInput) {
    const restaurant = await resolveRestaurantBySlug(slug);
    return this.createBooking(restaurant.id, input);
  },
};
