import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { conflict, unauthorized } from '../../utils/http-error';
import { isLocked, trialPeriodEnd } from '../../utils/subscription';
import { LoginInput, RegisterInput } from './auth.dto';

function signToken(payload: { userId: string; restaurantId: string; role: string }) {
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
  baseCurrency: true,
  theme: true,
  serviceChargeEnabled: true,
  ivaEnabled: true,
  orderingEnabled: true,
  requireOrderConfirmation: true,
  fullscreenImageEnabled: true,
  fullscreenImageUrl: true,
  subscriptionStatus: true,
  subscriptionPlan: true,
  billingCycle: true,
  periodEnd: true,
  suspended: true,
} as const;

type RestaurantRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  whatsappPhone: string | null;
  baseCurrency: 'USD' | 'EUR';
  theme: unknown;
  serviceChargeEnabled: boolean;
  ivaEnabled: boolean;
  orderingEnabled: boolean;
  requireOrderConfirmation: boolean;
  fullscreenImageEnabled: boolean;
  fullscreenImageUrl: string | null;
  subscriptionStatus: 'TRIALING' | 'ACTIVE';
  subscriptionPlan: string | null;
  billingCycle: string | null;
  periodEnd: Date;
  suspended: boolean;
};

/** Forma que el frontend consume: agrega `locked`, calculado en vivo (nunca persistido). */
function serializeRestaurant(restaurant: RestaurantRow) {
  return {
    id: restaurant.id,
    slug: restaurant.slug,
    name: restaurant.name,
    description: restaurant.description,
    logoUrl: restaurant.logoUrl,
    whatsappPhone: restaurant.whatsappPhone,
    baseCurrency: restaurant.baseCurrency,
    theme: restaurant.theme,
    serviceChargeEnabled: restaurant.serviceChargeEnabled,
    ivaEnabled: restaurant.ivaEnabled,
    orderingEnabled: restaurant.orderingEnabled,
    requireOrderConfirmation: restaurant.requireOrderConfirmation,
    fullscreenImageEnabled: restaurant.fullscreenImageEnabled,
    fullscreenImageUrl: restaurant.fullscreenImageUrl,
    subscriptionStatus: restaurant.subscriptionStatus,
    subscriptionPlan: restaurant.subscriptionPlan,
    billingCycle: restaurant.billingCycle,
    periodEnd: restaurant.periodEnd,
    suspended: restaurant.suspended,
    locked: isLocked(restaurant),
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
      restaurant: serializeRestaurant(restaurant),
      user: { id: owner.id, name: owner.name, email: owner.email, role: owner.role },
    };
  },

  async login(input: LoginInput) {
    if (input.slug) {
      const restaurant = await prisma.restaurant.findUnique({ where: { slug: input.slug } });
      if (!restaurant || !restaurant.isActive) throw unauthorized('Credenciales inválidas.');

      const user = await prisma.user.findFirst({
        where: { restaurantId: restaurant.id, email: { equals: input.email, mode: 'insensitive' }, isActive: true },
      });
      if (!user) throw unauthorized('Credenciales inválidas.');

      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) throw unauthorized('Credenciales inválidas.');

      return this.buildSession(user, restaurant);
    }

    // Sin slug (dispositivo nuevo o storage borrado): el email es único por
    // restaurante, no globalmente, así que puede haber más de un candidato.
    // Se prueba la contraseña contra cada uno hasta encontrar coincidencia.
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

  buildSession(
    user: { id: string; name: string; email: string; role: string },
    restaurant: RestaurantRow,
  ) {
    const token = signToken({ userId: user.id, restaurantId: restaurant.id, role: user.role });
    return {
      token,
      restaurant: serializeRestaurant(restaurant),
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  },

  async me(restaurantId: string, userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, restaurantId },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) throw unauthorized();

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: RESTAURANT_SELECT,
    });

    return { user, restaurant: restaurant ? serializeRestaurant(restaurant) : null };
  },
};
