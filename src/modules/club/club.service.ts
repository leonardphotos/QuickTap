import { nanoid } from 'nanoid';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, conflict, forbidden, notFound } from '../../utils/http-error';
import { clubPlayerService } from '../club-players/club-player.service';
import { refreshClubDemo } from '../../utils/club-demo';
import { atTimeCaracas, caracasPartsOf } from '../../utils/timezone';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import { customerService } from '../customers/customer.service';
import { clubTabletService } from '../club-tablet/club-tablet.service';
import { emitToKitchen, SocketEvents } from '../../sockets';
import { CURRENCY_SYMBOLS, round2, toDecimal } from '../../utils/money';
import { bankLedgerService } from '../bank-accounts/bank-ledger.service';
import { promotionDiscountOf, recordPromotionRedemption, resolvePromotionForRedeem } from '../promotions/promotion.service';
import type {
  CreateBookingInput,
  CreateCourtInput,
  CreateMaintenanceInput,
  CreateScheduleInput,
  ListBookingsQuery,
  RecordBookingPaymentInput,
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

/** Todo lo que la reserva incluye para efectos de dinero: la cancha, más lo que
 * el jugador fue pidiendo desde la tablet. Las tres consultas que cobran tienen
 * que traer las dos cosas o el saldo sale mal. */
const bookingMoneyInclude = {
  payments: { orderBy: { createdAt: 'asc' } },
  tabOrders: { where: { status: { not: 'CANCELLED' } }, include: { items: true } },
} satisfies Prisma.ClubBookingInclude;

/** Adjunta consumo/total/pagado/saldo a una reserva que trae `payments` (y, si
 * corresponde, `tabOrders`) incluidos — la Caja (Pagar/Fraccionado/Deuda) y el
 * ticket QR lo necesitan para saber cuánto falta cobrar.
 *
 * `dueBase` = cancha + consumo de la TIENDA PROPIA del club. Lo pedido a una
 * tienda vinculada NO entra: esa tienda le cobra directo al jugador, con su
 * propio método de pago. Por eso solo cuentan las comandas sin
 * `kitchenRestaurantId` (null = la despacha y la cobra el club).
 * Sin descuentos ni ajuste de servicio (a diferencia de Order). */
function withBookingMoney<
  T extends {
    totalBase: Prisma.Decimal;
    payments: { amountBase: Prisma.Decimal; discountBase?: Prisma.Decimal }[];
    tabOrders?: { totalBase: Prisma.Decimal; status: string; kitchenRestaurantId: string | null }[];
  },
>(booking: T) {
  const consumoBase = round2(
    (booking.tabOrders ?? [])
      .filter((o) => o.status !== 'CANCELLED' && o.kitchenRestaurantId === null)
      .reduce((acc, o) => acc.add(o.totalBase), toDecimal(0)),
  );
  const dueBase = round2(booking.totalBase.add(consumoBase));
  // "Pagado" incluye el descuento de promoción (CRM) perdonado en cada cobro:
  // condona esa parte de la deuda igual que el dinero, aunque no sea dinero.
  const paidBase = round2(
    booking.payments.reduce((acc, p) => acc.add(p.amountBase).add(p.discountBase ?? 0), toDecimal(0)),
  );
  const balanceBase = round2(Prisma.Decimal.max(0, dueBase.sub(paidBase)));
  return {
    ...booking,
    consumoBase: consumoBase.toFixed(2),
    dueBase: dueBase.toFixed(2),
    paidBase: paidBase.toFixed(2),
    balanceBase: balanceBase.toFixed(2),
  };
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
      isDemo: true,
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

    const [courts, schedules, blocks, restaurant] = await Promise.all([
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
      prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { isDemo: true } }),
    ]);

    const now = Date.now();
    // En el club demo TODO turno del día se puede reservar, aunque ya haya
    // pasado o esté ocupado: quien muestra el sistema no puede depender de la
    // hora que sea. Al reservar, el bloque que estorbe se cancela (ver
    // createBooking) — mismo criterio que las reservas deslizantes de la demo.
    const demoAlwaysOpen = restaurant?.isDemo ?? false;

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
            available: demoAlwaysOpen || (!clash && !isPast),
            reason: demoAlwaysOpen ? null : clash ? clash.kind : isPast ? 'PAST' : null,
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
  async createBooking(
    restaurantId: string,
    input: CreateBookingInput,
    opts: { enforcePublicRules?: boolean; playerAccountId?: string | null } = {},
  ) {
    // Lista negra y código de WhatsApp solo aplican a quien reserva SOLO desde
    // el enlace público. Recepción tiene que poder anotar a cualquiera por
    // teléfono: si el mostrador quedara bloqueado por las mismas reglas, un
    // error del escáner dejaría al club sin poder vender la cancha.
    if (opts.enforcePublicRules) {
      const blocked = await clubPlayerService.isBlacklisted(restaurantId, input.playerPhone);
      if (blocked) {
        throw forbidden(
          'No puedes reservar por internet en este momento. Comunícate con el club para resolverlo.',
        );
      }
      const settings = await clubPlayerService.getBookingSettings(restaurantId);
      if (settings.requirePhoneVerification) {
        const verified = await clubPlayerService.hasRecentVerification(restaurantId, input.playerPhone);
        if (!verified) {
          throw badRequest('Verifica tu número con el código que te enviamos por WhatsApp.');
        }
      }
    }

    const court = await prisma.clubCourt.findFirst({
      where: { id: input.courtId, restaurantId, active: true },
      select: { id: true },
    });
    if (!court) throw notFound('La cancha no existe o no está disponible.');

    const restaurant = await prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { baseCurrency: true, isDemo: true },
    });

    const startsAt = atTimeCaracas(input.date, input.startTime);
    const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
    // En la demo se puede reservar cualquier turno del día, incluso uno que ya
    // pasó: el QR igual abre la tablet a cualquier hora (ver getSession).
    if (!restaurant.isDemo && endsAt.getTime() <= Date.now()) {
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
        // Demo: el turno elegido manda. Cualquier bloque que estorbe se cancela
        // antes de insertar (mismo criterio que refreshClubDemo) — si no, la
        // restricción EXCLUDE rechazaría reservar encima de la partida en vivo.
        if (restaurant.isDemo) {
          await tx.clubCourtBlock.updateMany({
            where: {
              restaurantId,
              courtId: input.courtId,
              status: 'ACTIVE',
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
            },
            data: { status: 'CANCELLED' },
          });
        }
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
            tournamentPlayerNames: input.tournamentPlayerNames?.length ? input.tournamentPlayerNames : Prisma.DbNull,
            totalBase,
            exchangeRate: rate.rateBs,
            totalBs,
            accessToken: nanoid(14),
            playerAccountId: opts.playerAccountId ?? null,
            verifiedPhoneAt: opts.enforcePublicRules ? new Date() : null,
          },
          include: { block: { include: { court: true } } },
        });
      });

      emitToKitchen(restaurantId, SocketEvents.CLUB_BOOKING_NEW, { id: booking.id });
      // Recién creada, sin pagos: paidBase 0 / balanceBase = totalBase — misma forma
      // que devuelve el resto de endpoints, para que el cliente no tenga que
      // distinguir "reserva recién creada" de "reserva ya existente".
      return withBookingMoney({ ...booking, payments: [] });
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
    const bookings = await prisma.clubBooking.findMany({
      where,
      include: { block: { include: { court: true } }, ...bookingMoneyInclude },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return bookings.map(withBookingMoney);
  },

  /**
   * Cancela una reserva. El MOTIVO es obligatorio: sin él no hay forma de
   * distinguir "el club cerró por lluvia" de "el jugador no iba a venir", que es
   * justo lo que decide si esa persona debería entrar en la lista negra.
   */
  async cancelBooking(restaurantId: string, id: string, opts: { reason: string; by?: 'STAFF' | 'PLAYER' } = { reason: '' }) {
    const booking = await prisma.clubBooking.findFirst({ where: { id, restaurantId }, select: { id: true, blockId: true } });
    if (!booking) throw notFound('La reserva no existe o no pertenece a este club.');
    if (!opts.reason?.trim()) throw badRequest('Indica el motivo de la cancelación.');

    // Cancelar el bloque es lo que libera el hueco: la restricción solo mira los
    // bloques que no están CANCELLED.
    const updated = await prisma.$transaction(async (tx) => {
      await tx.clubCourtBlock.update({ where: { id: booking.blockId }, data: { status: 'CANCELLED' } });
      return tx.clubBooking.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: opts.reason.trim(),
          cancelledBy: opts.by ?? 'STAFF',
        },
        include: { block: { include: { court: true } }, ...bookingMoneyInclude },
      });
    });
    emitToKitchen(restaurantId, SocketEvents.CLUB_BOOKING_UPDATED, { id });
    return withBookingMoney(updated);
  },

  // ---------------------------------------------------------------- Caja
  /**
   * "Pagar" / "Pago fraccionado" (botón Caja en Canchas) — mismo criterio que
   * Order.addPayment: valida que el monto no exceda el saldo, y si con este
   * cobro la reserva queda saldada, apaga `awaitingPayment` sola (ya no hay
   * nada que recepción tenga que seguir vigilando).
   */
  async addBookingPayment(restaurantId: string, bookingId: string, input: RecordBookingPaymentInput) {
    return prisma.$transaction(async (tx) => {
      const booking = await tx.clubBooking.findFirst({
        where: { id: bookingId, restaurantId },
        include: bookingMoneyInclude,
      });
      if (!booking) throw notFound('Reserva no encontrada.');
      if (booking.status === 'CANCELLED') throw badRequest('No se puede registrar un cobro en una reserva cancelada.');

      // El tope es cancha + consumo de la TIENDA PROPIA, no solo la cancha: si
      // el jugador pidió dos aguas, recepción tiene que poder cobrarlas acá. Lo
      // pedido a una tienda vinculada no, que se lo cobra ella directo.
      const consumo = booking.tabOrders
        .filter((o) => o.kitchenRestaurantId === null)
        .reduce((acc, o) => acc.add(o.totalBase), toDecimal(0));
      const due = round2(booking.totalBase.add(consumo));
      const alreadyPaid = booking.payments.reduce(
        (acc, p) => acc.add(p.amountBase).add(p.discountBase ?? 0),
        toDecimal(0),
      );
      const balance = round2(due.sub(alreadyPaid));
      const amountBase = toDecimal(input.amountBase);

      // Código de promoción (CRM): valida lista/vigencia/canjes, perdona su
      // descuento sobre el saldo y deja el canje registrado en esta misma
      // transacción — el dinero cobrado (amountBase) sigue siendo solo dinero.
      let promoDiscount = toDecimal(0);
      let promoRedeem: { promotionId: string; customerId: string | null } | null = null;
      if (input.promoCode) {
        const { promotion, customerId } = await resolvePromotionForRedeem(
          tx,
          restaurantId,
          input.promoCode,
          booking.playerPhone,
        );
        promoDiscount = promotionDiscountOf(promotion, balance);
        if (promoDiscount.lte(0)) throw badRequest('El descuento de la promoción no aplica a este saldo.');
        promoRedeem = { promotionId: promotion.id, customerId };
      }

      if (amountBase.gt(balance.sub(promoDiscount).add(0.01))) {
        throw badRequest(`El monto no puede superar el saldo pendiente (${round2(balance.sub(promoDiscount)).toFixed(2)}).`);
      }

      await tx.clubBookingPayment.create({
        data: {
          bookingId,
          amountBase,
          discountBase: promoDiscount,
          method: input.method,
          referenceNumber: input.referenceNumber,
          proofImageUrl: input.proofImageUrl,
        },
      });
      if (promoRedeem) {
        await recordPromotionRedemption(tx, {
          restaurantId,
          promotionId: promoRedeem.promotionId,
          customerId: promoRedeem.customerId,
          sourceRef: bookingId,
          amountBase: promoDiscount,
        });
      }

      // Cuentas bancarias: el cobro de la reserva suma a la cuenta vinculada al método.
      await bankLedgerService.applyMethodPayment(tx, {
        restaurantId,
        method: input.method,
        direction: 'CREDIT',
        amountBase,
        bankAccountId: input.bankAccountId,
        description: 'Cobro reserva de cancha',
        sourceRef: bookingId,
      });

      const settled = round2(alreadyPaid.add(amountBase).add(promoDiscount));
      const fullyPaid = settled.gte(due);
      // Pago parcial → deuda automática: si tras el abono queda saldo, la reserva cae sola
      // en Deudas de Canchas (antes recepción tenía que marcarla a mano como cuenta abierta,
      // y una reserva futura abonada a medias no aparecía como deuda hasta jugarse).
      const updated = await tx.clubBooking.update({
        where: { id: bookingId },
        data: { awaitingPayment: !fullyPaid },
        include: { block: { include: { court: true } }, ...bookingMoneyInclude },
      });
      return withBookingMoney(updated);
    }).then((booking) => {
      emitToKitchen(restaurantId, SocketEvents.CLUB_BOOKING_UPDATED, { id: bookingId });
      return booking;
    });
  },

  // ------------------------------------- Pagos reportados desde la tablet
  /**
   * Los pagos que los jugadores reportaron desde la tablet A ESTE CLUB
   * (`payeeRestaurantId: null`; los de las tiendas vinculadas los revisa cada
   * tienda en su propio panel, ver club-link.service.ts). Es la cola que
   * alimenta el aviso "Pago por verificar" de la pantalla Canchas.
   */
  async listReportedPayments(restaurantId: string) {
    const payments = await prisma.clubReportedPayment.findMany({
      where: { restaurantId, payeeRestaurantId: null, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        booking: {
          select: {
            playerName: true,
            playerPhone: true,
            block: { select: { startsAt: true, court: { select: { name: true } } } },
          },
        },
      },
    });
    return payments.map((p) => ({
      id: p.id,
      bookingId: p.bookingId,
      amountBase: p.amountBase.toFixed(2),
      amountBs: p.amountBs.toFixed(2),
      method: p.method,
      referenceNumber: p.referenceNumber,
      createdAt: p.createdAt,
      playerName: p.booking.playerName,
      playerPhone: p.booking.playerPhone,
      courtName: p.booking.block.court.name,
      startsAt: p.booking.block.startsAt,
    }));
  },

  /**
   * Recepción verifica un pago reportado desde la tablet. Aprobar crea el
   * ClubBookingPayment REAL con el mismo criterio que la Caja (tope de saldo,
   * asiento en la cuenta bancaria, deuda automática si queda saldo) — hasta ese
   * momento el reporte era solo un aviso. Rechazar solo lo marca: nunca movió plata.
   */
  async reviewReportedPayment(restaurantId: string, paymentId: string, status: 'CONFIRMED' | 'REJECTED') {
    const result = await prisma.$transaction(async (tx) => {
      const reported = await tx.clubReportedPayment.findFirst({
        where: { id: paymentId, restaurantId, payeeRestaurantId: null },
      });
      if (!reported) throw notFound('Ese pago no existe.');
      if (reported.status !== 'PENDING') throw badRequest('Ese pago ya fue revisado.');

      if (status === 'REJECTED') {
        await tx.clubReportedPayment.update({ where: { id: paymentId }, data: { status, reviewedAt: new Date() } });
        return { bookingId: reported.bookingId };
      }

      const booking = await tx.clubBooking.findFirst({
        where: { id: reported.bookingId, restaurantId },
        include: bookingMoneyInclude,
      });
      if (!booking) throw notFound('Reserva no encontrada.');
      if (booking.status === 'CANCELLED') throw badRequest('La reserva de este pago fue cancelada. Recházalo.');

      // Mismo tope que addBookingPayment: cancha + consumo de la tienda propia.
      const consumo = booking.tabOrders
        .filter((o) => o.kitchenRestaurantId === null)
        .reduce((acc, o) => acc.add(o.totalBase), toDecimal(0));
      const due = round2(booking.totalBase.add(consumo));
      const alreadyPaid = booking.payments.reduce(
        (acc, p) => acc.add(p.amountBase).add(p.discountBase ?? 0),
        toDecimal(0),
      );
      const balance = round2(due.sub(alreadyPaid));
      if (reported.amountBase.gt(balance.add(0.01))) {
        throw badRequest(`El pago supera el saldo pendiente (${balance.toFixed(2)}). Si ya se cobró en caja, recházalo.`);
      }

      const bookingPayment = await tx.clubBookingPayment.create({
        data: {
          bookingId: reported.bookingId,
          amountBase: reported.amountBase,
          method: reported.method,
          referenceNumber: reported.referenceNumber,
        },
        select: { id: true },
      });

      await bankLedgerService.applyMethodPayment(tx, {
        restaurantId,
        method: reported.method,
        direction: 'CREDIT',
        amountBase: reported.amountBase,
        // El jugador transfirió un Bs exacto (congelado al reportar): ese entra al banco.
        bsAmount: reported.amountBs,
        description: 'Cobro reserva de cancha (tablet)',
        sourceRef: reported.bookingId,
      });

      const fullyPaid = round2(alreadyPaid.add(reported.amountBase)).gte(due);
      await tx.clubBooking.update({ where: { id: reported.bookingId }, data: { awaitingPayment: !fullyPaid } });
      await tx.clubReportedPayment.update({
        where: { id: paymentId },
        data: { status, reviewedAt: new Date(), bookingPaymentId: bookingPayment.id },
      });
      return { bookingId: reported.bookingId };
    });

    // El panel refresca la reserva; la tablet del jugador, su saldo "en verificación".
    emitToKitchen(restaurantId, SocketEvents.CLUB_BOOKING_UPDATED, { id: result.bookingId });
    emitToKitchen(restaurantId, SocketEvents.CLUB_TAB_ORDER_UPDATED, { paymentId });
    return { id: paymentId, status };
  },

  /** "Deuda" (botón Caja en Canchas) — recepción marca que sabe que se debe, sin
   * registrar ningún cobro. Mismo botón "Cta. abierta"/"Pendiente" de Pedidos. */
  async setBookingAwaitingPayment(restaurantId: string, bookingId: string, awaitingPayment: boolean) {
    const booking = await prisma.clubBooking.findFirst({ where: { id: bookingId, restaurantId }, select: { id: true } });
    if (!booking) throw notFound('Reserva no encontrada.');
    const updated = await prisma.clubBooking.update({
      where: { id: bookingId },
      data: { awaitingPayment },
      include: { block: { include: { court: true } }, ...bookingMoneyInclude },
    });
    emitToKitchen(restaurantId, SocketEvents.CLUB_BOOKING_UPDATED, { id: bookingId });
    return withBookingMoney(updated);
  },

  // ------------------------------------------------------ QR de acceso
  /** Resuelve una reserva por su token de QR, sin exponer nada del resto del club. */
  async getByAccessToken(accessToken: string) {
    const booking = await prisma.clubBooking.findUnique({
      where: { accessToken },
      include: {
        block: { include: { court: true } },
        ...bookingMoneyInclude,
        // El ticket se pinta con los colores del club, igual que la portada.
        restaurant: { select: { name: true, slug: true, logoUrl: true, theme: true } },
      },
    });
    if (!booking) throw notFound('Esta reserva no existe.');
    return withBookingMoney(booking);
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

    // Cerrar la reserva es lo que dispara las dos consecuencias: puntos a quien
    // jugó, y lista negra a quien faltó. Perezoso como el resto del vertical.
    // syncAutoBlacklist trae su propio freno para el club que no escanea QR.
    if (completed.length) await clubPlayerService.syncLoyalty(restaurantId).catch(() => undefined);
    if (noShows.length) await clubPlayerService.syncAutoBlacklist(restaurantId).catch(() => undefined);

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
    await refreshClubDemo(restaurantId);
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

  /**
   * Estado de las canchas para el panel de recepción.
   *
   * Se parece a `getLiveStatus` (público) pero no es lo mismo: aquí sí va el
   * nombre completo del jugador y, sobre todo, si tiene cuenta abierta en la
   * tienda — que es lo que evita que alguien se vaya del club debiendo el agua.
   *
   * La cuenta se cruza por teléfono contra ShopSale, igual que hace el resto del
   * sistema para identificar a un cliente (Customer es único por teléfono). No
   * hay FK entre la reserva y la venta a propósito: la tienda ya existía y es
   * compartida con el vertical de Locales.
   */
  async getPanelCourts(restaurantId: string) {
    await refreshClubDemo(restaurantId);
    await this.settlePastBookings(restaurantId);
    const now = new Date();
    const { dateStr } = caracasPartsOf(now);
    const dayEnd = new Date(atTimeCaracas(dateStr, '00:00').getTime() + 86_400_000);

    const [courts, blocks] = await Promise.all([
      prisma.clubCourt.findMany({
        where: { restaurantId, active: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.clubCourtBlock.findMany({
        where: { restaurantId, status: 'ACTIVE', endsAt: { gt: now }, startsAt: { lt: dayEnd } },
        orderBy: { startsAt: 'asc' },
        include: { booking: { include: bookingMoneyInclude } },
      }),
    ]);

    // Un solo golpe a la tienda para todos los jugadores en cancha, en vez de
    // una consulta por cancha.
    const phones = blocks
      .filter((b) => b.startsAt <= now && b.endsAt > now)
      .map((b) => b.booking?.playerPhone)
      .filter((p): p is string => !!p);

    const openSales = phones.length
      ? await prisma.shopSale.findMany({
          where: {
            restaurantId,
            returned: false,
            settledAt: null,
            creditTerms: { not: null },
            customerPhone: { in: phones },
          },
          select: { customerPhone: true, total: true, amountPaidNow: true, payments: { select: { amount: true } } },
        })
      : [];

    const owedByPhone = new Map<string, { count: number; balance: number }>();
    for (const sale of openSales) {
      if (!sale.customerPhone) continue;
      const paid = (sale.amountPaidNow ?? 0) + sale.payments.reduce((acc, p) => acc + p.amount, 0);
      const balance = Math.max(0, sale.total - paid);
      const prev = owedByPhone.get(sale.customerPhone) ?? { count: 0, balance: 0 };
      owedByPhone.set(sale.customerPhone, { count: prev.count + 1, balance: prev.balance + balance });
    }

    const minutesBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));

    return {
      now,
      courts: courts.map((court) => {
        const mine = blocks.filter((b) => b.courtId === court.id);
        const current = mine.find((b) => b.startsAt <= now && b.endsAt > now) ?? null;
        const next = mine.find((b) => b.startsAt >= (current?.endsAt ?? now)) ?? null;
        const phone = current?.booking?.playerPhone;
        const tab = phone ? owedByPhone.get(phone) : undefined;
        const bookingMoney = current?.booking ? withBookingMoney(current.booking) : null;

        return {
          court,
          busy: !!current,
          current: current
            ? {
                blockId: current.id,
                kind: current.kind,
                startsAt: current.startsAt,
                endsAt: current.endsAt,
                playedMinutes: minutesBetween(current.startsAt, now),
                remainingMinutes: minutesBetween(now, current.endsAt),
                totalMinutes: minutesBetween(current.startsAt, current.endsAt),
                note: current.note,
                booking: current.booking
                  ? {
                      id: current.booking.id,
                      playerName: current.booking.playerName,
                      playerPhone: current.booking.playerPhone,
                      playerCount: current.booking.playerCount,
                      status: current.booking.status,
                      checkedInAt: current.booking.checkedInAt,
                      awaitingPayment: current.booking.awaitingPayment,
                      totalBase: current.booking.totalBase.toString(),
                      totalBs: current.booking.totalBs.toString(),
                      requestedExtras: current.booking.requestedExtras,
                      // Lo pedido desde la tablet de la cancha: se cobra en esta
                      // misma Caja, así que el saldo ya lo trae sumado.
                      consumoBase: bookingMoney!.consumoBase,
                      dueBase: bookingMoney!.dueBase,
                      paidBase: bookingMoney!.paidBase,
                      balanceBase: bookingMoney!.balanceBase,
                    }
                  : null,
                openTab: tab ? { count: tab.count, balance: tab.balance } : null,
              }
            : null,
          next: next
            ? {
                kind: next.kind,
                startsAt: next.startsAt,
                endsAt: next.endsAt,
                note: next.note,
                playerName: next.booking?.playerName ?? null,
              }
            : null,
        };
      }),
    };
  },

  // ------------------------------------------------------- Rutas públicas
  async getPublicClub(slug: string) {
    const restaurant = await resolveRestaurantBySlug(slug);
    const [courts, settings] = await Promise.all([
      prisma.clubCourt.findMany({
        where: { restaurantId: restaurant.id, active: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, sport: true, courtType: true },
      }),
      clubPlayerService.getBookingSettings(restaurant.id),
    ]);
    return {
      club: {
        name: restaurant.name,
        slug: restaurant.slug,
        logoUrl: restaurant.logoUrl,
        // La portada se pinta con los colores del club, no con un azul fijo:
        // un club de marca verde no debería verse forzado a otra paleta.
        theme: restaurant.theme,
        currencySymbol: CURRENCY_SYMBOLS[restaurant.baseCurrency],
        // El formulario necesita saber si tiene que pedir el código de WhatsApp
        // antes de reservar, y si es demo (ahí acepta cualquier código de 4 dígitos).
        requiresVerification: settings.requirePhoneVerification,
        isDemo: restaurant.isDemo,
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
        select: { id: true, name: true, sport: true, courtType: true },
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

  async createPublicBooking(slug: string, input: CreateBookingInput, playerAccountId?: string | null) {
    const restaurant = await resolveRestaurantBySlug(slug);
    return this.createBooking(restaurant.id, input, { enforcePublicRules: true, playerAccountId });
  },

  /**
   * Catálogo para "¿Quieres algo al llegar?": el mismo que ve el jugador ya en
   * la tablet de la cancha (tienda del club + las tiendas vinculadas), para que
   * pedirlo antes de llegar sea sobre productos reales y con precio, no una
   * lista fija inventada.
   *
   * Acá se aplana a una sola lista a propósito: al reservar todavía no hay
   * cuenta abierta que separar por tienda, es solo un adelanto de lo que va a
   * poder pedir. Cada item trae su `storeId` para saber a quién pedírselo.
   */
  async getPublicProducts(slug: string) {
    const restaurant = await resolveRestaurantBySlug(slug);
    const catalog = await clubTabletService.getCatalog(restaurant.id);
    return catalog.stores.flatMap((s) => s.items);
  },
};
