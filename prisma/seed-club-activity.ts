/**
  * Movimiento de demostración para la cuenta demo del club (slug demo-canchas).
 *
 * OJO: esto NO crea el club — de eso se encarga seed-club-demo.ts, que arma
 * "Club Pádel Caracas" desde cero. Este script LLENA de actividad un club que ya
 * existe y está marcado como demo.
 *
 * Llena TODAS las áreas con movimiento realista: canchas, tienda, academia,
 * jugadores, caja, gastos, nómina e inventario. Sirve para enseñar el producto
 * sin que ninguna pantalla aparezca vacía.
 *
 * Dos reglas que lo hacen seguro y repetible:
 *
 * 1. Solo toca clubes con `isDemo = true`. Si el club objetivo no es demo, aborta
 *    — así este script nunca puede llenar de datos falsos el club de un cliente.
 * 2. Es IDEMPOTENTE: borra lo que sembró antes (por prefijo/tokens conocidos) y
 *    lo vuelve a crear relativo a HOY. Correrlo dos veces no duplica nada.
 *
 * Las reservas "en vivo" llevan tokens fijos (DEMO_LIVE_TOKENS) y las desliza
 * refreshClubDemo para que el QR de la tablet funcione siempre — ver
 * src/utils/club-demo.ts.
 *
 *   npm run seed:club-activity
 */
