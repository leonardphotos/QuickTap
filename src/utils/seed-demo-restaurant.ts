import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

/**
 * Entorno Demo Efímero: borra por completo el restaurante demo (si existe,
 * junto con sus sucursales) y lo vuelve a crear desde cero, siempre idéntico
 * — marca ficticia "Big Bite Burgers" (NO la marca real de McDonald's: usar
 * el nombre/logo/colores de una marca registrada en un demo público de un
 * producto no afiliado sería infracción de marca), menú con fotos/variantes/
 * modificadores, un año de historial realista (pedidos, movimientos de caja,
 * cajas abiertas/cerradas), actividad "de hoy" en todas las etapas del flujo,
 * plan Sucursales activo, y 3 sucursales propias con su propio catálogo,
 * inventario, movimientos e historial (para simular una cadena real).
 *
 * Se usa tanto desde el script CLI (`npm run seed:demo`, ver prisma/seed-demo.ts)
 * como desde `demoResetService.reset()` — misma lógica, un solo lugar.
 */

export const DEMO_SLUG = 'demo';
export const DEMO_PASSWORD = 'Demo1234';
// Ajustes → "Modo administrador" (Entorno Demo Efímero): código fijo que
// exime al restaurante demo del reset automático. No es un secreto de
// seguridad real (vive en el código fuente) — es solo fricción para evitar
// que un clic accidental descarte trabajo de configuración permanente.
export const DEMO_ADMIN_PIN = '8353';

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

const CUSTOMER_NAMES = ['Carlos Pérez', 'María Gómez', 'Luis Rodríguez', 'Ana Torres', 'José Martínez', 'Valentina Díaz', 'Andrea Salas', 'Pedro Blanco'];
const DELIVERY_ADDRESSES = ['Av. Francisco de Miranda, Chacao', 'Calle Madrid, Las Mercedes', 'Av. Libertador, La Campiña'];

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

const CATEGORIES_DATA = [
  { name: 'Hamburguesas', priority: 1 },
  { name: 'Combos', priority: 2 },
  { name: 'Acompañantes', priority: 3 },
  { name: 'Bebidas', priority: 4 },
  { name: 'Postres', priority: 5 },
];

const EXTRAS_MODIFIERS = [
  { name: 'Queso cheddar extra', priceBase: '1.00' },
  { name: 'Tocineta', priceBase: '1.50' },
  { name: 'Aguacate', priceBase: '1.50' },
  { name: 'Huevo frito', priceBase: '1.00' },
  { name: 'Aro de cebolla', priceBase: '0.75' },
];
const SIN_MODIFIERS = ['Sin cebolla', 'Sin pepinillo', 'Sin tomate', 'Sin lechuga', 'Sin mayonesa'];
const PUNTO_MODIFIERS = ['Término medio', 'Tres cuartos', 'Bien cocida'];

const COURIERS_DATA = [
  { name: 'Pedro Ramírez', whatsappPhone: '584121112233' },
  { name: 'Génesis Blanco', whatsappPhone: '584241234455' },
  { name: 'Wilmer Suárez', whatsappPhone: '584161239988' },
];

const INVENTORY_ITEMS_DATA: { name: string; unit: string; quantity: number; minQuantity: number; pricePerUnitBase: string }[] = [
  { name: 'Carne de res (kg)', unit: 'kg', quantity: 25, minQuantity: 8, pricePerUnitBase: '4.50' },
  { name: 'Pan para hamburguesa', unit: 'unidad', quantity: 180, minQuantity: 50, pricePerUnitBase: '0.35' },
  { name: 'Queso cheddar', unit: 'kg', quantity: 12, minQuantity: 4, pricePerUnitBase: '6.20' },
  { name: 'Lechuga', unit: 'kg', quantity: 6, minQuantity: 3, pricePerUnitBase: '1.10' },
  { name: 'Tomate', unit: 'kg', quantity: 7, minQuantity: 3, pricePerUnitBase: '1.30' },
  { name: 'Papas congeladas', unit: 'kg', quantity: 40, minQuantity: 15, pricePerUnitBase: '2.10' },
  { name: 'Aceite de freír', unit: 'lt', quantity: 20, minQuantity: 8, pricePerUnitBase: '2.80' },
  { name: 'Refrescos (lata)', unit: 'unidad', quantity: 90, minQuantity: 30, pricePerUnitBase: '0.60' },
  { name: 'Empaques desechables', unit: 'unidad', quantity: 250, minQuantity: 80, pricePerUnitBase: '0.15' },
  { name: 'Servilletas (paquete)', unit: 'unidad', quantity: 35, minQuantity: 10, pricePerUnitBase: '1.20' },
];

