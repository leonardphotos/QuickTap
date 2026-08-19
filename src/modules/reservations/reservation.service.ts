import { prisma } from '../../config/prisma';
import { badRequest, conflict, notFound } from '../../utils/http-error';
import { startOfDayCaracas, startOfTodayCaracas } from '../../utils/timezone';
import { emitToKitchen, SocketEvents } from '../../sockets';
import { primaryTableIdOf } from '../../utils/table-merge';
import {
  CreateReservationInput,
  CreateStaffReservationInput,
  SeatReservationInput,
  UpdateReservationInput,
} from './reservation.dto';

const WITH_TABLES = {
  tables: { select: { id: true, number: true } },
  // Dónde se sentó de verdad, que no siempre es la mesa que había apartado.
  tableSession: { select: { id: true, table: { select: { id: true, number: true } } } },
} as const;

/** Estados que un mesero puede ver: los que le sirven para atender, nunca las pendientes por
 *  aceptar (decidir si se acepta una reserva es de dueño/admin). */
const WAITER_VISIBLE_STATUSES = ['CONFIRMED', 'SEATED'] as const;

/** Todas las mesas elegidas existen, están activas y son de este restaurante. */
async function assertTablesBelong(restaurantId: string, tableIds: string[]) {
  const count = await prisma.table.count({ where: { id: { in: tableIds }, restaurantId, isActive: true } });
  if (count !== tableIds.length) throw badRequest('Alguna mesa elegida no existe o no está disponible.');
}

