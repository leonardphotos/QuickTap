import { prisma } from '../../config/prisma';
import { badRequest, conflict, notFound } from '../../utils/http-error';

export const tableSessionService = {
  /** Cuenta abierta vigente de una mesa (si la tiene). */
  async getOpenForTable(tableId: string) {
    return prisma.tableSession.findFirst({ where: { tableId, status: 'OPEN' } });
  },

  /** Resuelto públicamente por el qrToken (sin sesión de staff). */
  async getPublicStatusByQrToken(qrToken: string) {
    const table = await prisma.table.findUnique({
      where: { qrToken },
      select: { id: true, isActive: true },
    });
    if (!table || !table.isActive) throw notFound('Mesa no válida.');

    const session = await this.getOpenForTable(table.id);
    return {
      isOpen: !!session,
      customerName: session?.customerName ?? null,
    };
  },

  async getById(restaurantId: string, id: string) {
    const session = await prisma.tableSession.findFirst({ where: { id, restaurantId } });
    if (!session) throw notFound('Cuenta de mesa no encontrada.');
    return session;
  },

  /** "Cerrar mesa": libera la mesa para que pueda abrir una cuenta nueva. */
  async close(restaurantId: string, id: string) {
    const session = await this.getById(restaurantId, id);
    if (session.status === 'CLOSED') throw badRequest('Esa cuenta ya está cerrada.');
    return prisma.tableSession.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
  },

  /** "Rodar mesa": mueve la cuenta abierta a otra mesa física, conservándola intacta. */
  async move(restaurantId: string, id: string, newTableId: string) {
    const session = await this.getById(restaurantId, id);
    if (session.status !== 'OPEN') throw badRequest('Solo se puede rodar una cuenta abierta.');
    if (newTableId === session.tableId) throw badRequest('La cuenta ya está en esa mesa.');

    const newTable = await prisma.table.findFirst({ where: { id: newTableId, restaurantId } });
    if (!newTable) throw badRequest('La mesa destino no existe o no pertenece a este restaurante.');

    const existingOpen = await this.getOpenForTable(newTableId);
    if (existingOpen) throw conflict('La mesa destino ya tiene una cuenta abierta.');

    return prisma.tableSession.update({ where: { id }, data: { tableId: newTableId } });
  },
};
