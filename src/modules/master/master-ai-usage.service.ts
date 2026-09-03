import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { caracasPartsOf, startOfTodayCaracas } from '../../utils/timezone';

/**
 * Consumo del servicio de IA (panel maestro).
 *
 * Quien paga la factura de Gemini es QuickTap, no el restaurante: la carga de catálogo la
 * corre el equipo sobre el cliente que sea. Así que esto no es un reporte por inquilino sino
 * la cuenta de luz de la plataforma — cuánto se gastó, en qué operación se fue y a qué cliente
 * se le estaba cargando cuando se gastó.
 *
 * El razonamiento va en su propia columna porque no aparece ni en la entrada ni en la salida y
 * se cobra igual: era el 34% del gasto antes de poder apagarlo, y es el número que dice si una
 * operación está usando un modelo pensante donde no hace falta.
 */

/** Cuántos días hacia atrás mira cada rango. */
const DIAS_POR_RANGO: Record<string, number> = { hoy: 1, semana: 7, mes: 30, trimestre: 90 };

function dinero(entrada: number, salida: number, razonamiento: number): number | null {
  const pIn = env.geminiPrecioEntradaPorMillon;
  const pOut = env.geminiPrecioSalidaPorMillon;
  if (pIn <= 0 && pOut <= 0) return null;
  // El razonamiento se cobra como salida: son tokens que el modelo genera, aunque no se vean.
  return ((entrada * pIn) + ((salida + razonamiento) * pOut)) / 1_000_000;
}

export const masterAiUsageService = {
  async resumen(rango: string) {
    const dias = DIAS_POR_RANGO[rango] ?? 30;
    // Desde el arranque del día en Caracas y no "hace N × 24 h": el VPS corre en UTC, y un
    // corte por horas hace que "hoy" empiece a las 8 de la noche de ayer.
    const desde = new Date(startOfTodayCaracas().getTime() - (dias - 1) * 86_400_000);

    const llamadas = await prisma.aiUsage.findMany({
      where: { createdAt: { gte: desde } },
      orderBy: { createdAt: 'desc' },
    });

    const sumar = (filas: typeof llamadas) =>
      filas.reduce(
        (a, l) => ({
          llamadas: a.llamadas + 1,
          entrada: a.entrada + l.entrada,
          salida: a.salida + l.salida,
          razonamiento: a.razonamiento + l.razonamiento,
          total: a.total + l.total,
          ms: a.ms + l.ms,
        }),
        { llamadas: 0, entrada: 0, salida: 0, razonamiento: 0, total: 0, ms: 0 },
      );

    const totales = sumar(llamadas);

    // Por día, con los días vacíos incluidos: una barra faltante se lee como "ese día no cargué
    // el gráfico", y un cero se lee como "ese día no se gastó nada", que es la verdad.
    const porDia = new Map<string, { total: number; llamadas: number }>();
    for (let i = 0; i < dias; i++) {
      const d = new Date(desde.getTime() + i * 86_400_000);
      porDia.set(caracasPartsOf(d).dateStr, { total: 0, llamadas: 0 });
    }
    for (const l of llamadas) {
      const dia = caracasPartsOf(l.createdAt).dateStr;
      const fila = porDia.get(dia);
      if (!fila) continue;
      fila.total += l.total;
      fila.llamadas += 1;
    }

    const agrupar = <T extends string>(clave: (l: (typeof llamadas)[number]) => T | null) => {
      const mapa = new Map<T, typeof llamadas>();
      for (const l of llamadas) {
        const k = clave(l);
        if (k === null) continue;
        mapa.set(k, [...(mapa.get(k) ?? []), l]);
      }
      return [...mapa.entries()]
        .map(([k, filas]) => ({ clave: k, ...sumar(filas), costo: dinero(sumar(filas).entrada, sumar(filas).salida, sumar(filas).razonamiento) }))
        .sort((a, b) => b.total - a.total);
    };

    return {
      rango,
      desde: desde.toISOString(),
      // Null = no hay precios configurados (GEMINI_PRECIO_*_POR_MILLON). El panel muestra
      // tokens en vez de inventar un monto.
      precios:
        env.geminiPrecioEntradaPorMillon > 0 || env.geminiPrecioSalidaPorMillon > 0
          ? { entrada: env.geminiPrecioEntradaPorMillon, salida: env.geminiPrecioSalidaPorMillon }
          : null,
      totales: { ...totales, costo: dinero(totales.entrada, totales.salida, totales.razonamiento) },
      porDia: [...porDia.entries()].map(([dia, v]) => ({ dia, ...v })),
      porOperacion: agrupar((l) => l.operacion),
      porRestaurante: agrupar((l) => l.restaurante ?? null).slice(0, 15),
      porModelo: agrupar((l) => l.modelo),
      ultimas: llamadas.slice(0, 40).map((l) => ({
        id: l.id,
        operacion: l.operacion,
        modelo: l.modelo,
        restaurante: l.restaurante,
        entrada: l.entrada,
        salida: l.salida,
        razonamiento: l.razonamiento,
        total: l.total,
        ms: l.ms,
        createdAt: l.createdAt,
      })),
    };
  },
};
