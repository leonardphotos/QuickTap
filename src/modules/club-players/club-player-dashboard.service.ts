import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { round2, toDecimal } from '../../utils/money';
import { whatsappBotService } from '../whatsapp-bot/whatsapp-bot.service';
import { clubPlayerService } from './club-player.service';

export const clubPlayerDashboardService = {
  /**
   * Panel del jugador: puntos, partidas jugadas y próximas reservas.
   *
   * "Partidas jugadas" son las reservas COMPLETED, no todas las creadas: una
   * cancelada o una ausencia no es una partida, y contarlas inflaría el número
   * justo para quien peor se comporta.
   */
  async dashboard(restaurantId: string, accountId: string) {
    const account = await prisma.clubPlayerAccount.findFirst({
      where: { id: accountId, restaurantId },
      include: { customer: true },
    });
    if (!account) throw notFound('Tu cuenta no existe.');

    await clubPlayerService.syncLoyalty(restaurantId);

    const [points, played, noShows, upcoming, invites, settings] = await Promise.all([
      clubPlayerService.pointsBalance(restaurantId, account.customerId),
      prisma.clubBooking.count({ where: { restaurantId, customerId: account.customerId, status: 'COMPLETED' } }),
      prisma.clubBooking.count({ where: { restaurantId, customerId: account.customerId, status: 'NO_SHOW' } }),
      prisma.clubBooking.findMany({
        where: {
          restaurantId,
          customerId: account.customerId,
          status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] },
          block: { startsAt: { gt: new Date() }, status: 'ACTIVE' },
        },
        include: { block: { include: { court: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.clubPlayInvite.findMany({
        where: { restaurantId, toAccountId: accountId, status: 'PENDING' },
        include: { fromAccount: { include: { customer: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      clubPlayerService.getBookingSettings(restaurantId),
    ]);

    const spent = await prisma.clubBookingPayment.aggregate({
      where: { booking: { restaurantId, customerId: account.customerId } },
      _sum: { amountBase: true },
    });

    const blacklisted = await clubPlayerService.isBlacklisted(restaurantId, account.customer.phone);

    return {
      player: {
        id: account.id,
        username: account.username,
        name: account.customer.name,
        phone: account.customer.phone,
      },
      points,
      pointsValueBase: round2(toDecimal(points).div(settings.pointsPerRedeemUnit)).toFixed(2),
      played,
      noShows,
      totalSpentBase: round2(spent._sum.amountBase ?? toDecimal(0)).toFixed(2),
      upcoming,
      invites,
      // Se le dice en su cara y con el motivo: enterarse al intentar reservar,
      // sin saber por qué, es la peor versión de esto.
      blocked: blacklisted ? { reason: blacklisted.reason, since: blacklisted.createdAt } : null,
    };
  },

  /** Ranking del club por partidas jugadas. Solo nombre de pila y usuario. */
  async leaderboard(restaurantId: string) {
    const accounts = await prisma.clubPlayerAccount.findMany({
      where: { restaurantId, active: true },
      include: { customer: { select: { id: true, name: true } } },
      take: 200,
    });
    if (!accounts.length) return [];

    const [played, points] = await Promise.all([
      prisma.clubBooking.groupBy({
        by: ['customerId'],
        where: { restaurantId, status: 'COMPLETED', customerId: { in: accounts.map((a) => a.customerId) } },
        _count: { _all: true },
      }),
      prisma.clubLoyaltyEntry.groupBy({
        by: ['customerId'],
        where: { restaurantId, customerId: { in: accounts.map((a) => a.customerId) } },
        _sum: { delta: true },
      }),
    ]);

    const playedBy = new Map(played.map((p) => [p.customerId, p._count._all]));
    const pointsBy = new Map(points.map((p) => [p.customerId, p._sum.delta ?? 0]));

    return accounts
      .map((a) => ({
        username: a.username,
        firstName: a.customer.name.split(' ')[0],
        played: playedBy.get(a.customerId) ?? 0,
        points: pointsBy.get(a.customerId) ?? 0,
      }))
      .sort((a, b) => b.played - a.played || b.points - a.points)
      .slice(0, 50);
  },

  /** Buscar con quién jugar. Devuelve solo usuario y nombre de pila — el panel
   * de un jugador no es un directorio telefónico del club. */
  async searchPlayers(restaurantId: string, q: string, exceptAccountId: string) {
    if (q.trim().length < 2) return [];
    return prisma.clubPlayerAccount
      .findMany({
        where: {
          restaurantId,
          active: true,
          id: { not: exceptAccountId },
          OR: [
            { username: { contains: q.trim().toLowerCase() } },
            { customer: { name: { contains: q.trim(), mode: 'insensitive' } } },
          ],
        },
        include: { customer: { select: { name: true } } },
        take: 15,
      })
      .then((rows) => rows.map((r) => ({ id: r.id, username: r.username, firstName: r.customer.name.split(' ')[0] })));
  },

  /**
   * Invitar a jugar. A un jugador con cuenta le llega a su panel; a un teléfono
   * suelto, por WhatsApp. El aviso va fuera de cualquier transacción: que
   * WhatsApp falle no puede impedir que la invitación quede creada.
   */
  async invite(
    restaurantId: string,
    fromAccountId: string,
    input: { toAccountId?: string | null; toPhone?: string | null; toName?: string | null; bookingId?: string | null; message?: string | null },
  ) {
    if (!input.toAccountId && !input.toPhone) {
      throw badRequest('Indica a quién quieres invitar.');
    }

    const from = await prisma.clubPlayerAccount.findFirst({
      where: { id: fromAccountId, restaurantId },
      include: { customer: { select: { name: true } } },
    });
    if (!from) throw notFound('Tu cuenta no existe.');

    if (input.toAccountId) {
      const to = await prisma.clubPlayerAccount.findFirst({
        where: { id: input.toAccountId, restaurantId },
        select: { id: true },
      });
      if (!to) throw notFound('Ese jugador no existe en este club.');
    }

    if (input.bookingId) {
      const booking = await prisma.clubBooking.findFirst({
        where: { id: input.bookingId, restaurantId, customerId: from.customerId },
        select: { id: true },
      });
      if (!booking) throw notFound('Esa reserva no es tuya.');
    }

    const invite = await prisma.clubPlayInvite.create({
      data: {
        restaurantId,
        fromAccountId,
        toAccountId: input.toAccountId ?? null,
        toPhone: input.toPhone ? clubPlayerService.normalizePhone(input.toPhone) : null,
        toName: input.toName ?? null,
        bookingId: input.bookingId ?? null,
        message: input.message ?? null,
      },
    });

    if (invite.toPhone && !invite.toAccountId) {
      const club = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true, slug: true } });
      whatsappBotService
        .sendMessage(
          restaurantId,
          invite.toPhone,
          `${from.customer.name} te invitó a jugar en ${club?.name ?? 'el club'}.${invite.message ? ` "${invite.message}"` : ''}`,
        )
        .catch(() => undefined);
    }

    return invite;
  },

  async respondInvite(restaurantId: string, accountId: string, id: string, accept: boolean) {
    const invite = await prisma.clubPlayInvite.findFirst({
      where: { id, restaurantId, toAccountId: accountId, status: 'PENDING' },
      select: { id: true },
    });
    if (!invite) throw notFound('Esa invitación no existe o ya fue respondida.');
    return prisma.clubPlayInvite.update({
      where: { id },
      data: { status: accept ? 'ACCEPTED' : 'DECLINED', respondedAt: new Date() },
    });
  },

  async myInvites(restaurantId: string, accountId: string) {
    const [received, sent] = await Promise.all([
      prisma.clubPlayInvite.findMany({
        where: { restaurantId, toAccountId: accountId },
        include: { fromAccount: { include: { customer: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      prisma.clubPlayInvite.findMany({
        where: { restaurantId, fromAccountId: accountId },
        include: { toAccount: { include: { customer: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);
    return { received, sent };
  },
};
