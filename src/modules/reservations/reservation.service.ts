import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { startOfDayCaracas, startOfTodayCaracas } from '../../utils/timezone';
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

    return prisma.reservation.create({
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
  },

  /** Ajustes/Mesas → lista de reservas próximas (hoy en adelante), para que el staff sepa qué viene. */
  async listUpcoming(restaurantId: string) {
    const todayStart = startOfTodayCaracas();
    return prisma.reservation.findMany({
      where: { restaurantId, status: 'CONFIRMED', date: { gte: todayStart } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
      include: { tables: { select: { id: true, number: true } } },
    });
  },

  async cancel(restaurantId: string, id: string) {
    const existing = await prisma.reservation.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Reserva no encontrada.');
    return prisma.reservation.update({ where: { id }, data: { status: 'CANCELLED' } });
  },
};
