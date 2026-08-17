import { Prisma, PrismaClient, WasteReason } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { computeCostStructure, DEFAULT_COST_STRUCTURE_ITEMS, type MaterialLine } from './cost-structure';

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

/** Fecha "YYYY-MM-DD" (mediodía UTC, mismo criterio que InventoryItem.expiryDate) a N días de hoy. */
function isoDateOffset(offsetDays: number): string {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const INVENTORY_ITEMS_DATA: {
  name: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  pricePerUnitBase: string;
  /** Si viene, fija Alertas → "por vencer" (positivo) o ya vencido (negativo). */
  expiryOffsetDays?: number;
}[] = [
  { name: 'Carne de res (kg)', unit: 'kg', quantity: 25, minQuantity: 8, pricePerUnitBase: '4.50', expiryOffsetDays: -1 },
  { name: 'Pan para hamburguesa', unit: 'unidad', quantity: 180, minQuantity: 50, pricePerUnitBase: '0.35' },
  { name: 'Queso cheddar', unit: 'kg', quantity: 12, minQuantity: 4, pricePerUnitBase: '6.20', expiryOffsetDays: 12 },
  { name: 'Lechuga', unit: 'kg', quantity: 6, minQuantity: 3, pricePerUnitBase: '1.10', expiryOffsetDays: 2 },
  { name: 'Tomate', unit: 'kg', quantity: 7, minQuantity: 3, pricePerUnitBase: '1.30', expiryOffsetDays: 5 },
  { name: 'Papas congeladas', unit: 'kg', quantity: 40, minQuantity: 15, pricePerUnitBase: '2.10' },
  { name: 'Aceite de freír', unit: 'lt', quantity: 20, minQuantity: 8, pricePerUnitBase: '2.80' },
  { name: 'Refrescos (lata)', unit: 'unidad', quantity: 90, minQuantity: 30, pricePerUnitBase: '0.60' },
  { name: 'Empaques desechables', unit: 'unidad', quantity: 250, minQuantity: 80, pricePerUnitBase: '0.15' },
  { name: 'Servilletas (paquete)', unit: 'unidad', quantity: 35, minQuantity: 10, pricePerUnitBase: '1.20' },
  { name: 'Mayonesa de la casa', unit: 'kg', quantity: 8, minQuantity: 3, pricePerUnitBase: '3.20' },
  { name: 'Salsa BBQ', unit: 'kg', quantity: 5, minQuantity: 2, pricePerUnitBase: '4.10' },
  { name: 'Tocineta', unit: 'kg', quantity: 6, minQuantity: 2, pricePerUnitBase: '7.50', expiryOffsetDays: 4 },
  { name: 'Pechuga de pollo', unit: 'kg', quantity: 15, minQuantity: 5, pricePerUnitBase: '5.80', expiryOffsetDays: 3 },
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

  const products: { id: string; name: string; price: string }[] = [];
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
    products.push({ id: product.id, name: product.name, price: p.price });
  }

  return { products };
}

/** Zonas + mesas. Devuelve la lista de ids de mesa creadas. */
/** Reparte N mesas en una cuadrícula pareja (2 columnas hasta 4 mesas, 3 en adelante) dentro del
 * lienzo del plano (% del 20-80 en X, 25-75 en Y), para que el plano del demo no arranque vacío. */
function layoutPositions(count: number): { x: number; y: number }[] {
  if (count === 0) return [];
  const cols = Math.min(count, count <= 4 ? 2 : 3);
  const rows = Math.ceil(count / cols);
  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = cols === 1 ? 50 : Math.round(20 + (col * 60) / (cols - 1));
    const y = rows === 1 ? 50 : Math.round(25 + (row * 50) / (rows - 1));
    positions.push({ x, y });
  }
  return positions;
}

/** Formas/tamaños variados (incluye la rectangular de 6) para que el plano demo enseñe las
 * opciones del editor, no solo mesas redondas iguales. */
const FLOOR_PLAN_SHAPE_CYCLE: { shape: 'ROUND' | 'SQUARE' | 'RECTANGLE'; size: number }[] = [
  { shape: 'ROUND', size: 1 },
  { shape: 'SQUARE', size: 1 },
  { shape: 'ROUND', size: 1.35 },
  { shape: 'RECTANGLE', size: 1 },
];

