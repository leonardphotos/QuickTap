import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { badRequest, conflict, unauthorized } from '../../utils/http-error';
import { isLockedAsync, trialPeriodEnd } from '../../utils/subscription';
import { sendMail } from '../../utils/mailer';
import { ForgotPasswordInput, LoginInput, RegisterInput, ResetPasswordInput } from './auth.dto';

const RESET_CODE_TTL_MINUTES = 15;
const RESET_CODE_MAX_ATTEMPTS = 5;

function generateResetCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashResetCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export function signToken(payload: { userId: string; restaurantId: string; role: string; parentRestaurantId?: string }) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

// Forma completa del restaurante que el frontend espera en todo momento
// (login/register/me deben devolver siempre la misma forma).
const RESTAURANT_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  logoUrl: true,
  whatsappPhone: true,
  whatsappOrderMessageTemplate: true,
  baseCurrency: true,
  theme: true,
  serviceChargeEnabled: true,
  ivaEnabled: true,
  orderingEnabled: true,
  requireOrderConfirmation: true,
  deliveryOriginLat: true,
  deliveryOriginLng: true,
  deliveryPricingMode: true,
  deliveryBaseFee: true,
  deliveryPricePerKm: true,
  paymentMethodsConfig: true,
  fullscreenImageEnabled: true,
  fullscreenImageUrl: true,
  subscriptionStatus: true,
  subscriptionPlan: true,
  billingCycle: true,
  periodEnd: true,
  suspended: true,
  customAdministration: true,
  customInventoryBasic: true,
  customInventoryRecipe: true,
  customAccountsPayable: true,
  parentRestaurantId: true,
  pendingWelcomePlan: true,
  deleteOrderPinHash: true,
} as const;

type RestaurantRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  whatsappPhone: string | null;
  whatsappOrderMessageTemplate: string | null;
  baseCurrency: 'USD' | 'EUR';
  theme: unknown;
  serviceChargeEnabled: boolean;
  ivaEnabled: boolean;
  orderingEnabled: boolean;
  requireOrderConfirmation: boolean;
  deliveryOriginLat: number | null;
  deliveryOriginLng: number | null;
  deliveryPricingMode: 'DISABLED' | 'DISTANCE' | 'ZONE';
  deliveryBaseFee: Prisma.Decimal;
  deliveryPricePerKm: Prisma.Decimal;
  paymentMethodsConfig: unknown;
  fullscreenImageEnabled: boolean;
  fullscreenImageUrl: string | null;
  subscriptionStatus: 'TRIALING' | 'ACTIVE';
  subscriptionPlan: string | null;
  billingCycle: string | null;
  periodEnd: Date;
  suspended: boolean;
  customAdministration: boolean;
  customInventoryBasic: boolean;
  customInventoryRecipe: boolean;
  customAccountsPayable: boolean;
  parentRestaurantId: string | null;
  pendingWelcomePlan: string | null;
  deleteOrderPinHash: string | null;
};

