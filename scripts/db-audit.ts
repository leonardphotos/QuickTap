/**
 * Auditoría de basura en la base de datos (SOLO LECTURA).
 *
 *   npx ts-node --transpile-only -P tsconfig.json scripts/db-audit.ts
 *
 * Lista candidatos a limpieza sin borrar nada: registros que quedaron colgando de flujos
 * abandonados, datos de prueba, tablas vacías y archivos subidos que ya nadie referencia.
 * Lo que salga de acá se revisa a mano antes de tocar producción — nunca al revés.
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

async function main() {
  const rows: { concepto: string; cantidad: number; detalle: string }[] = [];
  const add = (concepto: string, cantidad: number, detalle = '') => rows.push({ concepto, cantidad, detalle });

  // --- Restaurantes: demo y cuentas nunca usadas -----------------------------------------
  const demos = await prisma.restaurant.findMany({
    where: { isDemo: true },
    select: { id: true, slug: true, name: true, createdAt: true },
  });
  add('Restaurantes demo', demos.length, demos.map((d) => d.slug).join(', '));

  const emptyRestaurants = await prisma.restaurant.findMany({
    where: { isDemo: false, orders: { none: {} }, shopSales: { none: {} }, createdAt: { lt: daysAgo(60) } },
    select: { id: true, slug: true, name: true, createdAt: true },
  });
  add(
    'Restaurantes sin una sola venta (>60 días)',
    emptyRestaurants.length,
    emptyRestaurants.map((r) => `${r.slug} (${r.createdAt.toISOString().slice(0, 10)})`).join(', '),
  );

  // --- Pedidos y sesiones colgadas -------------------------------------------------------
  add(
    'Pedidos CANCELADOS de más de 6 meses',
    await prisma.order.count({ where: { status: 'CANCELLED', createdAt: { lt: daysAgo(180) } } }),
  );
  add(
    'Pedidos de pruebas de carga (Estrés/Contención/QA)',
    await prisma.order.count({
      where: {
        OR: [
          { customerName: { startsWith: 'Estrés' } },
          { customerName: { startsWith: 'Contención' } },
          { customerName: 'Cliente QA' },
        ],
      },
    }),
  );
  add(
    'Cuentas de mesa abiertas hace más de 30 días',
    await prisma.tableSession.count({ where: { status: 'OPEN', openedAt: { lt: daysAgo(30) } } }),
  );
  add(
    'Cajas abiertas hace más de 30 días',
    await prisma.cashSession.count({ where: { status: 'OPEN', openedAt: { lt: daysAgo(30) } } }),
  );

  // --- Solicitudes y verificaciones vencidas ---------------------------------------------
  add(
    'Solicitudes de plan pendientes de más de 90 días',
    await prisma.planRequest.count({ where: { status: 'PENDING', createdAt: { lt: daysAgo(90) } } }),
  );
  add(
    'Verificaciones de teléfono vencidas (club)',
    await prisma.clubPhoneVerification.count({ where: { expiresAt: { lt: new Date() } } }),
  );

  // --- Catálogo huérfano -----------------------------------------------------------------
  // Customer no tiene relación directa con Order (el pedido guarda el teléfono congelado):
  // se cuentan los que no aparecen en ninguna venta ni reserva del club.
  const customers = await prisma.customer.findMany({ select: { id: true, phone: true, restaurantId: true } });
  const phonesWithOrders = new Set(
    (
      await prisma.order.findMany({
        where: { customerPhone: { not: null } },
        select: { restaurantId: true, customerPhone: true },
        distinct: ['restaurantId', 'customerPhone'],
      })
    ).map((o) => `${o.restaurantId}:${o.customerPhone}`),
  );
  add(
    'Clientes del CRM que nunca compraron',
    customers.filter((c) => !phonesWithOrders.has(`${c.restaurantId}:${c.phone}`)).length,
  );
  add(
    'Promociones vencidas hace más de 6 meses',
    await prisma.promotion.count({ where: { endsAt: { lt: daysAgo(180) } } }),
  );

  // --- Archivos subidos sin referencia ---------------------------------------------------
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (fs.existsSync(uploadsDir)) {
    const referenced = new Set<string>();
    const collect = (value?: string | null) => {
      if (value) referenced.add(path.basename(value));
    };

    const [products, restaurants, items, movements, plans, shopProducts, orderPayments, paymentOrders, clubPayments] =
      await Promise.all([
      prisma.product.findMany({ select: { photoUrl: true } }),
      prisma.restaurant.findMany({ select: { logoUrl: true, fullscreenImageUrl: true } }),
      prisma.inventoryItem.findMany({ select: { photoUrl: true } }),
      prisma.movement.findMany({ select: { receiptImageUrl: true, quoteImageUrl: true, paymentProofImageUrl: true } }),
      prisma.planRequestPayment.findMany({ select: { proofImageUrl: true } }),
      prisma.shopProduct.findMany({ select: { photoUrl: true } }),
      prisma.orderPayment.findMany({ select: { proofImageUrl: true } }),
        prisma.paymentOrder.findMany({ select: { attachments: true } }),
        prisma.clubBookingPayment.findMany({ select: { proofImageUrl: true } }),
      ]);
    products.forEach((p) => collect(p.photoUrl));
    restaurants.forEach((r) => {
      collect(r.logoUrl);
      collect(r.fullscreenImageUrl);
    });
    items.forEach((i) => collect(i.photoUrl));
    movements.forEach((m) => {
      collect(m.receiptImageUrl);
      collect(m.quoteImageUrl);
      collect(m.paymentProofImageUrl);
    });
    plans.forEach((p) => collect(p.proofImageUrl));
    shopProducts.forEach((p) => collect(p.photoUrl));
    orderPayments.forEach((p) => collect(p.proofImageUrl));
    clubPayments.forEach((p) => collect(p.proofImageUrl));
    paymentOrders.forEach((o) => {
      if (Array.isArray(o.attachments)) {
        for (const a of o.attachments as { url?: string }[]) collect(a?.url);
      }
    });

    let orphanFiles = 0;
    let orphanBytes = 0;
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (!referenced.has(entry.name)) {
          orphanFiles += 1;
          orphanBytes += fs.statSync(full).size;
        }
      }
    };
    walk(uploadsDir);
    add('Archivos en uploads/ sin referencia en la base', orphanFiles, `${(orphanBytes / 1024 / 1024).toFixed(1)} MB`);
  }

  console.log('\n── Candidatos a limpieza ──');
  for (const r of rows) {
    if (r.cantidad === 0) continue;
    console.log(`${String(r.cantidad).padStart(6)}  ${r.concepto}${r.detalle ? `\n         ${r.detalle.slice(0, 200)}` : ''}`);
  }
  const nada = rows.every((r) => r.cantidad === 0);
  if (nada) console.log('  (nada que limpiar)');

  await prisma.$disconnect();
}

main();
