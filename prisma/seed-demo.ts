import { PrismaClient } from '@prisma/client';
import { resetAndSeedDemoRestaurant } from '../src/utils/seed-demo-restaurant';

/**
 * Semilla de demostración: borra el restaurante "demo" (si existe) y lo
 * recrea desde cero con la marca ficticia "Big Bite Burgers", menú con
 * fotos/variantes/modificadores, un año de historial y actividad en vivo.
 * Misma lógica que usa el reset automático del Entorno Demo Efímero
 * (ver src/services/demo-reset.service.ts) — un solo lugar de verdad.
 *
 * Uso: npm run seed:demo
 */

const prisma = new PrismaClient();

resetAndSeedDemoRestaurant(prisma)
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
