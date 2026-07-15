import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma';
import { badRequest, conflict, notFound, unauthorized } from '../../utils/http-error';

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
      // Ya decidió (puso clave o dejó la cuenta abierta) vs. todavía sin decidir.
      pinDecided: !!session && (!!session.pinHash || session.pinSkipped),
      pinRequired: !!session?.pinHash,
    };
  },

  /** El cliente elige proteger la mesa con una clave de 4 dígitos (tras su primer pedido). */
  async setPinByQrToken(qrToken: string, pin: string) {
    const table = await prisma.table.findUnique({ where: { qrToken }, select: { id: true, isActive: true } });
    if (!table || !table.isActive) throw notFound('Mesa no válida.');

    const session = await this.getOpenForTable(table.id);
    if (!session) throw badRequest('Esta mesa no tiene una cuenta abierta todavía.');

    const pinHash = await bcrypt.hash(pin, 10);
    await prisma.tableSession.update({ where: { id: session.id }, data: { pinHash, pinSkipped: false } });
    return { ok: true };
  },

  /** El cliente elige dejar la cuenta abierta, sin clave. */
  async skipPinByQrToken(qrToken: string) {
    const table = await prisma.table.findUnique({ where: { qrToken }, select: { id: true, isActive: true } });
    if (!table || !table.isActive) throw notFound('Mesa no válida.');

    const session = await this.getOpenForTable(table.id);
    if (!session) throw badRequest('Esta mesa no tiene una cuenta abierta todavía.');

    await prisma.tableSession.update({ where: { id: session.id }, data: { pinSkipped: true } });
    return { ok: true };
  },

  /** Valida la clave de una sesión (usado al enviar un pedido nuevo a una cuenta ya protegida). */
  async verifyPin(session: { pinHash: string | null }, pin: string | undefined) {
    if (!session.pinHash) return true;
    if (!pin) throw unauthorized('Escribe la clave de la mesa para poder pedir.');
    const valid = await bcrypt.compare(pin, session.pinHash);
    if (!valid) throw unauthorized('Clave de mesa incorrecta.');
    return true;
  },

  /** Staff (Mesero/Admin): quita la clave de la cuenta abierta de una mesa (el cliente la olvidó). */
  async resetPin(restaurantId: string, id: string) {
    const session = await this.getById(restaurantId, id);
    if (session.status !== 'OPEN') throw badRequest('Esa cuenta ya está cerrada.');
    return prisma.tableSession.update({ where: { id }, data: { pinHash: null, pinSkipped: false } });
  },

  async getById(restaurantId: string, id: string) {
    const session = await prisma.tableSession.findFirst({ where: { id, restaurantId } });
    if (!session) throw notFound('Cuenta de mesa no encontrada.');
    return session;
  },

  /**
   * "Cerrar mesa": libera la mesa para que pueda abrir una cuenta nueva.
   * Si se indica método de pago, queda registrado en todos los pedidos de la
   * cuenta (así se puede filtrar ingresos por método de pago en mesa también).
   */
  async close(restaurantId: string, id: string, paymentMethod?: 'MOBILE_PAYMENT' | 'ZELLE' | 'CASH' | 'CARD') {
    const session = await this.getById(restaurantId, id);
    if (session.status === 'CLOSED') throw badRequest('Esa cuenta ya está cerrada.');

    const results = await prisma.$transaction([
      ...(paymentMethod
        ? [prisma.order.updateMany({ where: { tableSessionId: id, restaurantId }, data: { paymentMethod } })]
        : []),
      prisma.tableSession.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date() } }),
    ]);

    return results[results.length - 1];
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
