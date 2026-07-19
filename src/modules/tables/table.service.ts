import { nanoid } from 'nanoid';
import { ServiceRequestType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { emitToKitchen, emitToTable, SocketEvents } from '../../sockets';
import { CreateTableInput, UpdateTableInput } from './table.dto';

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
  orders: Array<{
    id: string;
    orderNumber: number;
    status: string;
    createdAt: Date;
    items: {
      productName: string;
      variantName: string | null;
      quantity: number;
      modifiers: { name: string; priceBase: unknown }[];
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
        modifiers: it.modifiers.map((m) => m.name),
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
      data: { restaurantId, number: input.number, zoneId: input.zoneId, qrToken: nanoid(14) },
    });
  },

  async update(restaurantId: string, id: string, input: UpdateTableInput) {
    const existing = await prisma.table.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Mesa no encontrada.');
    if (input.zoneId) await assertZoneBelongs(restaurantId, input.zoneId);

    return prisma.table.update({
      where: { id },
      data: { number: input.number, zoneId: input.zoneId },
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
   * sigue viva hasta que el restaurante la cierre.
   */
  async floorPlan(restaurantId: string) {
    const [zones, unzonedTables, openSessions] = await Promise.all([
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
        include: {
          orders: {
            where: { channel: 'DINE_IN' },
            orderBy: { createdAt: 'asc' },
            include: { items: { include: { modifiers: true } } },
          },
        },
      }),
    ]);

    const sessionByTable = new Map(openSessions.map((s) => [s.tableId, s]));

    const mapTable = (table: { id: string; number: string; serviceRequest: ServiceRequestType | null }) => {
      const session = sessionByTable.get(table.id);
      return {
        id: table.id,
        number: table.number,
        session: session ? serializeSession(session) : null,
        serviceRequest: table.serviceRequest,
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

  /** El comensal llama al mesero o pide la cuenta desde el menú público (vía qrToken de su mesa). */
  async requestService(qrToken: string, type: ServiceRequestType) {
    const table = await prisma.table.findUnique({ where: { qrToken } });
    if (!table || !table.isActive) throw notFound('Mesa no válida.');

    await prisma.table.update({
      where: { id: table.id },
      data: { serviceRequest: type, serviceRequestAt: new Date() },
    });

    emitToKitchen(table.restaurantId, SocketEvents.TABLE_SERVICE_REQUEST, { tableId: table.id, type });
    return { ok: true };
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
