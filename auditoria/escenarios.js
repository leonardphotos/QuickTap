module.exports = async function () {
  const { p, api, check, nota, rest, token, HAM, REF, mesas, n, r2 } = global.__ctx;
  const T = (x) => console.log('\n── ' + x + ' ' + '─'.repeat(Math.max(0, 60 - x.length)));

  // ══════════════════════════════════════════════════════════════════
  T('A. QR EN MESA — abrir cuenta y sumar rondas');
  // ══════════════════════════════════════════════════════════════════
  let res = await api('POST', '/public/checkout/dine-in', {
    qrToken: mesas[1].qrToken, items: [{ productId: HAM, quantity: 1 }],
    customerName: 'Beto', customerIdNumber: 'V-222', customerPhone: '04142220000',
  });
  check(res.status === 201, 'A1 primer pedido por QR abre la cuenta', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);
  const o1 = res.body?.data;
  const total1 = n(o1?.totalBase);
  check(r2(10 + 1 + 1.6) === total1, 'A2 total = subtotal + 10% servicio + 16% IVA', `esperado 12.60, obtenido ${total1}`);

  // Segunda ronda en la MISMA mesa: debe caer en la misma cuenta
  res = await api('POST', '/public/checkout/dine-in', {
    qrToken: mesas[1].qrToken, items: [{ productId: REF, quantity: 2 }],
  });
  check(res.status === 201, 'A3 segunda ronda sin repetir datos del cliente', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);
  const o2 = res.body?.data;

  const ses = await p.tableSession.findFirst({ where: { tableId: mesas[1].id, status: 'OPEN' }, include: { orders: true } });
  check(ses?.orders?.length === 2, 'A4 las dos rondas quedan en UNA sola cuenta', `cuenta con ${ses?.orders?.length} pedidos`);

  // ¿Se puede pedir a una mesa con QR de otro restaurante? (aislamiento)
  res = await api('POST', '/public/checkout/dine-in', { qrToken: 'qr-inexistente-xyz', items: [{ productId: HAM, quantity: 1 }] });
  check(res.status >= 400, 'A5 un QR inexistente se rechaza', `status ${res.status}`);

  // Producto de OTRO restaurante en el carrito
  const ajeno = await p.product.findFirst({ where: { restaurantId: { not: rest.id }, isAvailable: true } });
  if (ajeno) {
    res = await api('POST', '/public/checkout/dine-in', { qrToken: mesas[2].qrToken, items: [{ productId: ajeno.id, quantity: 1 }], customerName: 'X', customerIdNumber: 'V-9', customerPhone: '0414' });
    check(res.status >= 400, 'A6 no se puede meter un producto de otro restaurante', `status ${res.status} — creó pedido con producto ajeno`);
  }

  // Cantidad negativa / cero
  res = await api('POST', '/public/checkout/dine-in', { qrToken: mesas[2].qrToken, items: [{ productId: HAM, quantity: -3 }], customerName: 'X', customerIdNumber: 'V-9', customerPhone: '0414' });
  check(res.status >= 400, 'A7 cantidad negativa se rechaza', `status ${res.status}`);

  // Propina desmedida
  res = await api('POST', '/public/checkout/dine-in', { qrToken: mesas[2].qrToken, items: [{ productId: HAM, quantity: 1 }], customerName: 'X', customerIdNumber: 'V-9', customerPhone: '0414', tipBase: 999999 });
  check(res.status >= 400, 'A8 propina fuera de rango se rechaza', `status ${res.status}`);

  // ══════════════════════════════════════════════════════════════════
  T('B. COBRO DE LA CUENTA');
  // ══════════════════════════════════════════════════════════════════
  const cuenta = await p.tableSession.findFirst({ where: { tableId: mesas[1].id, status: 'OPEN' }, include: { orders: true } });
  const deuda = cuenta.orders.reduce((a, o) => a + n(o.totalBase), 0);
  nota(`B0 la cuenta de la mesa 2 debe $${r2(deuda)}`);

  // Pagar de más
  res = await api('POST', `/orders/${cuenta.orders[0].id}/payments`, { amountBase: n(cuenta.orders[0].totalBase) + 500, method: 'CASH' }, token);
  check(res.status >= 400, 'B1 no se puede pagar más que el saldo', `status ${res.status} — aceptó un pago de más`);

  // Pago exacto del primer pedido
  res = await api('POST', `/orders/${cuenta.orders[0].id}/payments`, { amountBase: n(cuenta.orders[0].totalBase), method: 'CASH' }, token);
  check(res.status === 201, 'B2 pago exacto se registra', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);

  // Pagar dos veces el mismo pedido
  res = await api('POST', `/orders/${cuenta.orders[0].id}/payments`, { amountBase: 1, method: 'CASH' }, token);
  check(res.status >= 400, 'B3 no se puede cobrar un pedido ya saldado', `status ${res.status} — permitió cobrar de nuevo`);

  // Pago negativo
  res = await api('POST', `/orders/${cuenta.orders[1].id}/payments`, { amountBase: -5, method: 'CASH' }, token);
  check(res.status >= 400, 'B4 pago negativo se rechaza', `status ${res.status}`);

  // ══════════════════════════════════════════════════════════════════
  T('C. DELIVERY');
  // ══════════════════════════════════════════════════════════════════
  res = await api('POST', `/public/checkout/delivery/${rest.slug}`, {
    mode: 'DELIVERY', items: [{ productId: HAM, quantity: 1 }],
    customer: { name: 'Caro', phone: '04143330000', address: 'Calle 1', paymentMethod: 'CASH' },
  });
  check(res.status >= 400, 'C1 delivery sin ubicación se rechaza (el local cobra envío)', `status ${res.status}`);

  res = await api('POST', `/public/checkout/delivery/${rest.slug}`, {
    mode: 'DELIVERY', items: [{ productId: HAM, quantity: 1 }],
    customer: { name: 'Caro', phone: '04143330000', address: 'Calle 1', lat: 10.20, lng: -68.015, paymentMethod: 'CASH' },
  });
  check(res.status === 201, 'C2 delivery dentro de zona "Cerca" ($1)', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);
  // El checkout público devuelve solo {orderId, orderNumber, subtotalBase, totalBs, whatsappUrl}:
  // lo que de verdad se cobró se comprueba contra la base.
  const delId = res.body?.data?.orderId;
  const del = delId ? await p.order.findUnique({ where: { id: delId } }) : null;
  check(n(del?.deliveryFeeBase) === 1, 'C3 cobra el envío de la zona', `envío ${del?.deliveryFeeBase}, esperado 1`);
  check(r2(10 + 1 + 1.6 + 1) === n(del?.totalBase), 'C4 el envío entra en el total', `total ${del?.totalBase}, esperado 13.60`);

  // Pickup no debe cobrar envío
  res = await api('POST', `/public/checkout/delivery/${rest.slug}`, {
    mode: 'PICKUP', items: [{ productId: HAM, quantity: 1 }],
    customer: { name: 'Dani', phone: '04144440000', address: '-', paymentMethod: 'CASH' },
  });
  const pkId = res.body?.data?.orderId;
  const pk = pkId ? await p.order.findUnique({ where: { id: pkId } }) : null;
  check(res.status === 201 && n(pk?.deliveryFeeBase) === 0, 'C5 pickup no cobra envío', `status ${res.status} ${JSON.stringify(res.body?.error ?? res.body?.details ?? '')} envío ${pk?.deliveryFeeBase}`);

  // ══════════════════════════════════════════════════════════════════
  T('D. PEDIDO MANUAL DESDE EL PANEL');
  // ══════════════════════════════════════════════════════════════════
  res = await api('POST', '/orders/manual', { channel: 'DINE_IN', tableId: mesas[2].id, items: [{ productId: HAM, quantity: 1 }], customerName: 'Eva', customerIdNumber: 'V-555', customerPhone: '04145550000' }, token);
  check(res.status === 201, 'D1 pedido manual en mesa', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);
  const man = res.body?.data;

  // Agregar productos a un pedido ya creado
  res = await api('POST', `/orders/${man.id}/items/batch`, { items: [{ productId: REF, quantity: 3 }] }, token);
  check(res.status === 201, 'D2 agregar productos a un pedido en curso', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);
  const conMas = res.body?.data;
  check(r2(n(conMas?.subtotalBase)) === 16, 'D3 el subtotal se recalcula al agregar', `subtotal ${conMas?.subtotalBase}, esperado 16`);
  check(r2(16 + 1.6 + 2.56) === n(conMas?.totalBase), 'D4 servicio e IVA se rehacen al agregar', `total ${conMas?.totalBase}, esperado 20.16`);

  // Editar cantidades
  res = await api('PATCH', `/orders/${man.id}/items`, { items: [{ orderItemId: conMas.items[0].id, quantity: 0 }] }, token);
  check(res.status === 200, 'D5 quitar un ítem del pedido', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);

  // Vaciar el pedido entero
  const actual = await p.order.findUnique({ where: { id: man.id }, include: { items: true } });
  res = await api('PATCH', `/orders/${man.id}/items`, { items: actual.items.map((i) => ({ orderItemId: i.id, quantity: 0 })) }, token);
  check(res.status >= 400, 'D6 no se puede dejar un pedido sin productos', `status ${res.status}`);

  // ══════════════════════════════════════════════════════════════════
  T('E. AISLAMIENTO ENTRE RESTAURANTES');
  // ══════════════════════════════════════════════════════════════════
  const otroRest = await p.restaurant.findFirst({ where: { id: { not: rest.id } } });
  const otroPedido = await p.order.findFirst({ where: { restaurantId: otroRest.id } });
  if (otroPedido) {
    res = await api('POST', `/orders/${otroPedido.id}/payments`, { amountBase: 1, method: 'CASH' }, token);
    check(res.status >= 400, 'E1 no se puede cobrar el pedido de otro restaurante', `status ${res.status}`);
    res = await api('PATCH', `/orders/${otroPedido.id}/status`, { status: 'CANCELLED' }, token);
    check(res.status >= 400, 'E2 no se puede cancelar el pedido de otro restaurante', `status ${res.status}`);
  }
  const otraMesa = await p.table.findFirst({ where: { restaurantId: otroRest.id } });
  if (otraMesa) {
    res = await api('POST', '/orders/manual', { channel: 'DINE_IN', tableId: otraMesa.id, items: [{ productId: HAM, quantity: 1 }], customerName: 'X', customerIdNumber: 'V-1', customerPhone: '0414' }, token);
    check(res.status >= 400, 'E3 no se puede usar la mesa de otro restaurante', `status ${res.status}`);
  }

  // ══════════════════════════════════════════════════════════════════
  T('F. ESTADOS Y CANCELACIÓN');
  // ══════════════════════════════════════════════════════════════════
  res = await api('POST', '/orders/manual', { channel: 'BAR', items: [{ productId: REF, quantity: 1 }], customerName: 'Fran' }, token);
  const bar = res.body?.data;
  check(res.status === 201, 'F1 pedido de barra', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);

  res = await api('PATCH', `/orders/${bar.id}/status`, { status: 'CANCELLED' }, token);
  check(res.status === 200, 'F2 cancelar un pedido', `status ${res.status}`);

  res = await api('POST', `/orders/${bar.id}/payments`, { amountBase: 1, method: 'CASH' }, token);
  check(res.status >= 400, 'F3 no se puede cobrar un pedido cancelado', `status ${res.status}`);

  res = await api('PATCH', `/orders/${bar.id}/items`, { items: [] }, token);
  check(res.status >= 400, 'F4 no se puede editar un pedido cancelado', `status ${res.status}`);
};
