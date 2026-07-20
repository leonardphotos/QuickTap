import { prisma } from '../../config/prisma';
import { UpdateRestaurantInput, UpdateScheduleInput } from './restaurant.dto';

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
};