async function seedFloorPlan(prisma: PrismaClient, restaurantId: string, zonesData: { name: string; priority: number; tables: string[] }[]) {
  const tableIds: string[] = [];
  for (const z of zonesData) {
    const zone = await prisma.zone.create({ data: { restaurantId, name: z.name, priority: z.priority } });
    const positions = layoutPositions(z.tables.length);
    for (let i = 0; i < z.tables.length; i++) {
      const number = z.tables[i];
      const pos = positions[i];
      const { shape, size } = FLOOR_PLAN_SHAPE_CYCLE[i % FLOOR_PLAN_SHAPE_CYCLE.length];
      const table = await prisma.table.create({
        data: {
          restaurantId,
          zoneId: zone.id,
          number,
          qrToken: nanoid(12),
          planX: pos.x,
          planY: pos.y,
          planShape: shape,
          planSize: size,
        },
      });
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
  const items: { id: string; name: string; unit: string; pricePerUnitBase: string }[] = [];
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
        expiryDate: i.expiryOffsetDays != null ? isoDateOffset(i.expiryOffsetDays) : undefined,
      },
    });
    items.push({ id: item.id, name: item.name, unit: item.unit, pricePerUnitBase: i.pricePerUnitBase });
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

/**
 * Movimientos administrativos del demo: proveedores, gastos de todas las categorías
 * (con factura fiscal / nota de entrega, método de pago, algunos recurrentes y algunos
 * a crédito con su orden de pago), ingresos manuales y cuentas bancarias con saldo.
 * Es lo que hace que Contabilidad, Libros fiscales, Proveedores, Órdenes de pago y
 * Cuentas bancarias se vean llenos en la cuenta de demostración.
 */
