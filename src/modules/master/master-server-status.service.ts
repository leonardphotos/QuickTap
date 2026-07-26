import os from 'os';
import fs from 'fs';
import { execSync } from 'child_process';
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
 *
 *  `vpsCapacity` traduce RAM/CPU/swap/disco a un solo porcentaje "qué tan
 *  cerca está de necesitar un VPS más grande", usando los umbrales del
 *  estudio de capacidad (26 jul 2026): carga sostenida >0.8 por núcleo, RAM
 *  sostenida >85%, swap en uso fuera de picos puntuales, disco >90%. Es una
 *  guía, no una alarma exacta — ver el estudio para la metodología completa.
 */

function bytesToMb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

/** Swap desde /proc/meminfo (Linux). Devuelve null en plataformas sin esa ruta (ej. macOS en dev). */
function readSwap(): { usedMb: number; totalMb: number; usedPercent: number } | null {
  try {
    const raw = fs.readFileSync('/proc/meminfo', 'utf8');
    const totalKb = Number(raw.match(/SwapTotal:\s+(\d+)/)?.[1] ?? 0);
    const freeKb = Number(raw.match(/SwapFree:\s+(\d+)/)?.[1] ?? 0);
    if (!totalKb) return { usedMb: 0, totalMb: 0, usedPercent: 0 };
    const usedKb = totalKb - freeKb;
    return {
      usedMb: Math.round((usedKb / 1024) * 10) / 10,
      totalMb: Math.round((totalKb / 1024) * 10) / 10,
      usedPercent: Math.round((usedKb / totalKb) * 100),
    };
  } catch {
    return null;
  }
}

/** % de disco usado en la partición raíz, vía `df` (funciona en Linux y macOS). */
function readDiskUsedPercent(): number | null {
  try {
    const out = execSync('df -k /', { encoding: 'utf8' });
    const line = out.trim().split('\n')[1];
    const match = line?.match(/(\d+)%/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

type Bottleneck = 'cpu' | 'ram' | 'swap' | 'disco' | 'ninguno';

const BOTTLENECK_LABEL: Record<Bottleneck, string> = {
  cpu: 'CPU (carga sostenida)',
  ram: 'RAM',
  swap: 'swap en uso',
  disco: 'espacio en disco',
  ninguno: 'ninguno — hay margen',
};

/**
 * Combina las 4 señales en un solo % "hacia necesitar upgrade", usando el
 * peor de los 4 componentes (el cuello de botella real es el que primero
 * llega a su umbral, no el promedio de todos).
 */
function computeVpsCapacity(input: {
  loadAvg1m: number;
  cpuCores: number;
  ramUsedPercent: number;
  swapUsedPercent: number;
  diskUsedPercent: number | null;
}) {
  const cpuPercent = (input.loadAvg1m / (0.8 * input.cpuCores)) * 100;
  const ramPercent = (input.ramUsedPercent / 85) * 100;
  const swapPercent = (input.swapUsedPercent / 15) * 100;
  const diskPercent = input.diskUsedPercent != null ? (input.diskUsedPercent / 90) * 100 : 0;

  const components: Array<[Bottleneck, number]> = [
    ['cpu', cpuPercent],
    ['ram', ramPercent],
    ['swap', swapPercent],
    ['disco', diskPercent],
  ];
  const [bottleneck, rawPercent] = components.reduce((worst, cur) => (cur[1] > worst[1] ? cur : worst));
  const percent = Math.max(0, Math.min(100, Math.round(rawPercent)));

  return {
    percent,
    bottleneck: percent < 40 ? ('ninguno' as Bottleneck) : bottleneck,
    bottleneckLabel: BOTTLENECK_LABEL[percent < 40 ? ('ninguno' as Bottleneck) : bottleneck],
  };
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
    const cpuCores = os.cpus().length;
    const swap = readSwap();
    const diskUsedPercent = readDiskUsedPercent();

    const vpsCapacity = computeVpsCapacity({
      loadAvg1m,
      cpuCores,
      ramUsedPercent: usedPercent,
      swapUsedPercent: swap?.usedPercent ?? 0,
      diskUsedPercent,
    });

    return {
      uptimeSeconds: Math.round(process.uptime()),
      memory: { rssMb: bytesToMb(mem.rss), heapUsedMb: bytesToMb(mem.heapUsed) },
      system: { freeMb, totalMb, usedPercent },
      loadAvg1m,
      cpuCores,
      swap,
      diskUsedPercent,
      dbLatencyMs,
      socketsConnected: socketsConnected(),
      exchangeRate,
      vpsCapacity,
    };
  },

  /** Fuerza un refresh de la tasa BCV (USD y EUR), sin esperar al TTL. */
  async refreshCache() {
    await exchangeRateService.refreshAll();
    return this.get();
  },
};
