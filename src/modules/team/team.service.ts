import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { CreateStaffInput, UpdateStaffInput } from './team.dto';

// OWNER nunca aparece en la lista de "Equipo" gestionable (es el dueño de la cuenta).
const STAFF_SELECT = { id: true, name: true, email: true, role: true, isActive: true, createdAt: true } as const;

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
      where: { restaurantId, email: input.email },
      select: { id: true },
    });
    if (existing) throw badRequest('Ya existe un miembro del equipo con ese email.');

    const passwordHash = await bcrypt.hash(input.password, 10);
    return prisma.user.create({
      data: {
        restaurantId,
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
      },
      select: STAFF_SELECT,
    });
  },

  async update(restaurantId: string, id: string, input: UpdateStaffInput) {
    await this.assertManageable(restaurantId, id);
    return prisma.user.update({ where: { id }, data: input, select: STAFF_SELECT });
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
