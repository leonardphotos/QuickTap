const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const p = new PrismaClient();

(async () => {
  const SLUG = 'auditoria-qt';
  // Limpieza de una corrida anterior
  const viejo = await p.restaurant.findUnique({ where: { slug: SLUG } });
  if (viejo) { await p.restaurant.delete({ where: { id: viejo.id } }); }

  const r = await p.restaurant.create({
    data: {
      name: 'Auditoria QT', slug: SLUG, baseCurrency: 'USD',
      whatsappPhone: '584240000000', isActive: true, orderingEnabled: true,
      serviceChargeEnabled: true, ivaEnabled: true,
      subscriptionStatus: 'ACTIVE', subscriptionPlan: 'ELITE', periodEnd: new Date(Date.now() + 365 * 864e5),
      deliveryPricingMode: 'ZONE', deliveryOriginLat: 10.20, deliveryOriginLng: -68.00,
    },
  });

  const hash = await bcrypt.hash('audit1234', 10);
  await p.user.create({ data: { restaurantId: r.id, name: 'Dueño Audit', email: 'audit@qt.test', passwordHash: hash, role: 'OWNER' } });

  const cat = await p.category.create({ data: { restaurantId: r.id, name: 'Platos' } });
  const prod = await p.product.create({ data: { restaurantId: r.id, categoryId: cat.id, name: 'Hamburguesa', price: 10, isAvailable: true } });
  const prod2 = await p.product.create({ data: { restaurantId: r.id, categoryId: cat.id, name: 'Refresco', price: 2, isAvailable: true } });

  const zona = await p.zone.create({ data: { restaurantId: r.id, name: 'Salon' } });
  const mesas = [];
  for (const n of ['1', '2', '3']) {
    mesas.push(await p.table.create({ data: { restaurantId: r.id, zoneId: zona.id, number: n, seats: 4, qrToken: `audit-qr-${n}` } }));
  }

  await p.deliveryZone.create({ data: { restaurantId: r.id, name: 'Cerca', price: 1, polygon: [
    {lat:10.19,lng:-68.02},{lat:10.19,lng:-68.01},{lat:10.21,lng:-68.01},{lat:10.21,lng:-68.02}] } });
  await p.deliveryZone.create({ data: { restaurantId: r.id, name: 'Lejos', price: 3, polygon: [
    {lat:10.19,lng:-67.98},{lat:10.19,lng:-67.97},{lat:10.21,lng:-67.97},{lat:10.21,lng:-67.98}] } });

  console.log(JSON.stringify({
    restaurantId: r.id, slug: SLUG,
    productos: { hamburguesa: prod.id, refresco: prod2.id },
    mesas: mesas.map(m => ({ numero: m.number, id: m.id, qr: m.qrToken })),
  }, null, 1));
  await p.$disconnect();
})();
