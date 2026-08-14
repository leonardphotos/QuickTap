import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { trialPeriodEnd } from '../src/utils/subscription';

/**
 * Local comercial de demostración para QuickTap Shop: "Urbana Store", una tienda de ropa con
 * los dos roles de equipo que existen en el vertical Shop (Administrador y Cajero, ver
 * SHOP_ASSIGNABLE_ROLES en ShopTeamSection.tsx) además del Dueño, 20 productos con foto real
 * (Unsplash) y variantes de talla/color, y meses de movimiento (ventas, compras, ajustes de
 * stock, cajas abiertas/cerradas, ingresos/egresos) para que el panel se vea usado de verdad.
 *
 * A diferencia de seed-demo.ts (restaurante slug 'demo'), esto NO se marca isDemo — vive
 * permanentemente, no lo resetea el barrido de inactividad (ese solo mira slug === 'demo').
 */

const prisma = new PrismaClient();

const SLUG = 'urbana-store';
const PASSWORD = 'UrbanaDemo2026';

const SUPPLIERS = ['Textiles del Sur', 'Distribuidora Andina'];

interface ProductSeed {
  name: string;
  category: string;
  subcategory: string;
  sku: string;
  location: string;
  price: number;
  cost: number;
  minStock: number;
  photoUrl: string;
  variants: { v1: string; v2: string; stock: number }[];
}

