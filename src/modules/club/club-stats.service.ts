import { prisma } from '../../config/prisma';
import { round2, toDecimal } from '../../utils/money';
import { atTimeCaracas, caracasPartsOf, startOfDayCaracas } from '../../utils/timezone';

/**
 * ============================================================================
 *  Estadísticas de ocupación de canchas
 * ============================================================================
 *  Ocupación = minutos vendidos / minutos disponibles. Lo que un club necesita
 *  saber no es cuánto facturó, sino cuánta de su capacidad quedó sin vender:
 *  dos días con la misma facturación pueden tener ocupación muy distinta si uno
 *  fue con precio de hora pico.
 *
 *  El disponible NO se saca sumando las franjas de ClubSchedule: pueden
 *  solaparse sobre la misma cancha (un tramo cargado a 60 min y otro a 90 min
 *  sobre el mismo horario, ver el comentario del modelo). Sumarlas contaría el
 *  mismo tiempo dos veces y daría ocupaciones imposibles por debajo de lo real.
 *  Por eso se unen los intervalos antes de medirlos.
 */

interface Interval {
  start: number; // minutos desde medianoche
  end: number;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Une intervalos solapados o pegados y devuelve los minutos totales que cubren. */
function unionMinutes(intervals: Interval[]): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let total = 0;
  let { start, end } = sorted[0];
  for (const cur of sorted.slice(1)) {
    if (cur.start <= end) {
      end = Math.max(end, cur.end);
    } else {
      total += end - start;
      ({ start, end } = cur);
    }
  }
  return total + (end - start);
}

/**
 * Ocupación día por día en un rango. `days` cuenta hacia atrás incluyendo hoy.
 *
 * Devuelve por día los minutos vendidos, los disponibles, el % y la facturación,
 * más el detalle por cancha del período — para poder ver no solo cuánto se vendió
 * sino cuál cancha se está quedando vacía.
 */
