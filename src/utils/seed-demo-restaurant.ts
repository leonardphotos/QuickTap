import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

/**
 * Entorno Demo Efímero: borra por completo el restaurante demo (si existe) y lo
 * vuelve a crear desde cero, siempre idéntico — marca ficticia "Big Bite
 * Burgers" (NO la marca real de McDonald's: usar el nombre/logo/colores de una
 * marca registrada en un demo público de un producto no afiliado sería
 * infracción de marca), menú con fotos/variantes/modificadores, un año de
 * historial realista (pedidos, movimientos de caja, cajas abiertas/cerradas)
 * y actividad "de hoy" en todas las etapas del flujo (cocina, comanda
 * esperando pago, delivery despachado).
 *
 * Se usa tanto desde el script CLI (`npm run seed:demo`, ver prisma/seed-demo.ts)
 * como desde `demoResetService.reset()` — misma lógica, un solo lugar.
 */

export const DEMO_SLUG = 'demo';
export const DEMO_PASSWORD = 'Demo1234';

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

export async function resetAndSeedDemoRestaurant(prisma: PrismaClient): Promise<void> {
  // Requerimiento 1: elimina todo lo que tenga el restaurante demo actual —
  // la cascada del schema (onDelete: Cascade en prácticamente todas las
  // relaciones hijas de Restaurant) se lleva pedidos, productos, equipo,
  // movimientos, cajas, mesas, todo, de un solo golpe.
  await prisma.restaurant.deleteMany({ where: { slug: DEMO_SLUG } });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const restaurant = await prisma.restaurant.create({
    data: {
      slug: DEMO_SLUG,
      name: 'Big Bite Burgers',
      description:
        'Restaurante de demostración de QuickTap — datos ficticios que se reinician automáticamente. Explora libremente: nada de lo que hagas aquí es permanente.',
      logoUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80',
      fullscreenImageUrl: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?auto=format&fit=crop&w=1600&q=80',
      baseCurrency: 'USD',
      whatsappPhone: '584241234567',
      theme: {
        primary: '#DA291C',
        accent: '#FFC72C',
        text: '#1a1a1a',
        buttonText: '#ffffff',
      },
      serviceChargeEnabled: true,
      ivaEnabled: true,
      orderingEnabled: true,
      isDemo: true,
      // Recién creado: cuenta como "actividad reciente" para que el barrido de
      // inactividad (server.ts) no lo vuelva a resetear antes de que alguien
      // llegue a usarlo.
      demoLastActivityAt: new Date(),
      subscriptionStatus: 'ACTIVE',
      subscriptionPlan: 'PRO',
      billingCycle: 'MONTHLY',
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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
  const usersByRole: Record<string, string> = {};
  for (const u of usersToCreate) {
    const user = await prisma.user.create({
      data: { restaurantId: restaurant.id, email: u.email, name: u.name, role: u.role, passwordHash },
    });
    usersByRole[u.role] = user.id;
  }

  // --- Categorías ---
  const categoriesData = [
    { name: 'Hamburguesas', priority: 1 },
    { name: 'Combos', priority: 2 },
    { name: 'Acompañantes', priority: 3 },
    { name: 'Bebidas', priority: 4 },
    { name: 'Postres', priority: 5 },
  ];
  const categories: Record<string, string> = {};
  for (const c of categoriesData) {
    const category = await prisma.category.create({ data: { restaurantId: restaurant.id, name: c.name, priority: c.priority } });
    categories[c.name] = category.id;
  }

  // --- Categorías de modificadores reutilizables ---
  const extrasCategory = await prisma.modifierCategory.create({
    data: { restaurantId: restaurant.id, name: 'Extras', isRequired: false, allowMultiple: true, maxSelections: 5, priority: 1 },
  });
  const sinCategory = await prisma.modifierCategory.create({
    data: { restaurantId: restaurant.id, name: 'Sin', isRequired: false, allowMultiple: true, priority: 2 },
  });
  const puntoCategory = await prisma.modifierCategory.create({
    data: { restaurantId: restaurant.id, name: 'Término de la carne', isRequired: true, allowMultiple: false, priority: 0 },
  });

  const extrasModifiers = [
    { name: 'Queso cheddar extra', priceBase: '1.00' },
    { name: 'Tocineta', priceBase: '1.50' },
    { name: 'Aguacate', priceBase: '1.50' },
    { name: 'Huevo frito', priceBase: '1.00' },
    { name: 'Aro de cebolla', priceBase: '0.75' },
  ];
  for (const m of extrasModifiers) {
    await prisma.modifier.create({ data: { restaurantId: restaurant.id, categoryId: extrasCategory.id, name: m.name, priceBase: m.priceBase } });
  }
  const sinModifiers = ['Sin cebolla', 'Sin pepinillo', 'Sin tomate', 'Sin lechuga', 'Sin mayonesa'];
  for (const name of sinModifiers) {
    await prisma.modifier.create({ data: { restaurantId: restaurant.id, categoryId: sinCategory.id, name } });
  }
  const puntoModifiers = ['Término medio', 'Tres cuartos', 'Bien cocida'];
  for (const name of puntoModifiers) {
    await prisma.modifier.create({ data: { restaurantId: restaurant.id, categoryId: puntoCategory.id, name } });
  }

  // --- Productos ---
  interface ProductSeed {
    category: string;
    name: string;
    description: string;
    price: string;
    photoUrl: string;
    isStar?: boolean;
    isPromo?: boolean;
    isHouseSpecial?: boolean;
    variants?: { name: string; priceBase: string }[];
    modifierCategoryIds?: string[];
  }

  const productsData: ProductSeed[] = [
    {
      category: 'Hamburguesas',
      name: 'Big Bite Clásica',
      description: 'Carne de res, queso cheddar, lechuga, tomate y salsa especial.',
      price: '6.50',
      photoUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80',
      isStar: true,
      variants: [
        { name: 'Sencilla', priceBase: '6.50' },
        { name: 'Doble', priceBase: '8.90' },
        { name: 'Triple', priceBase: '10.90' },
      ],
      modifierCategoryIds: [extrasCategory.id, sinCategory.id, puntoCategory.id],
    },
    {
      category: 'Hamburguesas',
      name: 'BBQ Bacon',
      description: 'Carne de res, tocineta crocante, cheddar y salsa BBQ ahumada.',
      price: '7.90',
      photoUrl: 'https://images.unsplash.com/photo-1552056776-9b5657118ca4?auto=format&fit=crop&w=800&q=80',
      isHouseSpecial: true,
      variants: [
        { name: 'Sencilla', priceBase: '7.90' },
        { name: 'Doble', priceBase: '10.20' },
      ],
      modifierCategoryIds: [extrasCategory.id, sinCategory.id, puntoCategory.id],
    },
    {
      category: 'Hamburguesas',
      name: 'Pollo Crocante',
      description: 'Pechuga de pollo empanizada, lechuga, mayonesa de la casa.',
      price: '6.90',
      photoUrl: 'https://images.unsplash.com/photo-1606755962773-d324e0a13086?auto=format&fit=crop&w=800&q=80',
      modifierCategoryIds: [extrasCategory.id, sinCategory.id],
    },
    {
      category: 'Hamburguesas',
      name: 'Veggie Deluxe',
      description: 'Medallón de vegetales, aguacate, brotes y salsa vegana.',
      price: '6.90',
      photoUrl: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80',
      isPromo: true,
      modifierCategoryIds: [extrasCategory.id, sinCategory.id],
    },
    {
      category: 'Combos',
      name: 'Combo Big Bite',
      description: 'Big Bite Clásica + papas medianas + bebida.',
      price: '9.90',
      photoUrl: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80',
      isStar: true,
    },
    {
      category: 'Combos',
      name: 'Combo BBQ Bacon',
      description: 'BBQ Bacon + papas grandes + bebida.',
      price: '11.50',
      photoUrl: 'https://images.unsplash.com/photo-1576107232684-1279f390859f?auto=format&fit=crop&w=800&q=80',
    },
    {
      category: 'Acompañantes',
      name: 'Papas Fritas',
      description: 'Crocantes por fuera, suaves por dentro.',
      price: '2.90',
      photoUrl: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=800&q=80',
      variants: [
        { name: 'Pequeña', priceBase: '2.90' },
        { name: 'Mediana', priceBase: '3.90' },
        { name: 'Grande', priceBase: '4.90' },
      ],
      modifierCategoryIds: [extrasCategory.id],
    },
    {
      category: 'Acompañantes',
      name: 'Aros de Cebolla',
      description: 'Empanizados y crocantes, con salsa ranch.',
      price: '3.50',
      photoUrl: 'https://images.unsplash.com/photo-1639024471283-03518883512d?auto=format&fit=crop&w=800&q=80',
    },
    {
      category: 'Bebidas',
      name: 'Refresco',
      description: '473ml, a elegir.',
      price: '1.80',
      photoUrl: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=800&q=80',
    },
    {
      category: 'Bebidas',
      name: 'Batido',
      description: 'Chocolate, vainilla o fresa.',
      price: '3.20',
      photoUrl: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=800&q=80',
      isPromo: true,
    },
    {
      category: 'Postres',
      name: 'Helado Suave',
      description: 'Vainilla o chocolate, en barquilla.',
      price: '2.20',
      photoUrl: 'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?auto=format&fit=crop&w=800&q=80',
    },
    {
      category: 'Postres',
      name: 'Brownie con Helado',
      description: 'Brownie tibio con bola de helado de vainilla.',
      price: '3.90',
      photoUrl: 'https://images.unsplash.com/photo-1607013251379-e6eecfffe234?auto=format&fit=crop&w=800&q=80',
      isHouseSpecial: true,
    },
  ];

  const products: { id: string; price: string }[] = [];
  for (const p of productsData) {
    const product = await prisma.product.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: categories[p.category],
        name: p.name,
        description: p.description,
        price: p.price,
        photoUrl: p.photoUrl,
        isStar: p.isStar ?? false,
        isPromo: p.isPromo ?? false,
        isHouseSpecial: p.isHouseSpecial ?? false,
        pricingMode: p.variants ? 'VARIANTS' : 'SIMPLE',
      },
    });
    if (p.variants) {
      for (const v of p.variants) {
        await prisma.productVariant.create({
          data: { restaurantId: restaurant.id, productId: product.id, name: v.name, priceBase: v.priceBase },
        });
      }
    }
    if (p.modifierCategoryIds) {
      for (const modifierCategoryId of p.modifierCategoryIds) {
        await prisma.productModifierCategory.create({
          data: { productId: product.id, modifierCategoryId },
        });
      }
    }
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
    const zone = await prisma.zone.create({ data: { restaurantId: restaurant.id, name: z.name, priority: z.priority } });
    for (const number of z.tables) {
      const table = await prisma.table.create({
        data: { restaurantId: restaurant.id, zoneId: zone.id, number, qrToken: nanoid(12) },
      });
      tableIds.push(table.id);
    }
  }

  // --- Equipo de delivery ---
  const couriersData = [
    { name: 'Pedro Ramírez', whatsappPhone: '584121112233' },
    { name: 'Génesis Blanco', whatsappPhone: '584241234455' },
    { name: 'Wilmer Suárez', whatsappPhone: '584161239988' },
  ];
  const couriers: { id: string }[] = [];
  for (const c of couriersData) {
    const courier = await prisma.deliveryCourier.create({ data: { restaurantId: restaurant.id, name: c.name, whatsappPhone: c.whatsappPhone } });
    couriers.push({ id: courier.id });
  }

  // --- Tasa BCV vigente (o respaldo si aún no se ha refrescado) ---
  const rate = await prisma.exchangeRate.findUnique({ where: { currency: 'USD' } });
  const rateBs = rate ? Number(rate.rateBs) : 40.5;

  let orderNumber = 1;
  const customerNames = ['Carlos Pérez', 'María Gómez', 'Luis Rodríguez', 'Ana Torres', 'José Martínez', 'Valentina Díaz', 'Andrea Salas', 'Pedro Blanco'];
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
    channel: 'DINE_IN' | 'DELIVERY' | 'PICKUP' | 'BAR';
    status: 'NEEDS_CONFIRMATION' | 'NEEDS_PAYMENT' | 'PENDING' | 'KITCHEN' | 'SERVED' | 'CANCELLED';
    tableId?: string;
    tableSessionId?: string;
    customerName: string;
    customerIdNumber?: string;
    customerPhone?: string;
    customerAddress?: string;
    paymentMethod?: 'MOBILE_PAYMENT' | 'ZELLE' | 'CASH' | 'CASH_USD' | 'CARD' | 'BINANCE' | 'PAYPAL' | 'TRANSFER';
    deliveryCourierId?: string;
    deliveryDispatchedAt?: Date;
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

    const order = await prisma.order.create({
      data: {
        restaurantId: restaurant.id,
        orderNumber: orderNumber++,
        channel: opts.channel,
        status: opts.status,
        tableId: opts.tableId,
        tableSessionId: opts.tableSessionId,
        currency: 'USD',
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
        deliveryCourierId: opts.deliveryCourierId,
        deliveryDispatchedAt: opts.deliveryDispatchedAt,
        createdAt: opts.createdAt,
        updatedAt: opts.createdAt,
        items: {
          create: items.map((i) => ({
            productId: i.productId,
            productName: nameById.get(i.productId) ?? 'Producto',
            unitPrice: i.unitPrice,
            quantity: i.quantity,
            lineTotal: i.lineTotal,
          })),
        },
      },
    });
    return { order, subtotalBase, totalBase };
  }

  // --- Historial de 1 año (hoy - 365 días hasta ayer) ---
  const DAYS_OF_HISTORY = 365;
  const now = new Date();
  let cashSessionCloseNumber = 1;

  for (let dayOffset = DAYS_OF_HISTORY; dayOffset >= 1; dayOffset--) {
    const day = new Date(now);
    day.setDate(day.getDate() - dayOffset);
    const weekday = day.getDay(); // 0=domingo..6=sábado
    // Viernes/sábado más movimiento, lunes más flojo — multiplicador simple sobre el rango base.
    const weekendBoost = weekday === 5 || weekday === 6 ? 1.6 : weekday === 1 ? 0.7 : 1;

    const openedAt = new Date(day);
    openedAt.setHours(11, 0, 0, 0);
    const dayOrders: { subtotalBase: number; totalBase: number; paymentMethod: string }[] = [];

    // Visitas en mesa: cada una es una sesión cerrada con 1-2 pedidos.
    const dineInVisits = Math.round(randomInt(2, 4) * weekendBoost);
    for (let v = 0; v < dineInVisits; v++) {
      const tableId = pick(tableIds);
      const visitStart = new Date(day);
      visitStart.setHours(randomInt(12, 20), randomInt(0, 59), 0, 0);
      const customerName = pick(customerNames);

      const session = await prisma.tableSession.create({
        data: {
          restaurantId: restaurant.id,
          tableId,
          customerName,
          customerIdNumber: `V-${randomInt(10000000, 29999999)}`,
          status: 'CLOSED',
          openedAt: visitStart,
          closedAt: new Date(visitStart.getTime() + randomInt(30, 90) * 60 * 1000),
        },
      });

      const ordersInVisit = randomInt(1, 2);
      for (let o = 0; o < ordersInVisit; o++) {
        const createdAt = new Date(visitStart.getTime() + o * 10 * 60 * 1000);
        const paymentMethod = pick(['MOBILE_PAYMENT', 'ZELLE', 'CASH', 'CARD'] as const);
        const { subtotalBase, totalBase } = await createOrder({
          createdAt,
          channel: 'DINE_IN',
          status: 'SERVED',
          tableId,
          tableSessionId: session.id,
          customerName,
          customerIdNumber: session.customerIdNumber ?? undefined,
          paymentMethod,
        });
        dayOrders.push({ subtotalBase, totalBase, paymentMethod });
      }
    }

    // Delivery/Pickup del día.
    const deliveryOrders = Math.round(randomInt(1, 3) * weekendBoost);
    for (let d = 0; d < deliveryOrders; d++) {
      const createdAt = new Date(day);
      createdAt.setHours(randomInt(11, 21), randomInt(0, 59), 0, 0);
      const isDelivery = Math.random() > 0.35;
      const paymentMethod = pick(['MOBILE_PAYMENT', 'ZELLE', 'CASH', 'CARD'] as const);
      const status = Math.random() > 0.08 ? 'SERVED' : 'CANCELLED';
      const { subtotalBase, totalBase } = await createOrder({
        createdAt,
        channel: isDelivery ? 'DELIVERY' : 'PICKUP',
        status,
        customerName: pick(customerNames),
        customerPhone: `0414${randomInt(1000000, 9999999)}`,
        customerAddress: isDelivery ? pick(deliveryAddresses) : undefined,
        paymentMethod,
        deliveryCourierId: isDelivery && status === 'SERVED' ? pick(couriers).id : undefined,
        deliveryDispatchedAt: isDelivery && status === 'SERVED' ? createdAt : undefined,
      });
      if (status === 'SERVED') dayOrders.push({ subtotalBase, totalBase, paymentMethod });
    }

    // Caja: abre en la mañana, cierra en la noche, con el resumen de lo vendido ese día.
    const totalsByMethod: Record<string, number> = {};
    let dayIncomeBase = 0;
    for (const o of dayOrders) {
      totalsByMethod[o.paymentMethod] = round2((totalsByMethod[o.paymentMethod] ?? 0) + o.totalBase);
      dayIncomeBase = round2(dayIncomeBase + o.totalBase);
    }
    const closedAt = new Date(day);
    closedAt.setHours(23, 30, 0, 0);
    await prisma.cashSession.create({
      data: {
        restaurantId: restaurant.id,
        status: 'CLOSED',
        openedByUserId: usersByRole.CASHIER,
        openedAt,
        openingBalances: { MOBILE_PAYMENT: '0', ZELLE: '0', CASH: '0', CARD: '0' },
        closedByUserId: usersByRole.CASHIER,
        closedAt,
        closeNumber: cashSessionCloseNumber++,
        closingSummary: { totalsByMethod, totalIncomeBase: dayIncomeBase, ordersCount: dayOrders.length },
      },
    });

    // Un par de gastos por semana (compra de insumos a proveedor).
    if (weekday === 2 || weekday === 5) {
      await prisma.movement.create({
        data: {
          restaurantId: restaurant.id,
          type: 'EXPENSE',
          amountBase: String(randomInt(30, 150)),
          description: pick(['Compra de carne y pan', 'Insumos de cocina', 'Compra de bebidas', 'Mantenimiento de equipos']),
          createdByUserId: usersByRole.ADMIN,
          category: pick(['SUPPLIES', 'MAINTENANCE', 'OTHER'] as const),
          createdAt: closedAt,
        },
      });
    }
  }

  // --- Actividad "de hoy": las 5 etapas del flujo, para que Cocina/Órdenes de
  //     Mesa/Delivery/Caja tengan algo en vivo con qué mostrar el producto ---
  const [tableA, tableB, tableC] = tableIds;

  // 1) Pedido recién creado, esperando que lo acepten.
  const sessionPending = await prisma.tableSession.create({
    data: {
      restaurantId: restaurant.id,
      tableId: tableB,
      customerName: 'Valentina Díaz',
      customerIdNumber: 'V-19888777',
      status: 'OPEN',
      openedAt: new Date(now.getTime() - 5 * 60 * 1000),
    },
  });
  await createOrder({
    createdAt: new Date(now.getTime() - 5 * 60 * 1000),
    channel: 'DINE_IN',
    status: 'PENDING',
    tableId: tableB,
    tableSessionId: sessionPending.id,
    customerName: 'Valentina Díaz',
    customerIdNumber: 'V-19888777',
  });

  // 2) Pedido ya en cocina.
  const sessionKitchen = await prisma.tableSession.create({
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
    tableSessionId: sessionKitchen.id,
    customerName: 'Carlos Pérez',
    customerIdNumber: 'V-20111222',
  });

  // 3) Pedido de kiosco (Comanda) esperando que caja confirme el cobro.
  const sessionComanda = await prisma.tableSession.create({
    data: {
      restaurantId: restaurant.id,
      tableId: tableC,
      customerName: 'Autoservicio (kiosco)',
      customerIdNumber: 'AUTOSERVICIO',
      customerPhone: '0000000000',
      status: 'OPEN',
      openedAt: new Date(now.getTime() - 3 * 60 * 1000),
    },
  });
  await createOrder({
    createdAt: new Date(now.getTime() - 3 * 60 * 1000),
    channel: 'DINE_IN',
    status: 'NEEDS_PAYMENT',
    tableId: tableC,
    tableSessionId: sessionComanda.id,
    customerName: 'Autoservicio (kiosco)',
    customerIdNumber: 'AUTOSERVICIO',
    customerPhone: '0000000000',
    paymentMethod: 'MOBILE_PAYMENT',
  });

  // 4) Pedido Delivery ya despachado a un repartidor.
  await createOrder({
    createdAt: new Date(now.getTime() - 18 * 60 * 1000),
    channel: 'DELIVERY',
    status: 'KITCHEN',
    customerName: 'María Gómez',
    customerPhone: '584141234567',
    customerAddress: pick(deliveryAddresses),
    paymentMethod: 'MOBILE_PAYMENT',
    deliveryCourierId: pick(couriers).id,
    deliveryDispatchedAt: new Date(now.getTime() - 10 * 60 * 1000),
  });

  // 5) Pedido Pickup recién servido.
  await createOrder({
    createdAt: new Date(now.getTime() - 5 * 60 * 1000),
    channel: 'PICKUP',
    status: 'SERVED',
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
      paymentMethod: pick(['MOBILE_PAYMENT', 'ZELLE', 'CASH', 'CARD'] as const),
    });
  }

  // Caja de hoy, abierta (todavía sin cerrar) — para que el flujo de caja se vea completo.
  await prisma.cashSession.create({
    data: {
      restaurantId: restaurant.id,
      status: 'OPEN',
      openedByUserId: usersByRole.CASHIER,
      openedAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
      openingBalances: { MOBILE_PAYMENT: '0', ZELLE: '0', CASH: '20', CARD: '0' },
    },
  });

  // eslint-disable-next-line no-console
  console.log(`✅ Demo lista. Restaurante público: /r/${restaurant.slug}`);
  // eslint-disable-next-line no-console
  console.log(`   Ingresa al panel en /admin/login con cualquiera de estos correos (contraseña: ${DEMO_PASSWORD}):`);
  for (const u of usersToCreate) {
    // eslint-disable-next-line no-console
    console.log(`   - ${u.email} (${u.role})`);
  }
}
