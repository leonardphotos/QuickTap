import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { isDeliveryTierPlan } from '../../utils/subscription';
import { CreateStaffInput, SetStaffPinInput, UpdateStaffInput } from './team.dto';

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
  clubCourtId: true,
  clubCourt: { select: { id: true, name: true } },
  createdAt: true,
  // Se resuelve a hasLockPin (booleano) antes de salir — ver serializeStaff. Es el mismo PIN
  // de 4 dígitos de la Pantalla de bloqueo: acá el dueño lo fija/quita, y también sirve para
  // que el mesero aparezca (o no) en la cuadrícula de la tablet compartida.
  lockPinHash: true,
} as const;

function serializeStaff<T extends { lockPinHash: string | null }>(user: T) {
  const { lockPinHash, ...rest } = user;
  return { ...rest, hasLockPin: !!lockPinHash };
}

/** Una tablet de cancha sin cancha asignada no sabe qué QR aceptar, así que se
 * exige al crearla. En cualquier otro rol el campo no aplica y se ignora. */
async function resolveClubCourtId(restaurantId: string, role: string, clubCourtId?: string | null) {
  if (role !== 'CANCHA') return null;
  if (!clubCourtId) throw badRequest('Elige a qué cancha va montada esta tablet.');
  return assertCourtOfTenant(restaurantId, clubCourtId);
}

async function assertCourtOfTenant(restaurantId: string, clubCourtId: string) {
  const court = await prisma.clubCourt.findFirst({
    where: { id: clubCourtId, restaurantId, active: true },
    select: { id: true },
  });
  if (!court) throw badRequest('Esa cancha no existe o no pertenece a este club.');
  return court.id;
}

export const teamService = {
  async list(restaurantId: string) {
    const rows = await prisma.user.findMany({
      where: { restaurantId, role: { not: 'OWNER' } },
      orderBy: { createdAt: 'asc' },
      select: STAFF_SELECT,
    });
    return rows.map(serializeStaff);
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
    // El PIN del segundo inicio de sesión, si lo trae — solo tiene sentido en Mesero (ver
    // auth.service.listSwitchableWaiters), así que se ignora en cualquier otro rol en vez de
    // guardarlo sin efecto y confundir después por qué "no aparece en la cuadrícula".
    const lockPinHash = input.pin && input.role === 'WAITER' ? await bcrypt.hash(input.pin, 10) : null;
    const created = await prisma.user.create({
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
        clubCourtId: await resolveClubCourtId(restaurantId, input.role, input.clubCourtId),
        lockPinHash,
      },
      select: STAFF_SELECT,
    });
    return serializeStaff(created);
  },

  async update(restaurantId: string, id: string, input: UpdateStaffInput) {
    await this.assertManageable(restaurantId, id);
    // paymentMethodsConfig es una columna Json: para borrarla hay que mandar Prisma.DbNull, no
    // null a secas (null en un campo Json significa "no tocar" en el tipado de Prisma).
    const { paymentMethodsConfig, clubCourtId, ...rest } = input;
    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...rest,
        ...(clubCourtId !== undefined
          ? { clubCourtId: clubCourtId ? await assertCourtOfTenant(restaurantId, clubCourtId) : null }
          : {}),
        ...(paymentMethodsConfig !== undefined
          ? { paymentMethodsConfig: paymentMethodsConfig === null ? Prisma.DbNull : (paymentMethodsConfig as Prisma.InputJsonValue) }
          : {}),
      },
      select: STAFF_SELECT,
    });
    return serializeStaff(updated);
  },

  /** El dueño/admin fija o quita el PIN de 4 dígitos de un mesero desde Equipo — para que no
   * dependa de que el propio mesero entre una vez con correo/clave a configurárselo en Ajustes
   * (que sigue funcionando igual, es el mismo campo). null = lo quita. */
  async setPin(restaurantId: string, id: string, input: SetStaffPinInput) {
    await this.assertManageable(restaurantId, id);
    const lockPinHash = input.pin ? await bcrypt.hash(input.pin, 10) : null;
    const updated = await prisma.user.update({ where: { id }, data: { lockPinHash }, select: STAFF_SELECT });
    return serializeStaff(updated);
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
