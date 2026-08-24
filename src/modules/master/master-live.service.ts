import { BusinessType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { startOfTodayCaracas } from '../../utils/timezone';

/**
 * Estadísticas en vivo de toda la plataforma, para el Dashboard maestro.
 *
 * Cruza los cuatro verticales en una sola serie temporal: cada uno guarda su plata en una
 * tabla distinta (Order, ShopSale, ClubBooking, JournalLine), así que acá se normalizan a
 * "cuánto entró y cuándo" y se acumulan sobre el mismo eje.
 *
 * Todo se mide desde las 00:00 de Caracas, que es el día que cierra el negocio, no UTC.
 */

/** Ventana que una visita se considera activa sin volver a dar señal. */
const PRESENCIA_TTL_MS = 45_000;

/**
 * Quién está ahora mismo en una página pública, en memoria del proceso.
 *
 * En memoria y no en base de datos a propósito: es un dato que vive 45 segundos y se escribe
 * en cada latido de cada visitante. Mandarlo a Postgres sería un INSERT por visitante cada
 * pocos segundos para un número que nadie consulta después. El precio es que el reinicio
 * nocturno de PM2 lo pone en cero — aceptable para un contador de "ahora mismo".
 */
const presencia = new Map<string, Map<string, number>>();

function limpiarVencidos() {
  const corte = Date.now() - PRESENCIA_TTL_MS;
  for (const [restaurantId, visitas] of presencia) {
    for (const [visitorId, visto] of visitas) if (visto < corte) visitas.delete(visitorId);
    if (visitas.size === 0) presencia.delete(restaurantId);
  }
}

/** Marca que un visitante sigue en la página pública de un negocio. */
export function marcarPresencia(restaurantId: string, visitorId: string) {
  limpiarVencidos();
  const visitas = presencia.get(restaurantId) ?? new Map<string, number>();
  visitas.set(visitorId, Date.now());
  presencia.set(restaurantId, visitas);
}

const VERTICALES: BusinessType[] = ['RESTAURANT', 'SHOP', 'SPORTS_CLUB', 'ADMIN_OFFICE'];

/** Un movimiento de dinero, ya normalizado sin importar de qué vertical venga. */
interface Movimiento {
  vertical: BusinessType;
  restaurantId: string;
  negocio: string;
  monto: number;
  cuando: Date;
  detalle: string;
}

function vacioPorVertical<T>(valor: () => T): Record<BusinessType, T> {
  return Object.fromEntries(VERTICALES.map((v) => [v, valor()])) as Record<BusinessType, T>;
}

export const masterLiveService = {
  /**
   * Foto del momento. Se sondea cada pocos segundos desde el dashboard, así que trae solo lo
   * del día en curso: son cuatro consultas acotadas por fecha, no un barrido del histórico.
   *
   * Las cuentas de demostración y las sucursales quedan fuera, igual que en el resto del
   * dashboard: la demo no es actividad real y una sucursal ya cuenta dentro de su sede.
   */
  async snapshot() {
    limpiarVencidos();
    const desde = startOfTodayCaracas();
    const soloReales = { isDemo: false, parentRestaurantId: null };

    const [pedidos, ventasLocal, reservas, asientos, negocios] = await Promise.all([
      prisma.order.findMany({
        where: { createdAt: { gte: desde }, status: { not: 'CANCELLED' }, restaurant: soloReales },
        select: { totalBase: true, createdAt: true, orderNumber: true, restaurantId: true, restaurant: { select: { name: true } } },
      }),
      prisma.shopSale.findMany({
        where: { time: { gte: desde }, returned: false, restaurant: soloReales },
        select: { total: true, time: true, restaurantId: true, restaurant: { select: { name: true } } },
      }),
      prisma.clubBooking.findMany({
        where: { createdAt: { gte: desde }, status: { not: 'CANCELLED' }, restaurant: soloReales },
        select: { totalBase: true, createdAt: true, restaurantId: true, restaurant: { select: { name: true } } },
      }),
      // Administración no vende: lo que "genera" son los ingresos asentados en sus libros.
      prisma.journalLine.findMany({
        where: {
          credit: { gt: 0 },
          account: { kind: 'INCOME' },
          entry: { voidedAt: null, date: { gte: desde }, company: { restaurant: soloReales } },
        },
        select: { credit: true, entry: { select: { date: true, companyId: true, company: { select: { name: true, restaurantId: true } } } } },
      }),
      prisma.restaurant.findMany({
        where: soloReales,
        select: { id: true, name: true, businessType: true },
      }),
    ]);

    const movimientos: Movimiento[] = [
      ...pedidos.map((o) => ({
        vertical: 'RESTAURANT' as BusinessType,
        restaurantId: o.restaurantId,
        negocio: o.restaurant.name,
        monto: Number(o.totalBase),
        cuando: o.createdAt,
        detalle: `Pedido #${o.orderNumber}`,
      })),
      ...ventasLocal.map((v) => ({
        vertical: 'SHOP' as BusinessType,
        restaurantId: v.restaurantId,
        negocio: v.restaurant.name,
        monto: v.total,
        cuando: v.time,
        detalle: 'Venta',
      })),
      ...reservas.map((b) => ({
        vertical: 'SPORTS_CLUB' as BusinessType,
        restaurantId: b.restaurantId,
        negocio: b.restaurant.name,
        monto: Number(b.totalBase),
        cuando: b.createdAt,
        detalle: 'Reserva',
      })),
      ...asientos.map((l) => ({
        vertical: 'ADMIN_OFFICE' as BusinessType,
        restaurantId: l.entry.company.restaurantId,
        negocio: l.entry.company.name,
        monto: Number(l.credit),
        cuando: l.entry.date,
        detalle: 'Ingreso',
      })),
    ].sort((a, b) => a.cuando.getTime() - b.cuando.getTime());

    // ─── Serie acumulada, en cubos de 15 minutos ───────────────────────────
    // Acumulada y no por cubo a propósito: el maestro quiere ver la curva del día subiendo,
    // no cuatro histogramas dentados que suben y bajan según pase o no un pedido.
    const CUBO_MS = 15 * 60 * 1000;
    const ahora = Date.now();
    const puntos: { t: string; total: number; porVertical: Record<BusinessType, number> }[] = [];
    const acumulado = vacioPorVertical(() => 0);
    let siguiente = 0;
    for (let t = desde.getTime(); t <= ahora; t += CUBO_MS) {
      const cierre = t + CUBO_MS;
      while (siguiente < movimientos.length && movimientos[siguiente].cuando.getTime() < cierre) {
        const m = movimientos[siguiente];
        acumulado[m.vertical] += m.monto;
        siguiente++;
      }
      puntos.push({
        t: new Date(Math.min(cierre, ahora)).toISOString(),
        total: Object.values(acumulado).reduce((a, n) => a + n, 0),
        porVertical: { ...acumulado },
      });
    }

    // ─── Totales del día ──────────────────────────────────────────────────
    const totales = vacioPorVertical(() => ({ operaciones: 0, usd: 0 }));
    for (const m of movimientos) {
      totales[m.vertical].operaciones++;
      totales[m.vertical].usd += m.monto;
    }

    // ─── Quién está en la página ahora ────────────────────────────────────
    const porNegocio = new Map(negocios.map((n) => [n.id, n]));
    const visitantesPorVertical = vacioPorVertical(() => 0);
    const visitantesPorNegocio: { negocio: string; vertical: BusinessType; visitantes: number }[] = [];
    let visitantesTotal = 0;
    for (const [restaurantId, visitas] of presencia) {
      const negocio = porNegocio.get(restaurantId);
      if (!negocio) continue; // demo o sucursal: no cuenta, igual que en el resto del panel
      visitantesTotal += visitas.size;
      visitantesPorVertical[negocio.businessType] += visitas.size;
      visitantesPorNegocio.push({ negocio: negocio.name, vertical: negocio.businessType, visitantes: visitas.size });
    }
    visitantesPorNegocio.sort((a, b) => b.visitantes - a.visitantes);

    // ─── Ranking del día y últimos movimientos ────────────────────────────
    const porLocal = new Map<string, { negocio: string; vertical: BusinessType; usd: number; operaciones: number }>();
    for (const m of movimientos) {
      const fila = porLocal.get(m.restaurantId) ?? { negocio: m.negocio, vertical: m.vertical, usd: 0, operaciones: 0 };
      fila.usd += m.monto;
      fila.operaciones++;
      porLocal.set(m.restaurantId, fila);
    }

    return {
      ahora: new Date().toISOString(),
      desde: desde.toISOString(),
      serie: puntos,
      totales,
      totalDia: {
        operaciones: movimientos.length,
        usd: Math.round(Object.values(totales).reduce((a, t) => a + t.usd, 0) * 100) / 100,
      },
      visitantes: { total: visitantesTotal, porVertical: visitantesPorVertical, porNegocio: visitantesPorNegocio.slice(0, 8) },
      ranking: [...porLocal.values()].sort((a, b) => b.usd - a.usd).slice(0, 8),
      ultimos: movimientos
        .slice(-12)
        .reverse()
        .map((m) => ({ vertical: m.vertical, negocio: m.negocio, detalle: m.detalle, monto: m.monto, cuando: m.cuando.toISOString() })),
    };
  },
};
