module.exports = async function () {
  const { p, api, check, nota, rest, token, HAM, n } = global.__ctx;
  const T = (x) => console.log('\n── ' + x + ' ' + '─'.repeat(Math.max(0, 60 - x.length)));
  const cat = await p.category.findFirst({ where: { restaurantId: rest.id } });

  const nuevoProd = async (nombre, stock) =>
    p.product.create({ data: { restaurantId: rest.id, categoryId: cat.id, name: nombre, price: 5, isAvailable: true, stockControlEnabled: true, stockQuantity: stock } });
  const pedir = (prodId, qty) => api('POST', '/orders/manual', { channel: 'BAR', customerName: 'Stk', items: [{ productId: prodId, quantity: qty }] }, token);

  // ══════════════════════════════════════════════════════════════════
  T('AE. BLOQUEO APAGADO (por defecto) — se vende de más y el stock va a negativo');
  // ══════════════════════════════════════════════════════════════════
  await p.restaurant.update({ where: { id: rest.id }, data: { blockOrdersWithoutStock: false } });
  let prod = await nuevoProd('Torta apagado', 3);
  let res = await pedir(prod.id, 10);
  check(res.status === 201, 'AE1 con el bloqueo apagado se puede pedir 10 con 3 en stock', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);
  await api('PATCH', `/orders/${res.body.data.id}/status`, { status: 'SERVED' }, token);
  let db = await p.product.findUnique({ where: { id: prod.id } });
  check(db.stockQuantity === -7, 'AE2 el stock queda en −7 (3 − 10), no pisado en 0', `quedó en ${db.stockQuantity}`);

  // Y sigue bajando
  res = await pedir(prod.id, 2);
  await api('PATCH', `/orders/${res.body.data.id}/status`, { status: 'SERVED' }, token);
  db = await p.product.findUnique({ where: { id: prod.id } });
  check(db.stockQuantity === -9, 'AE3 sigue bajando: −9', `quedó en ${db.stockQuantity}`);

  // ══════════════════════════════════════════════════════════════════
  T('AF. BLOQUEO ENCENDIDO — no se puede comandar más de lo que hay');
  // ══════════════════════════════════════════════════════════════════
  await p.restaurant.update({ where: { id: rest.id }, data: { blockOrdersWithoutStock: true } });
  prod = await nuevoProd('Torta bloqueada', 3);

  res = await pedir(prod.id, 10);
  check(res.status >= 400, 'AF1 pedir 10 con 3 en stock se RECHAZA', `status ${res.status}`);
  check(/quedan 3/.test(res.body?.error ?? ''), 'AF2 el mensaje dice cuántas quedan', `mensaje: ${res.body?.error}`);

  res = await pedir(prod.id, 3);
  check(res.status === 201, 'AF3 pedir exactamente las 3 que quedan sí pasa', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);

  // Ya hay 3 comprometidas sin servir: no debe dejar pedir ni una más
  res = await pedir(prod.id, 1);
  check(res.status >= 400, 'AF4 con las 3 ya pedidas y sin servir, no deja pedir una más', `status ${res.status} — dos mesas se llevarían las mismas unidades`);
  check(/agotado/i.test(res.body?.error ?? ''), 'AF5 el mensaje dice que está agotado', `mensaje: ${res.body?.error}`);

  // Producto con 1 unidad
  const uno = await nuevoProd('Ultima unidad', 1);
  res = await pedir(uno.id, 2);
  check(res.status >= 400, 'AF6 con 1 en stock, pedir 2 se rechaza', `status ${res.status}`);
  check(/queda 1 unidad/.test(res.body?.error ?? ''), 'AF7 el mensaje usa el singular', `mensaje: ${res.body?.error}`);
  res = await pedir(uno.id, 1);
  check(res.status === 201, 'AF8 pedir la última unidad sí pasa', `status ${res.status}`);

  // El QR del comensal también respeta el bloqueo
  const agotado = await nuevoProd('Sin nada', 0);
  const mesa = await p.table.findFirst({ where: { restaurantId: rest.id } });
  res = await api('POST', '/public/checkout/dine-in', { qrToken: mesa.qrToken, items: [{ productId: agotado.id, quantity: 1 }], customerName: 'Q', customerIdNumber: 'V-1', customerPhone: '04140000000' });
  check(res.status >= 400, 'AF9 el bloqueo también aplica al pedido por QR', `status ${res.status}`);

  // Agregar productos a un pedido en curso también respeta el bloqueo
  const base = await pedir(HAM, 1);
  res = await api('POST', `/orders/${base.body.data.id}/items/batch`, { items: [{ productId: uno.id, quantity: 5 }] }, token);
  check(res.status >= 400, 'AF10 agregar a un pedido en curso también se bloquea', `status ${res.status}`);

  // Un producto SIN control de stock nunca se bloquea
  res = await pedir(HAM, 50);
  check(res.status === 201, 'AF11 un producto sin control de stock no se bloquea nunca', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);

  await p.restaurant.update({ where: { id: rest.id }, data: { blockOrdersWithoutStock: false } });
};