export const reservationService = {
  /**
   * Botón "Mesa" del menú público: cuadrícula de mesas con su estado EN VIVO
   * ahora mismo (no proyectado a la fecha/hora que el cliente vaya a elegir
   * para reservar) — rojo = ocupada (cuenta abierta), amarillo = tiene una
   * reserva confirmada para hoy, verde = libre.
   */
  async getTableStatuses(slug: string) {
    const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true, isActive: true } });
    if (!restaurant || !restaurant.isActive) throw notFound('Restaurante no encontrado.');

    const todayStart = startOfTodayCaracas();
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const [tables, openSessions, todaysReservations] = await Promise.all([
      prisma.table.findMany({
        where: { restaurantId: restaurant.id, isActive: true },
        orderBy: { number: 'asc' },
        include: { zone: { select: { id: true, name: true } } },
      }),
      prisma.tableSession.findMany({
        where: { restaurantId: restaurant.id, status: 'OPEN' },
        select: { tableId: true },
      }),
      prisma.reservation.findMany({
        where: { restaurantId: restaurant.id, status: 'CONFIRMED', date: { gte: todayStart, lt: todayEnd } },
        select: { tables: { select: { id: true } } },
      }),
    ]);

    const occupiedTableIds = new Set(openSessions.map((s) => s.tableId));
    const reservedTableIds = new Set(todaysReservations.flatMap((r) => r.tables.map((t) => t.id)));

    // Mesa unida a otra: refleja el estado del grupo. Si no, una mesa pegada a una ocupada se
    // ofrecería como libre y el cliente reservaría algo que físicamente ya está en uso.
    const statusOf = (tableId: string, mergedIntoTableId: string | null) => {
      const id = mergedIntoTableId ?? tableId;
      if (occupiedTableIds.has(id)) return 'OCCUPIED';
      if (reservedTableIds.has(id)) return 'RESERVED';
      return 'AVAILABLE';
    };

    return tables.map((t) => ({
      id: t.id,
      number: t.number,
      zone: t.zone,
      status: statusOf(t.id, t.mergedIntoTableId),
    }));
  },

  async create(slug: string, input: CreateReservationInput) {
    const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true, isActive: true } });
    if (!restaurant || !restaurant.isActive) throw notFound('Restaurante no encontrado.');

    const tableCount = await prisma.table.count({
      where: { id: { in: input.tableIds }, restaurantId: restaurant.id, isActive: true },
    });
    if (tableCount !== input.tableIds.length) {
      throw badRequest('Alguna mesa elegida no existe o no está disponible.');
    }

    const reservation = await prisma.reservation.create({
      data: {
        restaurantId: restaurant.id,
        date: startOfDayCaracas(input.date),
        time: input.time,
        partySize: input.partySize,
        customerName: input.customerName,
        customerIdNumber: input.customerIdNumber,
        customerPhone: input.customerPhone,
        tables: { connect: input.tableIds.map((id) => ({ id })) },
      },
      include: { tables: { select: { id: true, number: true } } },
    });

    // Avisa en vivo a Cajero/Administrador (pestaña "Reservas") para que la acepten o rechacen.
    emitToKitchen(restaurant.id, SocketEvents.RESERVATION_NEW, reservation);

    return reservation;
  },

  /**
   * Reservas del panel. Dos modos:
   *  - sin `date`: pendientes por aceptar + confirmadas de hoy en adelante (pestaña "Reservas").
   *  - con `date`: TODO lo de ese día, sentados y no-show incluidos (barra lateral de Sala).
   *
   * `confirmedOnly` recorta a lo que un mesero puede ver: nunca las pendientes por aceptar.
   */
  async list(restaurantId: string, opts: { date?: string; confirmedOnly?: boolean } = {}) {
    const statuses = opts.confirmedOnly
      ? [...WAITER_VISIBLE_STATUSES]
      : opts.date
        ? (['PENDING', 'CONFIRMED', 'SEATED', 'NO_SHOW', 'CANCELLED'] as const)
        : (['PENDING', 'CONFIRMED'] as const);

    const dateFilter = opts.date
      ? (() => {
          const start = startOfDayCaracas(opts.date!);
          return { gte: start, lt: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
        })()
      : { gte: startOfTodayCaracas() };

    const reservations = await prisma.reservation.findMany({
      where: { restaurantId, status: { in: [...statuses] }, date: dateFilter },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
      include: WITH_TABLES,
    });
    // Las pendientes primero: son las que requieren acción del staff.
    return reservations.sort((a, b) => (a.status === b.status ? 0 : a.status === 'PENDING' ? -1 : 1));
  },

  /** "+ Nueva reserva" del panel: la toma el restaurante, así que nace ya confirmada. */
  async createByStaff(restaurantId: string, input: CreateStaffReservationInput) {
    await assertTablesBelong(restaurantId, input.tableIds);

    const reservation = await prisma.reservation.create({
      data: {
        restaurantId,
        date: startOfDayCaracas(input.date),
        time: input.time,
        partySize: input.partySize,
        customerName: input.customerName,
        customerIdNumber: input.customerIdNumber ?? '',
        customerPhone: input.customerPhone,
        note: input.note,
        status: 'CONFIRMED',
        source: 'STAFF',
        tables: { connect: input.tableIds.map((id) => ({ id })) },
      },
      include: WITH_TABLES,
    });

    emitToKitchen(restaurantId, SocketEvents.RESERVATION_UPDATED, { reservationId: reservation.id, status: reservation.status });
    return reservation;
  },

  /** Reprogramar / corregir una reserva (cambiar hora, personas, mesas, nota…). */
  async update(restaurantId: string, id: string, input: UpdateReservationInput) {
    const existing = await prisma.reservation.findFirst({ where: { id, restaurantId }, select: { id: true, status: true } });
    if (!existing) throw notFound('Reserva no encontrada.');
    if (existing.status === 'SEATED') throw badRequest('Esa reserva ya se sentó — edita la cuenta desde el plano.');
    if (input.tableIds) await assertTablesBelong(restaurantId, input.tableIds);

    const reservation = await prisma.reservation.update({
      where: { id },
      data: {
        ...(input.date ? { date: startOfDayCaracas(input.date) } : {}),
        ...(input.time ? { time: input.time } : {}),
        ...(input.partySize != null ? { partySize: input.partySize } : {}),
        ...(input.customerName ? { customerName: input.customerName } : {}),
        ...(input.customerIdNumber != null ? { customerIdNumber: input.customerIdNumber } : {}),
        ...(input.customerPhone ? { customerPhone: input.customerPhone } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        // `set` reemplaza la lista completa: es lo que espera "cambié las mesas de la reserva".
        ...(input.tableIds ? { tables: { set: input.tableIds.map((tid) => ({ id: tid })) } } : {}),
      },
      include: WITH_TABLES,
    });

    emitToKitchen(restaurantId, SocketEvents.RESERVATION_UPDATED, { reservationId: id, status: reservation.status });
    return reservation;
  },

  /**
   * "Sentar": el grupo llegó. Abre la cuenta en la mesa indicada con los datos de la reserva y
   * las deja enlazadas, para poder ir de la reserva al consumo real del grupo.
   */
  async seat(restaurantId: string, id: string, input: SeatReservationInput) {
    const reservation = await prisma.reservation.findFirst({ where: { id, restaurantId } });
    if (!reservation) throw notFound('Reserva no encontrada.');
    if (reservation.status === 'SEATED') throw badRequest('Esa reserva ya está sentada.');
    if (reservation.status === 'CANCELLED') throw badRequest('Esa reserva está cancelada.');

    const table = await prisma.table.findFirst({
      where: { id: input.tableId, restaurantId, isActive: true },
      select: { id: true, number: true, mergedIntoTableId: true },
    });
    if (!table) throw badRequest('La mesa elegida no existe o no está disponible.');

    // Mesa unida a otra: la cuenta va a la principal, igual que en cualquier otro pedido.
    const accountTableId = primaryTableIdOf(table);
    const alreadyOpen = await prisma.tableSession.count({
      where: { restaurantId, tableId: accountTableId, status: 'OPEN' },
    });
    if (alreadyOpen > 0) throw conflict(`La mesa ${table.number} ya tiene una cuenta abierta.`);

    const seated = await prisma.$transaction(async (tx) => {
      const session = await tx.tableSession.create({
        data: {
          restaurantId,
          tableId: accountTableId,
          customerName: reservation.customerName,
          // La cédula es obligatoria en la cuenta pero opcional en una reserva tomada por
          // teléfono: "S/C" (sin cédula) es lo mismo que ya usa la factura de consumidor final.
          customerIdNumber: reservation.customerIdNumber || 'S/C',
          customerPhone: reservation.customerPhone,
        },
      });
      return tx.reservation.update({
        where: { id },
        data: { status: 'SEATED', seatedAt: new Date(), tableSessionId: session.id },
        include: WITH_TABLES,
      });
    });

    emitToKitchen(restaurantId, SocketEvents.RESERVATION_UPDATED, { reservationId: id, status: seated.status });
    return seated;
  },

  /** Pasó la hora y no aparecieron. */
  async noShow(restaurantId: string, id: string) {
    const existing = await prisma.reservation.findFirst({ where: { id, restaurantId }, select: { id: true, status: true } });
    if (!existing) throw notFound('Reserva no encontrada.');
    if (existing.status === 'SEATED') throw badRequest('Esa reserva ya se sentó.');

    const reservation = await prisma.reservation.update({ where: { id }, data: { status: 'NO_SHOW' } });
    emitToKitchen(restaurantId, SocketEvents.RESERVATION_UPDATED, { reservationId: id, status: reservation.status });
    return reservation;
  },

  async accept(restaurantId: string, id: string) {
    const existing = await prisma.reservation.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Reserva no encontrada.');
    const reservation = await prisma.reservation.update({ where: { id }, data: { status: 'CONFIRMED' } });
    emitToKitchen(restaurantId, SocketEvents.RESERVATION_UPDATED, { reservationId: id, status: reservation.status });
    return reservation;
  },

  async cancel(restaurantId: string, id: string) {
    const existing = await prisma.reservation.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Reserva no encontrada.');
    const reservation = await prisma.reservation.update({ where: { id }, data: { status: 'CANCELLED' } });
    emitToKitchen(restaurantId, SocketEvents.RESERVATION_UPDATED, { reservationId: id, status: reservation.status });
    return reservation;
  },
};
