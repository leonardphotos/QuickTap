import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { notFound } from '../../utils/http-error';
import { prisma } from '../../config/prisma';
import { clubPlayerService } from './club-player.service';
import { clubPlayerDashboardService } from './club-player-dashboard.service';
import {
  adjustPointsSchema,
  blacklistAddSchema,
  blacklistLiftSchema,
  bookingSettingsSchema,
  createCustomerSchema,
  inviteSchema,
  listCustomersQuerySchema,
  loginSchema,
  redeemSchema,
  registerAccountSchema,
  sendCodeSchema,
  verifyCodeSchema,
} from './club-player.dto';

/** Resuelve el club público por slug, igual que el resto de rutas públicas: el
 * cliente nunca manda un restaurantId. */
async function clubBySlug(slug: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true, isActive: true, businessType: true, logoUrl: true, theme: true },
  });
  if (!restaurant || !restaurant.isActive || restaurant.businessType !== 'SPORTS_CLUB') {
    throw notFound('Este club no existe o no está disponible.');
  }
  return restaurant;
}

export const clubPlayerController = {
  // ------------------------------------------------------------- Público
  sendCode: asyncHandler(async (req: Request, res: Response) => {
    const club = await clubBySlug(req.params.slug);
    const { phone } = sendCodeSchema.parse(req.body);
    const r = await clubPlayerService.sendVerificationCode(club.id, phone);
    res.json({
      data: {
        sent: r.sent,
        demo: r.demo,
        expiresAt: r.expiresAt,
        // Si el bot está caído hay que decirlo, no fingir que llegó: el jugador
        // se quedaría esperando un mensaje que nunca va a ver.
        message: r.demo
          ? 'Modo demostración: escribe cualquier código de 4 dígitos.'
          : r.sent
            ? 'Te enviamos un código por WhatsApp.'
            : 'No pudimos enviarte el WhatsApp. Comunícate con el club para reservar.',
      },
    });
  }),

  verifyCode: asyncHandler(async (req: Request, res: Response) => {
    const club = await clubBySlug(req.params.slug);
    const { phone, code } = verifyCodeSchema.parse(req.body);
    await clubPlayerService.verifyCode(club.id, phone, code);
    const blocked = await clubPlayerService.isBlacklisted(club.id, phone);
    const account = await prisma.clubPlayerAccount.findFirst({
      where: { restaurantId: club.id, customer: { phone } },
      select: { id: true, username: true },
    });
    res.json({
      data: {
        verified: true,
        blocked: blocked ? { reason: blocked.reason } : null,
        hasAccount: !!account,
      },
    });
  }),

  checkUsername: asyncHandler(async (req: Request, res: Response) => {
    const club = await clubBySlug(req.params.slug);
    res.json({ data: await clubPlayerService.isUsernameAvailable(club.id, String(req.query.username ?? '')) });
  }),

  register: asyncHandler(async (req: Request, res: Response) => {
    const club = await clubBySlug(req.params.slug);
    const input = registerAccountSchema.parse(req.body);
    const { account, token } = await clubPlayerService.registerAccount(club.id, input);
    res.status(201).json({
      data: { token, player: { id: account.id, username: account.username, name: account.customer.name } },
    });
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const club = await clubBySlug(req.params.slug);
    const input = loginSchema.parse(req.body);
    const { account, token } = await clubPlayerService.login(club.id, input);
    res.json({
      data: { token, player: { id: account.id, username: account.username, name: account.customer.name } },
    });
  }),

  // -------------------------------------------------- Panel del jugador
  me: asyncHandler(async (req: Request, res: Response) => {
    const { restaurantId, playerAccountId } = req.player!;
    res.json({ data: await clubPlayerDashboardService.dashboard(restaurantId, playerAccountId) });
  }),

  myPoints: asyncHandler(async (req: Request, res: Response) => {
    const { restaurantId, playerAccountId } = req.player!;
    const account = await prisma.clubPlayerAccount.findUniqueOrThrow({ where: { id: playerAccountId } });
    res.json({ data: await clubPlayerService.loyaltyLedger(restaurantId, account.customerId) });
  }),

  leaderboard: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubPlayerDashboardService.leaderboard(req.player!.restaurantId) });
  }),

  searchPlayers: asyncHandler(async (req: Request, res: Response) => {
    const { restaurantId, playerAccountId } = req.player!;
    res.json({
      data: await clubPlayerDashboardService.searchPlayers(restaurantId, String(req.query.q ?? ''), playerAccountId),
    });
  }),

  invite: asyncHandler(async (req: Request, res: Response) => {
    const { restaurantId, playerAccountId } = req.player!;
    const input = inviteSchema.parse(req.body);
    res.status(201).json({ data: await clubPlayerDashboardService.invite(restaurantId, playerAccountId, input) });
  }),

  myInvites: asyncHandler(async (req: Request, res: Response) => {
    const { restaurantId, playerAccountId } = req.player!;
    res.json({ data: await clubPlayerDashboardService.myInvites(restaurantId, playerAccountId) });
  }),

  respondInvite: asyncHandler(async (req: Request, res: Response) => {
    const { restaurantId, playerAccountId } = req.player!;
    const accept = req.body?.accept !== false;
    res.json({
      data: await clubPlayerDashboardService.respondInvite(restaurantId, playerAccountId, req.params.id, accept),
    });
  }),

  // --------------------------------------------------------- Panel del club
  getSettings: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubPlayerService.getBookingSettings(req.restaurantId!) });
  }),

  updateSettings: asyncHandler(async (req: Request, res: Response) => {
    const input = bookingSettingsSchema.parse(req.body);
    res.json({ data: await clubPlayerService.updateBookingSettings(req.restaurantId!, input) });
  }),

  listBlacklist: asyncHandler(async (req: Request, res: Response) => {
    res.json({
      data: await clubPlayerService.listBlacklist(req.restaurantId!, req.query.includeLifted === 'true'),
    });
  }),

  addBlacklist: asyncHandler(async (req: Request, res: Response) => {
    const input = blacklistAddSchema.parse(req.body);
    res.status(201).json({
      data: await clubPlayerService.addToBlacklist(req.restaurantId!, input.phone, input.reason, false),
    });
  }),

  liftBlacklist: asyncHandler(async (req: Request, res: Response) => {
    const input = blacklistLiftSchema.parse(req.body);
    res.json({
      data: await clubPlayerService.liftBlacklist(req.restaurantId!, req.params.id, req.auth?.userId, input.reason),
    });
  }),

  /**
   * Base de clientes del club: los que entraron por reserva y los cargados a
   * mano, en la misma lista. Es la misma tabla `Customer` que ya usa todo el
   * sistema — no una segunda base paralela que se desincronizaría.
   */
  listCustomers: asyncHandler(async (req: Request, res: Response) => {
    const restaurantId = req.restaurantId!;
    const query = listCustomersQuerySchema.parse(req.query);

    const customers = await prisma.customer.findMany({
      where: {
        restaurantId,
        ...(query.q
          ? { OR: [{ name: { contains: query.q, mode: 'insensitive' as const } }, { phone: { contains: query.q } }] }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        _count: { select: { clubBookings: true } },
        clubPlayerAccount: { select: { username: true, lastLoginAt: true } },
      },
    });

    // Puntos y bloqueos de todos en dos consultas, no una por cliente.
    const [points, blocked] = await Promise.all([
      prisma.clubLoyaltyEntry.groupBy({
        by: ['customerId'],
        where: { restaurantId, customerId: { in: customers.map((c) => c.id) } },
        _sum: { delta: true },
      }),
      prisma.clubBlacklistEntry.findMany({ where: { restaurantId, liftedAt: null }, select: { phone: true, reason: true } }),
    ]);
    const pointsBy = new Map(points.map((p) => [p.customerId, p._sum.delta ?? 0]));
    const blockedPhones = new Map(blocked.map((b) => [b.phone, b.reason]));
    const digits = (p: string) => p.replace(/\D/g, '');

    res.json({
      data: customers
        .map((c) => ({
          ...c,
          points: pointsBy.get(c.id) ?? 0,
          bookings: c._count.clubBookings,
          blockedReason: blockedPhones.get(digits(c.phone)) ?? null,
        }))
        .filter((c) => (query.blocked === 'true' ? !!c.blockedReason : true)),
    });
  }),

  createCustomer: asyncHandler(async (req: Request, res: Response) => {
    const input = createCustomerSchema.parse(req.body);
    const restaurantId = req.restaurantId!;
    const customer = await prisma.customer.upsert({
      where: { restaurantId_phone: { restaurantId, phone: input.phone } },
      create: { restaurantId, ...input, idNumber: input.idNumber ?? null, address: input.address ?? null },
      update: { name: input.name, idNumber: input.idNumber ?? undefined, address: input.address ?? undefined },
    });
    res.status(201).json({ data: customer });
  }),

  customerPoints: asyncHandler(async (req: Request, res: Response) => {
    const restaurantId = req.restaurantId!;
    const [balance, ledger] = await Promise.all([
      clubPlayerService.pointsBalance(restaurantId, req.params.id),
      clubPlayerService.loyaltyLedger(restaurantId, req.params.id),
    ]);
    res.json({ data: { balance, ledger } });
  }),

  adjustPoints: asyncHandler(async (req: Request, res: Response) => {
    const input = adjustPointsSchema.parse(req.body);
    res.status(201).json({
      data: await clubPlayerService.adjustPoints(req.restaurantId!, req.params.id, input.delta, input.note),
    });
  }),

  redeemPoints: asyncHandler(async (req: Request, res: Response) => {
    const input = redeemSchema.parse(req.body);
    res.json({ data: await clubPlayerService.redeemPoints(req.restaurantId!, req.params.id, input.points) });
  }),
};
