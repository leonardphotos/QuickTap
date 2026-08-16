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
    resetInFlight = doReset().finally(() => {
      resetInFlight = null;
    });
    return resetInFlight;
  },

  /** ¿Hay un reset en curso? El simulador de la demo lo consulta para no crear pedidos
   * mientras el restaurante se está borrando y recreando: esa carrera es la que dejaba
   * `Unique constraint failed (restaurantId, orderNumber)` en el log del servidor. */
  isResetting(): boolean {
    return resetInFlight !== null;
  },

  /** Restaurantes demo cuya última actividad quedó vieja (pestaña cerrada/abandonada) — o que nunca tuvieron actividad registrada. */
  async findStaleDemoRestaurants(olderThanMs: number) {
    const cutoff = new Date(Date.now() - olderThanMs);
    return prisma.restaurant.findMany({
      where: {
        isDemo: true,
        slug: DEMO_SLUG,
        demoAdminUnlocked: false,
        OR: [{ demoLastActivityAt: null }, { demoLastActivityAt: { lt: cutoff } }],
      },
      select: { id: true },
    });
  },
};

/**
 * Si alguien desbloqueó el "Modo administrador" (código de 4 dígitos, ver
 * restaurant.service.ts `unlockDemoAdmin`), el restaurante demo queda exento
 * del reset — se resuelve acá, en el único lugar que de verdad borra/recrea,
 * para que tanto el logout como el barrido de inactividad respeten el flag
 * sin duplicar el chequeo en cada llamador.
 */
async function doReset(): Promise<void> {
  const existing = await prisma.restaurant.findUnique({
    where: { slug: DEMO_SLUG },
    select: { demoAdminUnlocked: true },
  });
  if (existing?.demoAdminUnlocked) return;
  await resetAndSeedDemoRestaurant(prisma);
}
