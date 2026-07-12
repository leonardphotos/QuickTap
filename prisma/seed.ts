import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

const prisma = new PrismaClient();

/**
 * Semilla de demostración: crea un restaurante con dueño, categorías,
 * productos (con banderas de marketing) y mesas.
 */
async function main() {
  const passwordHash = await bcrypt.hash('demo1234', 10);

  const restaurant = await prisma.restaurant.upsert({
    where: { slug: 'la-parrilla-de-juan' },
    update: {},
    create: {
      slug: 'la-parrilla-de-juan',
      name: 'La Parrilla de Juan',
      description: 'Comida criolla y parrilla a la leña.',
      baseCurrency: 'USD',
      whatsappPhone: '584141234567',
      users: {
        create: {
          email: 'juan@laparrilla.com',
          passwordHash,
          name: 'Juan Pérez',
          role: 'OWNER',
        },
      },
    },
  });

  const entradas = await prisma.category.create({
    data: { restaurantId: restaurant.id, name: 'Entradas', priority: 1 },
  });
  const principales = await prisma.category.create({
    data: { restaurantId: restaurant.id, name: 'Platos Principales', priority: 2 },
  });
  const bebidas = await prisma.category.create({
    data: { restaurantId: restaurant.id, name: 'Bebidas', priority: 3 },
  });

  await prisma.product.createMany({
    data: [
      {
        restaurantId: restaurant.id,
        categoryId: entradas.id,
        name: 'Tequeños (x6)',
        description: 'Palitos de queso envueltos en masa crujiente.',
        price: '5.00',
        isHouseSpecial: true,
      },
      {
        restaurantId: restaurant.id,
        categoryId: principales.id,
        name: 'Parrilla Mixta',
        description: 'Res, pollo, cerdo y chorizo con guarniciones.',
        price: '18.50',
        isStar: true,
      },
      {
        restaurantId: restaurant.id,
        categoryId: principales.id,
        name: 'Pabellón Criollo',
        description: 'Carne mechada, caraotas, arroz y tajadas.',
        price: '9.90',
        isPromo: true,
      },
      {
        restaurantId: restaurant.id,
        categoryId: bebidas.id,
        name: 'Jugo Natural',
        description: 'Parchita, mango o guayaba.',
        price: '2.50',
      },
    ],
  });

  await prisma.table.createMany({
    data: [
      { restaurantId: restaurant.id, number: '1', qrToken: nanoid(12) },
      { restaurantId: restaurant.id, number: '2', qrToken: nanoid(12) },
      { restaurantId: restaurant.id, number: 'Terraza-1', qrToken: nanoid(12) },
    ],
  });

  // Tasa BCV de respaldo para desarrollo local (el servidor intenta refrescarla
  // automáticamente al arrancar; esto solo evita quedar sin tasa si esa llamada
  // externa falla, p. ej. detrás de un firewall restrictivo).
  await prisma.exchangeRate.upsert({
    where: { currency: 'USD' },
    update: {},
    create: { currency: 'USD', rateBs: '40.50', source: 'SEED' },
  });
  await prisma.exchangeRate.upsert({
    where: { currency: 'EUR' },
    update: {},
    create: { currency: 'EUR', rateBs: '43.80', source: 'SEED' },
  });

  // eslint-disable-next-line no-console
  console.log(`✅ Semilla lista. Restaurante público: /${restaurant.slug}`);
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
