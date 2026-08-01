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

  /**
   * Tasa vigente para una moneda. Si se pasa `restaurantId` y ese restaurante activó
   * `exchangeRateManual`, devuelve su `manualExchangeRateBs` fijo en vez de la tasa BCV
   * cacheada (global). Lanza si no hay tasa BCV disponible y tampoco hay una manual.
   */
  async getRate(currency: Currency, restaurantId?: string) {
    if (restaurantId) {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { exchangeRateManual: true, manualExchangeRateBs: true },
      });
      if (restaurant?.exchangeRateManual && restaurant.manualExchangeRateBs) {
        return { currency, rateBs: restaurant.manualExchangeRateBs, source: 'MANUAL', fetchedAt: new Date() };
      }
    }

    const rate = await prisma.exchangeRate.findUnique({ where: { currency } });
    if (!rate) {
      throw badRequest(
        `Aún no hay una tasa de cambio disponible para ${currency}. Intenta de nuevo en unos minutos.`,
      );
    }
    return rate;
  },

  /**
   * Resumen de ambas monedas para el panel de Ajustes, con indicador de "desactualizada".
   * Si se pasa `restaurantId`, agrega el estado manual de ESE restaurante (`manual`/
   * `manualRateBs`) para que el frontend pueda mostrar/editar el interruptor.
   */
  async getSummary(restaurantId?: string) {
    const rates = await prisma.exchangeRate.findMany();
    const ttlMs = env.exchangeRate.ttlHours * 60 * 60 * 1000;
    const now = Date.now();

    const restaurant = restaurantId
      ? await prisma.restaurant.findUnique({
          where: { id: restaurantId },
          select: { exchangeRateManual: true, manualExchangeRateBs: true },
        })
      : null;

    const byCurrency = (currency: Currency) => {
      const r = rates.find((x) => x.currency === currency);
      const base = r
        ? { currency, rateBs: r.rateBs, fetchedAt: r.fetchedAt, source: r.source, stale: now - r.fetchedAt.getTime() > ttlMs }
        : { currency, rateBs: null, fetchedAt: null, stale: true, source: null };
      return {
        ...base,
        manual: restaurant?.exchangeRateManual ?? false,
        manualRateBs: restaurant?.manualExchangeRateBs ?? null,
      };
    };

    return { USD: byCurrency('USD'), EUR: byCurrency('EUR') };
  },

  /** Activa/desactiva la tasa manual del restaurante y/o actualiza su valor fijo en Bs. */
  async setManualRate(restaurantId: string, manual: boolean, rateBs: number | null) {
    if (manual && (rateBs == null || rateBs <= 0)) {
      throw badRequest('Ingresa una tasa manual válida (mayor a 0) antes de activarla.');
    }
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { exchangeRateManual: manual, manualExchangeRateBs: rateBs },
    });
    return this.getSummary(restaurantId);
  },
};
