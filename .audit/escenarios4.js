module.exports = async function () {
  const { p, api, check, nota, rest, token, HAM, REF, mesas, n, r2 } = global.__ctx;
  const T = (x) => console.log('\n── ' + x + ' ' + '─'.repeat(Math.max(0, 60 - x.length)));
  const cat = await p.category.findFirst({ where: { restaurantId: rest.id } });

  // ══════════════════════════════════════════════════════════════════
  T('Q. CONTROL DE STOCK POR PRODUCTO');
  // ══════════════════════════════════════════════════════════════════
  const limitado = await p.product.create({ data: { restaurantId: rest.id, categoryId: cat.id, name: 'Postre limitado', price: 5, isAvailable: true, stockControlEnabled: true, stockQuantity: 3 } });

  let res = await api('POST', '/orders/manual', { channel: 'BAR', customerName: 'S', items: [{ productId: limitado.id, quantity: 10 }] }, token);
  const dejoVender = res.status === 201;
  nota(`Q1 pedir 10 con solo 3 en stock: ${dejoVender ? 'LO ACEPTÓ' : 'lo rechazó (status ' + res.status + ')'}`);

  if (dejoVender) {
    await api('PATCH', `/orders/${res.body.data.id}/status`, { status: 'SERVED' }, token);
    const tras = await p.product.findUnique({ where: { id: limitado.id } });
    // Con el bloqueo APAGADO (por defecto) vender de más es una decisión del restaurante, y el
    // negativo es el dato útil: dice cuántas unidades salieron sin respaldo.
    check(n(tras.stockQuantity) === -7, 'Q2 sin bloqueo el stock queda en −7 y no se pisa en 0', `stock ${tras.stockQuantity}`);
  }

  // ══════════════════════════════════════════════════════════════════
  T('R. ENVASE (packaging) SOLO EN DELIVERY/PICKUP');
  // ══════════════════════════════════════════════════════════════════
  const conEnvase = await p.product.create({ data: { restaurantId: rest.id, categoryId: cat.id, name: 'Para llevar', price: 10, isAvailable: true, packagingMode: 'FIXED', packagingFeeBase: 0.5 } });

  res = await api('POST', '/orders/manual', { channel: 'DINE_IN', tableId: mesas[0].id, customerName: 'E', customerIdNumber: 'V-1', customerPhone: '0414', items: [{ productId: conEnvase.id, quantity: 2 }] }, token);
  check(n(res.body?.data?.envaseFeeBase) === 0, 'R1 en mesa NO se cobra envase', `envase ${res.body?.data?.envaseFeeBase}`);

  res = await api('POST', '/orders/manual', { channel: 'PICKUP', customerName: 'E2', items: [{ productId: conEnvase.id, quantity: 2 }] }, token);
  check(n(res.body?.data?.envaseFeeBase) === 1, 'R2 en pickup se cobra $0.50 x 2', `envase ${res.body?.data?.envaseFeeBase}, esperado 1`);
  check(r2(20 + 2 + 3.2 + 1) === n(res.body?.data?.totalBase), 'R3 el envase entra en el total', `total ${res.body?.data?.totalBase}, esperado 26.20`);

  // ══════════════════════════════════════════════════════════════════
  T('S. COMBOS');
  // ══════════════════════════════════════════════════════════════════
  const comboProd = await p.product.create({ data: { restaurantId: rest.id, categoryId: cat.id, name: 'Combo dúo', price: 15, isAvailable: true } });
  await p.comboComponent.create({ data: { restaurantId: rest.id, productId: comboProd.id, componentProductId: HAM, quantity: 1, priority: 0 } });
  await p.comboComponent.create({ data: { restaurantId: rest.id, productId: comboProd.id, componentProductId: REF, quantity: 1, priority: 1 } });

  const sel1 = [{ componentProductId: HAM, modifierIds: [] }, { componentProductId: REF, modifierIds: [] }];
  res = await api('POST', '/orders/manual', { channel: 'BAR', customerName: 'C', items: [{ productId: comboProd.id, quantity: 1, comboSelections: sel1 }] }, token);
  check(res.status === 201 && n(res.body?.data?.subtotalBase) === 15, 'S1 el combo cobra SU precio, no la suma de sus partes', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')} subtotal ${res.body?.data?.subtotalBase} (esperado 15, no 12)`);

  // Dos combos: una entrada de selección POR INSTANCIA de cada componente.
  res = await api('POST', '/orders/manual', { channel: 'BAR', customerName: 'C', items: [{ productId: comboProd.id, quantity: 2, comboSelections: sel1 }] }, token);
  check(res.status === 201 && n(res.body?.data?.subtotalBase) === 30, 'S2 dos combos = 30', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')} subtotal ${res.body?.data?.subtotalBase}`);

  // Combo incompleto: falta un componente
  res = await api('POST', '/orders/manual', { channel: 'BAR', customerName: 'C', items: [{ productId: comboProd.id, quantity: 1, comboSelections: [{ componentProductId: HAM, modifierIds: [] }] }] }, token);
  check(res.status >= 400, 'S4 un combo incompleto se rechaza', `status ${res.status}`);

  // Combo con el MISMO componente repetido en vez de los dos distintos
  res = await api('POST', '/orders/manual', { channel: 'BAR', customerName: 'C', items: [{ productId: comboProd.id, quantity: 1, comboSelections: [{ componentProductId: HAM, modifierIds: [] }, { componentProductId: HAM, modifierIds: [] }] }] }, token);
  check(res.status >= 400, 'S5 no se puede llevar dos veces el mismo componente y saltarse el otro', `status ${res.status} — lo aceptó`);

  // Combo con selección de un plato que NO es suyo
  const ajeno = await p.product.findFirst({ where: { restaurantId: rest.id, id: { notIn: [HAM, REF, comboProd.id] } } });
  if (ajeno) {
    res = await api('POST', '/orders/manual', { channel: 'BAR', customerName: 'C', items: [{ productId: comboProd.id, quantity: 1, comboSelections: [{ componentProductId: ajeno.id, modifierIds: [] }] }] }, token);
    check(res.status >= 400, 'S3 no se puede meter en el combo un plato que no lo compone', `status ${res.status}`);
  }

  // ══════════════════════════════════════════════════════════════════
  T('T. TASA DE CAMBIO CONGELADA');
  // ══════════════════════════════════════════════════════════════════
  res = await api('POST', '/orders/manual', { channel: 'BAR', customerName: 'Tasa', items: [{ productId: HAM, quantity: 1 }] }, token);
  const oT = await p.order.findUnique({ where: { id: res.body.data.id } });
  const esperadoBs = r2(n(oT.totalBase) * n(oT.exchangeRate));
  check(Math.abs(n(oT.totalBs) - esperadoBs) < 0.02, 'T1 totalBs = totalBase x tasa congelada', `totalBs ${oT.totalBs}, esperado ${esperadoBs}`);
  check(n(oT.exchangeRate) > 0, 'T2 la tasa quedó congelada en el pedido', `tasa ${oT.exchangeRate}`);

  // ══════════════════════════════════════════════════════════════════
  T('U. PRODUCTO NO DISPONIBLE');
  // ══════════════════════════════════════════════════════════════════
  const off = await p.product.create({ data: { restaurantId: rest.id, categoryId: cat.id, name: 'Agotado', price: 5, isAvailable: false } });
  res = await api('POST', '/orders/manual', { channel: 'BAR', customerName: 'U', items: [{ productId: off.id, quantity: 1 }] }, token);
  check(res.status >= 400, 'U1 no se puede vender un producto marcado no disponible', `status ${res.status}`);
  res = await api('POST', '/public/checkout/dine-in', { qrToken: mesas[0].qrToken, items: [{ productId: off.id, quantity: 1 }] });
  check(res.status >= 400, 'U2 tampoco desde el QR', `status ${res.status}`);

  // ══════════════════════════════════════════════════════════════════
  T('V. BORRADO DE PEDIDOS');
  // ══════════════════════════════════════════════════════════════════
  res = await api('POST', '/orders/manual', { channel: 'BAR', customerName: 'Del', items: [{ productId: HAM, quantity: 1 }] }, token);
  const aBorrar = res.body.data;
  res = await api('DELETE', `/orders/${aBorrar.id}`, { reason: 'prueba de auditoria' }, token);
  const borro = res.status === 200 || res.status === 204;
  nota(`V1 borrar un pedido: status ${res.status}`);
  if (borro) {
    const log = await p.orderDeletionLog.findFirst({ where: { restaurantId: rest.id }, orderBy: { deletedAt: 'desc' } }).catch(() => null);
    check(!!log, 'V2 el borrado queda registrado en la bitácora', 'no se registró en OrderDeletionLog');
    const sigue = await p.order.findUnique({ where: { id: aBorrar.id } });
    check(!sigue, 'V3 el pedido ya no está', 'el pedido sigue en la base');
  }

  // Borrar un pedido YA PAGADO
  res = await api('POST', '/orders/manual', { channel: 'BAR', customerName: 'Pag', items: [{ productId: HAM, quantity: 1 }] }, token);
  const pagado = res.body.data;
  await api('POST', `/orders/${pagado.id}/payments`, { amountBase: 12.6, method: 'CASH' }, token);
  res = await api('DELETE', `/orders/${pagado.id}`, { reason: 'prueba' }, token);
  nota(`V4 borrar un pedido YA COBRADO: status ${res.status} (permitido a propósito: revierte banco, devuelve stock y deja rastro)`);
  const logPagado = await p.orderDeletionLog.findFirst({ where: { restaurantId: rest.id, orderNumber: pagado.orderNumber }, orderBy: { deletedAt: 'desc' } });
  check(logPagado && n(logPagado.paidBase) === 12.6, 'V5 la bitácora registra CUÁNTO se había cobrado', `paidBase ${logPagado?.paidBase} (esperado 12.60)`);
  check(logPagado?.paidMethods != null, 'V6 y con qué método se había cobrado', `paidMethods ${JSON.stringify(logPagado?.paidMethods)}`);
};
