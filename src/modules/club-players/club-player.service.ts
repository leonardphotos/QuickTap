import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { badRequest, conflict, notFound, unauthorized } from '../../utils/http-error';
import { round2, toDecimal } from '../../utils/money';
import { whatsappBotService } from '../whatsapp-bot/whatsapp-bot.service';

const OTP_LENGTH = 6;
const MAX_OTP_ATTEMPTS = 5;
/** Cuántos códigos se pueden pedir por teléfono en una ventana, para que el
 * endpoint público no se convierta en una forma gratis de mandar WhatsApps. */
const MAX_OTP_PER_HOUR = 5;

const DEFAULT_SETTINGS = {
  requirePhoneVerification: true,
  otpTtlMinutes: 10,
  autoBlacklistEnabled: true,
  noShowStrikesToBlock: 1,
  loyaltyEnabled: true,
  pointsPerBooking: 10,
  pointsPerCurrencyUnit: new Prisma.Decimal(1),
  pointsPerRedeemUnit: 100,
};

export type ClubBookingSettingsLike = typeof DEFAULT_SETTINGS;

export async function getBookingSettings(restaurantId: string): Promise<ClubBookingSettingsLike> {
  const row = await prisma.clubBookingSettings.findUnique({ where: { restaurantId } });
  return row ?? DEFAULT_SETTINGS;
}

/** Solo dígitos: el mismo teléfono escrito con +58, 0412 o espacios tiene que
 * resolver al mismo jugador, o la lista negra se esquiva sola. */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function hashCode(code: string, phone: string): string {
  return crypto.createHmac('sha256', env.jwtSecret).update(`${phone}:${code}`).digest('hex');
}

export interface PlayerAuthPayload {
  playerAccountId: string;
  restaurantId: string;
  scope: 'player';
}

/** Firma el token del jugador. `scope: 'player'` es lo que impide que este token
 * sirva contra las rutas del panel, aunque vaya firmado con el mismo secreto. */
function signPlayerToken(account: { id: string; restaurantId: string }): string {
  const payload: PlayerAuthPayload = {
    playerAccountId: account.id,
    restaurantId: account.restaurantId,
    scope: 'player',
  };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '30d' });
}

