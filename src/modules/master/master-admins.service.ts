import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma';
import { conflict, notFound } from '../../utils/http-error';
import { CreatePlatformAdminInput, UpdatePlatformAdminInput } from './master-admins.dto';

export const masterAdminsService = {
  /** Cuentas con acceso al Dashboard maestro (Administrador y Gestor). */
  async list() {
    return prisma.platformAdmin.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
  },

  async create(input: CreatePlatformAdminInput) {
    const existing = await prisma.platformAdmin.findUnique({ where: { email: input.email } });
    if (existing) throw conflict('Ya existe una cuenta con ese correo.');

    const passwordHash = await bcrypt.hash(input.password, 10);
    const admin = await prisma.platformAdmin.create({
      data: { name: input.name, email: input.email, passwordHash, role: input.role },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    return admin;
  },

  async update(id: string, input: UpdatePlatformAdminInput) {
    const existing = await prisma.platformAdmin.findUnique({ where: { id } });
    if (!existing) throw notFound('Cuenta no encontrada.');

    if (input.email && input.email !== existing.email) {
      const emailTaken = await prisma.platformAdmin.findUnique({ where: { email: input.email } });
      if (emailTaken) throw conflict('Ya existe una cuenta con ese correo.');
    }

    return prisma.platformAdmin.update({
      where: { id },
      data: {
        name: input.name,
        email: input.email,
        role: input.role,
        ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 10) } : {}),
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
  },
};