async function seedAdministrativeMovements(
  prisma: PrismaClient,
  restaurantId: string,
  opts: { adminUserId: string; days: number },
) {
  const now = new Date();

  const suppliers = await Promise.all(
    [
      { name: 'Distribuidora La Carne C.A.', taxId: 'J-40123456-7', phone: '04141112233' },
      { name: 'Panadería El Trigal', taxId: 'J-29876543-1', phone: '04242223344' },
      { name: 'Bebidas del Centro', taxId: 'J-31234567-8', phone: '04123334455' },
      { name: 'Inmobiliaria Plaza Norte', taxId: 'J-50011223-4', phone: '02125556677' },
      { name: 'Servicios Técnicos Frío Total', taxId: 'V-12345678-9', phone: '04164445566' },
      { name: 'Agencia Creativa Sabor', taxId: 'J-41122334-5', phone: '04145557788' },
    ].map((s) => prisma.supplier.create({ data: { restaurantId, ...s } })),
  );
  const [carne, pan, bebidas, inmobiliaria, tecnico, agencia] = suppliers;

  // Cuentas bancarias con saldo inicial (los cobros nuevos suman acá solos).
  await prisma.bankAccount.create({
    data: {
      restaurantId,
      name: 'Banesco (Pago Móvil)',
      currency: 'BS',
      paymentMethods: ['MOBILE_PAYMENT', 'TRANSFER'],
      balance: 185000,
      transactions: {
        create: { restaurantId, type: 'CREDIT', amount: 185000, amountBase: 0, description: 'Saldo inicial' },
      },
    },
  });
  await prisma.bankAccount.create({
    data: {
      restaurantId,
      name: 'Zelle Chase',
      currency: 'BASE',
      paymentMethods: ['ZELLE'],
      balance: 1240,
      transactions: {
        create: { restaurantId, type: 'CREDIT', amount: 1240, amountBase: 1240, description: 'Saldo inicial' },
      },
    },
  });
  await prisma.bankAccount.create({
    data: {
      restaurantId,
      name: 'Caja chica',
      currency: 'BASE',
      isPettyCash: true,
      paymentMethods: ['CASH_USD'],
      balance: 320,
      transactions: {
        create: { restaurantId, type: 'CREDIT', amount: 320, amountBase: 320, description: 'Saldo inicial' },
      },
    },
  });

  const at = (daysAgo: number, hour = 10) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, randomInt(0, 59), 0, 0);
    return d;
  };
  const dateOnly = (daysAgo: number) => {
    const d = at(daysAgo, 12);
    d.setMinutes(0, 0, 0);
    return d;
  };

  const monthsBack = Math.min(12, Math.floor(opts.days / 30));
  let orderNumber = 1;

  for (let m = monthsBack; m >= 0; m--) {
    const base = m * 30;

    // Fijos mensuales (recurrentes, factura fiscal, transferencia/pago móvil).
    await prisma.movement.createMany({
      data: [
        {
          restaurantId,
          type: 'EXPENSE',
          amountBase: '850',
          description: 'Arriendo del local',
          category: 'RENT',
          supplierId: inmobiliaria.id,
          paymentMethod: 'TRANSFER',
          documentType: 'FISCAL_INVOICE',
          isRecurring: true,
          referenceNumber: `TR-${randomInt(100000, 999999)}`,
          createdByUserId: opts.adminUserId,
          expenseDate: dateOnly(base + 2),
          createdAt: at(base + 2),
        },
        {
          restaurantId,
          type: 'EXPENSE',
          amountBase: String(randomInt(1400, 1900)),
          description: 'Nómina quincenal (1ra)',
          category: 'PAYROLL',
          paymentMethod: 'MOBILE_PAYMENT',
          isRecurring: true,
          createdByUserId: opts.adminUserId,
          expenseDate: dateOnly(base + 15),
          createdAt: at(base + 15),
        },
        {
          restaurantId,
          type: 'EXPENSE',
          amountBase: String(randomInt(1400, 1900)),
          description: 'Nómina quincenal (2da)',
          category: 'PAYROLL',
          paymentMethod: 'MOBILE_PAYMENT',
          isRecurring: true,
          createdByUserId: opts.adminUserId,
          expenseDate: dateOnly(base + 1),
          createdAt: at(base + 1),
        },
        {
          restaurantId,
          type: 'EXPENSE',
          amountBase: String(randomInt(120, 210)),
          description: 'Electricidad (CORPOELEC)',
          category: 'UTILITIES',
          paymentMethod: 'MOBILE_PAYMENT',
          documentType: 'FISCAL_INVOICE',
          isRecurring: true,
          referenceNumber: `PM-${randomInt(100000, 999999)}`,
          createdByUserId: opts.adminUserId,
          expenseDate: dateOnly(base + 8),
          createdAt: at(base + 8),
        },
        {
          restaurantId,
          type: 'EXPENSE',
          amountBase: String(randomInt(45, 80)),
          description: 'Internet y telefonía',
          category: 'UTILITIES',
          paymentMethod: 'MOBILE_PAYMENT',
          documentType: 'FISCAL_INVOICE',
          isRecurring: true,
          createdByUserId: opts.adminUserId,
          expenseDate: dateOnly(base + 6),
          createdAt: at(base + 6),
        },
        {
          restaurantId,
          type: 'EXPENSE',
          amountBase: String(randomInt(90, 260)),
          description: pick(['Pauta en Instagram', 'Diseño de menú y flyers', 'Campaña de delivery']),
          category: 'MARKETING',
          supplierId: agencia.id,
          paymentMethod: 'ZELLE',
          documentType: 'FISCAL_INVOICE',
          createdByUserId: opts.adminUserId,
          expenseDate: dateOnly(base + 12),
          createdAt: at(base + 12),
        },
        {
          restaurantId,
          type: 'EXPENSE',
          amountBase: String(randomInt(35, 120)),
          description: pick(['Papelería y facturas', 'Honorarios contador', 'Licencia de software']),
          category: 'ADMINISTRATIVE',
          paymentMethod: 'CASH_USD',
          documentType: 'DELIVERY_NOTE',
          createdByUserId: opts.adminUserId,
          expenseDate: dateOnly(base + 18),
          createdAt: at(base + 18),
        },
        {
          restaurantId,
          type: 'EXPENSE',
          amountBase: String(randomInt(25, 70)),
          description: pick(['Gasolina de la moto de delivery', 'Flete de mercancía']),
          category: pick(['FUEL', 'TRANSPORT'] as const),
          paymentMethod: 'CASH',
          documentType: 'DELIVERY_NOTE',
          createdByUserId: opts.adminUserId,
          expenseDate: dateOnly(base + 21),
          createdAt: at(base + 21),
        },
      ],
    });

    // Compras semanales a proveedores (algunas a crédito).
    for (const week of [3, 10, 17, 24]) {
      const supplier = pick([carne, pan, bebidas]);
      const credit = Math.random() < 0.3;
      const amount = String(randomInt(120, 420));
      const mov = await prisma.movement.create({
        data: {
          restaurantId,
          type: 'EXPENSE',
          amountBase: amount,
          description:
            supplier.id === carne.id
              ? 'Compra de carne molida y pollo'
              : supplier.id === pan.id
                ? 'Panes de hamburguesa y perro'
                : 'Refrescos, jugos y agua',
          category: 'SUPPLIES',
          supplierId: supplier.id,
          paymentMethod: credit ? null : pick(['TRANSFER', 'MOBILE_PAYMENT', 'CASH_USD'] as const),
          documentType: Math.random() < 0.7 ? 'FISCAL_INVOICE' : 'DELIVERY_NOTE',
          isCredit: credit,
          invoiceDueDate: credit ? dateOnly(base + week - 20) : null,
          referenceNumber: credit ? null : `FAC-${randomInt(1000, 9999)}`,
          createdByUserId: opts.adminUserId,
          expenseDate: dateOnly(base + week),
          createdAt: at(base + week),
        },
      });

      // Los créditos viejos ya se pagaron con orden de pago; los recientes siguen pendientes.
      if (credit && m >= 1) {
        const paidAt = at(base + week - 12, 15);
        await prisma.paymentOrder.create({
          data: {
            restaurantId,
            orderNumber: orderNumber++,
            supplierId: supplier.id,
            status: 'PAID',
            amountBase: amount,
            paidAmountBase: amount,
            paymentMethod: 'TRANSFER',
            referenceNumber: `TR-${randomInt(100000, 999999)}`,
            ivaAmountBase: round2(Number(amount) * 0.16),
            totalWithIvaBase: round2(Number(amount) * 1.16),
            createdByUserId: opts.adminUserId,
            createdAt: at(base + week - 14, 9),
            paidAt,
            movements: { connect: { id: mov.id } },
          },
        });
        await prisma.movement.update({ where: { id: mov.id }, data: { creditPaidAt: paidAt } });
      }
    }

    // Mantenimiento ocasional (cada dos meses) y un ingreso manual (propinas / otro).
    if (m % 2 === 0) {
      await prisma.movement.create({
        data: {
          restaurantId,
          type: 'EXPENSE',
          amountBase: String(randomInt(60, 240)),
          description: pick(['Servicio de nevera y freidora', 'Recarga de extintores', 'Plomería del baño']),
          category: 'MAINTENANCE',
          supplierId: tecnico.id,
          paymentMethod: 'CASH_USD',
          documentType: 'DELIVERY_NOTE',
          createdByUserId: opts.adminUserId,
          expenseDate: dateOnly(base + 26),
          createdAt: at(base + 26),
        },
      });
    }
    await prisma.movement.create({
      data: {
        restaurantId,
        type: 'INCOME',
        amountBase: String(randomInt(40, 160)),
        description: pick(['Alquiler de la terraza para evento', 'Cobro de deuda de cliente']),
        incomeCategory: pick(['OTHER', 'DEBT'] as const),
        paymentMethod: pick(['CASH_USD', 'ZELLE', 'MOBILE_PAYMENT'] as const),
        createdByUserId: opts.adminUserId,
        createdAt: at(base + 4, 19),
      },
    });
    // Propinas: se reparten aparte cada semana (no van a nómina), para que el indicador de
    // propinas del mes no dependa de que salga el sorteo de la categoría de ingreso genérica.
    for (const week of [2, 9, 16, 23]) {
      await prisma.movement.create({
        data: {
          restaurantId,
          type: 'INCOME',
          amountBase: String(randomInt(15, 55)),
          description: 'Propinas de la semana',
          incomeCategory: 'TIP',
          paymentMethod: pick(['CASH_USD', 'ZELLE', 'MOBILE_PAYMENT'] as const),
          createdByUserId: opts.adminUserId,
          createdAt: at(base + week, 22),
        },
      });
    }
  }

  // Una orden de pago PENDIENTE hoy con dos facturas a crédito, para que Cuentas por pagar
  // no arranque vacío.
  const pending = await Promise.all(
    [
      { d: 'Compra de carne — factura pendiente', s: carne.id, a: '380' },
      { d: 'Refrescos — factura pendiente', s: bebidas.id, a: '145' },
    ].map((x) =>
      prisma.movement.create({
        data: {
          restaurantId,
          type: 'EXPENSE',
          amountBase: x.a,
          description: x.d,
          category: 'SUPPLIES',
          supplierId: x.s,
          documentType: 'FISCAL_INVOICE',
          isCredit: true,
          invoiceDueDate: dateOnly(-5),
          createdByUserId: opts.adminUserId,
          expenseDate: dateOnly(3),
          createdAt: at(3),
        },
      }),
    ),
  );
  await prisma.paymentOrder.create({
    data: {
      restaurantId,
      orderNumber: orderNumber++,
      supplierId: carne.id,
      status: 'PENDING',
      amountBase: '380',
      createdByUserId: opts.adminUserId,
      createdAt: at(1, 9),
      movements: { connect: { id: pending[0].id } },
    },
  });
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

