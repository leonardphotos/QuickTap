module.exports = async function () {
  const { p, api, check, nota, rest, token, HAM, REF, mesas, n, r2 } = global.__ctx;
  const T = (x) => console.log('\n── ' + x + ' ' + '─'.repeat(Math.max(0, 60 - x.length)));
  const jwt = require('jsonwebtoken');

  const nuevoPedido = async (qty = 1, prod = HAM, canal = 'BAR') => {
    const r = await api('POST', '/orders/manual', { channel: canal, items: [{ productId: prod, quantity: qty }], customerName: 'Test' }, token);
    return r.body?.data;
  };

  // ══════════════════════════════════════════════════════════════════
  T('G. PAGO FRACCIONADO Y SALDOS');
  // ══════════════════════════════════════════════════════════════════
  let o = await nuevoPedido(1);                    // 10 + 1 + 1.6 = 12.60
  let res = await api('POST', `/orders/${o.id}/payments`, { amountBase: 5, method: 'CASH' }, token);
  check(res.status === 201, 'G1 abono parcial se registra', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);
  res = await api('POST', `/orders/${o.id}/payments`, { amountBase: 5, method: 'CASH' }, token);
  check(res.status === 201, 'G2 segundo abono', `status ${res.status}`);
  res = await api('POST', `/orders/${o.id}/payments`, { amountBase: 3, method: 'CASH' }, token);
  check(res.status >= 400, 'G3 el tercer abono excede el saldo y se rechaza', `status ${res.status} — dejó pagar $13 de $12.60`);
  res = await api('POST', `/orders/${o.id}/payments`, { amountBase: 2.6, method: 'CASH' }, token);
  check(res.status === 201, 'G4 abono exacto que salda la cuenta', `status ${res.status}`);
  let db = await p.order.findUnique({ where: { id: o.id }, include: { payments: true } });
  const pagado = db.payments.reduce((a, x) => a + n(x.amountBase), 0);
  check(r2(pagado) === 12.6, 'G5 la suma de abonos es exacta', `pagado ${r2(pagado)} de 12.60`);

  // ══════════════════════════════════════════════════════════════════
  T('H. DESCUENTOS Y PERMISOS');
  // ══════════════════════════════════════════════════════════════════
  const cajero = await p.user.create({ data: { restaurantId: rest.id, name: 'Cajero', email: `caj${Date.now()}@qt.test`, passwordHash: 'x', role: 'CASHIER' } });
  const tokCajero = jwt.sign({ userId: cajero.id, restaurantId: rest.id, role: 'CASHIER' }, process.env.JWT_SECRET, { expiresIn: '1h' });

  o = await nuevoPedido(1);
  res = await api('POST', `/orders/${o.id}/payments`, { amountBase: 1, method: 'CASH', discountPercent: 50 }, tokCajero);
  check(res.status === 403, 'H1 un cajero NO puede aplicar descuento', `status ${res.status}`);
  res = await api('POST', `/orders/${o.id}/payments`, { amountBase: 1, method: 'CASH', discountAmount: 5 }, tokCajero);
  check(res.status === 403, 'H2 tampoco por monto', `status ${res.status}`);
  res = await api('POST', `/orders/${o.id}/payments`, { amountBase: 1, method: 'CASH', serviceChargeDiscountPercent: 100 }, tokCajero);
  check(res.status === 403, 'H3 tampoco condonando el servicio', `status ${res.status}`);

  // El dueño sí puede, y el saldo debe bajar de verdad
  o = await nuevoPedido(1);                        // 12.60
  res = await api('POST', `/orders/${o.id}/payments`, { amountBase: 6.3, method: 'CASH', discountPercent: 50 }, token);
  check(res.status === 201, 'H4 el dueño sí puede descontar', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);
  db = await p.order.findUnique({ where: { id: o.id }, include: { payments: true } });
  // Mismo criterio que settledOf en el frontend y que addPayment en el backend.
  const saldado = db.payments.reduce((a, x) => a + n(x.amountBase) + n(x.discountBase) + n(x.serviceChargeDiscountBase), 0);
  const saldo = n(db.totalBase) - saldado;
  check(Math.abs(saldo) < 0.02, 'H5 con 50% de descuento la cuenta queda saldada', `saldo ${r2(saldo)}`);

  // Descuento mayor al 100%
  o = await nuevoPedido(1);
  res = await api('POST', `/orders/${o.id}/payments`, { amountBase: 0, method: 'CASH', discountPercent: 150 }, token);
  check(res.status >= 400, 'H6 descuento mayor a 100% se rechaza', `status ${res.status}`);

  // ══════════════════════════════════════════════════════════════════
  T('I. INVENTARIO — descuento por receta');
  // ══════════════════════════════════════════════════════════════════
  const insumo = await p.inventoryItem.create({ data: { restaurantId: rest.id, name: 'Carne audit', unit: 'kg', quantity: 10, minQuantity: 1, pricePerUnitBase: 8 } });
  await p.recipeIngredient.create({ data: { restaurantId: rest.id, productId: HAM, inventoryItemId: insumo.id, quantity: 0.2, costBase: 1.6 } });
  await p.product.update({ where: { id: HAM }, data: { costSource: 'RECIPE' } });

  o = await nuevoPedido(3);                        // 3 hamburguesas -> 0.6 kg
  res = await api('PATCH', `/orders/${o.id}/status`, { status: 'SERVED' }, token);
  check(res.status === 200, 'I1 marcar SERVED', `status ${res.status}`);
  let inv = await p.inventoryItem.findUnique({ where: { id: insumo.id } });
  check(Math.abs(n(inv.quantity) - 9.4) < 0.001, 'I2 el stock baja 0.6 kg al servir 3 hamburguesas', `quedó ${inv.quantity}, esperado 9.4`);

  // Servir dos veces no debe descontar dos veces
  res = await api('PATCH', `/orders/${o.id}/status`, { status: 'SERVED' }, token);
  inv = await p.inventoryItem.findUnique({ where: { id: insumo.id } });
  check(Math.abs(n(inv.quantity) - 9.4) < 0.001, 'I3 volver a marcar SERVED no descuenta de nuevo', `quedó ${inv.quantity}, esperado 9.4`);

  // Cancelar después de servir: ¿devuelve el stock?
  const antesCancel = n(inv.quantity);
  res = await api('PATCH', `/orders/${o.id}/status`, { status: 'CANCELLED' }, token);
  inv = await p.inventoryItem.findUnique({ where: { id: insumo.id } });
  if (res.status === 200) {
    nota(`I4 cancelar un pedido ya servido ${Math.abs(n(inv.quantity) - antesCancel) < 0.001 ? 'NO devuelve el stock' : 'devuelve el stock'} (antes ${antesCancel}, ahora ${inv.quantity})`);
  } else nota(`I4 no se pudo cancelar un pedido ya servido (status ${res.status})`);

  // ══════════════════════════════════════════════════════════════════
  T('J. NUMERACIÓN DE PEDIDOS BAJO CONCURRENCIA');
  // ══════════════════════════════════════════════════════════════════
  const antes = await p.order.count({ where: { restaurantId: rest.id } });
  const lote = await Promise.all(
    Array.from({ length: 12 }, () => api('POST', '/orders/manual', { channel: 'BAR', items: [{ productId: REF, quantity: 1 }], customerName: 'Conc' }, token)),
  );
  const creados = lote.filter((x) => x.status === 201).map((x) => x.body.data.orderNumber);
  const unicos = new Set(creados);
  check(creados.length === 12, 'J1 los 12 pedidos simultáneos se crearon', `creados ${creados.length}/12`);
  check(unicos.size === creados.length, 'J2 ningún número de pedido repetido', `${creados.length} pedidos, ${unicos.size} números distintos: ${creados.sort((a,b)=>a-b).join(',')}`);
  const despues = await p.order.count({ where: { restaurantId: rest.id } });
  check(despues - antes === 12, 'J3 no se perdió ni duplicó ningún pedido', `delta ${despues - antes}`);

  // ══════════════════════════════════════════════════════════════════
  T('K. CIERRE DE CAJA');
  // ══════════════════════════════════════════════════════════════════
  res = await api('POST', '/cash-sessions/open', { openingBalances: { CASH: 100 } }, token);
  const abrio = res.status === 201 || res.status === 200;
  check(abrio, 'K1 abrir caja', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);
  if (abrio) {
    o = await nuevoPedido(1);
    await api('POST', `/orders/${o.id}/payments`, { amountBase: 12.6, method: 'CASH' }, token);
    res = await api('GET', '/cash-sessions/current', null, token);
    const cur = res.body?.data;
    nota(`K2 la caja abierta reporta: ${JSON.stringify(cur?.totals ?? cur?.summary ?? Object.keys(cur ?? {}))}`);
    const sesionId = cur?.id ?? (await p.cashSession.findFirst({ where: { restaurantId: rest.id, closedAt: null }, orderBy: { openedAt: 'desc' } }))?.id;
    res = await api('GET', `/cash-sessions/${sesionId}/preview`, null, token);
    const prev = res.body?.data;
    nota(`K3 el arqueo previo dice: ${JSON.stringify(prev?.expected ?? prev?.esperado ?? Object.keys(prev ?? {}))}`);
    res = await api('POST', `/cash-sessions/${sesionId}/close`, { countedBalances: { CASH: 112.6 } }, token);
    check(res.status === 200 || res.status === 201, 'K4 cerrar caja', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);
  }
};
