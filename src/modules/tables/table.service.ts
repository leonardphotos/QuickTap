import { nanoid } from 'nanoid';
import { Prisma, ServiceRequestType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, conflict, notFound } from '../../utils/http-error';
import { emitToKitchen, emitToTable, SocketEvents } from '../../sockets';
import { startOfTodayCaracas } from '../../utils/timezone';
import { primaryTableIdOf, unmergeGroup } from '../../utils/table-merge';
import { CreateTableInput, MergeTablesInput, SaveFloorPlanInput, UpdateTableInput } from './table.dto';

async function assertZoneBelongs(restaurantId: string, zoneId: string) {
  const zone = await prisma.zone.findFirst({ where: { id: zoneId, restaurantId }, select: { id: true } });
  if (!zone) throw badRequest('La zona no existe o no pertenece a este restaurante.');
}

function serializeSession(session: {
  id: string;
  customerName: string;
  customerIdNumber: string;
  openedAt: Date;
  pinHash: string | null;
  label: string | null;
  orders: Array<{
    id: string;
    orderNumber: number;
    status: string;
    createdAt: Date;
    totalBase: unknown;
    items: {
      productName: string;
      variantName: string | null;
      quantity: number;
      modifiers: { name: string; priceBase: unknown; quantity: number }[];
      note: string | null;
    }[];
  }>;
}) {
  return {
    id: session.id,
    customerName: session.customerName,
    customerIdNumber: session.customerIdNumber,
    openedAt: session.openedAt,
    pinRequired: !!session.pinHash,
    label: session.label,
    // Suma de todos los pedidos de la cuenta, para mostrar "Cuenta 1 — $22.50" al elegir entre varias.
    totalBase: session.orders.reduce((acc, o) => acc + Number(o.totalBase), 0).toFixed(2),
    // "Pedido #1", "Pedido #2"... según el orden en que se hicieron dentro de la cuenta.
    orders: session.orders.map((o, i) => ({
      orderId: o.id,
      pedidoNumber: i + 1,
      orderNumber: o.orderNumber,
      status: o.status,
      createdAt: o.createdAt,
      items: o.items.map((it) => ({
        name: it.productName,
        variantName: it.variantName,
        quantity: it.quantity,
        modifiers: it.modifiers.map((m) => (m.quantity > 1 ? `${m.name} x${m.quantity}` : m.name)),
        note: it.note,
      })),
    })),
  };
}

