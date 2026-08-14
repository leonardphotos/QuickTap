import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import { trialPeriodEnd } from '../src/utils/subscription';

/**
 * Club de canchas de demostración para QuickTap Club: "Club Pádel Caracas", con 3 canchas
 * (una techada), horarios de valle/pico, y ~5 semanas de reservas históricas con estados
 * variados (jugadas, ausencias, canceladas) más algunas próximas hoy/mañana para poder probar
 * el calendario y el control de acceso por QR sin tener que reservar nada a mano.
 *
 * A diferencia de seed-demo.ts (restaurante slug 'demo'), esto NO se marca isDemo — vive
 * permanentemente, no lo resetea el barrido de inactividad (ese solo mira slug === 'demo').
 * Mismo criterio que seed-shop-demo.ts.
 */

const prisma = new PrismaClient();

const SLUG = 'padel-caracas';
const PASSWORD = 'PadelDemo2026';

// Tasa fija solo para poblar los campos congelados de las reservas de ejemplo — el club real
// usa la tasa BCV vigente (o la manual del restaurante) al momento de reservar de verdad.
const DEMO_RATE_BS = 195;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

const PLAYER_NAMES = [
  'Andrea Salas', 'Miguel Rojas', 'Valentina Pérez', 'Carlos Mendoza', 'Génesis Torres',
  'Daniel Gómez', 'Fabiana Ruiz', 'José Hernández', 'Isabel Castillo', 'Luis Delgado',
  'María Fernanda Ortiz', 'Ricardo Blanco',
];

function randomPhone(): string {
  return `5814${randomInt(1, 4)}${String(randomInt(1000000, 9999999))}`;
}

