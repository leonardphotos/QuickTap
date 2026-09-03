const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const p = new PrismaClient();
const API = 'http://localhost:4000/api/v1';
(async () => {
  const rest = await p.restaurant.findUnique({ where: { slug: 'auditoria-qt' } });
  const u = await p.user.findFirst({ where: { restaurantId: rest.id, role: 'OWNER' } });
  const token = jwt.sign({ userId: u.id, restaurantId: rest.id, role: 'OWNER' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const HAM = (await p.product.findFirst({ where: { restaurantId: rest.id, name: 'Hamburguesa' } })).id;
  const api = async (m, path, body) => {
    const r = await fetch(API + path, { method: m, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  let r = await api('POST', '/orders/manual', { channel: 'BAR', customerName: 'Sec', items: [{ productId: HAM, quantity: 1 }] });
  const id = r.body.data.id;
  r = await api('POST', `/orders/${id}/payments`, { amountBase: 12.6, method: 'CASH' });
  console.log('cobrado:', r.status);
  r = await api('PATCH', `/orders/${id}/status`, { status: 'CANCELLED' });
  console.log('cancelar un pedido YA COBRADO ->', r.status, JSON.stringify(r.body?.error ?? ''));
  const o = await p.order.findUnique({ where: { id }, include: { payments: true } });
  console.log('estado final:', o.status, '| cobros encima:', o.payments.length, 'por $' + o.payments.reduce((a, x) => a + Number(x.amountBase), 0));
  await p.$disconnect();
})();
