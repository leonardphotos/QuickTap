import { QrNfcRequestStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';

/** Precio fijo en USD por unidad (tasa BCV al convertir para mostrar en Bs). */
const UNIT_PRICE_USD = 5;

export const qrNfcRequestService = {
  /** El restaurante ya está autenticado: los datos de contacto se derivan del dueño, nunca del cliente. */
  async create(restaurantId: string, quantity: number) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        name: true,
        whatsappPhone: true,
        users: { where: { role: 'OWNER' }, select: { name: true, email: true }, take: 1 },
      },
    });
    if (!restaurant) throw notFound('Restaurante no encontrado.');

    const owner = restaurant.users[0];
    if (!owner) throw badRequest('Este restaurante no tiene un usuario dueño registrado.');

    const totalPriceUsd = Math.round(quantity * UNIT_PRICE_USD * 100) / 100;

    return prisma.qrNfcRequest.create({
      data: {
        restaurantId,
        quantity,
        unitPriceUsd: UNIT_PRICE_USD,
        totalPriceUsd,
        contactName: owner.name,
        contactEmail: owner.email,
        contactPhone: restaurant.whatsappPhone,
      },
    });
  },

  /** Dashboard maestro: solicitudes de cotización, más recientes primero. */
  async list(status?: QrNfcRequestStatus) {
    return prisma.qrNfcRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { restaurant: { select: { id: true, name: true, slug: true } } },
    });
  },

  /** Marca la solicitud como atendida (el equipo de QuickTap ya contactó al restaurante). */
  async approve(id: string) {
    const existing = await prisma.qrNfcRequest.findUnique({ where: { id } });
    if (!existing) throw notFound('Solicitud no encontrada.');
    if (existing.status === 'APPROVED') throw badRequest('Esta solicitud ya fue marcada como atendida.');
    return prisma.qrNfcRequest.update({ where: { id }, data: { status: 'APPROVED' } });
  },
};