/**
 * Recetas (con costos aproximados) para los productos más representativos + dos preparaciones
 * (sub-recetas), y costo manual para el resto — así "Inventario → Recetas" y "Márgen de
 * utilidad" no arrancan vacíos en la demo. Los costos son cantidad × precio del insumo, sin
 * pasar por el grafo de rendimiento/corrección (aproximado a propósito, como pidió el negocio).
 */
async function seedRecipesAndPreparations(
  prisma: PrismaClient,
  restaurantId: string,
  products: { id: string; name: string; price: string }[],
  inventoryItems: { id: string; name: string; unit: string; pricePerUnitBase: string }[],
) {
  const itemByName = new Map(inventoryItems.map((i) => [i.name, i]));
  const productByName = new Map(products.map((p) => [p.name, p]));
  const lineCost = (itemName: string, quantity: number) => {
    const item = itemByName.get(itemName);
    if (!item) return null;
    return { itemId: item.id, quantity, costBase: round2(quantity * Number(item.pricePerUnitBase)) };
  };

  // --- Preparaciones (sub-recetas reutilizables) ---
  const prep1 = await prisma.preparation.create({ data: { restaurantId, name: 'Salsa especial de la casa', unit: 'lt', yieldQuantity: 3 } });
  for (const [name, qty] of [['Mayonesa de la casa', 2], ['Salsa BBQ', 1]] as const) {
    const l = lineCost(name, qty);
    if (l) await prisma.preparationIngredient.create({ data: { restaurantId, preparationId: prep1.id, inventoryItemId: l.itemId, quantity: l.quantity, costBase: l.costBase } });
  }
  const prep2 = await prisma.preparation.create({ data: { restaurantId, name: 'Papas pre-cocidas', unit: 'kg', yieldQuantity: 5 } });
  for (const [name, qty] of [['Papas congeladas', 5], ['Aceite de freír', 0.5]] as const) {
    const l = lineCost(name, qty);
    if (l) await prisma.preparationIngredient.create({ data: { restaurantId, preparationId: prep2.id, inventoryItemId: l.itemId, quantity: l.quantity, costBase: l.costBase } });
  }

  // --- Recetas por producto (insumo → cantidad usada por unidad vendida) ---
  const RECIPES: Record<string, { itemName: string; quantity: number }[]> = {
    'Big Bite Clásica': [
      { itemName: 'Pan para hamburguesa', quantity: 1 },
      { itemName: 'Carne de res (kg)', quantity: 0.15 },
      { itemName: 'Queso cheddar', quantity: 0.03 },
      { itemName: 'Lechuga', quantity: 0.02 },
      { itemName: 'Tomate', quantity: 0.03 },
      { itemName: 'Mayonesa de la casa', quantity: 0.02 },
    ],
    'BBQ Bacon': [
      { itemName: 'Pan para hamburguesa', quantity: 1 },
      { itemName: 'Carne de res (kg)', quantity: 0.15 },
      { itemName: 'Tocineta', quantity: 0.04 },
      { itemName: 'Queso cheddar', quantity: 0.03 },
      { itemName: 'Salsa BBQ', quantity: 0.03 },
    ],
    'Pollo Crocante': [
      { itemName: 'Pan para hamburguesa', quantity: 1 },
      { itemName: 'Pechuga de pollo', quantity: 0.18 },
      { itemName: 'Lechuga', quantity: 0.02 },
      { itemName: 'Mayonesa de la casa', quantity: 0.02 },
    ],
    'Papas Fritas': [
      { itemName: 'Papas congeladas', quantity: 0.2 },
      { itemName: 'Aceite de freír', quantity: 0.05 },
    ],
    Refresco: [{ itemName: 'Refrescos (lata)', quantity: 1 }],
  };
  for (const [productName, lines] of Object.entries(RECIPES)) {
    const product = productByName.get(productName);
    if (!product) continue;
    for (const line of lines) {
      const l = lineCost(line.itemName, line.quantity);
      if (!l) continue;
      await prisma.recipeIngredient.create({
        data: { restaurantId, productId: product.id, inventoryItemId: l.itemId, quantity: l.quantity, costBase: l.costBase },
      });
    }
    await prisma.product.update({ where: { id: product.id }, data: { costSource: 'RECIPE' } });
  }

  // --- Costo manual (aproximado, ~38% del precio) para el resto del menú ---
  const MANUAL_COST_RATIO = 0.38;
  for (const p of products) {
    if (RECIPES[p.name]) continue;
    await prisma.product.update({ where: { id: p.id }, data: { costSource: 'MANUAL', costBase: round2(Number(p.price) * MANUAL_COST_RATIO) } });
  }
}

