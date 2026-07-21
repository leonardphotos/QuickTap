import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { startOfDayCaracas, startOfTodayCaracas } from '../../utils/timezone';
import { emitToKitchen, SocketEvents } from '../../sockets';
import { CreateReservationInput } from './reservation.dto';

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

    return tables.map((t) => ({
      id: t.id,
      number: t.number,
      zone: t.zone,
      status: occupiedTableIds.has(t.id) ? 'OCCUPIED' : reservedTableIds.has(t.id) ? 'RESERVED' : 'AVAILABLE',
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

  /** Pestaña "Reservas" del panel: pendientes por aceptar + confirmadas próximas (hoy en adelante). */
  async list(restaurantId: string) {
    const todayStart = startOfTodayCaracas();
    const reservations = await prisma.reservation.findMany({
      where: { restaurantId, status: { in: ['PENDING', 'CONFIRMED'] }, date: { gte: todayStart } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
      include: { tables: { select: { id: true, number: true } } },
    });
    // Las pendientes primero: son las que requieren acción del staff.
    return reservations.sort((a, b) => (a.status === b.status ? 0 : a.status === 'PENDING' ? -1 : 1));
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
