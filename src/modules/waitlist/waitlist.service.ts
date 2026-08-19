import { prisma } from '../../config/prisma';
import { badRequest, conflict, notFound } from '../../utils/http-error';
import { startOfTodayCaracas } from '../../utils/timezone';
import { emitToKitchen, SocketEvents } from '../../sockets';
import { primaryTableIdOf } from '../../utils/table-merge';
import {
  CreateWaitlistEntryInput,
  SeatWaitlistEntryInput,
  UpdateWaitlistEntryInput,
} from './waitlist.dto';

const WITH_ZONE = {
  zone: { select: { id: true, name: true } },
  // La mesa donde terminó sentado: la barra lateral la muestra y deja tocarla para abrir la cuenta.
  tableSession: { select: { id: true, table: { select: { id: true, number: true } } } },
} as const;

/** Aplana la mesa donde se sentó, para que la UI no tenga que navegar la relación. */
function withSeatedTable<T extends { tableSession?: { table: { id: string; number: string } } | null }>(entry: T) {
  return { ...entry, seatedTable: entry.tableSession?.table ?? null };
}

/** Todavía en la puerta: esperando o ya avisados de que su mesa está lista. */
const LIVE_STATUSES = ['WAITING', 'NOTIFIED'] as const;

function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
}

export const waitlistService = {
  /**
   * Lo que ve la barra lateral de Sala: quién está esperando ahora mismo, quién ya se sentó hoy,
   * y cuánto se está esperando de verdad — el promedio sale de las esperas reales del día, no de
   * lo que se le prometió a cada uno.
   */
  async list(restaurantId: string) {
    const todayStart = startOfTodayCaracas();

    const [live, seatedToday] = await Promise.all([
      prisma.waitlistEntry.findMany({
        where: { restaurantId, status: { in: [...LIVE_STATUSES] } },
        orderBy: { createdAt: 'asc' },
        include: WITH_ZONE,
      }),
      prisma.waitlistEntry.findMany({
        where: { restaurantId, status: 'SEATED', seatedAt: { gte: todayStart } },
        orderBy: { seatedAt: 'desc' },
        include: WITH_ZONE,
      }),
    ]);

    const now = new Date();
    const waits = seatedToday
      .filter((e) => e.seatedAt)
      .map((e) => minutesBetween(e.createdAt, e.seatedAt as Date));

    return {
      // `waitedMinutes` es cuánto lleva esperando cada uno ahora mismo: lo calcula el servidor
      // para que todas las tablets muestren lo mismo sin depender de su reloj.
      waiting: live.map((e) => withSeatedTable({ ...e, waitedMinutes: minutesBetween(e.createdAt, now) })),
      seatedToday: seatedToday.map((e) =>
        withSeatedTable({ ...e, waitedMinutes: e.seatedAt ? minutesBetween(e.createdAt, e.seatedAt) : null }),
      ),
      stats: {
        waitingCount: live.length,
        avgWaitMinutes: waits.length > 0 ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
        longestWaitMinutes: live.length > 0 ? minutesBetween(live[0].createdAt, now) : null,
      },
    };
  },

  async create(restaurantId: string, input: CreateWaitlistEntryInput) {
    if (input.zoneId) await assertZoneBelongs(restaurantId, input.zoneId);

    const entry = await prisma.waitlistEntry.create({
      data: { restaurantId, ...input },
      include: WITH_ZONE,
    });
    emitToKitchen(restaurantId, SocketEvents.WAITLIST_NEW, entry);
    return entry;
  },

  async update(restaurantId: string, id: string, input: UpdateWaitlistEntryInput) {
    const existing = await getLive(restaurantId, id);
    if (input.zoneId) await assertZoneBelongs(restaurantId, input.zoneId);

    const entry = await prisma.waitlistEntry.update({
      where: { id: existing.id },
      data: input,
      include: WITH_ZONE,
    });
    emitToKitchen(restaurantId, SocketEvents.WAITLIST_UPDATED, entry);
    return entry;
  },

  /** "Ya está tu mesa": deja constancia de cuándo se le avisó. El WhatsApp lo manda la UI. */
  async notify(restaurantId: string, id: string) {
    const existing = await getLive(restaurantId, id);
    const entry = await prisma.waitlistEntry.update({
      where: { id: existing.id },
      data: { status: 'NOTIFIED', notifiedAt: new Date() },
      include: WITH_ZONE,
    });
    emitToKitchen(restaurantId, SocketEvents.WAITLIST_UPDATED, entry);
    return entry;
  },

  /**
   * "Sentar": le abre la cuenta en la mesa elegida y lo saca de la lista. Es el mismo paso que
   * `reservationService.seat`, pero desde la puerta en vez de desde una reserva.
   */
  async seat(restaurantId: string, id: string, input: SeatWaitlistEntryInput) {
    const existing = await getLive(restaurantId, id);

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
          customerName: existing.customerName,
          // La cuenta exige cédula pero en la puerta rara vez se pide: "S/C" (sin cédula) es lo
          // mismo que ya usa la factura de consumidor final.
          customerIdNumber: input.customerIdNumber || existing.customerIdNumber || 'S/C',
          customerPhone: existing.customerPhone,
        },
      });
      return tx.waitlistEntry.update({
        where: { id: existing.id },
        data: { status: 'SEATED', seatedAt: new Date(), closedAt: new Date(), tableSessionId: session.id },
        include: WITH_ZONE,
      });
    });

    const result = withSeatedTable(seated);
    emitToKitchen(restaurantId, SocketEvents.WAITLIST_UPDATED, result);
    return result;
  },

  /** Se cansó de esperar y se fue. */
  async cancel(restaurantId: string, id: string) {
    return closeWith(restaurantId, id, 'CANCELLED');
  },

  /** Le tocó su mesa y no apareció. */
  async noShow(restaurantId: string, id: string) {
    return closeWith(restaurantId, id, 'NO_SHOW');
  },
};

async function assertZoneBelongs(restaurantId: string, zoneId: string) {
  const zone = await prisma.zone.findFirst({ where: { id: zoneId, restaurantId }, select: { id: true } });
  if (!zone) throw badRequest('La zona no existe o no pertenece a este restaurante.');
}

/** La entrada existe, es de este restaurante y todavía está en la puerta (no cerrada). */
async function getLive(restaurantId: string, id: string) {
  const entry = await prisma.waitlistEntry.findFirst({ where: { id, restaurantId } });
  if (!entry) throw notFound('Esa persona no está en la lista de espera.');
  if (!(LIVE_STATUSES as readonly string[]).includes(entry.status)) {
    throw badRequest('Esa espera ya está cerrada.');
  }
  return entry;
}

async function closeWith(restaurantId: string, id: string, status: 'CANCELLED' | 'NO_SHOW') {
  const existing = await getLive(restaurantId, id);
  const entry = await prisma.waitlistEntry.update({
    where: { id: existing.id },
    data: { status, closedAt: new Date() },
    include: WITH_ZONE,
  });
  emitToKitchen(restaurantId, SocketEvents.WAITLIST_UPDATED, entry);
  return entry;
}