/**
 * Estructura de costo: config del restaurante + ficha guardada de un puñado de productos
 * representativos, para que "Administración → Estructura de costo" (cobertura, composición
 * promedio, ranking) tenga datos reales que mostrar en la demo.
 */
async function seedCostStructure(
  prisma: PrismaClient,
  restaurantId: string,
  products: { id: string; name: string; price: string }[],
  inventoryItems: { id: string; name: string; unit: string; pricePerUnitBase: string }[],
) {
  const config = await prisma.costStructureConfig.create({
    data: { restaurantId, items: DEFAULT_COST_STRUCTURE_ITEMS as unknown as Prisma.InputJsonValue, targetNetMarginPercent: 20 },
  });
  const items = DEFAULT_COST_STRUCTURE_ITEMS;
  const itemByName = new Map(inventoryItems.map((i) => [i.name, i]));
  const productByName = new Map(products.map((p) => [p.name, p]));

  const MATERIALS: Record<string, { name: string; quantity: number; unit: string; itemName?: string }[]> = {
    'Big Bite Clásica': [
      { name: 'Pan para hamburguesa', quantity: 1, unit: 'unidad', itemName: 'Pan para hamburguesa' },
      { name: 'Carne de res (kg)', quantity: 0.15, unit: 'kg', itemName: 'Carne de res (kg)' },
      { name: 'Queso cheddar', quantity: 0.03, unit: 'kg', itemName: 'Queso cheddar' },
      { name: 'Lechuga', quantity: 0.02, unit: 'kg', itemName: 'Lechuga' },
      { name: 'Tomate', quantity: 0.03, unit: 'kg', itemName: 'Tomate' },
      { name: 'Mayonesa de la casa', quantity: 0.02, unit: 'kg', itemName: 'Mayonesa de la casa' },
    ],
    'BBQ Bacon': [
      { name: 'Pan para hamburguesa', quantity: 1, unit: 'unidad', itemName: 'Pan para hamburguesa' },
      { name: 'Carne de res (kg)', quantity: 0.15, unit: 'kg', itemName: 'Carne de res (kg)' },
      { name: 'Tocineta', quantity: 0.04, unit: 'kg', itemName: 'Tocineta' },
      { name: 'Queso cheddar', quantity: 0.03, unit: 'kg', itemName: 'Queso cheddar' },
      { name: 'Salsa BBQ', quantity: 0.03, unit: 'kg', itemName: 'Salsa BBQ' },
    ],
    'Pollo Crocante': [
      { name: 'Pan para hamburguesa', quantity: 1, unit: 'unidad', itemName: 'Pan para hamburguesa' },
      { name: 'Pechuga de pollo', quantity: 0.18, unit: 'kg', itemName: 'Pechuga de pollo' },
      { name: 'Lechuga', quantity: 0.02, unit: 'kg', itemName: 'Lechuga' },
    ],
    'Papas Fritas': [{ name: 'Papas congeladas', quantity: 0.2, unit: 'kg', itemName: 'Papas congeladas' }],
    'Combo Big Bite': [{ name: 'Costo del producto (manual)', quantity: 1, unit: 'und' }],
  };

  for (const [productName, lines] of Object.entries(MATERIALS)) {
    const product = productByName.get(productName);
    if (!product) continue;
    const materials: MaterialLine[] = lines.map((l) => {
      const item = l.itemName ? itemByName.get(l.itemName) : undefined;
      const unitCost = item ? Number(item.pricePerUnitBase) : round2(Number(product.price) * 0.38);
      return { name: l.name, quantity: l.quantity, unit: l.unit, unitCost, inventoryItemId: item?.id ?? null };
    });
    const salePrice = Number(product.price);
    const result = computeCostStructure({ salePrice, materials, items, targetNetMarginPercent: Number(config.targetNetMarginPercent) });
    await prisma.productCostStructure.create({
      data: {
        restaurantId,
        productId: product.id,
        materials: materials as unknown as Prisma.InputJsonValue,
        materialsCostBase: result.materialsCost,
        variablePercent: result.variablePercent,
        fixedPercent: result.fixedPercent,
        salePriceBase: salePrice,
        variableCostBase: result.variableCost,
        fixedCostBase: result.fixedCost,
        totalCostBase: result.totalCost,
        netProfitBase: result.netProfit,
        netMarginPercent: result.netMarginPercent,
      },
    });
  }
}

