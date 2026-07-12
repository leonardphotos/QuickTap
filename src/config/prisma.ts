import { PrismaClient } from '@prisma/client';
import { env } from './env';

/**
 * Cliente Prisma singleton. Evita agotar el pool de conexiones en desarrollo
 * cuando ts-node-dev recarga el proceso.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isProd ? ['error'] : ['query', 'warn', 'error'],
  });

if (!env.isProd) {
  globalForPrisma.prisma = prisma;
}
