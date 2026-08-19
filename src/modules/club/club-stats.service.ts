import { PaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { round2, toDecimal } from '../../utils/money';
import { PAYMENT_METHOD_LABELS, shopMethodToEnum } from '../../utils/payment-method';
import { atTimeCaracas, caracasPartsOf, startOfDayCaracas } from '../../utils/timezone';
import { resolveDateFilter, type ReportRange } from '../../utils/date-range';
import { bucketSalesByDay, computeBreakEven, monthLabel, type BreakEvenResponse } from '../../utils/breakeven';
import { movementService } from '../movements/movement.service';
import { shopSalesCogsSummary } from '../shop/shop.service';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';

/**
 * Ventana de fechas de un reporte del club: si viene `from`/`to` (YYYY-MM-DD, hora de
 * Caracas), ese tramo exacto manda sobre `days`. Sin from/to, se conserva el
 * comportamiento de siempre (los últimos `days` días). `dayCount` es cuántos días cubre
 * la ventana — lo usan occupancy (iterar día por día) y consumption (calcular ritmo diario).
 */
function resolveStatsWindow(days: number, from?: string, to?: string): { since: Date; until?: Date; dayCount: number } {
  if (from || to) {
    const since = startOfDayCaracas(from ?? to!);
    const until = new Date(startOfDayCaracas(to ?? from!).getTime() + 24 * 60 * 60 * 1000);
    const dayCount = Math.max(1, Math.round((until.getTime() - since.getTime()) / (24 * 60 * 60 * 1000)));
    return { since, until, dayCount };
  }
  return { since: new Date(Date.now() - days * 86_400_000), dayCount: days };
}

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
async function occupancy(restaurantId: string, days: number, from?: string, to?: string) {
  let start: Date;
  let endExclusive: Date;
  let dayCount: number;
  if (from || to) {
    start = startOfDayCaracas(from ?? to!);
    endExclusive = new Date(startOfDayCaracas(to ?? from!).getTime() + 24 * 60 * 60 * 1000);
    dayCount = Math.max(1, Math.round((endExclusive.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
  } else {
    const today = caracasPartsOf(new Date()).dateStr;
    start = startOfDayCaracas(today);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    // Fin exclusivo: el arranque del día siguiente a hoy.
    endExclusive = startOfDayCaracas(today);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    dayCount = days;
  }

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
    // Antes esto filtraba `kind: 'BOOKING'`, así que las clases de academia no
    // contaban: una cancha llena de clases se reportaba como libre y la ocupación
    // salía subestimada. Ahora entran las dos y se separan, que es justo la
    // comparación que interesa — ¿rinde más la hora de academia o la renta libre?
    prisma.clubCourtBlock.findMany({
      where: {
        restaurantId,
        status: 'ACTIVE',
        kind: { in: ['BOOKING', 'CLASS'] },
        startsAt: { gte: start, lt: endExclusive },
      },
      select: {
        courtId: true,
        kind: true,
        startsAt: true,
        endsAt: true,
        booking: { select: { totalBase: true, status: true } },
        classSession: { select: { status: true, groupId: true } },
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
    rentalMinutes: number;
    academyMinutes: number;
    availableMinutes: number;
    occupancyPercent: number;
    bookings: number;
    classes: number;
    revenueBase: string;
  }[] = [];
  const byCourt = new Map<
    string,
    { courtId: string; name: string; bookedMinutes: number; rentalMinutes: number; academyMinutes: number; availableMinutes: number }
  >();
  for (const c of courts)
    byCourt.set(c.id, { courtId: c.id, name: c.name, bookedMinutes: 0, rentalMinutes: 0, academyMinutes: 0, availableMinutes: 0 });

  for (let i = 0; i < dayCount; i += 1) {
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
    // Ni una reserva ni una clase canceladas ocuparon la cancha. El bloque cancelado
    // ya está filtrado, pero la reserva/sesión puede haberse marcado cancelada sin
    // tocar el bloque.
    const counted = dayBlocks.filter(
      (b) =>
        b.booking?.status !== 'CANCELLED' &&
        b.classSession?.status !== 'CANCELLED' &&
        b.classSession?.status !== 'RELEASED',
    );

    const minutesOf = (b: { startsAt: Date; endsAt: Date }) =>
      Math.max(0, Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60000));

    let bookedMinutes = 0;
    let rentalMinutes = 0;
    let academyMinutes = 0;
    for (const b of counted) {
      const mins = minutesOf(b);
      bookedMinutes += mins;
      if (b.kind === 'CLASS') academyMinutes += mins;
      else rentalMinutes += mins;
      const entry = byCourt.get(b.courtId);
      if (entry) {
        entry.bookedMinutes += mins;
        if (b.kind === 'CLASS') entry.academyMinutes += mins;
        else entry.rentalMinutes += mins;
      }
    }

    // El ingreso de la renta libre está en la reserva. El de la academia NO cuelga de
    // la sesión (se cobra por mensualidad o bono, no por hora), así que se calcula
    // aparte en academyRevenue() y se cruza al final.
    const revenue = round2(counted.reduce((acc, b) => acc.add(b.booking?.totalBase ?? 0), toDecimal(0)));

    byDay.push({
      date: dateStr,
      weekday,
      bookedMinutes,
      rentalMinutes,
      academyMinutes,
      availableMinutes,
      // Sin horarios cargados no hay capacidad contra la cual medir: 0 y no una división por cero.
      occupancyPercent: availableMinutes > 0 ? Math.round((bookedMinutes / availableMinutes) * 100) : 0,
      bookings: counted.filter((b) => b.kind !== 'CLASS').length,
      classes: counted.filter((b) => b.kind === 'CLASS').length,
      revenueBase: revenue.toFixed(2),
    });
  }

  const totalBooked = byDay.reduce((acc, d) => acc + d.bookedMinutes, 0);
  const totalAvailable = byDay.reduce((acc, d) => acc + d.availableMinutes, 0);
  const totalRentalMin = byDay.reduce((acc, d) => acc + d.rentalMinutes, 0);
  const totalAcademyMin = byDay.reduce((acc, d) => acc + d.academyMinutes, 0);
  const rentalRevenue = round2(byDay.reduce((acc, d) => acc.add(d.revenueBase), toDecimal(0)));

  // Lo que facturó la academia en el mismo período. No sale de las sesiones (una
  // clase no tiene precio propio: se cobra por mensualidad o bono), así que se
  // suma de los cobros reales y se reparte contra las horas que ocupó.
  const academyPaid = await prisma.clubAcademyPayment.aggregate({
    where: { restaurantId, createdAt: { gte: start, lt: endExclusive } },
    _sum: { amountBase: true },
  });
  const academyRevenue = round2(academyPaid._sum.amountBase ?? toDecimal(0));

  /** Ingreso por hora de cancha ocupada. Es la cifra que de verdad compara: una
   *  hora de academia y una de renta libre ocupan la misma pista, así que gana la
   *  que deje más por hora. */
  const perHour = (revenue: Prisma.Decimal, minutes: number) =>
    minutes > 0 ? round2(revenue.div(minutes / 60)).toFixed(2) : null;

  return {
    byDay,
    byCourt: [...byCourt.values()].map((c) => ({
      ...c,
      occupancyPercent: c.availableMinutes > 0 ? Math.round((c.bookedMinutes / c.availableMinutes) * 100) : 0,
    })),
    /** Punto 6.1: academia vs renta libre, en horas y en plata por hora. */
    academyVsRental: {
      rental: {
        minutes: totalRentalMin,
        hours: Math.round((totalRentalMin / 60) * 10) / 10,
        revenueBase: rentalRevenue.toFixed(2),
        revenuePerHourBase: perHour(rentalRevenue, totalRentalMin),
        sharePercent: totalBooked > 0 ? Math.round((totalRentalMin / totalBooked) * 100) : 0,
      },
      academy: {
        minutes: totalAcademyMin,
        hours: Math.round((totalAcademyMin / 60) * 10) / 10,
        revenueBase: academyRevenue.toFixed(2),
        revenuePerHourBase: perHour(academyRevenue, totalAcademyMin),
        sharePercent: totalBooked > 0 ? Math.round((totalAcademyMin / totalBooked) * 100) : 0,
      },
    },
    totals: {
      bookedMinutes: totalBooked,
      rentalMinutes: totalRentalMin,
      academyMinutes: totalAcademyMin,
      availableMinutes: totalAvailable,
      occupancyPercent: totalAvailable > 0 ? Math.round((totalBooked / totalAvailable) * 100) : 0,
      bookings: byDay.reduce((acc, d) => acc + d.bookings, 0),
      classes: byDay.reduce((acc, d) => acc + d.classes, 0),
      revenueBase: rentalRevenue.toFixed(2),
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
async function frequentCustomers(restaurantId: string, days: number, from?: string, to?: string, limit = 30) {
  const { since, until } = resolveStatsWindow(days, from, to);
  const bookings = await prisma.clubBooking.findMany({
    where: { restaurantId, createdAt: { gte: since, ...(until ? { lt: until } : {}) }, status: { not: 'CANCELLED' } },
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
async function consumption(restaurantId: string, days: number, from?: string, to?: string) {
  const { since, until, dayCount } = resolveStatsWindow(days, from, to);

  const [saleItems, tabItems, products] = await Promise.all([
    prisma.shopSaleItem.findMany({
      where: { sale: { restaurantId, time: { gte: since, ...(until ? { lt: until } : {}) }, returned: false } },
      select: { productId: true, name: true, qty: true, price: true },
    }),
    prisma.clubTabItem.findMany({
      where: {
        order: { restaurantId, createdAt: { gte: since, ...(until ? { lt: until } : {}) }, status: { not: 'CANCELLED' } },
        source: 'CLUB_STORE',
      },
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
      const perDay = p.qty / dayCount;
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
    days: dayCount,
  };
}

/**
 * De dónde viene la plata y cómo pagó el cliente.
 *
 * Las MISMAS tres fuentes que suma el arqueo (ver collectPayments en
 * cash-session.service.ts): canchas, tienda y academia. Se leen acá otra vez en
 * vez de reutilizar aquella función porque el arqueo mira solo desde que se
 * abrió la caja, y esto mira un rango de días — pero el criterio de traducción
 * del método de pago SÍ se comparte (shopMethodToEnum), que es donde de verdad
 * se podrían desincronizar los números.
 *
 * Una venta devuelta no dejó plata. Y de una venta fiada solo entró el abono
 * inicial (`amountPaidNow`); el resto llega después como ShopSalePayment.
 */
async function finance(restaurantId: string, days = 30, from?: string, to?: string) {
  const { since, until } = resolveStatsWindow(days, from, to);
  const createdWindow = { gte: since, ...(until ? { lt: until } : {}) };

  const [courtPayments, storeSales, storeInstallments, academyPayments, restaurant] = await Promise.all([
    prisma.clubBookingPayment.findMany({
      where: { booking: { restaurantId }, createdAt: createdWindow },
      select: { amountBase: true, method: true },
    }),
    prisma.shopSale.findMany({
      where: { restaurantId, time: createdWindow, returned: false },
      select: { total: true, paymentMethod: true, creditTerms: true, amountPaidNow: true },
    }),
    prisma.shopSalePayment.findMany({
      where: { shopSale: { restaurantId }, createdAt: createdWindow },
      select: { amount: true, method: true },
    }),
    prisma.clubAcademyPayment.findMany({
      where: { restaurantId, createdAt: createdWindow },
      select: { amountBase: true, method: true },
    }),
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { baseCurrency: true } }),
  ]);

  // Tasa ACTUAL (no la histórica de cada transacción — ninguna de estas tres fuentes la
  // congela hoy) para dar un total de referencia en Bs. Es una aproximación: si el rango
  // cubre varias semanas con la tasa moviéndose, el total en Bs no es exacto día a día,
  // pero sí sirve como orden de magnitud al cierre.
  const rate = restaurant ? await exchangeRateService.getRate(restaurant.baseCurrency, restaurantId).catch(() => null) : null;

  const byMethod = new Map<string, Prisma.Decimal>();
  const add = (method: PaymentMethod | null, amount: Prisma.Decimal) => {
    const key = method ?? 'SIN_METODO';
    byMethod.set(key, (byMethod.get(key) ?? toDecimal(0)).add(amount));
  };

  let court = toDecimal(0);
  for (const p of courtPayments) {
    court = court.add(p.amountBase);
    add(p.method, p.amountBase);
  }

  let store = toDecimal(0);
  for (const sale of storeSales) {
    const amount = sale.creditTerms ? (sale.amountPaidNow ?? 0) : sale.total;
    if (!amount || amount <= 0) continue;
    store = store.add(toDecimal(amount));
    add(shopMethodToEnum(sale.paymentMethod), toDecimal(amount));
  }
  for (const p of storeInstallments) {
    if (!p.amount || p.amount <= 0) continue;
    store = store.add(toDecimal(p.amount));
    add(shopMethodToEnum(p.method), toDecimal(p.amount));
  }

  let academy = toDecimal(0);
  for (const p of academyPayments) {
    academy = academy.add(p.amountBase);
    add(p.method, p.amountBase);
  }

  const total = round2(court.add(store).add(academy));
  const toBs = (amount: Prisma.Decimal) => (rate ? round2(amount.mul(rate.rateBs)).toFixed(2) : null);

  return {
    days,
    totalBase: total.toFixed(2),
    totalBs: toBs(total),
    exchangeRate: rate?.rateBs?.toFixed(4) ?? null,
    bySource: [
      { key: 'court', label: 'Reservas de cancha', amountBase: round2(court).toFixed(2), count: courtPayments.length },
      { key: 'store', label: 'Tienda', amountBase: round2(store).toFixed(2), count: storeSales.length + storeInstallments.length },
      { key: 'academy', label: 'Academia', amountBase: round2(academy).toFixed(2), count: academyPayments.length },
    ],
    byMethod: [...byMethod.entries()]
      .map(([method, amount]) => ({
        method,
        label: method === 'SIN_METODO' ? 'Sin método registrado' : PAYMENT_METHOD_LABELS[method as PaymentMethod],
        amountBase: round2(amount).toFixed(2),
        totalBs: toBs(amount),
      }))
      .filter((m) => Number(m.amountBase) > 0)
      .sort((a, b) => Number(b.amountBase) - Number(a.amountBase)),
  };
}

/**
 * Quién debe y no ha pagado, de las tres fuentes a la vez.
 *
 * Una reserva debe si lo cobrado no cubre cancha + consumo de la tablet — el
 * mismo criterio de `withBookingMoney` en club.service.ts, no uno nuevo. Se
 * excluyen las canceladas (no se le cobra a nadie una reserva que no ocurrió) y
 * las futuras aún sin cobrar no son deuda todavía: solo cuenta lo que ya se jugó
 * o está marcado como cuenta abierta por recepción.
 */
async function debts(restaurantId: string) {
  const now = new Date();

  const [bookings, storeSales, charges] = await Promise.all([
    prisma.clubBooking.findMany({
      where: {
        restaurantId,
        status: { notIn: ['CANCELLED'] },
        OR: [{ awaitingPayment: true }, { block: { endsAt: { lt: now } } }],
      },
      include: {
        payments: { select: { amountBase: true, discountBase: true } },
        // Solo lo que cobra el club: la cancha y su tienda propia. Lo pedido a
        // una tienda vinculada se lo cobra ella, así que no es deuda de acá.
        tabOrders: {
          where: { status: { not: 'CANCELLED' }, kitchenRestaurantId: null },
          select: { totalBase: true },
        },
        block: { select: { startsAt: true, court: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    prisma.shopSale.findMany({
      where: { restaurantId, returned: false, creditTerms: { not: null }, settledAt: null },
      select: {
        id: true,
        time: true,
        total: true,
        amountPaidNow: true,
        customerName: true,
        customerPhone: true,
        payments: { select: { amount: true } },
      },
      orderBy: { time: 'desc' },
      take: 300,
    }),
    prisma.clubAcademyCharge.findMany({
      where: { restaurantId, status: { in: ['PENDING', 'OVERDUE'] } },
      include: {
        enrollment: {
          select: {
            studentId: true,
            student: { select: { customer: { select: { name: true, phone: true } } } },
            group: { select: { name: true } },
          },
        },
        payments: { select: { amountBase: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 300,
    }),
  ]);

  const bookingDebts = bookings
    .map((b) => {
      const consumo = b.tabOrders.reduce((acc, o) => acc.add(o.totalBase), toDecimal(0));
      const due = round2(b.totalBase.add(consumo));
      // El descuento de promoción (CRM) condona deuda igual que el dinero cobrado.
      const paid = b.payments.reduce((acc, p) => acc.add(p.amountBase).add(p.discountBase), toDecimal(0));
      const balance = round2(due.sub(paid));
      return {
        id: b.id,
        name: b.playerName,
        phone: b.playerPhone,
        detail: `${b.block?.court.name ?? 'Cancha'} · ${b.block?.startsAt.toISOString().slice(0, 10) ?? ''}`,
        // Desde cuándo existe la deuda — lo usa el recordatorio por WhatsApp (regla
        // de los 3 días, ver club-debt-bot.service.ts).
        since: (b.block?.startsAt ?? b.createdAt).toISOString(),
        dueBase: due.toFixed(2),
        paidBase: round2(paid).toFixed(2),
        balanceBase: balance.toFixed(2),
      };
    })
    // Un céntimo de diferencia por redondeo no es una deuda.
    .filter((b) => Number(b.balanceBase) > 0.01);

  const storeDebts = storeSales
    .map((s) => {
      const paid = (s.amountPaidNow ?? 0) + s.payments.reduce((acc, p) => acc + p.amount, 0);
      return {
        id: s.id,
        name: s.customerName ?? 'Sin nombre',
        phone: s.customerPhone ?? null,
        detail: `Tienda · ${s.time.toISOString().slice(0, 10)}`,
        since: s.time.toISOString(),
        dueBase: s.total.toFixed(2),
        paidBase: paid.toFixed(2),
        balanceBase: Math.max(0, s.total - paid).toFixed(2),
      };
    })
    .filter((s) => Number(s.balanceBase) > 0.01);

  const academyDebts = charges
    .map((c) => {
      const paid = c.payments.reduce((acc, p) => acc.add(p.amountBase), toDecimal(0));
      const balance = round2(c.amountBase.sub(paid));
      return {
        id: c.id,
        // El pago de una mensualidad se registra contra el ALUMNO, no contra la
        // cuota (ver academyApi.recordPayment): sin este id, Deudas no podía
        // cobrar directamente y mandaba a buscar al alumno en otra pestaña.
        studentId: c.enrollment.studentId,
        name: c.enrollment.student.customer.name,
        phone: c.enrollment.student.customer.phone,
        detail: `${c.enrollment.group.name} · ${String(c.periodMonth).padStart(2, '0')}/${c.periodYear}`,
        since: c.dueDate.toISOString(),
        dueBase: c.amountBase.toFixed(2),
        paidBase: round2(paid).toFixed(2),
        balanceBase: balance.toFixed(2),
        overdue: c.status === 'OVERDUE',
      };
    })
    .filter((c) => Number(c.balanceBase) > 0.01);

  const sum = (rows: { balanceBase: string }[]) =>
    round2(rows.reduce((acc, r) => acc.add(toDecimal(r.balanceBase)), toDecimal(0))).toFixed(2);

  return {
    bookings: bookingDebts,
    store: storeDebts,
    academy: academyDebts,
    totals: {
      bookings: sum(bookingDebts),
      store: sum(storeDebts),
      academy: sum(academyDebts),
      total: sum([...bookingDebts, ...storeDebts, ...academyDebts]),
      count: bookingDebts.length + storeDebts.length + academyDebts.length,
    },
  };
}

/**
 * Punto de equilibrio del mes: cancha y academia no tienen costo variable en el schema (se
 * cobra por hora/mensualidad, sin campo de costo — margen ≈100%), así que el único costo
 * variable real es el de la tienda del club, reutilizando `shopSalesCogsSummary` del módulo
 * de Shop (mismo modelo `ShopSale`). No reutiliza `finance()` porque esa usa ventana móvil de
 * N días y acá hace falta mes calendario para combinar con `movementService.summarizeFixedCosts`
 * — ver src/utils/breakeven.ts para la fórmula compartida con Restaurante y Shop.
 */
async function breakEven(restaurantId: string, range: ReportRange, date?: string, from?: string, to?: string): Promise<BreakEvenResponse> {
  const dateFilter = resolveDateFilter({ range, date, from, to });

  const [courtPayments, academyPayments, storeSales, store, fixedCosts] = await Promise.all([
    prisma.clubBookingPayment.findMany({
      where: { booking: { restaurantId }, createdAt: dateFilter },
      select: { createdAt: true, amountBase: true },
    }),
    prisma.clubAcademyPayment.findMany({
      where: { restaurantId, createdAt: dateFilter },
      select: { createdAt: true, amountBase: true },
    }),
    prisma.shopSale.findMany({
      where: { restaurantId, returned: false, time: dateFilter },
      select: { time: true, total: true },
    }),
    shopSalesCogsSummary(restaurantId, range, date),
    movementService.summarizeFixedCosts(restaurantId, range, date),
  ]);

  const court = courtPayments.reduce((acc, p) => acc.add(p.amountBase), toDecimal(0));
  const academy = academyPayments.reduce((acc, p) => acc.add(p.amountBase), toDecimal(0));
  const totalRevenue = court.add(academy).add(store.totalRevenue);
  const totalCost = store.totalCost;

  const periodStart = dateFilter?.gte ?? new Date();
  const result = computeBreakEven({
    salesBase: totalRevenue,
    cvBase: totalCost,
    fixedCostsBase: fixedCosts.totalBase,
    periodStart,
  });

  return {
    period: { label: monthLabel(periodStart), start: periodStart.toISOString(), end: new Date().toISOString() },
    fixedCosts,
    breakEven: result,
    // Las tres fuentes del club en un solo acumulado por día.
    dailySales: bucketSalesByDay(
      [
        ...courtPayments.map((p) => ({ at: p.createdAt, amount: p.amountBase })),
        ...academyPayments.map((p) => ({ at: p.createdAt, amount: p.amountBase })),
        ...storeSales.map((s) => ({ at: s.time, amount: s.total })),
      ],
      periodStart,
      result.daysElapsed,
    ),
  };
}

export const clubStatsService = { occupancy, frequentCustomers, consumption, finance, debts, breakEven };