/**
 * Merma manual (todos los motivos salvo YIELD_LOSS, que se genera sola al reabastecer — ver
 * movement.service.ts) repartida en los últimos 45 días, sobre insumos y un par de productos
 * terminados, para que el indicador de merma y "Análisis de costo" no arranquen en cero.
 */
async function seedWasteRecords(
  prisma: PrismaClient,
  restaurantId: string,
  opts: { inventoryItems: { id: string; name: string; unit: string; pricePerUnitBase: string }[]; products: { id: string; name: string; price: string }[]; adminUserId: string },
) {
  const now = new Date();
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

  const ITEM_WASTE: { itemName: string; quantity: number; reason: WasteReason; daysAgo: number; note?: string }[] = [
    { itemName: 'Lechuga', quantity: 0.8, reason: WasteReason.EXPIRED, daysAgo: 2, note: 'Se marchitó antes de usarse.' },
    { itemName: 'Tomate', quantity: 1.2, reason: WasteReason.DAMAGED, daysAgo: 5, note: 'Golpeado en el traslado del proveedor.' },
    { itemName: 'Carne de res (kg)', quantity: 0.5, reason: WasteReason.EXPIRED, daysAgo: 1 },
    { itemName: 'Pan para hamburguesa', quantity: 6, reason: WasteReason.DAMAGED, daysAgo: 9, note: 'Se aplastó la caja.' },
    { itemName: 'Queso cheddar', quantity: 0.3, reason: WasteReason.SPILLAGE, daysAgo: 14 },
    { itemName: 'Aceite de freír', quantity: 2, reason: WasteReason.SPILLAGE, daysAgo: 18, note: 'Se derramó al cambiar la freidora.' },
    { itemName: 'Refrescos (lata)', quantity: 4, reason: WasteReason.THEFT, daysAgo: 22, note: 'Faltante en el conteo de cierre.' },
    { itemName: 'Tocineta', quantity: 0.4, reason: WasteReason.EXPIRED, daysAgo: 7 },
    { itemName: 'Pechuga de pollo', quantity: 0.6, reason: WasteReason.DAMAGED, daysAgo: 11, note: 'Cadena de frío interrumpida.' },
    { itemName: 'Empaques desechables', quantity: 15, reason: WasteReason.OTHER, daysAgo: 30, note: 'Se mojaron en bodega.' },
  ];
  const itemByName = new Map(opts.inventoryItems.map((i) => [i.name, i]));
  for (const w of ITEM_WASTE) {
    const item = itemByName.get(w.itemName);
    if (!item) continue;
    await prisma.wasteRecord.create({
      data: {
        restaurantId,
        inventoryItemId: item.id,
        itemName: item.name,
        unit: item.unit,
        quantity: w.quantity,
        costBase: round2(w.quantity * Number(item.pricePerUnitBase)),
        reason: w.reason,
        note: w.note,
        stockAdjusted: false,
        createdByUserId: opts.adminUserId,
        occurredAt: at(w.daysAgo),
        createdAt: at(w.daysAgo),
      },
    });
  }

  const PRODUCT_WASTE: { productName: string; quantity: number; reason: WasteReason; daysAgo: number; note?: string }[] = [
    { productName: 'Big Bite Clásica', quantity: 2, reason: WasteReason.PREPARATION, daysAgo: 3, note: 'Se quemó en la plancha.' },
    { productName: 'BBQ Bacon', quantity: 1, reason: WasteReason.CUSTOMER_RETURN, daysAgo: 6, note: 'Cliente pidió cambio, no le gustó el punto de la carne.' },
    { productName: 'Papas Fritas', quantity: 3, reason: WasteReason.PREPARATION, daysAgo: 10, note: 'Se pasaron de fritura.' },
  ];
  const productByName = new Map(opts.products.map((p) => [p.name, p]));
  for (const w of PRODUCT_WASTE) {
    const product = productByName.get(w.productName);
    if (!product) continue;
    await prisma.wasteRecord.create({
      data: {
        restaurantId,
        productId: product.id,
        itemName: product.name,
        unit: 'und',
        quantity: w.quantity,
        costBase: round2(w.quantity * Number(product.price) * 0.38),
        reason: w.reason,
        note: w.note,
        stockAdjusted: false,
        createdByUserId: opts.adminUserId,
        occurredAt: at(w.daysAgo),
        createdAt: at(w.daysAgo),
      },
    });
  }
}