/** Forma que el frontend consume: agrega `locked`, calculado en vivo (nunca persistido; ver isLockedAsync). */
async function serializeRestaurant(restaurant: RestaurantRow) {
  return {
    id: restaurant.id,
    slug: restaurant.slug,
    name: restaurant.name,
    description: restaurant.description,
    logoUrl: restaurant.logoUrl,
    whatsappPhone: restaurant.whatsappPhone,
    whatsappOrderMessageTemplate: restaurant.whatsappOrderMessageTemplate,
    baseCurrency: restaurant.baseCurrency,
    theme: restaurant.theme,
    serviceChargeEnabled: restaurant.serviceChargeEnabled,
    ivaEnabled: restaurant.ivaEnabled,
    orderingEnabled: restaurant.orderingEnabled,
    requireOrderConfirmation: restaurant.requireOrderConfirmation,
    deliveryOriginLat: restaurant.deliveryOriginLat,
    deliveryOriginLng: restaurant.deliveryOriginLng,
    deliveryPricingMode: restaurant.deliveryPricingMode,
    deliveryBaseFee: restaurant.deliveryBaseFee,
    deliveryPricePerKm: restaurant.deliveryPricePerKm,
    paymentMethodsConfig: restaurant.paymentMethodsConfig,
    fullscreenImageEnabled: restaurant.fullscreenImageEnabled,
    fullscreenImageUrl: restaurant.fullscreenImageUrl,
    subscriptionStatus: restaurant.subscriptionStatus,
    subscriptionPlan: restaurant.subscriptionPlan,
    billingCycle: restaurant.billingCycle,
    periodEnd: restaurant.periodEnd,
    suspended: restaurant.suspended,
    customAdministration: restaurant.customAdministration,
    customInventoryBasic: restaurant.customInventoryBasic,
    customInventoryRecipe: restaurant.customInventoryRecipe,
    customAccountsPayable: restaurant.customAccountsPayable,
    parentRestaurantId: restaurant.parentRestaurantId,
    pendingWelcomePlan: restaurant.pendingWelcomePlan,
    hasDeleteOrderPin: !!restaurant.deleteOrderPinHash,
    locked: await isLockedAsync(restaurant),
  };
}

