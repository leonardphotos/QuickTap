import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma';
import { badRequest } from '../../utils/http-error';
import { DEMO_ADMIN_PIN } from '../../utils/seed-demo-restaurant';
import { UpdateLockScreenIntervalsInput, UpdateRestaurantInput, UpdateScheduleInput } from './restaurant.dto';

export const restaurantService = {
  async update(restaurantId: string, input: UpdateRestaurantInput) {
    return prisma.restaurant.update({
      where: { id: restaurantId },
      data: input,
    });
  },

  /** Confirma que ya se mostró la pantalla de bienvenida del plan recién activado. */
  async markWelcomeSeen(restaurantId: string) {
    await prisma.restaurant.update({ where: { id: restaurantId }, data: { pendingWelcomePlan: null } });
    return { done: true };
  },

  /** Ajustes → Horario: las 7 filas (domingo a sábado) de una sola vez. */
  async getSchedule(restaurantId: string) {
    const rows = await prisma.restaurantSchedule.findMany({ where: { restaurantId } });
    const byDay = new Map(rows.map((r) => [r.dayOfWeek, r]));
    return Array.from({ length: 7 }, (_, dayOfWeek) => {
      const row = byDay.get(dayOfWeek);
      return {
        dayOfWeek,
        isClosed: row?.isClosed ?? false,
        openTime: row?.openTime ?? null,
        closeTime: row?.closeTime ?? null,
      };
    });
  },

  async updateSchedule(restaurantId: string, input: UpdateScheduleInput) {
    await prisma.$transaction(
      input.map((day) =>
        prisma.restaurantSchedule.upsert({
          where: { restaurantId_dayOfWeek: { restaurantId, dayOfWeek: day.dayOfWeek } },
          create: {
            restaurantId,
            dayOfWeek: day.dayOfWeek,
            isClosed: day.isClosed,
            openTime: day.isClosed ? null : (day.openTime ?? null),
            closeTime: day.isClosed ? null : (day.closeTime ?? null),
          },
          update: {
            isClosed: day.isClosed,
            openTime: day.isClosed ? null : (day.openTime ?? null),
            closeTime: day.isClosed ? null : (day.closeTime ?? null),
          },
        }),
      ),
    );
    return this.getSchedule(restaurantId);
  },

  /** Ajustes → código de 6 dígitos para eliminar comandas (solo lo crea/cambia Dueño/Admin). */
  async setDeleteOrderPin(restaurantId: string, pin: string) {
    const deleteOrderPinHash = await bcrypt.hash(pin, 10);
    await prisma.restaurant.update({ where: { id: restaurantId }, data: { deleteOrderPinHash } });
    return { done: true };
  },

  /** Ajustes → Pantalla de bloqueo: minutos de inactividad por rol (solo Dueño/Admin). */
  async updateLockScreenIntervals(restaurantId: string, intervals: UpdateLockScreenIntervalsInput) {
    await prisma.restaurant.update({ where: { id: restaurantId }, data: { lockScreenIntervals: intervals } });
    return { done: true };
  },

  /**
   * Ajustes → Pantalla de bloqueo: interruptor general (solo Dueño/Admin).
   * Apagarlo no borra ningún PIN — los `lockPinHash` ya guardados se conservan,
   * así volver a activarlo no obliga al equipo a crear su clave de nuevo.
   */
  async setLockScreenEnabled(restaurantId: string, enabled: boolean) {
    await prisma.restaurant.update({ where: { id: restaurantId }, data: { lockScreenEnabled: enabled } });
    return { lockScreenEnabled: enabled };
  },

  /**
   * Entorno Demo Efímero → "Modo administrador": código fijo que exime al
   * restaurante demo del reset automático (ver demo-reset.service.ts), para
   * dejar cambios permanentes (ej. configurar sucursales) sin que se borren.
   */
  async unlockDemoAdmin(restaurantId: string, pin: string) {
    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { isDemo: true } });
    if (!restaurant?.isDemo) throw badRequest('Esta opción solo aplica al entorno demo.');
    if (pin !== DEMO_ADMIN_PIN) throw badRequest('Código incorrecto.');
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { demoAdminUnlocked: true, demoLastActivityAt: new Date() },
    });
    return { demoAdminUnlocked: true };
  },
};
