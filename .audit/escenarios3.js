module.exports = async function () {
  const { p, api, check, nota, rest, token, HAM, REF, mesas, n, r2 } = global.__ctx;
  const T = (x) => console.log('\n── ' + x + ' ' + '─'.repeat(Math.max(0, 60 - x.length)));

  // ══════════════════════════════════════════════════════════════════
  T('L. VARIANTES Y MODIFICADORES — precio');
  // ══════════════════════════════════════════════════════════════════
  const combo = await p.product.create({ data: { restaurantId: rest.id, categoryId: (await p.category.findFirst({ where: { restaurantId: rest.id } })).id, name: 'Pizza', price: 0, isAvailable: true, pricingMode: 'VARIANTS' } });
  const vG = await p.productVariant.create({ data: { restaurantId: rest.id, productId: combo.id, name: 'Grande', priceBase: 20 } });
  const vP = await p.productVariant.create({ data: { restaurantId: rest.id, productId: combo.id, name: 'Pequeña', priceBase: 12 } });

  const catMod = await p.modifierCategory.create({ data: { restaurantId: rest.id, name: 'Extras', isRequired: false, allowMultiple: true } });
  const modQ = await p.modifier.create({ data: { restaurantId: rest.id, categoryId: catMod.id, name: 'Extra queso', priceBase: 2.5 } });
  await p.productModifierCategory.create({ data: { productId: combo.id, modifierCategoryId: catMod.id } });

  let res = await api('POST', '/orders/manual', { channel: 'BAR', customerName: 'Var', items: [{ productId: combo.id, variantId: vG.id, quantity: 1 }] }, token);
  check(res.status === 201 && n(res.body?.data?.subtotalBase) === 20, 'L1 la variante Grande cobra su precio', `status ${res.status} subtotal ${res.body?.data?.subtotalBase}`);

  res = await api('POST', '/orders/manual', { channel: 'BAR', customerName: 'Var', items: [{ productId: combo.id, variantId: vP.id, quantity: 2 }] }, token);
  check(n(res.body?.data?.subtotalBase) === 24, 'L2 dos Pequeñas = 24', `subtotal ${res.body?.data?.subtotalBase}`);

  res = await api('POST', '/orders/manual', { channel: 'BAR', customerName: 'Var', items: [{ productId: combo.id, variantId: vG.id, quantity: 1, modifierIds: [modQ.id] }] }, token);
  check(n(res.body?.data?.subtotalBase) === 22.5, 'L3 el modificador suma su precio', `subtotal ${res.body?.data?.subtotalBase}, esperado 22.5`);

  res = await api('POST', '/orders/manual', { channel: 'BAR', customerName: 'Var', items: [{ productId: combo.id, variantId: vG.id, quantity: 3, modifierIds: [modQ.id] }] }, token);
  check(n(res.body?.data?.subtotalBase) === 67.5, 'L4 el modificador se multiplica por la cantidad', `subtotal ${res.body?.data?.subtotalBase}, esperado 67.5`);

  // Variante de OTRO producto
  const otraVar = await p.productVariant.findFirst({ where: { productId: { not: combo.id } } });
  if (otraVar) {
    res = await api('POST', '/orders/manual', { channel: 'BAR', customerName: 'X', items: [{ productId: combo.id, variantId: otraVar.id, quantity: 1 }] }, token);
    check(res.status >= 400, 'L5 no se puede usar la variante de otro producto', `status ${res.status}`);
  }
  // Modificador no vinculado al producto
  res = await api('POST', '/orders/manual', { channel: 'BAR', customerName: 'X', items: [{ productId: HAM, quantity: 1, modifierIds: [modQ.id] }] }, token);
  check(res.status >= 400, 'L6 un modificador que no es del producto se RECHAZA (antes se descartaba en silencio)', `status ${res.status} — lo aceptó y cobró ${res.body?.data?.subtotalBase}`);
  // Y por el QR, que es por donde llega un menú viejo abierto en el teléfono de alguien.
  res = await api('POST', '/public/checkout/dine-in', { qrToken: mesas[0].qrToken, items: [{ productId: HAM, quantity: 1, modifierIds: [modQ.id] }], customerName: 'Z', customerIdNumber: 'V-8', customerPhone: '04148880000' });
  check(res.status >= 400, 'L7 lo mismo desde el QR del comensal', `status ${res.status}`);
  // Un modificador que SÍ es del producto sigue funcionando.
  res = await api('POST', '/orders/manual', { channel: 'BAR', customerName: 'X', items: [{ productId: combo.id, variantId: vG.id, quantity: 1, modifierIds: [modQ.id] }] }, token);
  check(res.status === 201 && n(res.body?.data?.subtotalBase) === 22.5, 'L8 el modificador válido sigue cobrándose', `status ${res.status} subtotal ${res.body?.data?.subtotalBase}`);

  // ══════════════════════════════════════════════════════════════════
  T('M. PROPINAS');
  // ══════════════════════════════════════════════════════════════════
  res = await api('POST', '/orders/manual', { channel: 'BAR', customerName: 'Tip', items: [{ productId: HAM, quantity: 1 }] }, token);
  const oTip = res.body?.data;
  res = await api('PATCH', `/orders/${oTip.id}/tip`, { tipBase: 3 }, token);
  check(res.status === 200, 'M1 agregar propina', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);
  let db = await p.order.findUnique({ where: { id: oTip.id } });
  check(n(db.tipBase) === 3, 'M2 la propina se guarda', `tip ${db.tipBase}`);
  check(n(db.totalBase) === 12.6, 'M3 la propina NO se mete en el total del pedido', `total ${db.totalBase} (debe seguir en 12.60)`);
  // Pagar el total + propina
  res = await api('POST', `/orders/${oTip.id}/payments`, { amountBase: 12.6, method: 'CASH', tipBase: 3 }, token);
  check(res.status === 201, 'M4 cobrar con propina', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);

  // ══════════════════════════════════════════════════════════════════
  T('N. CUENTA DE MESA — cierre y PIN');
  // ══════════════════════════════════════════════════════════════════
  const mesa = mesas[2];
  res = await api('POST', '/public/checkout/dine-in', { qrToken: mesa.qrToken, items: [{ productId: HAM, quantity: 1 }], customerName: 'Pin', customerIdNumber: 'V-777', customerPhone: '04147770000' });
  check(res.status === 201, 'N1 abrir cuenta en mesa 3', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);
  const ses = await p.tableSession.findFirst({ where: { tableId: mesa.id, status: 'OPEN' } });

  // Poner PIN y pedir sin él
  await p.tableSession.update({ where: { id: ses.id }, data: { pinHash: require('bcryptjs').hashSync('1234', 10) } });
  res = await api('POST', '/public/checkout/dine-in', { qrToken: mesa.qrToken, items: [{ productId: REF, quantity: 1 }] });
  check(res.status >= 400, 'N2 con PIN puesto, pedir sin PIN se rechaza', `status ${res.status} — dejó pedir a la cuenta ajena`);
  res = await api('POST', '/public/checkout/dine-in', { qrToken: mesa.qrToken, items: [{ productId: REF, quantity: 1 }], pin: '9999' });
  check(res.status >= 400, 'N3 PIN incorrecto se rechaza', `status ${res.status}`);
  res = await api('POST', '/public/checkout/dine-in', { qrToken: mesa.qrToken, items: [{ productId: REF, quantity: 1 }], pin: '1234' });
  check(res.status === 201, 'N4 PIN correcto deja pedir', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);

  // Cerrar la cuenta con saldo pendiente
  res = await api('PATCH', `/table-sessions/${ses.id}/close`, {}, token);
  const cerroConDeuda = res.status === 200 || res.status === 201;
  const sesDespues = await p.tableSession.findUnique({ where: { id: ses.id } });
  if (cerroConDeuda) nota(`N5 se pudo cerrar una cuenta CON saldo pendiente (quedó ${sesDespues.status})`);
  else nota(`N5 cerrar la cuenta con deuda se rechazó (status ${res.status}) — ${JSON.stringify(res.body?.error ?? '')}`);

  // ══════════════════════════════════════════════════════════════════
  T('O. LOS REPORTES CUADRAN CON LOS PEDIDOS');
  // ══════════════════════════════════════════════════════════════════
  const hoy = new Date(); const iso = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
  const pedidosReales = await p.order.findMany({ where: { restaurantId: rest.id, status: { not: 'CANCELLED' }, isPartnerConsumption: false } });
  const totalReal = r2(pedidosReales.reduce((a, o) => a + n(o.totalBase), 0));

  res = await api('GET', `/orders/reports/sales-stats?from=${iso}&to=${iso}`, null, token);
  const st = res.body?.data;
  check(res.status === 200, 'O1 estadísticas responden', `status ${res.status}`);
  if (st) {
    check(Math.abs(n(st.totalBase) - totalReal) < 0.02, 'O2 el total de ventas cuadra con los pedidos', `reporte ${st.totalBase} vs base ${totalReal}`);
    check(Number(st.ordersCount ?? st.count ?? pedidosReales.length) === pedidosReales.length, 'O3 la cantidad de pedidos cuadra', `reporte ${st.ordersCount ?? st.count} vs base ${pedidosReales.length}`);
  }

  // Productos vendidos
  const items = await p.orderItem.findMany({ where: { order: { restaurantId: rest.id, status: { not: 'CANCELLED' }, isPartnerConsumption: false } } });
  const unidadesReales = items.reduce((a, i) => a + i.quantity, 0);
  res = await api('GET', `/orders/reports/products?from=${iso}&to=${iso}`, null, token);
  const unidadesReporte = (res.body?.data ?? []).reduce((a, x) => a + Number(x.quantity), 0);
  check(unidadesReporte === unidadesReales, 'O4 las unidades vendidas cuadran', `reporte ${unidadesReporte} vs base ${unidadesReales}`);

  // ══════════════════════════════════════════════════════════════════
  T('P. CUENTAS IMPAGAS NO SE PUEDEN OCULTAR (trigger de la base)');
  // ══════════════════════════════════════════════════════════════════
  const impago = await p.order.findFirst({ where: { restaurantId: rest.id, status: { not: 'CANCELLED' }, clearedAt: null, payments: { none: {} } } });
  if (impago) {
    await p.$executeRawUnsafe(`UPDATE orders SET "clearedAt" = NOW() WHERE id = '${impago.id}'`);
    const check1 = await p.order.findUnique({ where: { id: impago.id } });
    check(check1.clearedAt === null, 'P1 el trigger impide ocultar un pedido impago', `clearedAt quedó en ${check1.clearedAt}`);
  } else nota('P1 no había pedido impago para probar el trigger');
};