async function main() {
  const existing = await prisma.restaurant.findUnique({ where: { slug: SLUG } });
  if (existing) {
    console.log(`Ya existe "${SLUG}" — borrando para recrear desde cero...`);
    await prisma.restaurant.delete({ where: { id: existing.id } });
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const restaurant = await prisma.restaurant.create({
    data: {
      slug: SLUG,
      name: 'Club Pádel Caracas',
      description: 'Canchas de pádel en Los Palos Grandes — cuenta de demostración de QuickTap Club.',
      businessType: 'SPORTS_CLUB',
      // Cuenta de demostración: sin PIN de bloqueo, para que un prospecto entre directo.
      lockScreenEnabled: false,
      baseCurrency: 'USD',
      periodEnd: trialPeriodEnd(),
      subscriptionStatus: 'ACTIVE',
      subscriptionPlan: 'CLUB',
      theme: { primary: '#065F46', accent: '#F59E0B' },
      paymentMethodsConfig: {
        CASH: { enabled: true },
        CASH_USD: { enabled: true },
        MOBILE_PAYMENT: { enabled: true, banco: 'Banesco', telefono: '04141234567', cedula: 'V-12345678', titular: 'Club Pádel Caracas C.A.' },
        ZELLE: { enabled: true, cuenta: 'pagos@padelcaracas.club' },
      },
    },
  });

  const [owner, admin, cashier] = await Promise.all([
    prisma.user.create({ data: { restaurantId: restaurant.id, email: 'duena@padelcaracas.club', passwordHash, name: 'Valentina Rojas', role: 'OWNER' } }),
    prisma.user.create({ data: { restaurantId: restaurant.id, email: 'admin@padelcaracas.club', passwordHash, name: 'Carlos Mendoza', role: 'ADMIN' } }),
    prisma.user.create({ data: { restaurantId: restaurant.id, email: 'recepcion@padelcaracas.club', passwordHash, name: 'Génesis Torres', role: 'CASHIER' } }),
  ]);

  console.log('Usuarios creados:');
  console.log(`  Dueña:      duena@padelcaracas.club / ${PASSWORD}`);
  console.log(`  Admin:      admin@padelcaracas.club / ${PASSWORD}`);
  console.log(`  Recepción:  recepcion@padelcaracas.club / ${PASSWORD}`);

  // --- Canchas ---
  const court1 = await prisma.clubCourt.create({ data: { restaurantId: restaurant.id, name: 'Cancha 1', sport: 'PADEL', sortOrder: 0 } });
  const court2 = await prisma.clubCourt.create({ data: { restaurantId: restaurant.id, name: 'Cancha 2', sport: 'PADEL', sortOrder: 1 } });
  const court3 = await prisma.clubCourt.create({ data: { restaurantId: restaurant.id, name: 'Cancha Central', sport: 'PADEL', courtType: 'TECHADA', sortOrder: 2 } });
  const courts = [court1, court2, court3];
  console.log('3 canchas creadas (Cancha 1, Cancha 2, Cancha Central techada).');

  // --- Horarios: valle de mañana barato, pico de tarde/noche más caro, toda la semana ---
  for (let weekday = 0; weekday < 7; weekday++) {
    await prisma.clubSchedule.create({
      data: { restaurantId: restaurant.id, weekday, startTime: '07:00', endTime: '16:00', slotMinutes: 90, priceBase: 18 },
    });
    await prisma.clubSchedule.create({
      data: { restaurantId: restaurant.id, weekday, startTime: '16:00', endTime: '23:00', slotMinutes: 90, priceBase: 32, isPeak: true },
    });
  }
  // La cancha techada es un poco más cara en su franja pico.
  for (let weekday = 0; weekday < 7; weekday++) {
    await prisma.clubSchedule.create({
      data: { restaurantId: restaurant.id, courtId: court3.id, weekday, startTime: '16:00', endTime: '23:00', slotMinutes: 90, priceBase: 38, isPeak: true },
    });
  }
  console.log('Horarios creados: valle $18, pico $32 ($38 en la cancha techada).');

  const PEAK_SLOTS = ['16:00', '17:30', '19:00', '20:30'];
  const OFFPEAK_SLOTS = ['07:00', '08:30', '10:00', '11:30', '13:00', '14:30'];

  function priceFor(court: typeof court1, startTime: string): number {
    const isPeak = PEAK_SLOTS.includes(startTime);
    if (!isPeak) return 18;
    return court.id === court3.id ? 38 : 32;
  }

  async function makeBooking(opts: {
    court: typeof court1;
    startsAt: Date;
    endsAt: Date;
    status: 'PENDING_PAYMENT' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
    checkedIn: boolean;
  }) {
    const priceBase = priceFor(opts.court, opts.startsAt.toTimeString().slice(0, 5));
    const block = await prisma.clubCourtBlock.create({
      data: {
        restaurantId: restaurant.id,
        courtId: opts.court.id,
        kind: 'BOOKING',
        startsAt: opts.startsAt,
        endsAt: opts.endsAt,
        status: opts.status === 'CANCELLED' ? 'CANCELLED' : 'ACTIVE',
      },
    });
    const totalBase = priceBase;
    await prisma.clubBooking.create({
      data: {
        restaurantId: restaurant.id,
        blockId: block.id,
        playerName: pick(PLAYER_NAMES),
        playerPhone: randomPhone(),
        playerCount: pick([2, 4, 4, 4]),
        totalBase,
        exchangeRate: DEMO_RATE_BS,
        totalBs: totalBase * DEMO_RATE_BS,
        accessToken: nanoid(14),
        status: opts.status,
        checkedInAt: opts.checkedIn ? opts.endsAt : null,
        cancelledAt: opts.status === 'CANCELLED' ? opts.startsAt : null,
      },
    });
  }

  function atSlot(daysFromNow: number, hhmm: string): { start: Date; end: Date } {
    const [h, m] = hhmm.split(':').map(Number);
    const start = new Date();
    start.setDate(start.getDate() + daysFromNow);
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + 90 * 60_000);
    return { start, end };
  }

  // --- Historial: últimos 30 días, densidad realista (no todas las franjas ocupadas) ---
  let historyCount = 0;
  for (let day = 30; day >= 1; day--) {
    const slotsToday = [...OFFPEAK_SLOTS, ...PEAK_SLOTS].filter(() => Math.random() < 0.35);
    for (const hhmm of slotsToday) {
      const court = pick(courts);
      const { start, end } = atSlot(-day, hhmm);
      const roll = Math.random();
      // La mayoría se jugó, algunas ausencias, pocas canceladas — para que el
      // panel muestre los tres estados de verdad, no solo el camino feliz.
      const status = roll < 0.78 ? 'COMPLETED' : roll < 0.92 ? 'NO_SHOW' : 'CANCELLED';
      try {
        await makeBooking({ court, startsAt: start, endsAt: end, status, checkedIn: status === 'COMPLETED' });
        historyCount++;
      } catch {
        // Dos canchas distintas pueden coincidir en el mismo slot al azar; se salta ese hueco.
      }
    }
  }
  console.log(`${historyCount} reservas históricas creadas (jugadas, ausencias y canceladas).`);

  // --- Próximas: hoy y mañana, para poder probar Calendario/Reservas/Acceso al toque ---
  let upcoming = 0;
  for (const [dayOffset, slots] of [[0, ['17:30', '20:30']], [1, ['08:30', '16:00', '19:00']]] as const) {
    for (const hhmm of slots) {
      const court = pick(courts);
      const { start, end } = atSlot(dayOffset, hhmm);
      if (start.getTime() < Date.now()) continue; // no crear turnos que ya pasaron hoy
      try {
        await makeBooking({ court, startsAt: start, endsAt: end, status: 'CONFIRMED', checkedIn: false });
        upcoming++;
      } catch {
        // slot ya ocupado por azar, se salta
      }
    }
  }
  console.log(`${upcoming} reservas próximas creadas (hoy/mañana, para probar el check-in).`);

  // --- Un bloqueo de mantenimiento próximo, para ver el calendario con las 4 razones ---
  try {
    const { start, end } = atSlot(2, '13:00');
    await prisma.clubCourtBlock.create({
      data: { restaurantId: restaurant.id, courtId: court3.id, kind: 'MAINTENANCE', startsAt: start, endsAt: new Date(end.getTime() + 30 * 60_000), note: 'Cambio de red' },
    });
    console.log('1 bloqueo de mantenimiento creado (Cancha Central, en 2 días).');
  } catch {
    // no crítico si choca
  }

  console.log('\n✅ "Club Pádel Caracas" listo.');
  console.log(`   Panel: /admin/login → duena@padelcaracas.club / ${PASSWORD}`);
  console.log(`   Reservas del jugador: /club/${SLUG}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