function productsData(extrasCategoryId: string, sinCategoryId: string, puntoCategoryId: string): ProductSeed[] {
  return [
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
      modifierCategoryIds: [extrasCategoryId, sinCategoryId, puntoCategoryId],
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
      modifierCategoryIds: [extrasCategoryId, sinCategoryId, puntoCategoryId],
    },
    {
      category: 'Hamburguesas',
      name: 'Pollo Crocante',
      description: 'Pechuga de pollo empanizada, lechuga, mayonesa de la casa.',
      price: '6.90',
      photoUrl: 'https://images.unsplash.com/photo-1606755962773-d324e0a13086?auto=format&fit=crop&w=800&q=80',
      modifierCategoryIds: [extrasCategoryId, sinCategoryId],
    },
    {
      category: 'Hamburguesas',
      name: 'Veggie Deluxe',
      description: 'Medallón de vegetales, aguacate, brotes y salsa vegana.',
      price: '6.90',
      photoUrl: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80',
      isPromo: true,
      modifierCategoryIds: [extrasCategoryId, sinCategoryId],
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
      modifierCategoryIds: [extrasCategoryId],
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
}

type Role = 'OWNER' | 'ADMIN' | 'CASHIER' | 'WAITER' | 'KITCHEN' | 'SCREEN' | 'COMANDA' | 'NUMERO';

/** Crea los usuarios de un restaurante (demo principal o sucursal) y devuelve un mapa rol → userId. */
async function seedUsers(
  prisma: PrismaClient,
  restaurantId: string,
  passwordHash: string,
  usersToCreate: { email: string; name: string; role: Role }[],
): Promise<Record<string, string>> {
  const usersByRole: Record<string, string> = {};
  for (const u of usersToCreate) {
    const user = await prisma.user.create({
      data: { restaurantId, email: u.email, name: u.name, role: u.role, passwordHash },
    });
    usersByRole[u.role] = user.id;
  }
  return usersByRole;
}

/** Categorías, categorías de modificadores + modificadores, y productos (con variantes/modificadores). */
async function seedCatalog(prisma: PrismaClient, restaurantId: string) {
  const categories: Record<string, string> = {};
  for (const c of CATEGORIES_DATA) {
    const category = await prisma.category.create({ data: { restaurantId, name: c.name, priority: c.priority } });
    categories[c.name] = category.id;
  }

  const extrasCategory = await prisma.modifierCategory.create({
    data: { restaurantId, name: 'Extras', isRequired: false, allowMultiple: true, maxSelections: 5, priority: 1 },
  });
  const sinCategory = await prisma.modifierCategory.create({
    data: { restaurantId, name: 'Sin', isRequired: false, allowMultiple: true, priority: 2 },
  });
  const puntoCategory = await prisma.modifierCategory.create({
    data: { restaurantId, name: 'Término de la carne', isRequired: true, allowMultiple: false, priority: 0 },
  });

  for (const m of EXTRAS_MODIFIERS) {
    await prisma.modifier.create({ data: { restaurantId, categoryId: extrasCategory.id, name: m.name, priceBase: m.priceBase } });
  }
  for (const name of SIN_MODIFIERS) {
    await prisma.modifier.create({ data: { restaurantId, categoryId: sinCategory.id, name } });
  }
  for (const name of PUNTO_MODIFIERS) {
    await prisma.modifier.create({ data: { restaurantId, categoryId: puntoCategory.id, name } });
  }

  const products: { id: string; price: string }[] = [];
  for (const p of productsData(extrasCategory.id, sinCategory.id, puntoCategory.id)) {
    const product = await prisma.product.create({
      data: {
        restaurantId,
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
          data: { restaurantId, productId: product.id, name: v.name, priceBase: v.priceBase },
        });
      }
    }
    if (p.modifierCategoryIds) {
      for (const modifierCategoryId of p.modifierCategoryIds) {
        await prisma.productModifierCategory.create({ data: { productId: product.id, modifierCategoryId } });
      }
    }
    products.push({ id: product.id, price: p.price });
  }

  return { products };
}