export const clubPlayerService = {
  getBookingSettings,
  normalizePhone,

  async updateBookingSettings(restaurantId: string, input: Record<string, unknown>) {
    return prisma.clubBookingSettings.upsert({
      where: { restaurantId },
      create: { restaurantId, ...input },
      update: input,
    });
  },

  // ------------------------------------------------ Verificación por WhatsApp
  /**
   * Envía el código. Devuelve `sent:false` en vez de reventar si el bot está
   * caído: el club tiene que poder seguir tomando reservas por teléfono aunque
   * WhatsApp falle, y quien decide si eso bloquea la reserva es `requirePhoneVerification`.
   */
  async sendVerificationCode(restaurantId: string, rawPhone: string) {
    const phone = normalizePhone(rawPhone);
    if (phone.length < 7) throw badRequest('El número de teléfono no es válido.');

    // El club demo no tiene WhatsApp vinculado: no se envía nada ni se guarda
    // código, pero se responde como si sí — el paso de verificación tiene que
    // verse igual que en un club real, solo que acepta cualquier código.
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { isDemo: true },
    });
    if (restaurant?.isDemo) {
      return { sent: true, demo: true, expiresAt: new Date(Date.now() + 10 * 60_000), phone };
    }

    const settings = await getBookingSettings(restaurantId);
    const since = new Date(Date.now() - 3_600_000);
    const recent = await prisma.clubPhoneVerification.count({
      where: { restaurantId, phone, createdAt: { gte: since } },
    });
    if (recent >= MAX_OTP_PER_HOUR) {
      throw badRequest('Pediste demasiados códigos. Espera un rato antes de intentar de nuevo.');
    }

    const code = String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
    const expiresAt = new Date(Date.now() + settings.otpTtlMinutes * 60_000);

    await prisma.clubPhoneVerification.create({
      data: { restaurantId, phone, codeHash: hashCode(code, phone), expiresAt },
    });

    let sent = false;
    try {
      sent = await whatsappBotService.sendMessage(
        restaurantId,
        phone,
        `Tu código para confirmar la reserva es ${code}. Vence en ${settings.otpTtlMinutes} minutos.`,
      );
    } catch {
      sent = false;
    }

    return { sent, demo: false, expiresAt, phone };
  },

  /**
   * Valida el código. Consume el registro al acertar para que no valga dos veces,
   * y cuenta los intentos fallidos: seis dígitos se rompen por fuerza bruta en
   * segundos si se deja probar sin límite.
   */
  async verifyCode(restaurantId: string, rawPhone: string, code: string): Promise<boolean> {
    const phone = normalizePhone(rawPhone);

    // Demo: cualquier código vale. Se registra una verificación ya consumida
    // para que hasRecentVerification (que valida la reserva) la encuentre.
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { isDemo: true },
    });
    if (restaurant?.isDemo) {
      await prisma.clubPhoneVerification.create({
        data: { restaurantId, phone, codeHash: 'DEMO', expiresAt: new Date(), consumedAt: new Date() },
      });
      return true;
    }

    const row = await prisma.clubPhoneVerification.findFirst({
      where: { restaurantId, phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) throw badRequest('El código venció o no existe. Pide uno nuevo.');
    if (row.attempts >= MAX_OTP_ATTEMPTS) {
      throw badRequest('Demasiados intentos fallidos. Pide un código nuevo.');
    }

    if (row.codeHash !== hashCode(code, phone)) {
      await prisma.clubPhoneVerification.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
      throw badRequest('El código no es correcto.');
    }

    await prisma.clubPhoneVerification.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
    return true;
  },

  /** ¿Este teléfono verificó su código hace poco? Lo usa la reserva pública. */
  async hasRecentVerification(restaurantId: string, rawPhone: string): Promise<boolean> {
    const phone = normalizePhone(rawPhone);
    const row = await prisma.clubPhoneVerification.findFirst({
      where: {
        restaurantId,
        phone,
        consumedAt: { not: null, gte: new Date(Date.now() - 30 * 60_000) },
      },
    });
    return !!row;
  },

  // ------------------------------------------------------------ Lista negra
  async isBlacklisted(restaurantId: string, rawPhone: string) {
    const phone = normalizePhone(rawPhone);
    return prisma.clubBlacklistEntry.findFirst({
      where: { restaurantId, phone, liftedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  },

  async listBlacklist(restaurantId: string, includeLifted = false) {
    return prisma.clubBlacklistEntry.findMany({
      where: { restaurantId, ...(includeLifted ? {} : { liftedAt: null }) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { customer: { select: { name: true, phone: true } } },
    });
  },

  async addToBlacklist(restaurantId: string, rawPhone: string, reason: string, automatic = false, noShowCount = 0) {
    const phone = normalizePhone(rawPhone);
    const existing = await this.isBlacklisted(restaurantId, phone);
    if (existing) return existing;

    const customer = await prisma.customer.findFirst({
      where: { restaurantId, phone: { contains: phone.slice(-10) } },
      select: { id: true },
    });

    return prisma.clubBlacklistEntry.create({
      data: { restaurantId, phone, customerId: customer?.id ?? null, reason, automatic, noShowCount },
    });
  },

  /** Se levanta poniendo fecha, nunca borrando: el historial de por qué se
   * bloqueó no debe desaparecer al perdonar. */
  async liftBlacklist(restaurantId: string, id: string, userId?: string, reason?: string) {
    const entry = await prisma.clubBlacklistEntry.findFirst({ where: { id, restaurantId }, select: { id: true } });
    if (!entry) throw notFound('Ese bloqueo no existe o no pertenece a este club.');
    return prisma.clubBlacklistEntry.update({
      where: { id },
      data: { liftedAt: new Date(), liftedByUserId: userId ?? null, liftedReason: reason ?? null },
    });
  },

  /**
   * Bloquea automáticamente a quien acumuló ausencias.
   *
   * El freno importante: si el club NUNCA registró un check-in, no bloquea a
   * nadie. `settlePastBookings` marca NO_SHOW toda reserva sin escaneo, así que
   * en un club que no usa el escáner todos sus clientes serían "ausentes" — y
   * bloquear a la clientela entera por no usar una función opcional es peor que
   * no bloquear a nadie.
   */
  async syncAutoBlacklist(restaurantId: string) {
    const settings = await getBookingSettings(restaurantId);
    if (!settings.autoBlacklistEnabled) return { blocked: 0, skipped: 'DESACTIVADO' as const };

    const everCheckedIn = await prisma.clubBooking.count({
      where: { restaurantId, checkedInAt: { not: null } },
    });
    if (everCheckedIn === 0) return { blocked: 0, skipped: 'SIN_CHECKINS' as const };

    const noShows = await prisma.clubBooking.groupBy({
      by: ['playerPhone'],
      where: { restaurantId, status: 'NO_SHOW' },
      _count: { _all: true },
    });

    let blocked = 0;
    for (const row of noShows) {
      if (row._count._all < settings.noShowStrikesToBlock) continue;
      const already = await this.isBlacklisted(restaurantId, row.playerPhone);
      if (already) continue;
      await this.addToBlacklist(
        restaurantId,
        row.playerPhone,
        `${row._count._all} ausencia(s) sin avisar`,
        true,
        row._count._all,
      );
      blocked++;
    }
    return { blocked, skipped: null };
  },

  // ------------------------------------------------ Cuenta del jugador
  /**
   * Crea la cuenta a partir de una reserva ya hecha: el jugador solo elige
   * usuario y contraseña, porque nombre y teléfono ya los dio al reservar.
   */
  async registerAccount(
    restaurantId: string,
    input: { phone: string; username: string; password: string; name?: string },
  ) {
    const phone = normalizePhone(input.phone);
    const username = input.username.trim().toLowerCase();

    const taken = await prisma.clubPlayerAccount.findFirst({
      where: { restaurantId, username },
      select: { id: true },
    });
    if (taken) throw conflict('Ese nombre de usuario ya está tomado en este club.');

    // Customer va indexado por el teléfono TAL CUAL se escribió (así lo hace el
    // resto del sistema), así que el match exacto puede fallar solo por formato:
    // "04141234567" contra "+58 414 1234567" es la misma persona. Si el exacto no
    // encuentra nada se reintenta por dígitos — si no, esa persona se quedaría
    // con un cliente nuevo y perdería su historial y sus puntos.
    let customer = await prisma.customer.findUnique({
      where: { restaurantId_phone: { restaurantId, phone: input.phone } },
    });
    if (!customer && phone.length >= 10) {
      const candidates = await prisma.customer.findMany({
        where: { restaurantId, phone: { contains: phone.slice(-10) } },
        take: 5,
      });
      customer = candidates.find((c) => normalizePhone(c.phone).endsWith(phone.slice(-10))) ?? null;
    }
    if (!customer) {
      customer = await prisma.customer.create({
        data: { restaurantId, phone: input.phone, name: input.name?.trim() || username },
      });
    }

    const existing = await prisma.clubPlayerAccount.findUnique({ where: { customerId: customer.id } });
    if (existing) throw conflict('Este teléfono ya tiene una cuenta en el club.');

    const account = await prisma.clubPlayerAccount.create({
      data: {
        restaurantId,
        customerId: customer.id,
        username,
        passwordHash: await bcrypt.hash(input.password, 10),
      },
      include: { customer: { select: { name: true, phone: true } } },
    });

    return { account, token: signPlayerToken(account) };
  },

  /**
   * Login con teléfono + usuario + clave, tal como lo pidió el club.
   *
   * El mensaje de error es el mismo para "usuario no existe", "teléfono no
   * coincide" y "clave mala": distinguirlos permitiría averiguar qué usuarios
   * existen probando nombres.
   */
  async login(restaurantId: string, input: { phone: string; username: string; password: string }) {
    const account = await prisma.clubPlayerAccount.findFirst({
      where: { restaurantId, username: input.username.trim().toLowerCase(), active: true },
      include: { customer: { select: { id: true, name: true, phone: true } } },
    });

    const phone = normalizePhone(input.phone);
    const ok =
      !!account &&
      normalizePhone(account.customer.phone) === phone &&
      (await bcrypt.compare(input.password, account.passwordHash));

    if (!ok || !account) throw unauthorized('Teléfono, usuario o clave incorrectos.');

    await prisma.clubPlayerAccount.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });
    return { account, token: signPlayerToken(account) };
  },

  async isUsernameAvailable(restaurantId: string, username: string) {
    const taken = await prisma.clubPlayerAccount.findFirst({
      where: { restaurantId, username: username.trim().toLowerCase() },
      select: { id: true },
    });
    return { available: !taken };
  },

  // ----------------------------------------------------------- Fidelización
  async pointsBalance(restaurantId: string, customerId: string): Promise<number> {
    const agg = await prisma.clubLoyaltyEntry.aggregate({
      where: { restaurantId, customerId },
      _sum: { delta: true },
    });
    return agg._sum.delta ?? 0;
  },

  /**
   * Otorga puntos por una reserva jugada: fijos por reservar más variables por
   * lo gastado (cancha + consumo). Idempotente por reserva — si no, cada vez que
   * alguien abra el panel se repartirían puntos otra vez.
   */
  async awardForBooking(restaurantId: string, bookingId: string) {
    const settings = await getBookingSettings(restaurantId);
    if (!settings.loyaltyEnabled) return null;

    const booking = await prisma.clubBooking.findFirst({
      where: { id: bookingId, restaurantId },
      include: { payments: true, tabOrders: { where: { status: { not: 'CANCELLED' } } } },
    });
    if (!booking || !booking.customerId) return null;
    if (booking.status !== 'COMPLETED') return null;

    const already = await prisma.clubLoyaltyEntry.findFirst({
      where: { bookingId, reason: 'BOOKING' },
      select: { id: true },
    });
    if (already) return null;

    const consumo = booking.tabOrders.reduce((acc, o) => acc.add(o.totalBase), toDecimal(0));
    const spent = round2(booking.totalBase.add(consumo));
    const points =
      settings.pointsPerBooking + Math.floor(Number(spent) * Number(settings.pointsPerCurrencyUnit));
    if (points <= 0) return null;

    return prisma.clubLoyaltyEntry.create({
      data: {
        restaurantId,
        customerId: booking.customerId,
        delta: points,
        reason: 'BOOKING',
        bookingId,
        amountBase: spent,
        note: `Reserva jugada`,
      },
    });
  },

  /** Barrido perezoso: reparte los puntos de todas las reservas ya jugadas que
   * todavía no los tienen. Idempotente por el chequeo de awardForBooking. */
  async syncLoyalty(restaurantId: string) {
    const settings = await getBookingSettings(restaurantId);
    if (!settings.loyaltyEnabled) return { awarded: 0 };

    const pending = await prisma.clubBooking.findMany({
      where: {
        restaurantId,
        status: 'COMPLETED',
        customerId: { not: null },
        loyaltyEntries: { none: { reason: 'BOOKING' } },
      },
      select: { id: true },
      take: 200,
    });

    let awarded = 0;
    for (const b of pending) {
      const r = await this.awardForBooking(restaurantId, b.id);
      if (r) awarded++;
    }
    return { awarded };
  },

  async adjustPoints(restaurantId: string, customerId: string, delta: number, note: string) {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, restaurantId }, select: { id: true } });
    if (!customer) throw notFound('Ese cliente no existe o no pertenece a este club.');
    return prisma.clubLoyaltyEntry.create({
      data: { restaurantId, customerId, delta, reason: 'MANUAL', note },
    });
  },

  async redeemPoints(restaurantId: string, customerId: string, points: number) {
    const settings = await getBookingSettings(restaurantId);
    const balance = await this.pointsBalance(restaurantId, customerId);
    if (points <= 0) throw badRequest('Los puntos a canjear deben ser mayores a 0.');
    if (points > balance) throw badRequest(`Solo tiene ${balance} punto(s).`);

    const value = round2(new Prisma.Decimal(points).div(settings.pointsPerRedeemUnit));
    const entry = await prisma.clubLoyaltyEntry.create({
      data: {
        restaurantId,
        customerId,
        delta: -points,
        reason: 'REDEEM',
        amountBase: value,
        note: `Canje de ${points} puntos`,
      },
    });
    return { entry, valueBase: value.toFixed(2) };
  },

  async loyaltyLedger(restaurantId: string, customerId: string) {
    return prisma.clubLoyaltyEntry.findMany({
      where: { restaurantId, customerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { booking: { select: { id: true, createdAt: true } } },
    });
  },
};

export { signPlayerToken };