const EMPLOYEES_DATA: { name: string; position: string; phone: string; idNumber: string; salaryBase: number }[] = [
  { name: 'Rosa Fernández', position: 'Cocinera principal', phone: '04141234567', idNumber: 'V-15234567', salaryBase: 420 },
  { name: 'Jesús Ramírez', position: 'Ayudante de cocina', phone: '04241239876', idNumber: 'V-21345678', salaryBase: 280 },
  { name: 'Camila Torres', position: 'Mesera', phone: '04161237654', idNumber: 'V-24456789', salaryBase: 300 },
  { name: 'Diego Herrera', position: 'Cajero', phone: '04121236543', idNumber: 'V-22567890', salaryBase: 320 },
  { name: 'Antonio Silva', position: 'Encargado de limpieza', phone: '04141235432', idNumber: 'V-18678901', salaryBase: 250 },
  { name: 'Fabiola Reyes', position: 'Supervisora de turno', phone: '04241234321', idNumber: 'V-19789012', salaryBase: 380 },
];

/** Nómina (Desarrollo Humano): empleados + 3 quincenas de pagos ya hechos, con variación real sobre el sueldo acordado. */
async function seedEmployeesAndPayroll(prisma: PrismaClient, restaurantId: string, adminUserId: string) {
  const MONTH_LABELS = ['Junio 2026', 'Julio 2026', 'Agosto 2026'];
  for (const e of EMPLOYEES_DATA) {
    const employee = await prisma.employee.create({
      data: { restaurantId, name: e.name, position: e.position, phone: e.phone, idNumber: e.idNumber, salaryBase: e.salaryBase },
    });
    for (let q = 0; q < 5; q++) {
      const daysAgo = 75 - q * 15;
      const half = round2(e.salaryBase / 2);
      const amount = round2(half + randomInt(-8, 8));
      await prisma.employeePayment.create({
        data: {
          restaurantId,
          employeeId: employee.id,
          amountBase: amount,
          periodLabel: `${q % 2 === 0 ? '1ra' : '2da'} quincena — ${MONTH_LABELS[Math.min(2, Math.floor(q / 2))]}`,
          paymentMethod: pick(['MOBILE_PAYMENT', 'CASH_USD', 'ZELLE'] as const),
          createdByUserId: adminUserId,
          paidAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
        },
      });
    }
  }
}