/** Zonas + mesas. Devuelve la lista de ids de mesa creadas. */
async function seedFloorPlan(prisma: PrismaClient, restaurantId: string, zonesData: { name: string; priority: number; tables: string[] }[]) {
  const tableIds: string[] = [];
  for (const z of zonesData) {
    const zone = await prisma.zone.create({ data: { restaurantId, name: z.name, priority: z.priority } });
    for (const number of z.tables) {
      const table = await prisma.table.create({ data: { restaurantId, zoneId: zone.id, number, qrToken: nanoid(12) } });
      tableIds.push(table.id);
    }
  }
  return tableIds;
}

async function seedCouriers(prisma: PrismaClient, restaurantId: string, couriersData: { name: string; whatsappPhone: string }[]) {
  const couriers: { id: string }[] = [];
  for (const c of couriersData) {
    const courier = await prisma.deliveryCourier.create({ data: { restaurantId, name: c.name, whatsappPhone: c.whatsappPhone } });
    couriers.push({ id: courier.id });
  }
  return couriers;
}

/**
 * Insumos de inventario, para que el módulo de Inventario del demo no quede vacío.
 * La cantidad se varía con un multiplicador aleatorio sobre el mínimo (0.3x-2.5x) en vez
 * de usar siempre el mismo valor "lleno" — así cada sede muestra un stock distinto y
 * realista, con algún insumo ocasionalmente por debajo del mínimo.
 */
async function seedInventory(prisma: PrismaClient, restaurantId: string) {
  const items: { id: string; name: string }[] = [];
  for (const i of INVENTORY_ITEMS_DATA) {
    const factor = randomInt(30, 250) / 100;
    const quantity = Math.max(0, Math.round(i.minQuantity * factor * 10) / 10);
    const item = await prisma.inventoryItem.create({
      data: {
        restaurantId,
        name: i.name,
        unit: i.unit,
        quantity,
        minQuantity: i.minQuantity,
        pricePerUnitBase: i.pricePerUnitBase,
      },
    });
    items.push({ id: item.id, name: item.name });
  }
  return items;
}

/** Fábrica de `createOrder` con contador de `orderNumber` propio, ligada a un restaurante/catálogo/tasa concretos. */
function makeOrderFactory(
  prisma: PrismaClient,
  restaurantId: string,
  products: { id: string; price: string }[],
  rateBs: number,
) {
  let orderNumber = 1;

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
        restaurantId,
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

  return { createOrder };
}

