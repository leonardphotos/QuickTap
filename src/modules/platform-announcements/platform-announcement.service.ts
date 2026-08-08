import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { formatVenezuelanWhatsappPhone } from '../../utils/whatsapp';
import { masterWhatsappBotService } from '../master-whatsapp/master-whatsapp-bot.service';
import type { CreateAnnouncementInput, UpdateAnnouncementInput } from './platform-announcement.dto';

export const platformAnnouncementService = {
  list() {
    return prisma.platformAnnouncement.findMany({ orderBy: { createdAt: 'desc' } });
  },

  create(input: CreateAnnouncementInput) {
    return prisma.platformAnnouncement.create({
      data: { message: input.message, targetBusinessType: input.targetBusinessType ?? null },
    });
  },

  async update(id: string, input: UpdateAnnouncementInput) {
    const existing = await prisma.platformAnnouncement.findUnique({ where: { id } });
    if (!existing) throw notFound('Aviso no encontrado.');
    if (existing.status === 'SENT') throw badRequest('Ya se envió — no se puede editar.');
    return prisma.platformAnnouncement.update({
      where: { id },
      data: {
        message: input.message ?? undefined,
        targetBusinessType: input.targetBusinessType !== undefined ? input.targetBusinessType : undefined,
      },
    });
  },

  async remove(id: string) {
    const existing = await prisma.platformAnnouncement.findUnique({ where: { id } });
    if (!existing) throw notFound('Aviso no encontrado.');
    if (existing.status === 'SENT') throw badRequest('Ya se envió — no se puede borrar.');
    await prisma.platformAnnouncement.delete({ where: { id } });
  },

  /** Manda el aviso a todos los restaurantes/locales activos (no demo, con WhatsApp) que
   * coincidan con targetBusinessType — null manda a ambos tipos por igual. Encolado entero de
   * una vez vía broadcast() (ver master-whatsapp-bot.service.ts): la cola ya existente lo procesa
   * sola, uno a la vez con ~30s aleatorios, sin que nadie tenga que supervisarlo. */
  async send(id: string) {
    const existing = await prisma.platformAnnouncement.findUnique({ where: { id } });
    if (!existing) throw notFound('Aviso no encontrado.');
    if (existing.status === 'SENT') throw badRequest('Ya se envió.');

    const restaurants = await prisma.restaurant.findMany({
      where: {
        isDemo: false,
        isActive: true,
        whatsappPhone: { not: null },
        parentRestaurantId: null,
        ...(existing.targetBusinessType ? { businessType: existing.targetBusinessType } : {}),
      },
      select: { whatsappPhone: true },
    });
    // Las sucursales sí tienen su propio WhatsApp/local físico, aunque no tengan suscripción propia.
    const branches = await prisma.restaurant.findMany({
      where: {
        isDemo: false,
        isActive: true,
        whatsappPhone: { not: null },
        parentRestaurantId: { not: null },
        ...(existing.targetBusinessType ? { businessType: existing.targetBusinessType } : {}),
      },
      select: { whatsappPhone: true },
    });

    const phones = [...restaurants, ...branches]
      .map((r) => formatVenezuelanWhatsappPhone(r.whatsappPhone!).replace(/\D/g, ''))
      .filter((p, i, arr) => arr.indexOf(p) === i);

    if (phones.length === 0) throw badRequest('No hay restaurantes/locales activos con WhatsApp para este destino.');

    masterWhatsappBotService.broadcast(phones, existing.message);

    return prisma.platformAnnouncement.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), sentCount: phones.length },
    });
  },
};