export const authService = {
  /** Registro de un restaurante nuevo + su usuario dueño (OWNER). Arranca en TRIALING (15 días). */
  async register(input: RegisterInput) {
    const existingSlug = await prisma.restaurant.findUnique({ where: { slug: input.slug } });
    if (existingSlug) throw conflict('Ese slug ya está en uso.');

    const passwordHash = await bcrypt.hash(input.password, 10);

    const restaurant = await prisma.restaurant.create({
      data: {
        slug: input.slug,
        name: input.restaurantName,
        whatsappPhone: input.whatsappPhone,
        baseCurrency: input.baseCurrency,
        periodEnd: trialPeriodEnd(),
        users: {
          create: {
            email: input.email,
            passwordHash,
            name: input.ownerName,
            role: 'OWNER',
          },
        },
      },
      include: { users: true },
    });

    const owner = restaurant.users[0];
    const token = signToken({ userId: owner.id, restaurantId: restaurant.id, role: owner.role });

    return {
      token,
      restaurant: await serializeRestaurant(restaurant),
      user: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: owner.role,
        canAccessInventory: owner.canAccessInventory,
      },
    };
  },

  async login(input: LoginInput) {
    // El slug guardado en el navegador es solo un atajo (evita probar contra
    // todos los restaurantes). Si ya no sirve —el restaurante fue borrado o
    // desactivado, o esa cuenta ya no está ahí— NO cortamos el login: seguimos
    // abajo y probamos por email en todos los restaurantes antes de rendirnos.
    // Así un slug viejo en localStorage nunca bloquea un login válido.
    if (input.slug) {
      const restaurant = await prisma.restaurant.findUnique({ where: { slug: input.slug } });
      if (restaurant?.isActive) {
        const user = await prisma.user.findFirst({
          where: { restaurantId: restaurant.id, email: { equals: input.email, mode: 'insensitive' }, isActive: true },
        });
        if (user && (await bcrypt.compare(input.password, user.passwordHash))) {
          return this.buildSession(user, restaurant);
        }
      }
    }

    // Sin slug (dispositivo nuevo o storage borrado), o el slug guardado ya no
    // sirve: el email es único por restaurante, no globalmente, así que puede
    // haber más de un candidato. Se prueba la contraseña contra cada uno hasta
    // encontrar coincidencia.
    const candidates = await prisma.user.findMany({
      where: { email: { equals: input.email, mode: 'insensitive' }, isActive: true, restaurant: { isActive: true } },
      include: { restaurant: true },
    });

    for (const candidate of candidates) {
      const valid = await bcrypt.compare(input.password, candidate.passwordHash);
      if (valid) return this.buildSession(candidate, candidate.restaurant);
    }

    throw unauthorized('Credenciales inválidas.');
  },

  async buildSession(
    user: { id: string; name: string; email: string; role: string; canAccessInventory: boolean },
    restaurant: RestaurantRow,
  ) {
    const token = signToken({ userId: user.id, restaurantId: restaurant.id, role: user.role });
    return {
      token,
      restaurant: await serializeRestaurant(restaurant),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        canAccessInventory: user.canAccessInventory,
      },
    };
  },

  async me(restaurantId: string, userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, restaurantId },
      select: { id: true, name: true, email: true, role: true, canAccessInventory: true },
    });
    if (!user) throw unauthorized();

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: RESTAURANT_SELECT,
    });

    return { user, restaurant: restaurant ? await serializeRestaurant(restaurant) : null };
  },

  /**
   * Genera un código de 6 dígitos y lo envía por correo. El email es único
   * por restaurante (no globalmente), así que un mismo correo puede tener
   * cuentas en varios restaurantes: todas reciben el mismo código y se
   * actualizan juntas al confirmar (ver resetPassword). Por seguridad, si el
   * correo no existe no se revela: la respuesta es igual en ambos casos.
   */
  async forgotPassword(input: ForgotPasswordInput) {
    const candidates = await prisma.user.findMany({
      where: { email: { equals: input.email, mode: 'insensitive' }, isActive: true, restaurant: { isActive: true } },
    });
    if (candidates.length === 0) return;

    // Evita reenvíos en cadena: si ya hay un código vigente pedido hace menos
    // de un minuto, no se genera ni se envía uno nuevo.
    const recent = candidates.find(
      (c) => c.resetCodeExpiresAt && c.resetCodeExpiresAt.getTime() - Date.now() > (RESET_CODE_TTL_MINUTES - 1) * 60 * 1000,
    );
    if (recent) return;

    const code = generateResetCode();
    const resetCodeHash = hashResetCode(code);
    const resetCodeExpiresAt = new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000);

    await prisma.user.updateMany({
      where: { id: { in: candidates.map((c) => c.id) } },
      data: { resetCodeHash, resetCodeExpiresAt, resetCodeAttempts: 0 },
    });

    await sendMail(
      input.email,
      'Tu código para restablecer la contraseña — QuickTap.club',
      `<p>Usa este código para restablecer tu contraseña en QuickTap.club:</p>
       <p style="font-size:28px;font-weight:700;letter-spacing:4px;">${code}</p>
       <p>Vence en ${RESET_CODE_TTL_MINUTES} minutos. Si no fuiste tú, ignora este correo.</p>`,
    );
  },

  /** Valida el código y actualiza la contraseña en todas las cuentas que compartan ese correo. */
  async resetPassword(input: ResetPasswordInput) {
    const candidates = await prisma.user.findMany({
      where: {
        email: { equals: input.email, mode: 'insensitive' },
        isActive: true,
        restaurant: { isActive: true },
        resetCodeHash: { not: null },
        resetCodeExpiresAt: { gt: new Date() },
      },
    });
    if (candidates.length === 0) throw badRequest('El código es inválido o ya venció. Pide uno nuevo.');

    const codeHash = hashResetCode(input.code);
    const valid = candidates.some((c) => c.resetCodeHash === codeHash);

    if (!valid) {
      const ids = candidates.map((c) => c.id);
      const attempts = candidates[0].resetCodeAttempts + 1;
      if (attempts >= RESET_CODE_MAX_ATTEMPTS) {
        // Demasiados intentos: se invalida el código, hay que pedir uno nuevo.
        await prisma.user.updateMany({
          where: { id: { in: ids } },
          data: { resetCodeHash: null, resetCodeExpiresAt: null, resetCodeAttempts: 0 },
        });
        throw badRequest('Demasiados intentos. Pide un código nuevo.');
      }
      await prisma.user.updateMany({ where: { id: { in: ids } }, data: { resetCodeAttempts: attempts } });
      throw badRequest('Código incorrecto.');
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 10);
    await prisma.user.updateMany({
      where: { id: { in: candidates.map((c) => c.id) } },
      data: { passwordHash, resetCodeHash: null, resetCodeExpiresAt: null, resetCodeAttempts: 0 },
    });
  },
};
