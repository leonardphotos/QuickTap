import { Currency, OrderChannel, OrderStatus, PaymentMethod, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

const prisma = new PrismaClient();

/**
 * Semilla de demostración: un restaurante "Demo" con historial real de
 * ventas (últimos 21 días + hoy), usuarios de todos los roles, mesas con
 * sesiones abiertas/cerradas y pedidos de los 3 canales (mesa, delivery,
 * pickup). Pensado para mostrar el producto sin depender de datos reales.
 *
 * Uso: npm run seed:demo
 */

const DEMO_SLUG = 'demo';
const DEMO_PASSWORD = 'Demo1234';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function pickMany<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function main() {
  // eslint-disable-next-line no-console
  console.log('🌱 Sembrando restaurante Demo…');

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const restaurant = await prisma.restaurant.upsert({
    where: { slug: DEMO_SLUG },
    update: {},
    create: {
      slug: DEMO_SLUG,
      name: 'Restaurante Demo',
      description: 'Cocina de autor con toques criollos. Cuenta demo de QuickTap.',
      baseCurrency: 'USD',
      whatsappPhone: '584241234567',
      serviceChargeEnabled: true,
      ivaEnabled: true,
      orderingEnabled: true,
      subscriptionStatus: 'ACTIVE',
      subscriptionPlan: 'PRO',
      billingCycle: 'MONTHLY',
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      theme: {
        bannerColor: '#001B43',
        primary: '#E63946',
      },
    },
  });

  // --- Usuarios: uno por rol, todos con la misma contraseña de demo ---
  const usersToCreate: { email: string; name: string; role: 'OWNER' | 'ADMIN' | 'CASHIER' | 'WAITER' | 'KITCHEN' | 'SCREEN' }[] = [
    { email: 'demo@quicktap.club', name: 'Dueño Demo', role: 'OWNER' },
    { email: 'admin.demo@quicktap.club', name: 'Admin Demo', role: 'ADMIN' },
    { email: 'cajero.demo@quicktap.club', name: 'Cajero Demo', role: 'CASHIER' },
    { email: 'mesero.demo@quicktap.club', name: 'Mesero Demo', role: 'WAITER' },
    { email: 'cocina.demo@quicktap.club', name: 'Cocina Demo', role: 'KITCHEN' },
    { email: 'pantalla.demo@quicktap.club', name: 'Pantalla Demo', role: 'SCREEN' },
  ];

  for (const u of usersToCreate) {
    await prisma.user.upsert({
      where: { restaurantId_email: { restaurantId: restaurant.id, email: u.email } },
      update: {},
      create: { restaurantId: restaurant.id, email: u.email, name: u.name, role: u.role, passwordHash },
    });
  }

  // --- Categorías + productos ---
  const categoriesData = [
    { name: 'Entradas', priority: 1 },
    { name: 'Platos Principales', priority: 2 },
    { name: 'Postres', priority: 3 },
    { name: 'Bebidas', priority: 4 },
  ];

  const categories: Record<string, string> = {};
  for (const c of categoriesData) {
    const existing = await prisma.category.findFirst({ where: { restaurantId: restaurant.id, name: c.name } });
    const category =
      existing ??
      (await prisma.category.create({ data: { restaurantId: restaurant.id, name: c.name, priority: c.priority } }));
    categories[c.name] = category.id;
  }

  const productsData: {
    category: string;
    name: string;
    description: string;
    price: string;
    isStar?: boolean;
    isPromo?: boolean;
    isHouseSpecial?: boolean;
  }[] = [
    { category: 'Entradas', name: 'Tequeños (x6)', description: 'Palitos de queso crujientes.', price: '5.00', isHouseSpecial: true },
    { category: 'Entradas', name: 'Empanadas Mixtas', description: 'Carne, pollo y queso.', price: '4.50' },
    { category: 'Entradas', name: 'Ceviche de Camarón', description: 'Cítricos, cebolla morada, cilantro.', price: '8.50', isStar: true },
    { category: 'Platos Principales', name: 'Parrilla Mixta', description: 'Res, pollo, cerdo y chorizo.', price: '18.50', isStar: true },
    { category: 'Platos Principales', name: 'Pabellón Criollo', description: 'Carne mechada, caraotas, arroz, tajadas.', price: '9.90', isPromo: true },
    { category: 'Platos Principales', name: 'Pasta Alfredo', description: 'Fettuccine, pollo, salsa cremosa.', price: '11.00' },
    { category: 'Platos Principales', name: 'Pescado a la Plancha', description: 'Con vegetales salteados.', price: '13.50', isHouseSpecial: true },
    { category: 'Postres', name: 'Tres Leches', description: 'Clásico venezolano.', price: '4.00' },
    { category: 'Postres', name: 'Quesillo', description: 'Flan de caramelo casero.', price: '3.50', isPromo: true },
    { category: 'Bebidas', name: 'Jugo Natural', description: 'Parchita, mango o guayaba.', price: '2.50' },
    { category: 'Bebidas', name: 'Refresco', description: '355ml.', price: '1.50' },
    { category: 'Bebidas', name: 'Cerveza Nacional', description: '355ml, bien fría.', price: '3.00', isStar: true },
  ];

  const products: { id: string; price: string }[] = [];
  for (const p of productsData) {
    const existing = await prisma.product.findFirst({ where: { restaurantId: restaurant.id, name: p.name } });
    const product =
      existing ??
      (await prisma.product.create({
        data: {
          restaurantId: restaurant.id,
          categoryId: categories[p.category],
          name: p.name,
          description: p.description,
          price: p.price,
          isStar: p.isStar ?? false,
          isPromo: p.isPromo ?? false,
          isHouseSpecial: p.isHouseSpecial ?? false,
        },
      }));
    products.push({ id: product.id, price: p.price });
  }

  // --- Zonas + mesas ---
  const zonesData = [
    { name: 'Salón Principal', priority: 1, tables: ['1', '2', '3', '4'] },
    { name: 'Terraza', priority: 2, tables: ['Terraza-1', 'Terraza-2'] },
    { name: 'Barra', priority: 3, tables: ['Barra-1'] },
  ];

  const tableIds: string[] = [];
  for (const z of zonesData) {
    const existingZone = await prisma.zone.findFirst({ where: { restaurantId: restaurant.id, name: z.name } });
    const zone =
      existingZone ??
      (await prisma.zone.create({ data: { restaurantId: restaurant.id, name: z.name, priority: z.priority } }));

    for (const number of z.tables) {
      const existingTable = await prisma.table.findFirst({ where: { restaurantId: restaurant.id, number } });
      const table =
        existingTable ??
        (await prisma.table.create({
          data: { restaurantId: restaurant.id, zoneId: zone.id, number, qrToken: nanoid(12) },
        }));
      tableIds.push(table.id);
    }
  }

  // --- Tasa BCV vigente (o respaldo si aún no se ha refrescado) ---
  const rate = await prisma.exchangeRate.findUnique({ where: { currency: 'USD' } });
  const rateBs = rate ? Number(rate.rateBs) : 40.5;

  // --- Pedidos: solo se generan si el restaurante todavía no tiene historial ---
  const existingOrders = await prisma.order.count({ where: { restaurantId: restaurant.id } });
  if (existingOrders > 0) {
    // eslint-disable-next-line no-console
    console.log(`↷ Ya hay ${existingOrders} pedidos en Demo, se omite la generación de historial.`);
  } else {
    let orderNumber = 1;
    const customerNames = ['Carlos Pérez', 'María Gómez', 'Luis Rodríguez', 'Ana Torres', 'José Martínez', 'Valentina Díaz'];
    const deliveryAddresses = ['Av. Francisco de Miranda, Chacao', 'Calle Madrid, Las Mercedes', 'Av. Libertador, La Campiña'];

    function randomItems() {
      const chosen = pickMany(products, randomInt(1, 4));
      return chosen.map((p) => {
        const quantity = randomInt(1, 3);
        const unitPrice = Number(p.price);
        return { productId: p.id, quantity, unitPrice, lineTotal: round2(unitPrice * quantity) };
      });
    }

    function charges(subtotalBase: number) {
      const serviceChargeBase = round2(subtotalBase * 0.1);
      const ivaBase = round2(subtotalBase * 0.16);
      const totalBase = round2(subtotalBase + serviceChargeBase + ivaBase);
      return { serviceChargeBase, ivaBase, totalBase };
    }

    async function createOrder(opts: {
      createdAt: Date;
      channel: OrderChannel;
      status: OrderStatus;
      tableId?: string;
      tableSessionId?: string;
      customerName: string;
      customerIdNumber?: string;
      customerPhone?: string;
      customerAddress?: string;
      paymentMethod?: PaymentMethod;
    }) {
      const items = randomItems();
      const subtotalBase = round2(items.reduce((acc, i) => acc + i.lineTotal, 0));
      const { serviceChargeBase, ivaBase, totalBase } = charges(subtotalBase);
      const totalBs = round2(totalBase * rateBs);

      const productNames = await prisma.product.findMany({
        where: { id: { in: items.map((i) => i.productId) } },
        select: { id: true, name: true },
      });
      const nameById = new Map(productNames.map((p) => [p.id, p.name]));

      await prisma.order.create({
        data: {
          restaurantId: restaurant.id,
          orderNumber: orderNumber++,
          channel: opts.channel,
          status: opts.status,
          tableId: opts.tableId,
          tableSessionId: opts.tableSessionId,
          currency: 'USD' as Currency,
          subtotalBase,
          serviceChargeBase,
          ivaBase,
          totalBase,
          exchangeRate: rateBs,
          totalBs,
          customerName: opts.customerName,
          customerIdNumber: opts.customerIdNumber,
          customerPhone: opts.customerPhone,
          customerAddress: opts.customerAddress,
          paymentMethod: opts.paymentMethod,
          createdAt: opts.createdAt,
          updatedAt: opts.createdAt,
          items: {
            create: items.map((i) => ({
              productId: i.productId,
              productName: nameById.get(i.productId) ?? 'Producto',
              unitPrice: i.unitPrice,
              quantity: i.quantity,
              lineTotal: i.lineTotal,
              modifiers: [],
            })),
          },
        },
      });
    }

    const DAYS_OF_HISTORY = 21;
    const now = new Date();

    for (let dayOffset = DAYS_OF_HISTORY; dayOffset >= 1; dayOffset--) {
      const day = new Date(now);
      day.setDate(day.getDate() - dayOffset);

      // Visitas en mesa: cada una es una sesión cerrada con 1-2 pedidos.
      const dineInVisits = randomInt(2, 4);
      for (let v = 0; v < dineInVisits; v++) {
        const tableId = pick(tableIds);
        const openedAt = new Date(day);
        openedAt.setHours(randomInt(12, 20), randomInt(0, 59), 0, 0);
        const customerName = pick(customerNames);

        const session = await prisma.tableSession.create({
          data: {
            restaurantId: restaurant.id,
            tableId,
            customerName,
            customerIdNumber: `V-${randomInt(10000000, 29999999)}`,
            status: 'CLOSED',
            openedAt,
            closedAt: new Date(openedAt.getTime() + randomInt(30, 90) * 60 * 1000),
          },
        });

        const ordersInVisit = randomInt(1, 2);
        for (let o = 0; o < ordersInVisit; o++) {
          const createdAt = new Date(openedAt.getTime() + o * 10 * 60 * 1000);
          await createOrder({
            createdAt,
            channel: 'DINE_IN',
            status: 'SERVED',
            tableId,
            tableSessionId: session.id,
            customerName,
            customerIdNumber: session.customerIdNumber,
          });
        }
      }

      // Delivery/Pickup del día.
      const deliveryOrders = randomInt(1, 3);
      for (let d = 0; d < deliveryOrders; d++) {
        const createdAt = new Date(day);
        createdAt.setHours(randomInt(11, 21), randomInt(0, 59), 0, 0);
        const isDelivery = Math.random() > 0.35;
        await createOrder({
          createdAt,
          channel: isDelivery ? 'DELIVERY' : 'PICKUP',
          status: Math.random() > 0.08 ? 'SERVED' : 'CANCELLED',
          customerName: pick(customerNames),
          customerPhone: `0414${randomInt(1000000, 9999999)}`,
          customerAddress: isDelivery ? pick(deliveryAddresses) : undefined,
          paymentMethod: pick(['MOBILE_PAYMENT', 'ZELLE', 'CASH', 'CARD'] as PaymentMethod[]),
        });
      }
    }

    // --- Actividad de HOY para que Cocina / Órdenes de Mesa / Delivery tengan algo en vivo ---
    const [tableA, tableB] = tableIds;
    const sessionA = await prisma.tableSession.create({
      data: {
        restaurantId: restaurant.id,
        tableId: tableA,
        customerName: 'Carlos Pérez',
        customerIdNumber: 'V-20111222',
        status: 'OPEN',
        openedAt: new Date(now.getTime() - 25 * 60 * 1000),
      },
    });
    await createOrder({
      createdAt: new Date(now.getTime() - 25 * 60 * 1000),
      channel: 'DINE_IN',
      status: 'KITCHEN',
      tableId: tableA,
      tableSessionId: sessionA.id,
      customerName: 'Carlos Pérez',
      customerIdNumber: 'V-20111222',
    });

    const sessionB = await prisma.tableSession.create({
      data: {
        restaurantId: restaurant.id,
        tableId: tableB,
        customerName: 'Valentina Díaz',
        customerIdNumber: 'V-19888777',
        status: 'OPEN',
        openedAt: new Date(now.getTime() - 10 * 60 * 1000),
      },
    });
    await createOrder({
      createdAt: new Date(now.getTime() - 10 * 60 * 1000),
      channel: 'DINE_IN',
      status: 'PENDING',
      tableId: tableB,
      tableSessionId: sessionB.id,
      customerName: 'Valentina Díaz',
      customerIdNumber: 'V-19888777',
    });

    await createOrder({
      createdAt: new Date(now.getTime() - 15 * 60 * 1000),
      channel: 'DELIVERY',
      status: 'KITCHEN',
      customerName: 'María Gómez',
      customerPhone: '584141234567',
      customerAddress: pick(deliveryAddresses),
      paymentMethod: 'MOBILE_PAYMENT',
    });
    await createOrder({
      createdAt: new Date(now.getTime() - 5 * 60 * 1000),
      channel: 'PICKUP',
      status: 'PENDING',
      customerName: 'Luis Rodríguez',
      customerPhone: '584241234567',
      paymentMethod: 'CASH',
    });

    // Un par de ventas ya servidas hoy, para que "Ventas de hoy" no quede en cero.
    for (let i = 0; i < 3; i++) {
      await createOrder({
        createdAt: new Date(now.getTime() - randomInt(60, 300) * 60 * 1000),
        channel: 'DINE_IN',
        status: 'SERVED',
        tableId: pick(tableIds),
        customerName: pick(customerNames),
        customerIdNumber: `V-${randomInt(10000000, 29999999)}`,
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log(`✅ Demo lista. Restaurante público: /r/${restaurant.slug}`);
  // eslint-disable-next-line no-console
  console.log(`   Ingresa al panel en /admin/login con cualquiera de estos correos (contraseña: ${DEMO_PASSWORD}):`);
  for (const u of usersToCreate) {
    // eslint-disable-next-line no-console
    console.log(`   - ${u.email} (${u.role})`);
  }
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
