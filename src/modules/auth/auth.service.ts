import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { conflict, unauthorized } from '../../utils/http-error';
import { LoginInput, RegisterInput } from './auth.dto';

function signToken(payload: { userId: string; restaurantId: string; role: string }) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

export const authService = {
  /** Registro de un restaurante nuevo + su usuario dueño (OWNER). */
  async register(input: RegisterInput) {
    const existingSlug = await prisma.restaurant.findUnique({ where: { slug: input.slug } });
    if (existingSlug) throw conflict('Ese slug ya está en uso.');

    const passwordHash = await bcrypt.hash(input.password, 10);

    const restaurant = await prisma.restaurant.create({
      data: {
        slug: input.slug,
        name: input.restaurantName,
        whatsappPhone: input.whatsappPhone,
        exchangeRate: input.exchangeRate,
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
      restaurant: { id: restaurant.id, slug: restaurant.slug, name: restaurant.name },
      user: { id: owner.id, name: owner.name, email: owner.email, role: owner.role },
    };
  },

  async login(input: LoginInput) {
    const restaurant = await prisma.restaurant.findUnique({ where: { slug: input.slug } });
    if (!restaurant || !restaurant.isActive) throw unauthorized('Credenciales inválidas.');

    const user = await prisma.user.findFirst({
      where: { restaurantId: restaurant.id, email: input.email, isActive: true },
    });
    if (!user) throw unauthorized('Credenciales inválidas.');

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) throw unauthorized('Credenciales inválidas.');

    const token = signToken({ userId: user.id, restaurantId: restaurant.id, role: user.role });

    return {
      token,
      restaurant: { id: restaurant.id, slug: restaurant.slug, name: restaurant.name },
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
      select: {
        id: true,
        slug: true,
        name: true,
        whatsappPhone: true,
        exchangeRate: true,
        baseCurrency: true,
      },
    });

    return { user, restaurant };
  },
};