import { PaymentMethod, PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';
import { DEMO_LIVE_TOKENS } from '../src/utils/club-demo';
import { atTimeCaracas, caracasPartsOf } from '../src/utils/timezone';

const prisma = new PrismaClient();

const SLUG = process.env.CLUB_DEMO_SLUG ?? 'demo-canchas';
const RATE = 40; // Bs por $ — solo para congelar montos de demo.

const NAMES = [
  'Carlos Rondón', 'María Fernández', 'José361 Pérez', 'Ana Villalba', 'Luis Contreras',
  'Gabriela Ríos', 'Andrés Mendoza', 'Valentina Sosa', 'Ricardo Álvarez', 'Daniela Castro',
  'Miguel Herrera', 'Patricia León', 'Jorge Silva', 'Camila Duarte', 'Rafael Moreno',
  'Isabella Nieves', 'Óscar Blanco', 'Adriana Peña', 'Felipe Guerrero', 'Lucía Marcano',
  'Tomás Bracho', 'Renata Salas', 'Iván Padrón', 'Sofía Gil', 'Emilio Navarro',
].map((n) => n.replace(' 361', ''));

const ALL_METHODS: PaymentMethod[] = [
  'CASH', 'CASH_USD', 'MOBILE_PAYMENT', 'ZELLE', 'CARD', 'BINANCE', 'PAYPAL', 'TRANSFER',
];

/** Números de teléfono estables: el mismo índice da siempre el mismo cliente. */
const phoneFor = (i: number) => `0414${String(1000000 + i * 137).slice(0, 7)}`;

/** Determinista a propósito: dos corridas producen la misma demo, así que un
 *  screenshot de ayer sigue coincidiendo con lo que se ve hoy. */
function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

async function main() {
  const club = await prisma.restaurant.findUnique({
    where: { slug: SLUG },
    select: { id: true, name: true, isDemo: true, businessType: true },
  });

  if (!club) throw new Error(`No existe un club con slug "${SLUG}".`);
  if (club.businessType !== 'SPORTS_CLUB') throw new Error(`"${SLUG}" no es un club deportivo.`);
  // La barrera que impide llenar de datos falsos el club de un cliente real.
  if (!club.isDemo) {
    throw new Error(`"${SLUG}" no está marcado como demo (isDemo = false). Abortado por seguridad.`);
  }

  const C = club.id;
  console.log(`\n🎾 Sembrando demo en "${club.name}"…\n`);

  // ---------------------------------------------------------------- limpieza
  // Se borra lo sembrado antes para poder correrlo mil veces sin duplicar.
  const oldSessions = await prisma.clubClassSession.findMany({ where: { restaurantId: C }, select: { id: true, blockId: true } });
  const oldBookings = await prisma.clubBooking.findMany({ where: { restaurantId: C }, select: { id: true, blockId: true } });

  await prisma.clubAttendance.deleteMany({ where: { sessionId: { in: oldSessions.map((s) => s.id) } } });
  await prisma.clubTabItem.deleteMany({ where: { order: { restaurantId: C } } });
  await prisma.clubTabOrder.deleteMany({ where: { restaurantId: C } });
  await prisma.clubBookingPayment.deleteMany({ where: { booking: { restaurantId: C } } });
  await prisma.clubWaitlistEntry.deleteMany({ where: { restaurantId: C } });
  await prisma.clubClassCreditEntry.deleteMany({ where: { restaurantId: C } });
  await prisma.clubAcademyPayment.deleteMany({ where: { restaurantId: C } });
  await prisma.clubAcademyCharge.deleteMany({ where: { restaurantId: C } });
  await prisma.clubClassPackage.deleteMany({ where: { restaurantId: C } });
  await prisma.clubEnrollment.deleteMany({ where: { restaurantId: C } });
  await prisma.clubClassSession.deleteMany({ where: { restaurantId: C } });
  await prisma.clubClassSlot.deleteMany({ where: { group: { restaurantId: C } } });
  await prisma.clubClassGroup.deleteMany({ where: { restaurantId: C } });
  await prisma.clubProgram.deleteMany({ where: { restaurantId: C } });
  await prisma.clubCoachPayout.deleteMany({ where: { restaurantId: C } });
  await prisma.clubCoach.deleteMany({ where: { restaurantId: C } });
  await prisma.clubStudent.deleteMany({ where: { restaurantId: C } });
  await prisma.clubBooking.deleteMany({ where: { restaurantId: C } });
  await prisma.clubCourtBlock.deleteMany({
    where: { id: { in: [...oldSessions, ...oldBookings].map((x) => x.blockId).filter(Boolean) as string[] } },
  });
  await prisma.clubCourtBlock.deleteMany({ where: { restaurantId: C } });
  await prisma.clubPlayInvite.deleteMany({ where: { restaurantId: C } });
  await prisma.clubLoyaltyEntry.deleteMany({ where: { restaurantId: C } });
  await prisma.clubBlacklistEntry.deleteMany({ where: { restaurantId: C } });
  await prisma.clubPlayerAccount.deleteMany({ where: { restaurantId: C } });
  await prisma.shopSalePayment.deleteMany({ where: { shopSale: { restaurantId: C } } });
  await prisma.shopSaleItem.deleteMany({ where: { sale: { restaurantId: C } } });
  await prisma.shopSale.deleteMany({ where: { restaurantId: C } });
  await prisma.employeePayment.deleteMany({ where: { restaurantId: C } });
  await prisma.employee.deleteMany({ where: { restaurantId: C } });
  await prisma.movement.deleteMany({ where: { restaurantId: C } });
  console.log('  · limpieza previa lista');

  // ----------------------------------------------------------------- canchas
  let courts = await prisma.clubCourt.findMany({ where: { restaurantId: C }, orderBy: { sortOrder: 'asc' } });
  if (courts.length < 3) {
    const names = ['Cancha 1', 'Cancha 2', 'Cancha 3'];
    for (let i = courts.length; i < 3; i += 1) {
      await prisma.clubCourt.create({
        data: {
          restaurantId: C,
          name: names[i],
          sport: 'PADEL',
          courtType: i === 1 ? 'TECHADA' : i === 2 ? 'INDOOR' : 'LIBRE',
          sortOrder: i,
        },
      });
    }
    courts = await prisma.clubCourt.findMany({ where: { restaurantId: C }, orderBy: { sortOrder: 'asc' } });
  }

  // Horarios: todos los días, con hora valle y hora pico.
  if ((await prisma.clubSchedule.count({ where: { restaurantId: C } })) === 0) {
    for (let wd = 0; wd < 7; wd += 1) {
      await prisma.clubSchedule.createMany({
        data: [
          { restaurantId: C, weekday: wd, startTime: '07:00', endTime: '17:00', slotMinutes: 90, priceBase: 18, isPeak: false },
          { restaurantId: C, weekday: wd, startTime: '17:00', endTime: '23:00', slotMinutes: 90, priceBase: 25, isPeak: true },
        ],
      });
    }
  }
  console.log(`  · ${courts.length} canchas y horarios`);

  // --------------------------------------------------------------- clientes
  const customers = [];
  for (let i = 0; i < NAMES.length; i += 1) {
    const c = await prisma.customer.upsert({
      where: { restaurantId_phone: { restaurantId: C, phone: phoneFor(i) } },
      create: { restaurantId: C, name: NAMES[i], phone: phoneFor(i), idNumber: `V-${12000000 + i * 3571}` },
      update: { name: NAMES[i] },
    });
    customers.push(c);
  }
  console.log(`  · ${customers.length} clientes`);

  // ---------------------------------------------------------- reservas pasadas
  // 45 días de historia: pagadas con TODOS los métodos, algunas a medias, unas
  // ausencias y unas canceladas con motivo.
  let bookingCount = 0;
  let debtCount = 0;
  const hours = ['07:00', '08:30', '10:00', '11:30', '17:00', '18:30', '20:00', '21:30'];

  for (let d = 45; d >= 1; d -= 1) {
    const date = caracasPartsOf(daysAgo(d)).dateStr;
    // Entre 3 y 6 reservas por día, determinista.
    const perDay = 3 + (d % 4);
    for (let k = 0; k < perDay; k += 1) {
      const court = pick(courts, d + k);
      const hour = pick(hours, d * 3 + k);
      const startsAt = atTimeCaracas(date, hour);
      const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
      const price = Number(hour) >= 17 || hour >= '17:00' ? 25 : 18;
      const customer = pick(customers, d * 5 + k);

      // 1 de cada 12 se cancela; 1 de cada 9 es ausencia.
      const cancelled = (d + k) % 12 === 0;
      const noShow = !cancelled && (d + k) % 9 === 0;

      const block = await prisma.clubCourtBlock
        .create({
          data: {
            restaurantId: C,
            courtId: court.id,
            kind: 'BOOKING',
            startsAt,
            endsAt,
            status: cancelled ? 'CANCELLED' : 'ACTIVE',
          },
        })
        .catch(() => null);
      if (!block) continue; // chocó con otra: se salta, la demo no necesita esa

      const booking = await prisma.clubBooking.create({
        data: {
          restaurantId: C,
          blockId: block.id,
          customerId: customer.id,
          playerName: customer.name,
          playerPhone: customer.phone,
          playerCount: 4,
          totalBase: price,
          exchangeRate: RATE,
          totalBs: price * RATE,
          accessToken: nanoid(14),
          status: cancelled ? 'CANCELLED' : noShow ? 'NO_SHOW' : 'COMPLETED',
          checkedInAt: cancelled || noShow ? null : startsAt,
          cancelledAt: cancelled ? startsAt : null,
          cancelReason: cancelled ? pick(['Lluvia / cancha no jugable', 'El jugador avisó que no viene', 'Mantenimiento imprevisto'], d) : null,
          cancelledBy: cancelled ? 'STAFF' : null,
          createdAt: new Date(startsAt.getTime() - 2 * 86_400_000),
        },
      });
      bookingCount += 1;

      if (cancelled) continue;

      // Consumo desde la tablet en 1 de cada 4.
      if ((d + k) % 4 === 0) {
        const consumo = 6;
        const tab = await prisma.clubTabOrder.create({
          data: {
            restaurantId: C,
            bookingId: booking.id,
            courtName: court.name,
            status: 'DELIVERED',
            totalBase: consumo,
            exchangeRate: RATE,
            totalBs: consumo * RATE,
            deliveredAt: endsAt,
            createdAt: startsAt,
          },
        });
        await prisma.clubTabItem.create({
          data: {
            tabOrderId: tab.id,
            source: 'CLUB_STORE',
            productName: pick(['Agua 600ml', 'Gatorade', 'Cerveza', 'Snack'], d + k),
            unitPrice: 3,
            quantity: 2,
            lineTotal: 6,
          },
        });
      }

      // Cobro: rota TODOS los métodos. 1 de cada 7 queda debiendo (parcial o nada).
      const due = price + ((d + k) % 4 === 0 ? 6 : 0);
      const owes = !noShow && (d + k) % 7 === 0;
      if (noShow) {
        // Ausencia: se le cobró igual la mitad, práctica común.
        await prisma.clubBookingPayment.create({
          data: { bookingId: booking.id, amountBase: price / 2, method: pick(ALL_METHODS, d + k), createdAt: endsAt },
        });
      } else if (owes) {
        // Abonó parte y quedó debiendo.
        await prisma.clubBookingPayment.create({
          data: { bookingId: booking.id, amountBase: Math.round(due * 0.4), method: pick(ALL_METHODS, d + k), createdAt: endsAt },
        });
        await prisma.clubBooking.update({ where: { id: booking.id }, data: { awaitingPayment: true } });
        debtCount += 1;
      } else {
        await prisma.clubBookingPayment.create({
          data: { bookingId: booking.id, amountBase: due, method: pick(ALL_METHODS, d * 2 + k), createdAt: endsAt },
        });
      }
    }
  }
  console.log(`  · ${bookingCount} reservas de los últimos 45 días (${debtCount} con saldo)`);

  // ------------------------------------------------- reservas de HOY y futuras
  const today = caracasPartsOf(new Date()).dateStr;
  for (let k = 0; k < 4; k += 1) {
    const court = pick(courts, k);
    const hour = pick(['17:00', '18:30', '20:00', '21:30'], k);
    const startsAt = atTimeCaracas(today, hour);
    if (startsAt.getTime() < Date.now()) continue;
    const block = await prisma.clubCourtBlock
      .create({
        data: { restaurantId: C, courtId: court.id, kind: 'BOOKING', startsAt, endsAt: new Date(startsAt.getTime() + 90 * 60_000) },
      })
      .catch(() => null);
    if (!block) continue;
    const customer = pick(customers, 100 + k);
    await prisma.clubBooking.create({
      data: {
        restaurantId: C,
        blockId: block.id,
        customerId: customer.id,
        playerName: customer.name,
        playerPhone: customer.phone,
        playerCount: 4,
        totalBase: 25,
        exchangeRate: RATE,
        totalBs: 25 * RATE,
        accessToken: nanoid(14),
        status: k % 2 === 0 ? 'CONFIRMED' : 'PENDING_PAYMENT',
      },
    });
  }

  // ----------------------------------------------- reservas EN VIVO (QR fijo)
  // Una por cancha, con token conocido. refreshClubDemo las desliza para que el
  // QR nunca deje de abrir en la tablet.
  const liveNow = new Date();
  for (let i = 0; i < DEMO_LIVE_TOKENS.length; i += 1) {
    const court = courts[i];
    if (!court) break;
    const startsAt = new Date(liveNow.getTime() - 20 * 60_000);
    const endsAt = new Date(liveNow.getTime() + 70 * 60_000);

    // Libera lo que estorbe en esa franja: la restricción EXCLUDE no deja dos.
    await prisma.clubCourtBlock.updateMany({
      where: { restaurantId: C, courtId: court.id, status: 'ACTIVE', startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
      data: { status: 'CANCELLED' },
    });

    const block = await prisma.clubCourtBlock.create({
      data: { restaurantId: C, courtId: court.id, kind: 'BOOKING', startsAt, endsAt },
    });
    const customer = pick(customers, 200 + i);
    const booking = await prisma.clubBooking.create({
      data: {
        restaurantId: C,
        blockId: block.id,
        customerId: customer.id,
        playerName: customer.name,
        playerPhone: customer.phone,
        playerCount: 4,
        totalBase: 25,
        exchangeRate: RATE,
        totalBs: 25 * RATE,
        accessToken: DEMO_LIVE_TOKENS[i],
        status: 'CONFIRMED',
        checkedInAt: startsAt,
      },
    });
    // Ya pidió algo desde la tablet, para que la pantalla no salga vacía.
    const tab = await prisma.clubTabOrder.create({
      data: {
        restaurantId: C,
        bookingId: booking.id,
        courtName: court.name,
        status: 'DELIVERED',
        totalBase: 9,
        exchangeRate: RATE,
        totalBs: 9 * RATE,
        deliveredAt: new Date(),
      },
    });
    await prisma.clubTabItem.createMany({
      data: [
        { tabOrderId: tab.id, source: 'CLUB_STORE', productName: 'Agua 600ml', unitPrice: 3, quantity: 2, lineTotal: 6 },
        { tabOrderId: tab.id, source: 'CLUB_STORE', productName: 'Gatorade', unitPrice: 3, quantity: 1, lineTotal: 3 },
      ],
    });
  }
  console.log(`  · ${DEMO_LIVE_TOKENS.length} reservas EN VIVO con QR fijo: ${DEMO_LIVE_TOKENS.join(', ')}`);

  // ------------------------------------------------------------------ tienda
  let products = await prisma.shopProduct.findMany({ where: { restaurantId: C }, include: { variants: true } });
  if (products.length < 6) {
    const catalog = [
      { name: 'Agua mineral 600ml', price: 1.5, cost: 0.8, stock: 120 },
      { name: 'Gatorade 500ml', price: 3, cost: 1.8, stock: 60 },
      { name: 'Cerveza nacional', price: 3.5, cost: 2, stock: 48 },
      { name: 'Pelotas Head x3', price: 12, cost: 8, stock: 24 },
      { name: 'Grip overgrip', price: 4, cost: 2.2, stock: 8 },
      { name: 'Toalla del club', price: 15, cost: 9, stock: 5 },
    ];
    for (const [i, p] of catalog.entries()) {
      const created = await prisma.shopProduct.create({
        data: {
          restaurantId: C,
          name: p.name,
          category: i < 3 ? 'Bebidas' : 'Accesorios',
          subcategory: '',
          sku: `DEMO-${1000 + i}`,
          location: 'Barra',
          price: p.price,
          cost: p.cost,
          minStock: 10,
          isPublished: true,
        },
      });
      await prisma.shopProductVariant.create({ data: { productId: created.id, v1: '', v2: '', stock: p.stock } });
    }
    products = await prisma.shopProduct.findMany({ where: { restaurantId: C }, include: { variants: true } });
  }

  const STORE_METHODS = ['Efectivo Bs', 'Efectivo $', 'Pago Móvil', 'Zelle', 'Punto de venta', 'Transferencia', 'Binance'];
  let salesCount = 0;
  let storeDebt = 0;
  for (let d = 30; d >= 0; d -= 1) {
    const perDay = 2 + (d % 3);
    for (let k = 0; k < perDay; k += 1) {
      const prod = pick(products, d + k);
      const qty = 1 + ((d + k) % 3);
      const total = Math.round(prod.price * qty * 100) / 100;
      const customer = pick(customers, d * 7 + k);
      // 1 de cada 8 se va fiada, con abono parcial → deuda visible.
      const credit = (d + k) % 8 === 0;
      const sale = await prisma.shopSale.create({
        data: {
          restaurantId: C,
          total,
          time: new Date(daysAgo(d).getTime() + (10 + k) * 3_600_000),
          customerName: customer.name,
          customerPhone: customer.phone,
          paymentMethod: pick(STORE_METHODS, d + k),
          creditTerms: credit ? '15 días' : null,
          amountPaidNow: credit ? Math.round(total * 0.3 * 100) / 100 : null,
        },
      });
      await prisma.shopSaleItem.create({
        data: {
          saleId: sale.id,
          productId: prod.id,
          v1: '',
          v2: '',
          name: prod.name,
          category: prod.category,
          qty,
          price: prod.price,
          cost: prod.cost,
        },
      });
      salesCount += 1;
      if (credit) storeDebt += 1;
    }
  }
  console.log(`  · ${salesCount} ventas de tienda (${storeDebt} fiadas)`);

  // ---------------------------------------------------------------- academia
  const programs = [];
  for (const [i, p] of [
    { name: 'Infantil', color: '#f97316', description: 'De 6 a 14 años' },
    { name: 'Adultos', color: '#0ea5e9', description: 'Iniciación y perfeccionamiento' },
    { name: 'Competición', color: '#a855f7', description: 'Preparación para torneos' },
    { name: 'Clínicas', color: '#22c55e', description: 'Intensivos de fin de semana' },
  ].entries()) {
    programs.push(await prisma.clubProgram.create({ data: { restaurantId: C, ...p, sortOrder: i } }));
  }

  const coaches = [];
  for (const [i, c] of [
    { displayName: 'Carlos Bermúdez', phone: '04141234501', payType: 'FIXED_PER_SESSION' as const, payAmountBase: 15, commissionPercent: null, levelMin: 1, levelMax: 4 },
    { displayName: 'Andrea Salazar', phone: '04141234502', payType: 'COMMISSION_ON_CONSUMED' as const, payAmountBase: null, commissionPercent: 45, levelMin: 2, levelMax: 6 },
    { displayName: 'Diego Mata', phone: '04141234503', payType: 'MIXED' as const, payAmountBase: 8, commissionPercent: 20, levelMin: 3, levelMax: 6 },
  ].entries()) {
    coaches.push(
      await prisma.clubCoach.create({
        data: {
          restaurantId: C,
          displayName: c.displayName,
          phone: c.phone,
          payType: c.payType,
          payAmountBase: c.payAmountBase,
          commissionPercent: c.commissionPercent,
          levelMin: c.levelMin,
          levelMax: c.levelMax,
          sortOrder: i,
          availability: {
            create: [
              { weekday: 1, startTime: '16:00', endTime: '21:00' },
              { weekday: 3, startTime: '16:00', endTime: '21:00' },
              { weekday: 5, startTime: '15:00', endTime: '20:00' },
            ],
          },
        },
      }),
    );
  }

  const groupDefs = [
    { name: 'Mini pádel 6-9', program: 0, coach: 0, levelMin: 1, levelMax: 2, cap: 6, price: 45, wd: [1, 3], time: '16:00' },
    { name: 'Iniciación adultos', program: 1, coach: 0, levelMin: 1, levelMax: 2.5, cap: 4, price: 60, wd: [1, 3], time: '18:00' },
    { name: 'Intermedio adultos', program: 1, coach: 1, levelMin: 2.5, levelMax: 3.5, cap: 4, price: 70, wd: [2, 4], time: '19:30' },
    { name: 'Competición 4.5', program: 2, coach: 2, levelMin: 4, levelMax: 5.5, cap: 4, price: 90, wd: [5], time: '17:30' },
  ];

  const groups = [];
  for (const g of groupDefs) {
    const created = await prisma.clubClassGroup.create({
      data: {
        restaurantId: C,
        coachId: coaches[g.coach].id,
        programId: programs[g.program].id,
        name: g.name,
        levelMin: g.levelMin,
        levelMax: g.levelMax,
        classType: 'GROUP',
        capacityMin: 2,
        capacityMax: g.cap,
        seasonStart: daysAgo(60),
        priceMonthlyBase: g.price,
        pricePerClassBase: Math.round(g.price / 8),
        packagePriceBase: Math.round(g.price * 1.5),
        packageClasses: 8,
        status: 'ACTIVE',
        slots: {
          create: g.wd.map((wd) => ({ weekday: wd, startTime: g.time, durationMinutes: 90, courtId: pick(courts, wd).id })),
        },
      },
      include: { slots: true },
    });
    groups.push(created);
  }

  // Alumnos: los primeros 14 clientes.
  const students = [];
  for (let i = 0; i < 14; i += 1) {
    const level = [1.5, 2, 2.5, 3, 3.5, 4, 4.5][i % 7];
    students.push(
      await prisma.clubStudent.create({
        data: {
          restaurantId: C,
          customerId: customers[i].id,
          level,
          accessToken: nanoid(14),
          birthDate: i < 4 ? daysAgo(365 * (8 + i)) : null,
          guardianName: i < 4 ? `Representante de ${customers[i].name.split(' ')[0]}` : null,
          guardianPhone: i < 4 ? phoneFor(i + 50) : null,
          medicalNotes: i === 2 ? 'Asma leve — inhalador en el bolso.' : null,
        },
      }),
    );
  }

  // Inscripciones: llenan los grupos, con mensualidad y con paquete.
  let enrolled = 0;
  for (let i = 0; i < students.length; i += 1) {
    const group = pick(groups, i);
    const active = await prisma.clubEnrollment.count({ where: { groupId: group.id, status: 'ACTIVE' } });
    if (active >= group.capacityMax) {
      await prisma.clubWaitlistEntry.create({
        data: { restaurantId: C, groupId: group.id, studentId: students[i].id, note: 'Quiere entrar apenas se libere' },
      });
      continue;
    }
    const byPackage = i % 3 === 0;
    await prisma.clubEnrollment.create({
      data: {
        restaurantId: C,
        studentId: students[i].id,
        groupId: group.id,
        billingMode: byPackage ? 'PACKAGE' : 'MONTHLY',
        priceBase: Number(group.priceMonthlyBase ?? 60),
        billingDay: 5,
        startsAt: daysAgo(45 - i),
        status: 'ACTIVE',
      },
    });
    enrolled += 1;

    if (byPackage) {
      const price = Number(group.packagePriceBase ?? 90);
      const pkg = await prisma.clubClassPackage.create({
        data: {
          restaurantId: C,
          studentId: students[i].id,
          groupId: group.id,
          slotId: group.slots[0]?.id ?? null,
          name: 'Lote de 8 clases',
          totalClasses: 8,
          priceBase: price,
          pricePerClassBase: Math.round((price / 8) * 100) / 100,
          holdsSeat: true,
          purchasedAt: daysAgo(20),
          expiresAt: new Date(Date.now() + 70 * 86_400_000),
        },
      });
      await prisma.clubAcademyPayment.create({
        data: {
          restaurantId: C,
          studentId: students[i].id,
          kind: 'PACKAGE',
          packageId: pkg.id,
          amountBase: price,
          exchangeRate: RATE,
          amountBs: price * RATE,
          method: pick(ALL_METHODS, i),
          createdAt: daysAgo(20),
        },
      });
      await prisma.clubClassCreditEntry.create({
        data: { restaurantId: C, studentId: students[i].id, delta: 8, reason: 'PACKAGE_PURCHASE', packageId: pkg.id, createdAt: daysAgo(20) },
      });
      // Ya gastó algunas.
      for (let u = 0; u < (i % 4); u += 1) {
        await prisma.clubClassCreditEntry.create({
          data: { restaurantId: C, studentId: students[i].id, delta: -1, reason: 'CLASS_CONSUMED', packageId: pkg.id, createdAt: daysAgo(15 - u * 3) },
        });
      }
    }
  }

  // Dos bajas, para que Retención muestre churn real.
  const toChurn = await prisma.clubEnrollment.findMany({ where: { restaurantId: C, status: 'ACTIVE' }, take: 2 });
  for (const e of toChurn) {
    await prisma.clubEnrollment.update({ where: { id: e.id }, data: { status: 'CANCELLED', endsAt: daysAgo(8) } });
  }

  // Mensualidades: pagadas, pendientes y vencidas.
  const monthlyEnrollments = await prisma.clubEnrollment.findMany({
    where: { restaurantId: C, billingMode: 'MONTHLY', status: 'ACTIVE' },
    include: { student: true },
  });
  const now = new Date();
  let charges = 0;
  let overdue = 0;
  for (const [i, e] of monthlyEnrollments.entries()) {
    for (const back of [1, 0]) {
      const d = new Date(now.getFullYear(), now.getMonth() - back, 5);
      const paid = back === 1 || i % 3 !== 0;
      const charge = await prisma.clubAcademyCharge.create({
        data: {
          restaurantId: C,
          enrollmentId: e.id,
          periodYear: d.getFullYear(),
          periodMonth: d.getMonth() + 1,
          amountBase: e.priceBase,
          dueDate: d,
          status: paid ? 'PAID' : d < now ? 'OVERDUE' : 'PENDING',
        },
      });
      charges += 1;
      if (!paid) overdue += 1;
      if (paid) {
        await prisma.clubAcademyPayment.create({
          data: {
            restaurantId: C,
            studentId: e.studentId,
            kind: 'MONTHLY',
            chargeId: charge.id,
            amountBase: e.priceBase,
            exchangeRate: RATE,
            amountBs: Number(e.priceBase) * RATE,
            method: pick(ALL_METHODS, i + back),
            createdAt: d,
          },
        });
      }
    }
  }

  // Sesiones de academia: 4 semanas atrás (con asistencia) y 4 adelante.
  let sessions = 0;
  for (const group of groups) {
    for (const slot of group.slots) {
      for (let w = -4; w <= 4; w += 1) {
        const base = new Date();
        base.setDate(base.getDate() + w * 7);
        // mover al weekday del slot
        while (caracasPartsOf(base).dayOfWeek !== slot.weekday) base.setDate(base.getDate() + 1);
        const dateStr = caracasPartsOf(base).dateStr;
        const startsAt = atTimeCaracas(dateStr, slot.startTime);
        const endsAt = new Date(startsAt.getTime() + slot.durationMinutes * 60_000);
        const past = endsAt < new Date();

        const block = await prisma.clubCourtBlock
          .create({
            data: { restaurantId: C, courtId: slot.courtId ?? courts[0].id, kind: 'CLASS', startsAt, endsAt, note: group.name },
          })
          .catch(() => null);
        if (!block) continue;

        const coach = coaches.find((c) => c.id === group.coachId)!;
        const session = await prisma.clubClassSession.create({
          data: {
            restaurantId: C,
            blockId: block.id,
            groupId: group.id,
            coachId: group.coachId,
            courtId: slot.courtId ?? courts[0].id,
            startsAt,
            endsAt,
            classType: 'GROUP',
            capacityMin: 2,
            capacityMax: group.capacityMax,
            releaseHoursBefore: 12,
            payType: coach.payType,
            payAmountBase: coach.payAmountBase,
            commissionPercent: coach.commissionPercent,
            status: past ? 'DONE' : 'SCHEDULED',
            coachFeeBase: past ? 15 : null,
          },
        });
        sessions += 1;

        if (past) {
          const inGroup = await prisma.clubEnrollment.findMany({ where: { groupId: group.id, status: 'ACTIVE' }, take: 4 });
          for (const [j, e] of inGroup.entries()) {
            await prisma.clubAttendance.create({
              data: {
                sessionId: session.id,
                studentId: e.studentId,
                status: (w + j) % 7 === 0 ? 'ABSENT' : 'PRESENT',
                consumedValueBase: Math.round((Number(e.priceBase) / 8) * 100) / 100,
              },
            });
          }
        }
      }
    }
  }
  console.log(`  · academia: ${programs.length} programas, ${coaches.length} profes, ${groups.length} grupos, ${enrolled} inscritos, ${sessions} clases, ${charges} mensualidades (${overdue} por cobrar)`);

  // -------------------------------------------------------- jugadores y puntos
  const bcrypt = await import('bcryptjs');
  const hash = await bcrypt.default.hash('Demo1234', 10);
  let accounts = 0;
  for (let i = 0; i < 8; i += 1) {
    await prisma.clubPlayerAccount.create({
      data: {
        restaurantId: C,
        customerId: customers[i].id,
        username: customers[i].name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, ''),
        passwordHash: hash,
        lastLoginAt: daysAgo(i),
      },
    });
    accounts += 1;
  }

  // Puntos por las reservas jugadas.
  const played = await prisma.clubBooking.findMany({
    where: { restaurantId: C, status: 'COMPLETED', customerId: { not: null } },
    select: { id: true, customerId: true, totalBase: true, createdAt: true },
    take: 120,
  });
  for (const b of played) {
    await prisma.clubLoyaltyEntry.create({
      data: {
        restaurantId: C,
        customerId: b.customerId!,
        delta: 10 + Math.round(Number(b.totalBase)),
        reason: 'BOOKING',
        bookingId: b.id,
        amountBase: b.totalBase,
        createdAt: b.createdAt,
      },
    });
  }
  // Un canje, para que el libro no sea solo sumas.
  await prisma.clubLoyaltyEntry.create({
    data: { restaurantId: C, customerId: customers[0].id, delta: -100, reason: 'REDEEM', amountBase: 1, note: 'Canje de 100 puntos', createdAt: daysAgo(5) },
  });

  // Lista negra: uno automático y uno manual.
  await prisma.clubBlacklistEntry.createMany({
    data: [
      { restaurantId: C, phone: phoneFor(21).replace(/\D/g, ''), customerId: customers[21].id, reason: '2 ausencias sin avisar', automatic: true, noShowCount: 2, createdAt: daysAgo(10) },
      { restaurantId: C, phone: phoneFor(22).replace(/\D/g, ''), customerId: customers[22].id, reason: 'Daños a la cancha sin reportar', automatic: false, createdAt: daysAgo(25) },
    ],
  });
  console.log(`  · ${accounts} cuentas de jugador, ${played.length} movimientos de puntos, 2 en lista negra`);

  // ------------------------------------------------- gastos, nómina, inventario
  const suppliers = [];
  for (const n of ['Distribuidora Deportiva CA', 'Bebidas del Este', 'Mantenimiento Pádel Pro']) {
    suppliers.push(
      (await prisma.supplier.findFirst({ where: { restaurantId: C, name: n } })) ??
        (await prisma.supplier.create({ data: { restaurantId: C, name: n, phone: '04120000000' } })),
    );
  }

  const expenses: { cat: 'UTILITIES' | 'SUPPLIES' | 'RENT' | 'MAINTENANCE' | 'MARKETING' | 'ADMINISTRATIVE'; desc: string; amount: number }[] = [
    { cat: 'UTILITIES', desc: 'Electricidad — iluminación de canchas', amount: 180 },
    { cat: 'UTILITIES', desc: 'Agua', amount: 45 },
    { cat: 'SUPPLIES', desc: 'Compra de pelotas y grips', amount: 220 },
    { cat: 'RENT', desc: 'Alquiler del local', amount: 800 },
    { cat: 'MAINTENANCE', desc: 'Cambio de red Cancha 2', amount: 120 },
    { cat: 'MAINTENANCE', desc: 'Limpieza de cristales', amount: 60 },
    { cat: 'MARKETING', desc: 'Pauta en redes', amount: 90 },
    { cat: 'ADMINISTRATIVE', desc: 'Internet y sistema', amount: 55 },
  ];
  for (const [i, e] of expenses.entries()) {
    await prisma.movement.create({
      data: {
        restaurantId: C,
        type: 'EXPENSE',
        category: e.cat,
        amountBase: e.amount,
        description: e.desc,
        paymentMethod: pick(ALL_METHODS, i),
        supplierId: i % 3 === 0 ? pick(suppliers, i).id : null,
        expenseDate: daysAgo(i * 3 + 1),
        isCredit: i === 2,
        createdAt: daysAgo(i * 3 + 1),
      },
    });
  }

  const employees = [];
  for (const [i, e] of [
    { name: 'Rosa Jiménez', position: 'Recepción', salary: 180 },
    { name: 'Pedro Suárez', position: 'Mantenimiento', salary: 150 },
    { name: 'Luisa Ortega', position: 'Barra', salary: 160 },
  ].entries()) {
    const emp = await prisma.employee.create({
      data: { restaurantId: C, name: e.name, position: e.position, phone: phoneFor(60 + i), salaryBase: e.salary },
    });
    employees.push(emp);
    for (const back of [1, 0]) {
      await prisma.employeePayment.create({
        data: {
          restaurantId: C,
          employeeId: emp.id,
          amountBase: e.salary,
          periodLabel: back === 1 ? 'Mes pasado' : 'Este mes',
          paymentMethod: pick(ALL_METHODS, i + back),
          paidAt: daysAgo(back * 30 + 2),
        },
      });
    }
  }

  if ((await prisma.inventoryItem.count({ where: { restaurantId: C } })) === 0) {
    await prisma.inventoryItem.createMany({
      data: [
        { restaurantId: C, name: 'Pelotas de pádel', unit: 'tubo', quantity: 18, minQuantity: 12, pricePerUnitBase: 8 },
        { restaurantId: C, name: 'Grips', unit: 'unidad', quantity: 6, minQuantity: 15, pricePerUnitBase: 2.2 },
        { restaurantId: C, name: 'Agua 600ml', unit: 'unidad', quantity: 140, minQuantity: 48, pricePerUnitBase: 0.8 },
        { restaurantId: C, name: 'Bombillos LED cancha', unit: 'unidad', quantity: 3, minQuantity: 6, pricePerUnitBase: 25 },
      ],
    });
  }
  console.log(`  · ${expenses.length} gastos, ${employees.length} en nómina, inventario con alertas`);

  // ------------------------------------------------------------------ resumen
  const totals = await Promise.all([
    prisma.clubBooking.count({ where: { restaurantId: C } }),
    prisma.shopSale.count({ where: { restaurantId: C } }),
    prisma.clubAcademyPayment.count({ where: { restaurantId: C } }),
    prisma.customer.count({ where: { restaurantId: C } }),
    prisma.clubBookingPayment.count({ where: { booking: { restaurantId: C } } }),
  ]);

  console.log(`
✅ Demo del club lista.

   Reservas: ${totals[0]}   ·   Ventas de tienda: ${totals[1]}   ·   Cobros de academia: ${totals[2]}
   Clientes: ${totals[3]}   ·   Cobros de cancha: ${totals[4]}

   QR SIEMPRE VÁLIDOS para la tablet (se deslizan solos):
     ${DEMO_LIVE_TOKENS.map((t) => `/acceso/${t}`).join('\n     ')}
`);
}

main()
  .catch((e) => {
    console.error('\n❌', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