async function occupancy(restaurantId: string, days: number) {
  const today = caracasPartsOf(new Date()).dateStr;
  const start = startOfDayCaracas(today);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  // Fin exclusivo: el arranque del día siguiente a hoy.
  const endExclusive = startOfDayCaracas(today);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  const [courts, schedules, blocks] = await Promise.all([
    prisma.clubCourt.findMany({
      where: { restaurantId, active: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.clubSchedule.findMany({
      where: { restaurantId, active: true },
      select: { courtId: true, weekday: true, startTime: true, endTime: true },
    }),
    prisma.clubCourtBlock.findMany({
      where: {
        restaurantId,
        status: 'ACTIVE',
        kind: 'BOOKING',
        startsAt: { gte: start, lt: endExclusive },
      },
      select: {
        courtId: true,
        startsAt: true,
        endsAt: true,
        booking: { select: { totalBase: true, status: true } },
      },
    }),
  ]);

  /** Minutos vendibles de una cancha en un día de la semana, sin contar dos veces
   * las franjas que se solapan. */
  const availableFor = (courtId: string, weekday: number) =>
    unionMinutes(
      schedules
        .filter((s) => s.weekday === weekday && (s.courtId === null || s.courtId === courtId))
        .map((s) => ({ start: toMinutes(s.startTime), end: toMinutes(s.endTime) })),
    );

  // Un día a la vez, en hora de Caracas: el club abre y cierra por su reloj, no por UTC.
  const byDay: {
    date: string;
    weekday: number;
    bookedMinutes: number;
    availableMinutes: number;
    occupancyPercent: number;
    bookings: number;
    revenueBase: string;
  }[] = [];
  const byCourt = new Map<string, { courtId: string; name: string; bookedMinutes: number; availableMinutes: number }>();
  for (const c of courts) byCourt.set(c.id, { courtId: c.id, name: c.name, bookedMinutes: 0, availableMinutes: 0 });

  for (let i = 0; i < days; i += 1) {
    const dayStart = new Date(start);
    dayStart.setUTCDate(dayStart.getUTCDate() + i);
    const { dateStr, dayOfWeek: weekday } = caracasPartsOf(dayStart);
    const dayFrom = atTimeCaracas(dateStr, '00:00');
    const dayTo = new Date(dayFrom.getTime() + 24 * 60 * 60 * 1000);

    let availableMinutes = 0;
    for (const court of courts) {
      const mins = availableFor(court.id, weekday);
      availableMinutes += mins;
      byCourt.get(court.id)!.availableMinutes += mins;
    }

    const dayBlocks = blocks.filter((b) => b.startsAt >= dayFrom && b.startsAt < dayTo);
    // Una reserva cancelada no ocupó la cancha; su bloque queda CANCELLED y ya está
    // filtrado, pero el booking puede haberse marcado cancelado sin tocar el bloque.
    const counted = dayBlocks.filter((b) => b.booking?.status !== 'CANCELLED');

    let bookedMinutes = 0;
    for (const b of counted) {
      const mins = Math.max(0, Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60000));
      bookedMinutes += mins;
      const entry = byCourt.get(b.courtId);
      if (entry) entry.bookedMinutes += mins;
    }

    const revenue = round2(counted.reduce((acc, b) => acc.add(b.booking?.totalBase ?? 0), toDecimal(0)));

    byDay.push({
      date: dateStr,
      weekday,
      bookedMinutes,
      availableMinutes,
      // Sin horarios cargados no hay capacidad contra la cual medir: 0 y no una división por cero.
      occupancyPercent: availableMinutes > 0 ? Math.round((bookedMinutes / availableMinutes) * 100) : 0,
      bookings: counted.length,
      revenueBase: revenue.toFixed(2),
    });
  }

  const totalBooked = byDay.reduce((acc, d) => acc + d.bookedMinutes, 0);
  const totalAvailable = byDay.reduce((acc, d) => acc + d.availableMinutes, 0);

  return {
    byDay,
    byCourt: [...byCourt.values()].map((c) => ({
      ...c,
      occupancyPercent: c.availableMinutes > 0 ? Math.round((c.bookedMinutes / c.availableMinutes) * 100) : 0,
    })),
    totals: {
      bookedMinutes: totalBooked,
      availableMinutes: totalAvailable,
      occupancyPercent: totalAvailable > 0 ? Math.round((totalBooked / totalAvailable) * 100) : 0,
      bookings: byDay.reduce((acc, d) => acc + d.bookings, 0),
      revenueBase: round2(byDay.reduce((acc, d) => acc.add(d.revenueBase), toDecimal(0))).toFixed(2),
    },
  };
}

/**
 * Clientes frecuentes: quién vuelve y cuánto deja. Se deriva de las reservas en vez de
 * llevar contadores en `Customer` — un contador se desincroniza en cuanto alguien cancela o
 * corrige una reserva, y acá el dato siempre sale de la fuente.
 *
 * Se agrupa por teléfono (no por `customerId`): un mismo jugador puede haber reservado
 * antes de que existiera el directorio de clientes, y quedaría partido en dos.
 */
async function frequentCustomers(restaurantId: string, days: number, limit = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const bookings = await prisma.clubBooking.findMany({
    where: { restaurantId, createdAt: { gte: since }, status: { not: 'CANCELLED' } },
    select: {
      playerName: true,
      playerPhone: true,
      totalBase: true,
      createdAt: true,
      status: true,
      customerId: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const byKey = new Map<
    string,
    {
      name: string;
      phone: string | null;
      customerId: string | null;
      bookings: number;
      noShows: number;
      totalBase: number;
      lastVisit: Date;
    }
  >();

  for (const b of bookings) {
    const key = b.playerPhone?.replace(/\D/g, '') || `name:${b.playerName.trim().toLowerCase()}`;
    const prev = byKey.get(key);
    if (prev) {
      prev.bookings += 1;
      prev.totalBase += Number(b.totalBase);
      if (b.status === 'NO_SHOW') prev.noShows += 1;
      if (b.createdAt > prev.lastVisit) prev.lastVisit = b.createdAt;
      prev.customerId ??= b.customerId;
    } else {
      byKey.set(key, {
        name: b.playerName,
        phone: b.playerPhone,
        customerId: b.customerId,
        bookings: 1,
        noShows: b.status === 'NO_SHOW' ? 1 : 0,
        totalBase: Number(b.totalBase),
        lastVisit: b.createdAt,
      });
    }
  }

  const customers = [...byKey.values()]
    .sort((a, b) => b.bookings - a.bookings || b.totalBase - a.totalBase)
    .slice(0, limit)
    .map((c) => ({
      ...c,
      totalBase: round2(c.totalBase).toFixed(2),
      avgTicketBase: round2(c.totalBase / c.bookings).toFixed(2),
    }));

  return {
    customers,
    totals: {
      uniqueCustomers: byKey.size,
      // Quién vuelve: es la señal de si el club retiene o solo capta gente nueva.
      returning: [...byKey.values()].filter((c) => c.bookings > 1).length,
      bookings: bookings.length,
    },
  };
}

/**
 * Consumo del inventario del club (la barra/tienda) y qué está por acabarse.
 *
 * El stock baja por DOS caminos independientes: la venta de mostrador (ShopSale) y lo que
 * los jugadores piden desde la tablet de la cancha (ClubTabItem). Mirar solo uno subestima
 * el consumo justo de lo que más rota, que es lo que uno necesita reponer a tiempo.
 */
async function consumption(restaurantId: string, days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [saleItems, tabItems, products] = await Promise.all([
    prisma.shopSaleItem.findMany({
      where: { sale: { restaurantId, time: { gte: since }, returned: false } },
      select: { productId: true, name: true, qty: true, price: true },
    }),
    prisma.clubTabItem.findMany({
      where: { order: { restaurantId, createdAt: { gte: since }, status: { not: 'CANCELLED' } }, source: 'CLUB_STORE' },
      select: { sourceProductId: true, productName: true, quantity: true, unitPrice: true },
    }),
    prisma.shopProduct.findMany({
      where: { restaurantId },
      select: { id: true, name: true, minStock: true, sku: true, variants: { select: { stock: true } } },
    }),
  ]);

  const stockOf = new Map(products.map((p) => [p.id, p.variants.reduce((acc, v) => acc + v.stock, 0)]));
  const byProduct = new Map<string, { productId: string | null; name: string; qty: number; revenue: number }>();

  const add = (id: string | null, name: string, qty: number, revenue: number) => {
    const key = id ?? `name:${name.toLowerCase()}`;
    const prev = byProduct.get(key);
    if (prev) {
      prev.qty += qty;
      prev.revenue += revenue;
    } else {
      byProduct.set(key, { productId: id, name, qty, revenue });
    }
  };

  for (const it of saleItems) add(it.productId, it.name, it.qty, it.qty * it.price);
  for (const it of tabItems) add(it.sourceProductId, it.productName, it.quantity, it.quantity * Number(it.unitPrice));

  const top = [...byProduct.values()]
    .map((p) => {
      const stock = p.productId ? (stockOf.get(p.productId) ?? null) : null;
      const perDay = p.qty / days;
      return {
        productId: p.productId,
        name: p.name,
        qty: round2(p.qty).toFixed(2),
        revenueBase: round2(p.revenue).toFixed(2),
        stock,
        // Días que aguanta al ritmo actual. Null cuando no se puede saber (producto suelto
        // sin id, o sin consumo) — es más honesto que inventar un número.
        daysLeft: stock != null && perDay > 0 ? Math.floor(stock / perDay) : null,
      };
    })
    .sort((a, b) => Number(b.qty) - Number(a.qty));

  const product = new Map(products.map((p) => [p.id, p]));
  const lowStock = products
    .map((p) => ({ id: p.id, name: p.name, sku: p.sku, stock: p.variants.reduce((a, v) => a + v.stock, 0), minStock: p.minStock }))
    .filter((p) => p.minStock > 0 && p.stock <= p.minStock)
    .sort((a, b) => a.stock - b.stock);

  return {
    // Los 15 que más rotan: la lista completa no se lee y el resto casi nunca importa.
    top: top.slice(0, 15),
    // Lo que se acaba en menos de una semana al ritmo actual, aunque todavía no esté bajo mínimo.
    runningOut: top
      .filter((p) => p.daysLeft != null && p.daysLeft <= 7)
      .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
      .slice(0, 10),
    lowStock: lowStock.slice(0, 15).map((p) => ({ ...p, exists: product.has(p.id) })),
    days,
  };
}

export const clubStatsService = { occupancy, frequentCustomers, consumption };
