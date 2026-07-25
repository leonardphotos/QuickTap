import { prisma } from '../config/prisma';
import { resetAndSeedDemoRestaurant, DEMO_SLUG } from './seed-demo-restaurant';

let resetInFlight: Promise<void> | null = null;

/**
 * Entorno Demo Efímero: vuelve a dejar el restaurante demo exactamente como
 * lo deja `resetAndSeedDemoRestaurant` (borra y recrea desde cero). Se llama
 * desde el logout explícito (`POST /auth/logout`) y desde el barrido
 * periódico de inactividad (ver server.ts) — con protección contra llamadas
 * concurrentes (ambas rutas pueden dispararse casi al mismo tiempo).
 */
export const demoResetService = {
  async reset(): Promise<void> {
    if (resetInFlight) return resetInFlight;
    resetInFlight = resetAndSeedDemoRestaurant(prisma).finally(() => {
      resetInFlight = null;
    });
    return resetInFlight;
  },

  /** Restaurantes demo cuya última actividad quedó vieja (pestaña cerrada/abandonada) — o que nunca tuvieron actividad registrada. */
  async findStaleDemoRestaurants(olderThanMs: number) {
    const cutoff = new Date(Date.now() - olderThanMs);
    return prisma.restaurant.findMany({
      where: {
        isDemo: true,
        slug: DEMO_SLUG,
        OR: [{ demoLastActivityAt: null }, { demoLastActivityAt: { lt: cutoff } }],
      },
      select: { id: true },
    });
  },
};
