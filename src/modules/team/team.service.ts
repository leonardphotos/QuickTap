import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { isDeliveryTierPlan } from '../../utils/subscription';
import { CreateStaffInput, UpdateStaffInput } from './team.dto';

// OWNER nunca aparece en la lista de "Equipo" gestionable (es el dueño de la cuenta).
const STAFF_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  canAccessInventory: true,
  cashierFullAccess: true,
  isServiceProvider: true,
  commissionPercent: true,
  paymentMethodsConfig: true,
  createdAt: true,
} as const;

export const teamService = {
  async list(restaurantId: string) {
    return prisma.user.findMany({
      where: { restaurantId, role: { not: 'OWNER' } },
      orderBy: { createdAt: 'asc' },
      select: STAFF_SELECT,
    });
  },

  async create(restaurantId: string, input: CreateStaffInput) {
    const existing = await prisma.user.findFirst({
      where: { restaurantId, email: { equals: input.email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) throw badRequest('Ya existe un miembro del equipo con ese email.');

    // Plan Solo Delivery (con o sin sucursales): máximo 6 usuarios (incluye al dueño).
    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { subscriptionPlan: true } });
    if (isDeliveryTierPlan(restaurant?.subscriptionPlan)) {
      const teamSize = await prisma.user.count({ where: { restaurantId } });
      if (teamSize >= 6) {
        throw badRequest('El Plan Solo Delivery permite hasta 6 usuarios. Mejora tu plan para agregar más.');
      }
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    return prisma.user.create({
      data: {
        restaurantId,
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
        canAccessInventory: input.canAccessInventory ?? false,
        cashierFullAccess: input.cashierFullAccess ?? false,
        isServiceProvider: input.isServiceProvider ?? false,
        commissionPercent: input.commissionPercent ?? null,
        paymentMethodsConfig: (input.paymentMethodsConfig ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      select: STAFF_SELECT,
    });
  },

  async update(restaurantId: string, id: string, input: UpdateStaffInput) {
    await this.assertManageable(restaurantId, id);
    // paymentMethodsConfig es una columna Json: para borrarla hay que mandar Prisma.DbNull, no
    // null a secas (null en un campo Json significa "no tocar" en el tipado de Prisma).
    const { paymentMethodsConfig, ...rest } = input;
    return prisma.user.update({
      where: { id },
      data: {
        ...rest,
        ...(paymentMethodsConfig !== undefined
          ? { paymentMethodsConfig: paymentMethodsConfig === null ? Prisma.DbNull : (paymentMethodsConfig as Prisma.InputJsonValue) }
          : {}),
      },
      select: STAFF_SELECT,
    });
  },

  async remove(restaurantId: string, id: string) {
    await this.assertManageable(restaurantId, id);
    await prisma.user.delete({ where: { id } });
    return { deleted: true };
  },

  async assertManageable(restaurantId: string, id: string) {
    const user = await prisma.user.findFirst({ where: { id, restaurantId }, select: { id: true, role: true } });
    if (!user) throw notFound('Miembro del equipo no encontrado.');
    if (user.role === 'OWNER') throw badRequest('No se puede modificar al dueño de la cuenta desde aquí.');
    return user;
  },
};
