module.exports = async function () {
  const { p, api, check, nota, rest, token, HAM, REF, mesas, n, r2 } = global.__ctx;
  const T = (x) => console.log('\n── ' + x + ' ' + '─'.repeat(Math.max(0, 60 - x.length)));

  // ══════════════════════════════════════════════════════════════════
  T('W. MESAS UNIDAS');
  // ══════════════════════════════════════════════════════════════════
  // Mesas frescas para no arrastrar cuentas de otros escenarios
  const zona = await p.zone.findFirst({ where: { restaurantId: rest.id } });
  const mA = await p.table.create({ data: { restaurantId: rest.id, zoneId: zona.id, number: 'U1', seats: 4, qrToken: `audit-u1-${Date.now()}` } });
  const mB = await p.table.create({ data: { restaurantId: rest.id, zoneId: zona.id, number: 'U2', seats: 4, qrToken: `audit-u2-${Date.now()}` } });

  let res = await api('POST', '/tables/merge', { primaryTableId: mA.id, tableIds: [mB.id] }, token);
  const unio = res.status === 200 || res.status === 201;
  check(unio, 'W1 unir dos mesas', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);

  if (unio) {
    const bDespues = await p.table.findUnique({ where: { id: mB.id } });
    check(bDespues.mergedIntoTableId === mA.id, 'W2 la miembro apunta a la primaria', `mergedIntoTableId ${bDespues.mergedIntoTableId}`);
    const primaria = mA;
    const miembro = mB;

    // Pedir por el QR de la MIEMBRO debe caer en la cuenta de la PRIMARIA
    res = await api('POST', '/public/checkout/dine-in', { qrToken: miembro.qrToken, items: [{ productId: HAM, quantity: 1 }], customerName: 'Unida', customerIdNumber: 'V-9', customerPhone: '04149990000' });
    check(res.status === 201, 'W3 se puede pedir por el QR de la mesa miembro', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);
    const ordenId = res.body?.data?.id;
    if (ordenId) {
      const orden = await p.order.findUnique({ where: { id: ordenId }, include: { tableSession: true } });
      check(orden.tableId === primaria.id, 'W4 el pedido queda en la mesa PRIMARIA, no en la miembro', `quedó en tableId ${orden.tableId} (primaria ${primaria.id}, miembro ${miembro.id})`);
      const sesionesAbiertas = await p.tableSession.count({ where: { tableId: { in: [mA.id, mB.id] }, status: 'OPEN' } });
      check(sesionesAbiertas === 1, 'W5 hay UNA sola cuenta para las dos mesas', `hay ${sesionesAbiertas} cuentas abiertas`);
    }

    // Separar con cuenta abierta
    res = await api('POST', `/tables/${primaria.id}/unmerge`, {}, token);
    nota(`W6 separar mesas con cuenta abierta: status ${res.status} ${res.status >= 400 ? JSON.stringify(res.body?.error ?? '') : '(permitido)'}`);
  }

  // ══════════════════════════════════════════════════════════════════
  T('X. COCINA');
  // ══════════════════════════════════════════════════════════════════
  const coc1 = await p.kitchen.create({ data: { restaurantId: rest.id, name: 'Parrilla' } });
  const coc2 = await p.kitchen.create({ data: { restaurantId: rest.id, name: 'Bar' } });
  const pParrilla = await p.product.create({ data: { restaurantId: rest.id, categoryId: (await p.category.findFirst({ where: { restaurantId: rest.id } })).id, name: 'Costilla', price: 20, isAvailable: true, kitchenId: coc1.id } });
  const pBar = await p.product.create({ data: { restaurantId: rest.id, categoryId: (await p.category.findFirst({ where: { restaurantId: rest.id } })).id, name: 'Mojito', price: 6, isAvailable: true, kitchenId: coc2.id } });

  res = await api('POST', '/orders/manual', { channel: 'BAR', customerName: 'Coc', items: [{ productId: pParrilla.id, quantity: 1 }, { productId: pBar.id, quantity: 1 }] }, token);
  const oc = res.body?.data;
  check(res.status === 201, 'X1 pedido con dos cocinas', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);

  res = await api('PATCH', `/orders/${oc.id}/kitchen-ready`, { kitchenName: 'Parrilla' }, token);
  check(res.status === 200, 'X2 una cocina marca lista su parte', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);
  let db = await p.order.findUnique({ where: { id: oc.id } });
  check(db.status !== 'SERVED', 'X3 el pedido NO se sirve hasta que TODAS las cocinas terminen', `status quedó ${db.status}`);

  res = await api('PATCH', `/orders/${oc.id}/kitchen-ready`, { kitchenName: 'Bar' }, token);
  db = await p.order.findUnique({ where: { id: oc.id }, include: { items: true } });
  nota(`X4 con las dos cocinas listas el pedido quedó en ${db.status}`);

  // Cocina inexistente
  res = await api('PATCH', `/orders/${oc.id}/kitchen-ready`, { kitchenName: 'Cocina fantasma' }, token);
  nota(`X5 marcar lista una cocina que no existe en el pedido: status ${res.status}`);

  // ══════════════════════════════════════════════════════════════════
  T('Y. ACEPTACIÓN DE PEDIDOS QUE LLEGAN SOLOS');
  // ══════════════════════════════════════════════════════════════════
  await p.restaurant.update({ where: { id: rest.id }, data: { requireOrderAcceptance: true } }).catch(() => {});
  const mesaAcc = await p.table.create({ data: { restaurantId: rest.id, zoneId: zona.id, number: 'ACC', seats: 2, qrToken: `audit-acc-${Date.now()}` } });
  res = await api('POST', '/public/checkout/dine-in', { qrToken: mesaAcc.qrToken, items: [{ productId: HAM, quantity: 1 }], customerName: 'Acc', customerIdNumber: 'V-3', customerPhone: '04143330001' });
  const oAcc = res.body?.data;
  if (oAcc) {
    db = await p.order.findUnique({ where: { id: oAcc.id } });
    nota(`Y1 pedido por QR nace en estado ${db.status}`);
    res = await api('POST', `/orders/${oAcc.id}/accept`, {}, token);
    check(res.status === 200 || res.status === 201, 'Y2 aceptar el pedido', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);
    db = await p.order.findUnique({ where: { id: oAcc.id } });
    check(db.status === 'KITCHEN', 'Y3 tras aceptar pasa a cocina', `status ${db.status}`);
    // Aceptar dos veces
    res = await api('POST', `/orders/${oAcc.id}/accept`, {}, token);
    nota(`Y4 aceptar dos veces: status ${res.status} (no debe duplicar la comanda)`);
  }
};
