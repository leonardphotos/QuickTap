import os from 'os';
import { prisma } from '../../config/prisma';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import { getIO } from '../../sockets';

/**
 * ============================================================================
 *  Salud del servidor (Dashboard maestro)
 * ============================================================================
 *  Snapshot en vivo de RAM/CPU/latencia de BD/sockets conectados, para que el
 *  equipo de QuickTap vigile el VPS sin entrar por SSH. No hay ningún caché en
 *  memoria en este backend (Prisma no cachea queries, no hay Map persistente
 *  entre requests) — lo único que se "cachea" de verdad es la tasa BCV en la
 *  tabla ExchangeRate (ver exchange-rate.service.ts), así que "limpiar caché"
 *  aquí significa forzar un refresh de esa tasa, no un no-op.
 */

function bytesToMb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

async function measureDbLatencyMs(): Promise<number | null> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Date.now() - start;
  } catch {
    return null;
  }
}

function socketsConnected(): number {
  try {
    return getIO().sockets.sockets.size;
  } catch {
    return 0;
  }
}

export const masterServerStatusService = {
  async get() {
    const [dbLatencyMs, exchangeRate] = await Promise.all([measureDbLatencyMs(), exchangeRateService.getSummary()]);
    const mem = process.memoryUsage();
    const freeMb = bytesToMb(os.freemem());
    const totalMb = bytesToMb(os.totalmem());
    const usedPercent = Math.round((1 - freeMb / totalMb) * 100);
    const loadAvg1m = Math.round(os.loadavg()[0] * 100) / 100;

    return {
      uptimeSeconds: Math.round(process.uptime()),
      memory: { rssMb: bytesToMb(mem.rss), heapUsedMb: bytesToMb(mem.heapUsed) },
      system: { freeMb, totalMb, usedPercent },
      loadAvg1m,
      dbLatencyMs,
      socketsConnected: socketsConnected(),
      exchangeRate,
    };
  },

  /** Fuerza un refresh de la tasa BCV (USD y EUR), sin esperar al TTL. */
  async refreshCache() {
    await exchangeRateService.refreshAll();
    return this.get();
  },
};
