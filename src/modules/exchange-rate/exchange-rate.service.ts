import { Currency } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { badRequest } from '../../utils/http-error';

/**
 * ============================================================================
 *  Tasa de cambio BCV (Banco Central de Venezuela)
 * ============================================================================
 *  Es una tasa GLOBAL (no por restaurante): todos los negocios que facturan
 *  en la misma moneda comparten el mismo valor. Se cachea en la tabla
 *  `ExchangeRate` y se refresca periódicamente (ver server.ts) desde una
 *  fuente pública que replica el dato oficial del BCV.
 *
 *  Diseño defensivo: si la fuente externa falla (caída, cambio de formato,
 *  bloqueo de red), NUNCA se rompe el checkout — se sigue sirviendo la
 *  última tasa cacheada válida. Solo falla si jamás se ha logrado obtener
 *  una tasa para esa moneda.
 */

const SOURCE_URLS: Record<Currency, string> = {
  USD: env.exchangeRate.usdUrl,
  EUR: env.exchangeRate.eurUrl,
};

interface FetchResult {
  rateBs: number;
  source: string;
}

/** Intenta extraer el valor numérico de la tasa de formas de respuesta comunes. */
function extractRate(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const obj = payload as Record<string, unknown>;
  for (const key of ['promedio', 'venta', 'compra', 'price', 'rate']) {
    const value = obj[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return null;
}

async function fetchFromSource(currency: Currency): Promise<FetchResult> {
  const url = SOURCE_URLS[currency];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Fuente de tasa respondió ${res.status} para ${currency}.`);
    }
    const json = await res.json();
    const rateBs = extractRate(json);
    if (rateBs === null) {
      throw new Error(`No se pudo interpretar la respuesta de tasa para ${currency}.`);
    }
    return { rateBs, source: 'BCV' };
  } finally {
    clearTimeout(timeout);
  }
}

export const exchangeRateService = {
  /** Refresca UNA moneda. Si falla, conserva silenciosamente el valor cacheado anterior. */
  async refreshCurrency(currency: Currency): Promise<void> {
    try {
      const { rateBs, source } = await fetchFromSource(currency);
      await prisma.exchangeRate.upsert({
        where: { currency },
        create: { currency, rateBs, source },
        update: { rateBs, source, fetchedAt: new Date() },
      });
    } catch (err) {

      console.error(`[exchange-rate] No se pudo refrescar ${currency}:`, (err as Error).message);
      // No relanzamos: el caller sigue funcionando con la tasa cacheada (si existe).
    }
  },

  async refreshAll(): Promise<void> {
    await Promise.all([this.refreshCurrency('USD'), this.refreshCurrency('EUR')]);
  },

  /** Tasa vigente (cacheada) para una moneda. Lanza si nunca se ha obtenido ninguna. */
  async getRate(currency: Currency) {
    const rate = await prisma.exchangeRate.findUnique({ where: { currency } });
    if (!rate) {
      throw badRequest(
        `Aún no hay una tasa de cambio disponible para ${currency}. Intenta de nuevo en unos minutos.`,
      );
    }
    return rate;
  },

  /** Resumen de ambas monedas para el dashboard, con indicador de "desactualizada". */
  async getSummary() {
    const rates = await prisma.exchangeRate.findMany();
    const ttlMs = env.exchangeRate.ttlHours * 60 * 60 * 1000;
    const now = Date.now();

    const byCurrency = (currency: Currency) => {
      const r = rates.find((x) => x.currency === currency);
      if (!r) return { currency, rateBs: null, fetchedAt: null, stale: true, source: null };
      return {
        currency,
        rateBs: r.rateBs,
        fetchedAt: r.fetchedAt,
        source: r.source,
        stale: now - r.fetchedAt.getTime() > ttlMs,
      };
    };

    return { USD: byCurrency('USD'), EUR: byCurrency('EUR') };
  },
};