/** Historial de N días (hoy - days hasta ayer): visitas en mesa, delivery/pickup, caja diaria y algún gasto semanal. */
async function seedHistory(
  prisma: PrismaClient,
  restaurantId: string,
  opts: {
    days: number;
    tableIds: string[];
    couriers: { id: string }[];
    cashierUserId: string;
    adminUserId: string;
    inventoryItems: { id: string; name: string }[];
    createOrder: ReturnType<typeof makeOrderFactory>['createOrder'];
  },
) {
  const now = new Date();
  let cashSessionCloseNumber = 1;

  for (let dayOffset = opts.days; dayOffset >= 1; dayOffset--) {
    const day = new Date(now);
    day.setDate(day.getDate() - dayOffset);
    const weekday = day.getDay();
    const weekendBoost = weekday === 5 || weekday === 6 ? 1.6 : weekday === 1 ? 0.7 : 1;

    const openedAt = new Date(day);
    openedAt.setHours(11, 0, 0, 0);
    const dayOrders: { subtotalBase: number; totalBase: number; paymentMethod: string }[] = [];

    const dineInVisits = Math.round(randomInt(2, 4) * weekendBoost);
    for (let v = 0; v < dineInVisits; v++) {
      const tableId = pick(opts.tableIds);
      const visitStart = new Date(day);
      visitStart.setHours(randomInt(12, 20), randomInt(0, 59), 0, 0);
      const customerName = pick(CUSTOMER_NAMES);

      const session = await prisma.tableSession.create({
        data: {
          restaurantId,
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
        const { subtotalBase, totalBase } = await opts.createOrder({
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

    const deliveryOrders = Math.round(randomInt(1, 3) * weekendBoost);
    for (let d = 0; d < deliveryOrders; d++) {
      const createdAt = new Date(day);
      createdAt.setHours(randomInt(11, 21), randomInt(0, 59), 0, 0);
      const isDelivery = Math.random() > 0.35;
      const paymentMethod = pick(['MOBILE_PAYMENT', 'ZELLE', 'CASH', 'CARD'] as const);
      const status = Math.random() > 0.08 ? 'SERVED' : 'CANCELLED';
      const { subtotalBase, totalBase } = await opts.createOrder({
        createdAt,
        channel: isDelivery ? 'DELIVERY' : 'PICKUP',
        status,
        customerName: pick(CUSTOMER_NAMES),
        customerPhone: `0414${randomInt(1000000, 9999999)}`,
        customerAddress: isDelivery ? pick(DELIVERY_ADDRESSES) : undefined,
        paymentMethod,
        deliveryCourierId: isDelivery && status === 'SERVED' ? pick(opts.couriers).id : undefined,
        deliveryDispatchedAt: isDelivery && status === 'SERVED' ? createdAt : undefined,
      });
      if (status === 'SERVED') dayOrders.push({ subtotalBase, totalBase, paymentMethod });
    }

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
        restaurantId,
        status: 'CLOSED',
        openedByUserId: opts.cashierUserId,
        openedAt,
        openingBalances: { MOBILE_PAYMENT: '0', ZELLE: '0', CASH: '0', CARD: '0' },
        closedByUserId: opts.cashierUserId,
        closedAt,
        closeNumber: cashSessionCloseNumber++,
        closingSummary: { totalsByMethod, totalIncomeBase: dayIncomeBase, ordersCount: dayOrders.length },
      },
    });

    // Un par de gastos por semana: a veces genérico, a veces restock de un insumo puntual.
    if (weekday === 2 || weekday === 5) {
      const restock = opts.inventoryItems.length > 0 && Math.random() > 0.4 ? pick(opts.inventoryItems) : null;
      await prisma.movement.create({
        data: {
          restaurantId,
          type: 'EXPENSE',
          amountBase: String(randomInt(30, 150)),
          description: restock ? `Reposición de ${restock.name}` : pick(['Compra de carne y pan', 'Insumos de cocina', 'Compra de bebidas', 'Mantenimiento de equipos']),
          createdByUserId: opts.adminUserId,
          category: restock ? 'SUPPLIES' : pick(['SUPPLIES', 'MAINTENANCE', 'OTHER'] as const),
          inventoryItemId: restock?.id,
          createdAt: closedAt,
        },
      });
    }
  }
}

/** Actividad "de hoy". `full=true` cubre las 5 etapas (usado por el restaurante principal); `full=false` es una versión reducida para sucursales. */
async function seedTodayActivity(
  prisma: PrismaClient,
  restaurantId: string,
  opts: {
    full: boolean;
    tableIds: string[];
    couriers: { id: string }[];
    cashierUserId: string;
    createOrder: ReturnType<typeof makeOrderFactory>['createOrder'];
  },
) {
  const now = new Date();
  const [tableA, tableB, tableC] = opts.tableIds;

  // 1) Pedido recién creado, esperando que lo acepten.
  const sessionPending = await prisma.tableSession.create({
    data: {
      restaurantId,
      tableId: tableB,
      customerName: 'Valentina Díaz',
      customerIdNumber: 'V-19888777',
      status: 'OPEN',
      openedAt: new Date(now.getTime() - 5 * 60 * 1000),
    },
  });
  await opts.createOrder({
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
      restaurantId,
      tableId: tableA,
      customerName: 'Carlos Pérez',
      customerIdNumber: 'V-20111222',
      status: 'OPEN',
      openedAt: new Date(now.getTime() - 25 * 60 * 1000),
    },
  });
  await opts.createOrder({
    createdAt: new Date(now.getTime() - 25 * 60 * 1000),
    channel: 'DINE_IN',
    status: 'KITCHEN',
    tableId: tableA,
    tableSessionId: sessionKitchen.id,
    customerName: 'Carlos Pérez',
    customerIdNumber: 'V-20111222',
  });

  if (opts.full) {
    // 3) Pedido de kiosco (Comanda) esperando que caja confirme el cobro.
    const sessionComanda = await prisma.tableSession.create({
      data: {
        restaurantId,
        tableId: tableC,
        customerName: 'Autoservicio (kiosco)',
        customerIdNumber: 'AUTOSERVICIO',
        customerPhone: '0000000000',
        status: 'OPEN',
        openedAt: new Date(now.getTime() - 3 * 60 * 1000),
      },
    });
    await opts.createOrder({
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
  }

  // 4) Pedido Delivery ya despachado a un repartidor.
  await opts.createOrder({
    createdAt: new Date(now.getTime() - 18 * 60 * 1000),
    channel: 'DELIVERY',
    status: 'KITCHEN',
    customerName: 'María Gómez',
    customerPhone: '584141234567',
    customerAddress: pick(DELIVERY_ADDRESSES),
    paymentMethod: 'MOBILE_PAYMENT',
    deliveryCourierId: pick(opts.couriers).id,
    deliveryDispatchedAt: new Date(now.getTime() - 10 * 60 * 1000),
  });

  // 5) Pedido Pickup recién servido.
  await opts.createOrder({
    createdAt: new Date(now.getTime() - 5 * 60 * 1000),
    channel: 'PICKUP',
    status: 'SERVED',
    customerName: 'Luis Rodríguez',
    customerPhone: '584241234567',
    paymentMethod: 'CASH',
  });

  if (opts.full) {
    // Un par de ventas ya servidas hoy, para que "Ventas de hoy" no quede en cero.
    for (let i = 0; i < 3; i++) {
      await opts.createOrder({
        createdAt: new Date(now.getTime() - randomInt(60, 300) * 60 * 1000),
        channel: 'DINE_IN',
        status: 'SERVED',
        tableId: pick(opts.tableIds),
        customerName: pick(CUSTOMER_NAMES),
        customerIdNumber: `V-${randomInt(10000000, 29999999)}`,
        paymentMethod: pick(['MOBILE_PAYMENT', 'ZELLE', 'CASH', 'CARD'] as const),
      });
    }
  }

  // Caja de hoy, abierta (todavía sin cerrar) — para que el flujo de caja se vea completo.
  await prisma.cashSession.create({
    data: {
      restaurantId,
      status: 'OPEN',
      openedByUserId: opts.cashierUserId,
      openedAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
      openingBalances: { MOBILE_PAYMENT: '0', ZELLE: '0', CASH: '20', CARD: '0' },
    },
  });
}

const BRANCHES_DATA = [
  { slug: 'demo-branch-centro', name: 'Big Bite Burgers - Sucursal Centro', emailPrefix: 'centro' },
  { slug: 'demo-branch-este', name: 'Big Bite Burgers - Sucursal Este', emailPrefix: 'este' },
  { slug: 'demo-branch-oeste', name: 'Big Bite Burgers - Sucursal Oeste', emailPrefix: 'oeste' },
];

/** Crea una sucursal completa (usuarios, catálogo, piso, repartidores, inventario, 45 días de historial + actividad de hoy reducida). */
async function seedBranch(
  prisma: PrismaClient,
  parentId: string,
  branch: { slug: string; name: string; emailPrefix: string },
  passwordHash: string,
  rateBs: number,
) {
  const restaurant = await prisma.restaurant.create({
    data: {
      slug: branch.slug,
      name: branch.name,
      description: 'Sucursal de demostración de Big Bite Burgers — datos ficticios que se reinician automáticamente.',
      logoUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80',
      baseCurrency: 'USD',
      whatsappPhone: '584241234567',
      theme: {
        primary: '#DA291C',
        accent: '#FFC72C',
        text: '#1a1a1a',
        buttonText: '#ffffff',
        bioColor: '#ffffff',
        coverImageUrl: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1600&q=80',
        bannerStyle: 'gradient',
        bannerBlurEnabled: false,
      },
      serviceChargeEnabled: true,
      ivaEnabled: true,
      orderingEnabled: true,
      isDemo: true,
      // Las cuentas demo nunca piden PIN de bloqueo: un prospecto que entra a curiosear
      // no tiene por qué toparse con "Crea tu PIN" (además el PIN quedaría desconocido
      // para el siguiente visitante).
      lockScreenEnabled: false,
      demoLastActivityAt: new Date(),
      parentRestaurantId: parentId,
      subscriptionStatus: 'ACTIVE',
      subscriptionPlan: 'SUCURSALES',
      billingCycle: 'MONTHLY',
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  const usersByRole = await seedUsers(prisma, restaurant.id, passwordHash, [
    { email: `owner.${branch.emailPrefix}.demo@quicktap.club`, name: `Dueño ${branch.name}`, role: 'OWNER' },
    { email: `admin.${branch.emailPrefix}.demo@quicktap.club`, name: `Admin ${branch.name}`, role: 'ADMIN' },
    { email: `cajero.${branch.emailPrefix}.demo@quicktap.club`, name: `Cajero ${branch.name}`, role: 'CASHIER' },
    { email: `mesero.${branch.emailPrefix}.demo@quicktap.club`, name: `Mesero ${branch.name}`, role: 'WAITER' },
    { email: `cocina.${branch.emailPrefix}.demo@quicktap.club`, name: `Cocina ${branch.name}`, role: 'KITCHEN' },
    { email: `pantalla.${branch.emailPrefix}.demo@quicktap.club`, name: `Pantalla ${branch.name}`, role: 'SCREEN' },
    { email: `comanda.${branch.emailPrefix}.demo@quicktap.club`, name: `Comanda ${branch.name}`, role: 'COMANDA' },
    { email: `numero.${branch.emailPrefix}.demo@quicktap.club`, name: `Numero ${branch.name}`, role: 'NUMERO' },
  ]);

  const { products } = await seedCatalog(prisma, restaurant.id);
  const tableIds = await seedFloorPlan(prisma, restaurant.id, [
    { name: 'Salón', priority: 1, tables: ['1', '2', '3', '4'] },
    { name: 'Terraza', priority: 2, tables: ['Terraza-1', 'Terraza-2'] },
  ]);
  const couriers = await seedCouriers(prisma, restaurant.id, [COURIERS_DATA[randomInt(0, COURIERS_DATA.length - 1)], COURIERS_DATA[randomInt(0, COURIERS_DATA.length - 1)]]);
  const inventoryItems = await seedInventory(prisma, restaurant.id);

  const { createOrder } = makeOrderFactory(prisma, restaurant.id, products, rateBs);
  await seedHistory(prisma, restaurant.id, {
    days: 45,
    tableIds,
    couriers,
    cashierUserId: usersByRole.CASHIER,
    adminUserId: usersByRole.ADMIN,
    inventoryItems,
    createOrder,
  });
  await seedTodayActivity(prisma, restaurant.id, {
    full: false,
    tableIds,
    couriers,
    cashierUserId: usersByRole.CASHIER,
    createOrder,
  });

  return restaurant;
}

export async function resetAndSeedDemoRestaurant(prisma: PrismaClient): Promise<void> {
  // Requerimiento 1: elimina todo lo que tenga el restaurante demo actual y
  // sus sucursales — la cascada del schema (onDelete: Cascade en
  // prácticamente todas las relaciones hijas de Restaurant) se lleva
  // pedidos, productos, equipo, movimientos, cajas, mesas, todo, de un solo
  // golpe. `parentRestaurantId` es SET NULL (no cascada), así que las
  // sucursales se borran explícitamente primero por su slug conocido.
  await prisma.restaurant.deleteMany({ where: { slug: { in: BRANCHES_DATA.map((b) => b.slug) } } });
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
        bioColor: '#ffffff',
        // Foto de portada del banner del menú público (horizontal, mostrador de hamburguesería).
        coverImageUrl: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1600&q=80',
        bannerStyle: 'gradient',
        bannerBlurEnabled: false,
      },
      serviceChargeEnabled: true,
      ivaEnabled: true,
      orderingEnabled: true,
      isDemo: true,
      // Las cuentas demo nunca piden PIN de bloqueo (ver el mismo comentario en las sucursales).
      lockScreenEnabled: false,
      // Recién creado: cuenta como "actividad reciente" para que el barrido de
      // inactividad (server.ts) no lo vuelva a resetear antes de que alguien
      // llegue a usarlo.
      demoLastActivityAt: new Date(),
      subscriptionStatus: 'ACTIVE',
      // Plan Sucursales: habilita el switcher de sucursales y las 3 que se crean abajo.
      subscriptionPlan: 'SUCURSALES',
      billingCycle: 'MONTHLY',
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  // --- Usuarios: uno por rol, todos con la misma contraseña de demo ---
  const usersToCreate: { email: string; name: string; role: Role }[] = [
    { email: 'demo@quicktap.club', name: 'Dueño Demo', role: 'OWNER' },
    { email: 'admin.demo@quicktap.club', name: 'Admin Demo', role: 'ADMIN' },
    { email: 'cajero.demo@quicktap.club', name: 'Cajero Demo', role: 'CASHIER' },
    { email: 'mesero.demo@quicktap.club', name: 'Mesero Demo', role: 'WAITER' },
    { email: 'cocina.demo@quicktap.club', name: 'Cocina Demo', role: 'KITCHEN' },
    { email: 'pantalla.demo@quicktap.club', name: 'Pantalla Demo', role: 'SCREEN' },
    { email: 'comanda.demo@quicktap.club', name: 'Comanda Demo', role: 'COMANDA' },
    { email: 'numero.demo@quicktap.club', name: 'Numero Demo', role: 'NUMERO' },
  ];
  const usersByRole = await seedUsers(prisma, restaurant.id, passwordHash, usersToCreate);

  const { products } = await seedCatalog(prisma, restaurant.id);

  const tableIds = await seedFloorPlan(prisma, restaurant.id, [
    { name: 'Salón Principal', priority: 1, tables: ['1', '2', '3', '4'] },
    { name: 'Terraza', priority: 2, tables: ['Terraza-1', 'Terraza-2'] },
    { name: 'Barra', priority: 3, tables: ['Barra-1'] },
  ]);

  const couriers = await seedCouriers(prisma, restaurant.id, COURIERS_DATA);
  const inventoryItems = await seedInventory(prisma, restaurant.id);

  // --- Tasa BCV vigente (o respaldo si aún no se ha refrescado) ---
  const rate = await prisma.exchangeRate.findUnique({ where: { currency: 'USD' } });
  const rateBs = rate ? Number(rate.rateBs) : 40.5;

  const { createOrder } = makeOrderFactory(prisma, restaurant.id, products, rateBs);

  // --- Historial de 1 año (hoy - 365 días hasta ayer) ---
  await seedHistory(prisma, restaurant.id, {
    days: 365,
    tableIds,
    couriers,
    cashierUserId: usersByRole.CASHIER,
    adminUserId: usersByRole.ADMIN,
    inventoryItems,
    createOrder,
  });

  // --- Actividad "de hoy": las 5 etapas del flujo ---
  await seedTodayActivity(prisma, restaurant.id, {
    full: true,
    tableIds,
    couriers,
    cashierUserId: usersByRole.CASHIER,
    createOrder,
  });

  // --- Requerimiento: 3 sucursales completas (catálogo, inventario, historial propio) ---
  for (const branch of BRANCHES_DATA) {
    await seedBranch(prisma, restaurant.id, branch, passwordHash, rateBs);
  }

  // eslint-disable-next-line no-console
  console.log(`✅ Demo lista. Restaurante público: /r/${restaurant.slug}`);
  // eslint-disable-next-line no-console
  console.log(`   Ingresa al panel en /admin/login con cualquiera de estos correos (contraseña: ${DEMO_PASSWORD}):`);
  for (const u of usersToCreate) {
    // eslint-disable-next-line no-console
    console.log(`   - ${u.email} (${u.role})`);
  }
  // eslint-disable-next-line no-console
  console.log(`   Sucursales creadas: ${BRANCHES_DATA.map((b) => b.name).join(', ')}`);
  // eslint-disable-next-line no-console
  console.log(`   Modo administrador (Ajustes): código ${DEMO_ADMIN_PIN} para que los cambios no se reinicien.`);
}