export const tableService = {
  async list(restaurantId: string) {
    return prisma.table.findMany({
      where: { restaurantId },
      orderBy: { number: 'asc' },
      include: { zone: { select: { id: true, name: true } } },
    });
  },

  /** Crea la mesa con un qrToken único; ese token es lo que va embebido en el QR. */
  async create(restaurantId: string, input: CreateTableInput) {
    if (input.zoneId) await assertZoneBelongs(restaurantId, input.zoneId);
    return prisma.table.create({
      data: {
        restaurantId,
        number: input.number,
        zoneId: input.zoneId,
        qrToken: nanoid(14),
        ...(input.seats != null ? { seats: input.seats } : {}),
      },
    });
  },

  async update(restaurantId: string, id: string, input: UpdateTableInput) {
    const existing = await prisma.table.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Mesa no encontrada.');
    if (input.zoneId) await assertZoneBelongs(restaurantId, input.zoneId);

    return prisma.table.update({
      where: { id },
      data: { number: input.number, zoneId: input.zoneId, ...(input.seats != null ? { seats: input.seats } : {}) },
      include: { zone: { select: { id: true, name: true } } },
    });
  },

  async remove(restaurantId: string, id: string) {
    const existing = await prisma.table.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Mesa no encontrada.');
    await prisma.table.delete({ where: { id } });
    return { deleted: true };
  },

  /**
   * Plano de Órdenes de Mesa: mesas agrupadas por zona (cuadrícula automática).
   * Una mesa se pinta en verde mientras tenga una CUENTA ABIERTA (TableSession),
   * sin importar si sus pedidos individuales ya fueron servidos: la cuenta
   * sigue viva hasta que el restaurante la cierre. `reserved` usa el mismo
   * criterio que ya ve el comensal en el menú público (reservationService.
   * getTableStatuses): tiene una reserva CONFIRMED para hoy. Si la mesa está
   * ocupada ahora mismo, esa realidad física manda sobre la reserva.
   */
  async floorPlan(restaurantId: string) {
    const todayStart = startOfTodayCaracas();
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const [zones, unzonedTables, openSessions, todaysReservations] = await Promise.all([
      prisma.zone.findMany({
        where: { restaurantId },
        orderBy: [{ priority: 'asc' }, { name: 'asc' }],
        include: {
          tables: { where: { isActive: true }, orderBy: { number: 'asc' } },
        },
      }),
      prisma.table.findMany({
        where: { restaurantId, zoneId: null, isActive: true },
        orderBy: { number: 'asc' },
      }),
      prisma.tableSession.findMany({
        where: { restaurantId, status: 'OPEN' },
        orderBy: { openedAt: 'asc' },
        include: {
          orders: {
            where: { channel: 'DINE_IN' },
            orderBy: { createdAt: 'asc' },
            include: { items: { include: { modifiers: true } } },
          },
        },
      }),
      prisma.reservation.findMany({
        where: { restaurantId, status: 'CONFIRMED', date: { gte: todayStart, lt: todayEnd } },
        select: { tables: { select: { id: true } } },
      }),
    ]);

    // Una mesa puede tener varias cuentas abiertas a la vez — se agrupan todas, no solo la última.
    const sessionByTable = new Map<string, typeof openSessions>();
    for (const s of openSessions) {
      sessionByTable.set(s.tableId, [...(sessionByTable.get(s.tableId) ?? []), s]);
    }
    const reservedTableIds = new Set(todaysReservations.flatMap((r) => r.tables.map((t) => t.id)));

    // Mesas unidas: cada principal necesita saber quiénes cuelgan de ella para que el plano
    // dibuje una sola tarjeta por grupo, con el rótulo "1+2" y la suma de sillas.
    const allTables = [...zones.flatMap((z) => z.tables), ...unzonedTables];
    const membersOfPrimary = new Map<string, { id: string; number: string; seats: number }[]>();
    for (const t of allTables) {
      if (!t.mergedIntoTableId) continue;
      const list = membersOfPrimary.get(t.mergedIntoTableId) ?? [];
      list.push({ id: t.id, number: t.number, seats: t.seats });
      membersOfPrimary.set(t.mergedIntoTableId, list);
    }

    const mapTable = (table: {
      id: string;
      number: string;
      serviceRequest: ServiceRequestType | null;
      planX: Prisma.Decimal | null;
      planY: Prisma.Decimal | null;
      planShape: string;
      planSize: Prisma.Decimal;
      seats: number;
      mergedIntoTableId: string | null;
    }) => {
      const sessions = sessionByTable.get(table.id) ?? [];
      const members = membersOfPrimary.get(table.id) ?? [];
      return {
        id: table.id,
        number: table.number,
        sessions: sessions.map(serializeSession),
        serviceRequest: table.serviceRequest,
        reserved: sessions.length === 0 && reservedTableIds.has(table.id),
        // Planimetría: null = todavía sin ubicar en el plano de su zona.
        planX: table.planX != null ? Number(table.planX) : null,
        planY: table.planY != null ? Number(table.planY) : null,
        planShape: table.planShape,
        planSize: Number(table.planSize),
        seats: table.seats,
        // Unión de mesas. En una miembro: a qué principal pertenece (y nada más — su cuenta
        // vive allá). En una principal: quiénes cuelgan de ella, para dibujar el grupo.
        mergedIntoTableId: table.mergedIntoTableId,
        mergedTableIds: members.map((m) => m.id),
        mergedNumbers: members.length > 0 ? [table.number, ...members.map((m) => m.number)] : [],
        groupSeats: table.seats + members.reduce((acc, m) => acc + m.seats, 0),
      };
    };

    return {
      zones: zones.map((zone) => ({
        id: zone.id,
        name: zone.name,
        tables: zone.tables.map(mapTable),
      })),
      unzoned: unzonedTables.map(mapTable),
    };
  },

  /**
   * Guarda el plano del salón: la posición (en % del lienzo), la forma y el tamaño de cada
   * mesa que se movió. Se manda solo lo que cambió, en un solo golpe, para que arrastrar
   * diez mesas no sean diez peticiones.
   */
  async saveFloorPlan(restaurantId: string, input: SaveFloorPlanInput) {
    if (input.tables.length === 0) return { updated: 0 };
    const ids = input.tables.map((t) => t.id);
    const count = await prisma.table.count({ where: { id: { in: ids }, restaurantId } });
    if (count !== ids.length) throw badRequest('Alguna mesa no existe o no pertenece a este restaurante.');

    await prisma.$transaction(
      input.tables.map((t) =>
        prisma.table.update({
          where: { id: t.id },
          data: {
            planX: t.planX,
            planY: t.planY,
            ...(t.planShape ? { planShape: t.planShape } : {}),
            ...(t.planSize != null ? { planSize: t.planSize } : {}),
            ...(t.seats != null ? { seats: t.seats } : {}),
          },
        }),
      ),
    );
    return { updated: input.tables.length };
  },

  /**
   * "Unir mesas": junta varias mesas en una sola para un grupo grande. La `primaryTableId` es la
   * que lleva la cuenta — el resto se le pega y deja de tener vida propia hasta separarlas, así
   * el grupo entero consume y paga UNA sola cuenta (ver src/utils/table-merge.ts).
   *
   * Reglas, en este orden:
   *  - un solo nivel: ni la principal ni los miembros pueden estar ya metidos en otra unión;
   *  - todas de la misma zona (el plano se ve por zona, una mesa no puede estar en dos a la vez);
   *  - a lo sumo UNA mesa del grupo puede traer cuenta abierta, y si no es la principal, esa
   *    cuenta se muda a la principal aquí mismo (mismo patrón que "rodar mesa").
   */
  async merge(restaurantId: string, input: MergeTablesInput) {
    const memberIds = [...new Set(input.tableIds)].filter((id) => id !== input.primaryTableId);
    if (memberIds.length === 0) throw badRequest('Elige al menos otra mesa para unir.');

    const ids = [input.primaryTableId, ...memberIds];
    const tables = await prisma.table.findMany({
      where: { id: { in: ids }, restaurantId },
      select: { id: true, number: true, zoneId: true, isActive: true, mergedIntoTableId: true, planX: true, planY: true },
    });
    if (tables.length !== ids.length) throw badRequest('Alguna mesa no existe o no pertenece a este restaurante.');

    const primary = tables.find((t) => t.id === input.primaryTableId)!;
    const members = tables.filter((t) => t.id !== primary.id);

    const inactive = tables.find((t) => !t.isActive);
    if (inactive) throw badRequest(`La mesa ${inactive.number} está desactivada.`);

    const alreadyMerged = tables.find((t) => t.mergedIntoTableId);
    if (alreadyMerged) throw badRequest(`La mesa ${alreadyMerged.number} ya está unida a otra. Sepárala primero.`);

    // Ninguna puede ser principal de otro grupo: la unión es de un solo nivel para que
    // resolver "quién lleva la cuenta" sea siempre una sola indirección.
    const withMembers = await prisma.table.findMany({
      where: { restaurantId, mergedIntoTableId: { in: ids } },
      select: { mergedIntoTableId: true },
    });
    if (withMembers.length > 0) {
      const busy = tables.find((t) => t.id === withMembers[0].mergedIntoTableId);
      throw badRequest(`La mesa ${busy?.number ?? ''} ya tiene mesas unidas. Sepáralas primero.`.trim());
    }

    if (members.some((m) => m.zoneId !== primary.zoneId)) {
      throw badRequest('Solo se pueden unir mesas de la misma zona.');
    }

    // Cuentas abiertas: como el grupo debe quedar con una sola, se admite a lo sumo una.
    const openSessions = await prisma.tableSession.findMany({
      where: { restaurantId, tableId: { in: ids }, status: 'OPEN' },
      select: { id: true, tableId: true },
    });
    const tablesWithAccount = new Set(openSessions.map((s) => s.tableId));
    if (tablesWithAccount.size > 1) {
      throw conflict('Hay más de una cuenta abierta entre esas mesas. Cierra o cobra una antes de unirlas.');
    }
    // La cuenta de un miembro se muda a la principal, junto con sus pedidos — si no, cocina y la
    // comanda impresa seguirían nombrando la mesa vieja.
    const sessionsToMove = openSessions.filter((s) => s.tableId !== primary.id).map((s) => s.id);

    const positionById = new Map((input.positions ?? []).map((p) => [p.id, p]));

    await prisma.$transaction([
      ...(sessionsToMove.length > 0
        ? [
            prisma.order.updateMany({
              where: { restaurantId, tableSessionId: { in: sessionsToMove } },
              data: { tableId: primary.id },
            }),
            prisma.tableSession.updateMany({ where: { id: { in: sessionsToMove } }, data: { tableId: primary.id } }),
          ]
        : []),
      ...members.map((m) => {
        const pos = positionById.get(m.id);
        return prisma.table.update({
          where: { id: m.id },
          data: {
            mergedIntoTableId: primary.id,
            mergedAt: new Date(),
            // Se guarda de dónde venía para devolverla ahí al separar.
            preMergePlanX: m.planX,
            preMergePlanY: m.planY,
            ...(pos ? { planX: pos.planX, planY: pos.planY } : {}),
          },
        });
      }),
    ]);

    emitToKitchen(restaurantId, SocketEvents.TABLE_MERGE_UPDATED, { primaryTableId: primary.id, merged: true });
    return { merged: members.length, primaryTableId: primary.id };
  },

  /** "Separar mesas": deshace la unión a mano y devuelve cada mesa a su sitio en el plano. */
  async unmerge(restaurantId: string, primaryTableId: string) {
    const primary = await prisma.table.findFirst({
      where: { id: primaryTableId, restaurantId },
      select: { id: true },
    });
    if (!primary) throw notFound('Mesa no encontrada.');

    const count = await unmergeGroup(restaurantId, primaryTableId);
    if (count === 0) throw badRequest('Esa mesa no tiene mesas unidas.');

    emitToKitchen(restaurantId, SocketEvents.TABLE_MERGE_UPDATED, { primaryTableId, merged: false });
    return { unmerged: count };
  },

  /** El comensal llama al mesero o pide la cuenta desde el menú público (vía qrToken de su mesa). */
  async requestService(qrToken: string, type: ServiceRequestType) {
    const table = await prisma.table.findUnique({ where: { qrToken } });
    if (!table || !table.isActive) throw notFound('Mesa no válida.');

    // Mesa unida: la campanita se prende en la principal, que es la tarjeta que el plano dibuja
    // para todo el grupo — si no, el llamado quedaría invisible dentro de la cápsula.
    const targetId = primaryTableIdOf(table);
    await prisma.table.update({
      where: { id: targetId },
      data: { serviceRequest: type, serviceRequestAt: new Date() },
    });

    emitToKitchen(table.restaurantId, SocketEvents.TABLE_SERVICE_REQUEST, { tableId: targetId, type });
    return { ok: true };
  },

  /**
   * Ajustes → Equipo → "Asignar mesas": reemplazo completo de las mesas de un
   * mesero. Las que estaban asignadas a él y no vienen en `tableIds` quedan
   * sin asignar; el resto de las mesas no se toca.
   */
  async assignTablesToWaiter(restaurantId: string, waiterId: string, tableIds: string[]) {
    const waiter = await prisma.user.findFirst({ where: { id: waiterId, restaurantId }, select: { id: true } });
    if (!waiter) throw notFound('Mesero no encontrado.');

    if (tableIds.length > 0) {
      const count = await prisma.table.count({ where: { id: { in: tableIds }, restaurantId } });
      if (count !== tableIds.length) throw badRequest('Alguna mesa no existe o no pertenece a este restaurante.');
    }

    await prisma.$transaction([
      prisma.table.updateMany({
        where: { restaurantId, assignedWaiterId: waiterId, id: { notIn: tableIds } },
        data: { assignedWaiterId: null },
      }),
      prisma.table.updateMany({
        where: { restaurantId, id: { in: tableIds } },
        data: { assignedWaiterId: waiterId },
      }),
    ]);

    return prisma.table.findMany({ where: { restaurantId, assignedWaiterId: waiterId }, orderBy: { number: 'asc' } });
  },

  /** El mesero atiende la solicitud desde el plano de mesas: la limpia y avisa al comensal. */
  async acknowledgeServiceRequest(restaurantId: string, tableId: string) {
    const table = await prisma.table.findFirst({ where: { id: tableId, restaurantId } });
    if (!table) throw notFound('Mesa no encontrada.');
    if (!table.serviceRequest) throw badRequest('Esta mesa no tiene una solicitud pendiente.');

    const type = table.serviceRequest;
    await prisma.table.update({
      where: { id: tableId },
      data: { serviceRequest: null, serviceRequestAt: null },
    });

    emitToTable(tableId, SocketEvents.TABLE_SERVICE_ACK, { type });
    emitToKitchen(restaurantId, SocketEvents.TABLE_SERVICE_ACK, { tableId, type });
    return { ok: true };
  },
};
