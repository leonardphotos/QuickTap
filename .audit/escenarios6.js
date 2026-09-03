module.exports = async function () {
  const { p, api, check, nota, rest, token, HAM, REF, mesas, n, r2 } = global.__ctx;
  const T = (x) => console.log('\n── ' + x + ' ' + '─'.repeat(Math.max(0, 60 - x.length)));

  const nuevo = async (qty = 1) => (await api('POST', '/orders/manual', { channel: 'BAR', customerName: 'Race', items: [{ productId: HAM, quantity: qty }] }, token)).body.data;
  const saldado = (pagos) => pagos.reduce((a, x) => a + n(x.amountBase) + n(x.discountBase) + n(x.serviceChargeDiscountBase), 0);

  // ══════════════════════════════════════════════════════════════════
  T('AA. DOS CAJEROS COBRANDO EL MISMO PEDIDO A LA VEZ');
  // ══════════════════════════════════════════════════════════════════
  let o = await nuevo(1);                                   // 12.60
  let res = await Promise.all([
    api('POST', `/orders/${o.id}/payments`, { amountBase: 12.6, method: 'CASH' }, token),
    api('POST', `/orders/${o.id}/payments`, { amountBase: 12.6, method: 'CARD' }, token),
  ]);
  const ok = res.filter((x) => x.status === 201).length;
  let db = await p.order.findUnique({ where: { id: o.id }, include: { payments: true } });
  check(ok === 1, 'AA1 solo UNO de los dos cobros simultáneos entra', `entraron ${ok} de 2`);
  check(r2(saldado(db.payments)) <= 12.6, 'AA2 no se cobró de más', `cobrado ${r2(saldado(db.payments))} de 12.60`);

  // Cuatro abonos simultáneos que juntos exceden el total
  o = await nuevo(1);
  res = await Promise.all([4, 4, 4, 4].map((m) => api('POST', `/orders/${o.id}/payments`, { amountBase: m, method: 'CASH' }, token)));
  db = await p.order.findUnique({ where: { id: o.id }, include: { payments: true } });
  const total = r2(saldado(db.payments));
  check(total <= 12.6, 'AA3 cuatro abonos de $4 en paralelo no superan el total', `quedó cobrado ${total} de 12.60 (${res.filter(x=>x.status===201).length} aceptados)`);

  // ══════════════════════════════════════════════════════════════════
  T('AB. CANCELAR MIENTRAS SE COBRA');
  // ══════════════════════════════════════════════════════════════════
  // 8 intentos: el entrelazado exacto no se da siempre, y una sola pasada puede no reproducirlo.
  let colgados = 0;
  for (let i = 0; i < 8; i++) {
    o = await nuevo(1);
    await Promise.all([
      api('POST', `/orders/${o.id}/payments`, { amountBase: 12.6, method: 'CASH' }, token),
      api('PATCH', `/orders/${o.id}/status`, { status: 'CANCELLED' }, token),
    ]);
    db = await p.order.findUnique({ where: { id: o.id }, include: { payments: true } });
    if (db.status === 'CANCELLED' && r2(saldado(db.payments)) > 0) colgados++;
  }
  check(colgados === 0, 'AB1 cobrar y cancelar a la vez nunca deja plata colgada (8 intentos)', `${colgados} de 8 quedaron CANCELADOS con plata encima`);

  // El caso de todos los días, sin carrera: cobrar y después cancelar.
  o = await nuevo(1);
  await api('POST', `/orders/${o.id}/payments`, { amountBase: 12.6, method: 'CASH' }, token);
  res = await api('PATCH', `/orders/${o.id}/status`, { status: 'CANCELLED' }, token);
  check(res.status >= 400, 'AB2 no se puede cancelar un pedido YA COBRADO', `status ${res.status} — lo canceló con la plata encima`);
  db = await p.order.findUnique({ where: { id: o.id } });
  check(db.status !== 'CANCELLED', 'AB3 el pedido cobrado sigue vivo', `quedó en ${db.status}`);

  // Un pedido SIN cobros se sigue pudiendo cancelar con normalidad.
  o = await nuevo(1);
  res = await api('PATCH', `/orders/${o.id}/status`, { status: 'CANCELLED' }, token);
  check(res.status === 200, 'AB4 un pedido sin cobrar se cancela normal', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);

  // Y si se le devolvió la plata al cliente, el camino es eliminar la comanda.
  o = await nuevo(1);
  await api('POST', `/orders/${o.id}/payments`, { amountBase: 12.6, method: 'CASH' }, token);
  res = await api('DELETE', `/orders/${o.id}`, { reason: 'devolución al cliente' }, token);
  check(res.status === 200, 'AB5 eliminar sí funciona (y deja rastro de lo cobrado)', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);

  // ══════════════════════════════════════════════════════════════════
  T('AC. DEUDA / CUENTA POR COBRAR');
  // ══════════════════════════════════════════════════════════════════
  o = await nuevo(1);
  res = await api('PATCH', `/orders/${o.id}/awaiting-payment`, { awaitingPayment: true }, token);
  check(res.status === 200, 'AC1 marcar como pendiente por cobrar', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);
  res = await api('GET', '/orders/live', null, token);
  const enVivo = (res.body?.data ?? []).some((x) => x.id === o.id);
  check(enVivo, 'AC2 la deuda sigue visible en Pedidos', 'desapareció del panel');

  // Un pedido servido y saldado desaparece; uno servido con deuda NO
  const oPagado = await nuevo(1);
  await api('POST', `/orders/${oPagado.id}/payments`, { amountBase: 12.6, method: 'CASH' }, token);
  await api('PATCH', `/orders/${oPagado.id}/status`, { status: 'SERVED' }, token);
  const oDebe = await nuevo(1);
  await api('PATCH', `/orders/${oDebe.id}/status`, { status: 'SERVED' }, token);
  res = await api('GET', '/orders/live', null, token);
  const ids = (res.body?.data ?? []).map((x) => x.id);
  check(!ids.includes(oPagado.id), 'AC3 un pedido servido Y pagado sale del panel', 'sigue apareciendo');
  check(ids.includes(oDebe.id), 'AC4 un pedido servido CON DEUDA sigue en el panel', 'desapareció con la deuda encima');

  // ══════════════════════════════════════════════════════════════════
  T('AD. DEVOLUCIONES');
  // ══════════════════════════════════════════════════════════════════
  o = await nuevo(3);
  const it = (await p.order.findUnique({ where: { id: o.id }, include: { items: true } })).items[0];
  // Solo se devuelve lo que ya se marcó "Entregado" — para el resto se usa +/−.
  await api('PATCH', `/orders/${o.id}/items/${it.id}/delivered`, { delivered: true }, token);
  res = await api('POST', `/orders/${o.id}/items/${it.id}/return`, { quantity: 1, reason: 'CUSTOMER_RETURN' }, token);
  check(res.status === 200 || res.status === 201, 'AD1 devolver 1 de 3', `status ${res.status} ${JSON.stringify(res.body?.error ?? '')}`);
  db = await p.order.findUnique({ where: { id: o.id }, include: { items: true } });
  check(db.items[0]?.quantity === 2, 'AD2 queda con 2 unidades', `quedó en ${db.items[0]?.quantity}`);
  check(n(db.subtotalBase) === 20, 'AD3 el subtotal baja a 20', `subtotal ${db.subtotalBase}`);
  const merma = await p.wasteRecord.count({ where: { restaurantId: rest.id } });
  check(merma > 0, 'AD4 la devolución queda registrada en Merma', `${merma} registros`);

  // Devolver más de lo que hay
  res = await api('POST', `/orders/${o.id}/items/${it.id}/return`, { quantity: 99, reason: 'OTHER' }, token);
  check(res.status >= 400, 'AD5 no se puede devolver más de lo pedido', `status ${res.status}`);
};