/** Historial de traslados de insumos entre la sede principal y sus sucursales. */
async function seedInventoryTransfers(
  prisma: PrismaClient,
  opts: {
    groupId: string;
    adminUserId: string;
    main: { id: string; name: string };
    branches: { id: string; name: string }[];
  },
) {
  if (opts.branches.length === 0) return;
  const TRANSFERS: { itemName: string; unit: string; quantity: number; daysAgo: number; fromMain: boolean; branchIndex: number }[] = [
    { itemName: 'Carne de res (kg)', unit: 'kg', quantity: 8, daysAgo: 4, fromMain: true, branchIndex: 0 },
    { itemName: 'Papas congeladas', unit: 'kg', quantity: 15, daysAgo: 9, fromMain: true, branchIndex: 1 },
    { itemName: 'Refrescos (lata)', unit: 'unidad', quantity: 24, daysAgo: 15, fromMain: false, branchIndex: 2 },
    { itemName: 'Queso cheddar', unit: 'kg', quantity: 3, daysAgo: 20, fromMain: true, branchIndex: 2 },
    { itemName: 'Pan para hamburguesa', unit: 'unidad', quantity: 40, daysAgo: 27, fromMain: true, branchIndex: 0 },
  ];
  for (const t of TRANSFERS) {
    const branch = opts.branches[t.branchIndex % opts.branches.length];
    const from = t.fromMain ? opts.main : branch;
    const to = t.fromMain ? branch : opts.main;
    await prisma.inventoryTransfer.create({
      data: {
        groupId: opts.groupId,
        fromRestaurantId: from.id,
        fromScope: 'LOCAL',
        fromLocationName: from.name,
        toRestaurantId: to.id,
        toScope: 'LOCAL',
        toLocationName: to.name,
        itemName: t.itemName,
        unit: t.unit,
        quantity: t.quantity,
        createdByUserId: opts.adminUserId,
        createdAt: new Date(Date.now() - t.daysAgo * 24 * 60 * 60 * 1000),
      },
    });
  }
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
      // Las sucursales heredan el plan de la sede principal (Elite).
      subscriptionPlan: 'ELITE',
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
      // Plan Elite: la demo enseña TODO (Administración completa, CRM, contabilidad, bancos,
      // inventario por receta) y habilita el switcher de sucursales y las 3 que se crean abajo.
      subscriptionPlan: 'ELITE',
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

  // --- Movimientos administrativos: proveedores, gastos por categoría, órdenes de pago,
  //     ingresos manuales y cuentas bancarias (llenan Contabilidad y compañía) ---
  await seedAdministrativeMovements(prisma, restaurant.id, { adminUserId: usersByRole.ADMIN, days: 365 });

  // --- Actividad "de hoy": las 5 etapas del flujo ---
  await seedTodayActivity(prisma, restaurant.id, {
    full: true,
    tableIds,
    couriers,
    cashierUserId: usersByRole.CASHIER,
    createOrder,
  });

  // --- Recetas, preparaciones, costo manual, estructura de costo, merma y nómina, para que
  //     el demo enseñe TODO lo que un cliente prospecto va a querer ver en vivo ---
  await seedRecipesAndPreparations(prisma, restaurant.id, products, inventoryItems);
  await seedCostStructure(prisma, restaurant.id, products, inventoryItems);
  await seedWasteRecords(prisma, restaurant.id, { inventoryItems, products, adminUserId: usersByRole.ADMIN });
  await seedEmployeesAndPayroll(prisma, restaurant.id, usersByRole.ADMIN);

  // --- Requerimiento: 3 sucursales completas (catálogo, inventario, historial propio) ---
  const branches: { id: string; name: string }[] = [];
  for (const branch of BRANCHES_DATA) {
    const created = await seedBranch(prisma, restaurant.id, branch, passwordHash, rateBs);
    branches.push({ id: created.id, name: created.name });
  }

  // --- Historial de transferencia de insumos entre la sede principal y las sucursales ---
  await seedInventoryTransfers(prisma, {
    groupId: restaurant.id,
    adminUserId: usersByRole.ADMIN,
    main: { id: restaurant.id, name: restaurant.name },
    branches,
  });

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