// Fotos de stock estables (Unsplash) — mismo mecanismo que ya usa el resto del seed de demo
// (seed-demo-restaurant.ts): un string URL, sin subir archivos.
const PRODUCTS: ProductSeed[] = [
  { name: 'Camiseta Básica Blanca', category: 'Indumentaria', subcategory: 'Camisetas', sku: 'CAM-BAS-BL', location: 'Pasillo 1, Estante A', price: 12.5, cost: 5.2, minStock: 8, photoUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80', variants: [{ v1: 'S', v2: 'Blanco', stock: 14 }, { v1: 'M', v2: 'Blanco', stock: 18 }, { v1: 'L', v2: 'Blanco', stock: 6 }] },
  { name: 'Camiseta Básica Negra', category: 'Indumentaria', subcategory: 'Camisetas', sku: 'CAM-BAS-NG', location: 'Pasillo 1, Estante A', price: 12.5, cost: 5.2, minStock: 8, photoUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&q=80', variants: [{ v1: 'S', v2: 'Negro', stock: 2 }, { v1: 'M', v2: 'Negro', stock: 9 }, { v1: 'L', v2: 'Negro', stock: 0 }] },
  { name: 'Jean Slim Fit Azul', category: 'Indumentaria', subcategory: 'Pantalones', sku: 'JEA-SLM-AZ', location: 'Pasillo 1, Estante C', price: 34.9, cost: 26.0, minStock: 6, photoUrl: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=800&q=80', variants: [{ v1: '38', v2: 'Azul', stock: 5 }, { v1: '40', v2: 'Azul', stock: 7 }, { v1: '42', v2: 'Azul', stock: 1 }] },
  { name: 'Jean Slim Fit Negro', category: 'Indumentaria', subcategory: 'Pantalones', sku: 'JEA-SLM-NG', location: 'Pasillo 1, Estante C', price: 34.9, cost: 26.0, minStock: 6, photoUrl: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=800&q=80', variants: [{ v1: '38', v2: 'Negro', stock: 0 }, { v1: '40', v2: 'Negro', stock: 4 }] },
  { name: 'Campera Denim', category: 'Indumentaria', subcategory: 'Abrigos', sku: 'CAM-DNM', location: 'Pasillo 1, Estante D', price: 52.0, cost: 24.0, minStock: 4, photoUrl: 'https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=800&q=80', variants: [{ v1: 'S', v2: 'Azul', stock: 3 }, { v1: 'M', v2: 'Azul', stock: 5 }, { v1: 'L', v2: 'Azul', stock: 2 }] },
  { name: 'Buzo Canguro Gris', category: 'Indumentaria', subcategory: 'Abrigos', sku: 'BUZ-CNG-GR', location: 'Pasillo 1, Estante D', price: 28.0, cost: 12.5, minStock: 6, photoUrl: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800&q=80', variants: [{ v1: 'S', v2: 'Gris', stock: 9 }, { v1: 'M', v2: 'Gris', stock: 11 }, { v1: 'L', v2: 'Gris', stock: 3 }] },
  { name: 'Camisa Formal Celeste', category: 'Indumentaria', subcategory: 'Camisas', sku: 'CAM-FOR-CL', location: 'Pasillo 1, Estante B', price: 29.9, cost: 14.0, minStock: 5, photoUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&q=80', variants: [{ v1: 'M', v2: 'Celeste', stock: 6 }, { v1: 'L', v2: 'Celeste', stock: 4 }] },
  { name: 'Vestido Casual Floral', category: 'Indumentaria', subcategory: 'Vestidos', sku: 'VES-CAS-FL', location: 'Pasillo 1, Estante E', price: 38.0, cost: 17.5, minStock: 4, photoUrl: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800&q=80', variants: [{ v1: 'S', v2: 'Floral', stock: 5 }, { v1: 'M', v2: 'Floral', stock: 7 }] },
  { name: 'Falda Denim', category: 'Indumentaria', subcategory: 'Faldas', sku: 'FAL-DNM', location: 'Pasillo 1, Estante E', price: 24.0, cost: 10.5, minStock: 4, photoUrl: 'https://images.unsplash.com/photo-1583496661160-fb5886a13d77?w=800&q=80', variants: [{ v1: 'S', v2: 'Azul', stock: 4 }, { v1: 'M', v2: 'Azul', stock: 6 }] },
  { name: 'Short Deportivo', category: 'Indumentaria', subcategory: 'Deportivo', sku: 'SHO-DEP', location: 'Pasillo 1, Estante F', price: 15.5, cost: 6.5, minStock: 6, photoUrl: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=800&q=80', variants: [{ v1: 'M', v2: 'Negro', stock: 10 }, { v1: 'L', v2: 'Negro', stock: 8 }] },
  { name: 'Zapatilla Runner Negra', category: 'Calzado', subcategory: 'Zapatillas', sku: 'ZAP-RUN-NG', location: 'Pasillo 2, Estante A', price: 68.0, cost: 58.0, minStock: 5, photoUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80', variants: [{ v1: '39', v2: 'Negro', stock: 4 }, { v1: '40', v2: 'Negro', stock: 6 }, { v1: '41', v2: 'Negro', stock: 2 }] },
  { name: 'Zapatilla Runner Blanca', category: 'Calzado', subcategory: 'Zapatillas', sku: 'ZAP-RUN-BL', location: 'Pasillo 2, Estante A', price: 68.0, cost: 58.0, minStock: 5, photoUrl: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800&q=80', variants: [{ v1: '42', v2: 'Blanco', stock: 3 }, { v1: '43', v2: 'Blanco', stock: 5 }] },
  { name: 'Bota Urbana Marrón', category: 'Calzado', subcategory: 'Botas', sku: 'BOT-URB-MR', location: 'Pasillo 2, Estante B', price: 74.5, cost: 55.0, minStock: 4, photoUrl: 'https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=800&q=80', variants: [{ v1: '39', v2: 'Marrón', stock: 1 }, { v1: '40', v2: 'Marrón', stock: 1 }] },
  { name: 'Sandalia Verano Beige', category: 'Calzado', subcategory: 'Sandalias', sku: 'SAN-VER-BG', location: 'Pasillo 2, Estante C', price: 22.0, cost: 9.0, minStock: 6, photoUrl: 'https://images.unsplash.com/photo-1603487742131-4160ec999306?w=800&q=80', variants: [{ v1: '37', v2: 'Beige', stock: 10 }, { v1: '38', v2: 'Beige', stock: 12 }] },
  { name: 'Mocasín Casual', category: 'Calzado', subcategory: 'Mocasines', sku: 'MOC-CAS', location: 'Pasillo 2, Estante D', price: 45.0, cost: 22.0, minStock: 4, photoUrl: 'https://images.unsplash.com/photo-1614252369475-531eba835eb1?w=800&q=80', variants: [{ v1: '40', v2: 'Marrón', stock: 3 }, { v1: '41', v2: 'Marrón', stock: 5 }] },
  { name: 'Gorra Snapback Negra', category: 'Accesorios', subcategory: 'Gorras', sku: 'GOR-SNP-NG', location: 'Pasillo 3, Estante A', price: 15.0, cost: 6.0, minStock: 10, photoUrl: 'https://images.unsplash.com/photo-1521369909029-2afed882baee?w=800&q=80', variants: [{ v1: 'Único', v2: 'Negro', stock: 20 }, { v1: 'Único', v2: 'Azul', stock: 13 }] },
  { name: 'Mochila Urbana', category: 'Accesorios', subcategory: 'Mochilas', sku: 'MOC-URB', location: 'Pasillo 3, Estante B', price: 39.0, cost: 18.0, minStock: 5, photoUrl: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80', variants: [{ v1: 'Único', v2: 'Negro', stock: 2 }, { v1: 'Único', v2: 'Gris', stock: 1 }] },
  { name: 'Cinturón de Cuero', category: 'Accesorios', subcategory: 'Cinturones', sku: 'CIN-CUE', location: 'Pasillo 3, Estante C', price: 18.5, cost: 7.5, minStock: 8, photoUrl: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80', variants: [{ v1: 'M', v2: 'Marrón', stock: 9 }, { v1: 'L', v2: 'Marrón', stock: 1 }] },
  { name: 'Lentes de Sol', category: 'Accesorios', subcategory: 'Lentes', sku: 'LEN-SOL', location: 'Pasillo 3, Estante D', price: 21.0, cost: 8.0, minStock: 6, photoUrl: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=800&q=80', variants: [{ v1: 'Único', v2: 'Negro', stock: 12 }] },
  { name: 'Billetera de Cuero', category: 'Accesorios', subcategory: 'Billeteras', sku: 'BIL-CUE', location: 'Pasillo 3, Estante E', price: 16.0, cost: 6.5, minStock: 8, photoUrl: 'https://images.unsplash.com/photo-1627123424574-724758594e90?w=800&q=80', variants: [{ v1: 'Único', v2: 'Marrón', stock: 15 }, { v1: 'Único', v2: 'Negro', stock: 10 }] },
];

const PAYMENT_METHODS = ['Efectivo Bs', 'Pago Móvil', 'Zelle', 'Efectivo $'];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(randomInt(9, 20), randomInt(0, 59), 0, 0);
  return d;
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
      name: 'Urbana Store',
      description: 'Tienda de ropa, calzado y accesorios — cuenta de demostración de QuickTap Shop.',
      businessType: 'SHOP',
      shopRubro: 'ropa',
      // Cuenta de demostración: sin PIN de bloqueo, para que un prospecto entre directo.
      lockScreenEnabled: false,
      baseCurrency: 'USD',
      periodEnd: trialPeriodEnd(),
      subscriptionStatus: 'ACTIVE',
      subscriptionPlan: 'PRO',
      theme: { primary: '#1E293B', accent: '#F59E0B' },
      paymentMethodsConfig: {
        CASH: { enabled: true },
        CASH_USD: { enabled: true },
        MOBILE_PAYMENT: { enabled: true, banco: 'Banesco', telefono: '04141234567', cedula: 'V-12345678', titular: 'Urbana Store C.A.' },
        ZELLE: { enabled: true, cuenta: 'pagos@urbanastore.com' },
      },
    },
  });

  const [owner, admin, cashier] = await Promise.all([
    prisma.user.create({ data: { restaurantId: restaurant.id, email: 'duena@urbanastore.club', passwordHash, name: 'Valentina Rojas', role: 'OWNER' } }),
    prisma.user.create({ data: { restaurantId: restaurant.id, email: 'admin@urbanastore.club', passwordHash, name: 'Carlos Mendoza', role: 'ADMIN' } }),
    prisma.user.create({ data: { restaurantId: restaurant.id, email: 'caja@urbanastore.club', passwordHash, name: 'Génesis Torres', role: 'CASHIER' } }),
  ]);
  const staffUsers = [owner, admin, cashier];

  console.log('Usuarios creados:');
  console.log(`  Dueña:  duena@urbanastore.club / ${PASSWORD}`);
  console.log(`  Admin:  admin@urbanastore.club / ${PASSWORD}`);
  console.log(`  Cajera: caja@urbanastore.club / ${PASSWORD}`);

  // --- Catálogo: 20 productos con foto y variantes ---
  const categories = new Set<string>();
  const subcategoriesByCategory: Record<string, Set<string>> = {};
  const products = [];
  for (const p of PRODUCTS) {
    const created = await prisma.shopProduct.create({
      data: {
        restaurantId: restaurant.id,
        name: p.name,
        category: p.category,
        subcategory: p.subcategory,
        sku: p.sku,
        location: p.location,
        price: p.price,
        cost: p.cost,
        minStock: p.minStock,
        photoUrl: p.photoUrl,
        variants: { createMany: { data: p.variants.map((v) => ({ v1: v.v1, v2: v.v2, stock: v.stock })) } },
      },
      include: { variants: true },
    });
    products.push(created);
    categories.add(p.category);
    (subcategoriesByCategory[p.category] ??= new Set()).add(p.subcategory);
  }
  console.log(`${products.length} productos creados.`);

  await Promise.all(
    Array.from(categories).map((name) => prisma.shopCategory.create({ data: { restaurantId: restaurant.id, name } })),
  );
  for (const [category, subs] of Object.entries(subcategoriesByCategory)) {
    await Promise.all(
      Array.from(subs).map((name) => prisma.shopSubcategory.create({ data: { restaurantId: restaurant.id, category, name } })),
    );
  }

  // --- Compras a proveedores (reponen stock, últimos 60 días) ---
  for (let i = 0; i < 18; i++) {
    const product = pick(products);
    const variant = pick(product.variants);
    const qty = randomInt(3, 15);
    await prisma.shopPurchase.create({
      data: {
        restaurantId: restaurant.id,
        supplier: pick(SUPPLIERS),
        productId: product.id,
        productName: product.name,
        v1: variant.v1,
        v2: variant.v2,
        qty,
        cost: product.cost,
        time: daysAgo(randomInt(1, 60)),
      },
    });
  }
  console.log('18 compras a proveedores creadas.');

  // --- Ajustes de stock (recuentos físicos ocasionales) ---
  for (let i = 0; i < 6; i++) {
    const product = pick(products);
    const variant = pick(product.variants);
    const before = variant.stock;
    const counted = Math.max(0, before + randomInt(-3, 3));
    await prisma.shopStockAdjustment.create({
      data: {
        restaurantId: restaurant.id,
        productId: product.id,
        productName: product.name,
        v1: variant.v1,
        v2: variant.v2,
        before,
        after: counted,
        diff: counted - before,
        reason: 'Recuento físico mensual',
        time: daysAgo(randomInt(1, 45)),
      },
    });
  }
  console.log('6 ajustes de stock creados.');

  // --- Cajas: últimos 12 días cerradas + una abierta hoy ---
  for (let day = 12; day >= 1; day--) {
    const opening = randomInt(20, 60);
    const totalSales = randomInt(80, 320);
    const salesCount = randomInt(3, 12);
    const expected = opening + totalSales;
    const counted = expected + randomInt(-5, 5);
    const openedAt = daysAgo(day);
    openedAt.setHours(9, 0, 0, 0);
    const closedAt = new Date(openedAt);
    closedAt.setHours(19, 30, 0, 0);
    await prisma.shopCashSession.create({
      data: {
        restaurantId: restaurant.id,
        openedAt,
        closedAt,
        opening,
        salesCount,
        totalSales,
        expected,
        counted,
        diff: counted - expected,
      },
    });
  }
  const todayOpen = daysAgo(0);
  todayOpen.setHours(9, 0, 0, 0);
  await prisma.shopCashSession.create({
    data: { restaurantId: restaurant.id, openedAt: todayOpen, opening: 40 },
  });
  console.log('12 cajas cerradas + 1 abierta hoy.');

  // --- Ventas: ~55 en los últimos 30 días ---
  let saleCount = 0;
  for (let i = 0; i < 55; i++) {
    const dayOffset = randomInt(0, 29);
    const numItems = randomInt(1, 3);
    const items = [];
    let total = 0;
    for (let j = 0; j < numItems; j++) {
      const product = pick(products);
      const variant = pick(product.variants);
      const qty = randomInt(1, 3);
      const price = product.price;
      items.push({
        productId: product.id,
        v1: variant.v1,
        v2: variant.v2,
        name: product.name,
        category: product.category,
        qty,
        price,
        cost: product.cost,
      });
      total += price * qty;
    }
    const returned = Math.random() < 0.06;
    const method = pick(PAYMENT_METHODS);
    const paymentMeta = method === 'Pago Móvil' ? { reference: String(randomInt(100000, 999999)), hasProof: true } : undefined;

    await prisma.shopSale.create({
      data: {
        restaurantId: restaurant.id,
        total: Math.round(total * 100) / 100,
        time: daysAgo(dayOffset),
        paymentMethod: method,
        paymentMeta,
        returned,
        items: { createMany: { data: items } },
      },
    });
    saleCount++;
  }
  console.log(`${saleCount} ventas creadas.`);

  // --- Movimientos de caja del restaurante (ingresos/egresos, últimos 45 días) ---
  const expenseDescriptions: [string, string][] = [
    ['RENT', 'Arriendo del local'],
    ['UTILITIES', 'Electricidad y agua'],
    ['SUPPLIES', 'Compra de bolsas y empaques'],
    ['PAYROLL', 'Pago de nómina quincenal'],
    ['MARKETING', 'Publicidad en redes sociales'],
    ['TRANSPORT', 'Flete de mercancía'],
    ['MAINTENANCE', 'Mantenimiento de aire acondicionado'],
    ['ADMINISTRATIVE', 'Papelería y facturación'],
  ];
  for (let i = 0; i < 20; i++) {
    const [category, description] = pick(expenseDescriptions);
    await prisma.movement.create({
      data: {
        restaurantId: restaurant.id,
        type: 'EXPENSE',
        amountBase: randomInt(15, 400),
        description,
        category: category as any,
        createdByUserId: pick(staffUsers).id,
        createdAt: daysAgo(randomInt(1, 45)),
      },
    });
  }
  const incomeDescriptions: [string, string][] = [
    ['TIP', 'Propina de cliente satisfecho'],
    ['DEBT', 'Cobro de fiado pendiente'],
    ['OTHER', 'Venta de exhibidor en desuso'],
  ];
  for (let i = 0; i < 8; i++) {
    const [category, description] = pick(incomeDescriptions);
    await prisma.movement.create({
      data: {
        restaurantId: restaurant.id,
        type: 'INCOME',
        amountBase: randomInt(5, 60),
        description,
        incomeCategory: category as any,
        paymentMethod: pick(['CASH', 'MOBILE_PAYMENT', 'ZELLE']) as any,
        createdByUserId: pick(staffUsers).id,
        createdAt: daysAgo(randomInt(1, 45)),
      },
    });
  }
  console.log('20 egresos + 8 ingresos creados en Movimientos.');

  console.log('\n✅ "Urbana Store" lista.');
  console.log(`   Panel: /admin/login → duena@urbanastore.club / ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
