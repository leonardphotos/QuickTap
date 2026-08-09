/* Prueba E2E del vertical Club contra el servidor local. Se borra al terminar. */
const BASE = 'http://localhost:4000/api/v1';
const stamp = Date.now();
const SLUG = `zztest-club-${stamp}`;
const EMAIL = `zztest-club-${stamp}@quicktap.club`;
const PASS = 'Test1234!';

let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => { c ? (pass++, console.log(`✅ ${msg}`)) : (fail++, console.log(`❌ ${msg} ${extra}`)); };

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* sin cuerpo */ }
  return { status: res.status, json };
}

// Mañana en hora de Caracas (UTC-4), para no chocar con "ya pasó".
function tomorrowCaracas() {
  const d = new Date(Date.now() + 86400000 - 4 * 3600000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

(async () => {
  const date = tomorrowCaracas();
  const weekday = weekdayOf(date);
  console.log(`\n── Registro del club (${date}, día ${weekday}) ──`);

  const reg = await call('POST', '/auth/register', {
    body: {
      slug: SLUG, restaurantName: 'ZZTEST Club Pádel', ownerName: 'Tester',
      email: EMAIL, password: PASS, businessType: 'SPORTS_CLUB',
    },
  });
  ok(reg.status === 201, `registro con businessType SPORTS_CLUB → ${reg.status}`, JSON.stringify(reg.json).slice(0, 200));
  const token = reg.json?.data?.token;
  ok(!!token, 'devuelve token');
  ok(reg.json?.data?.restaurant?.businessType === 'SPORTS_CLUB', `businessType en sesión → ${reg.json?.data?.restaurant?.businessType}`);
  ok(reg.json?.data?.restaurant?.subscriptionPlan === 'CLUB', `plan de prueba → ${reg.json?.data?.restaurant?.subscriptionPlan}`);

  console.log('\n── Canchas y horarios ──');
  const court = await call('POST', '/club/courts', { token, body: { name: 'Cancha 1', sport: 'PADEL' } });
  ok(court.status === 201, `crear cancha → ${court.status}`, JSON.stringify(court.json).slice(0, 200));
  const courtId = court.json?.data?.id;

  const court2 = await call('POST', '/club/courts', { token, body: { name: 'Cancha 2', sport: 'PADEL', sortOrder: 1 } });
  const courtId2 = court2.json?.data?.id;

  const sched = await call('POST', '/club/schedules', {
    token, body: { weekday, startTime: '08:00', endTime: '23:00', slotMinutes: 90, priceBase: 20 },
  });
  ok(sched.status === 201, `franja general 08:00-23:00 (90 min, $20) → ${sched.status}`, JSON.stringify(sched.json).slice(0, 200));

  const peak = await call('POST', '/club/schedules', {
    token, body: { courtId, weekday, startTime: '08:00', endTime: '23:00', slotMinutes: 90, priceBase: 35, isPeak: true },
  });
  ok(peak.status === 201, `franja propia de Cancha 1 más cara ($35, pico) → ${peak.status}`);

  const badSched = await call('POST', '/club/schedules', {
    token, body: { weekday, startTime: '22:00', endTime: '21:00', slotMinutes: 90, priceBase: 10 },
  });
  ok(badSched.status === 400, `franja con cierre antes de apertura → ${badSched.status} (debe ser 400)`);

  console.log('\n── Disponibilidad ──');
  const avail = await call('GET', `/club/availability?date=${date}`, { token });
  ok(avail.status === 200, `consultar disponibilidad → ${avail.status}`);
  const c1 = avail.json?.data?.find((x) => x.court.id === courtId);
  const c2 = avail.json?.data?.find((x) => x.court.id === courtId2);
  ok(c1?.slots?.length === 10, `Cancha 1: 10 turnos de 90 min entre 08:00 y 23:00 → ${c1?.slots?.length}`);
  ok(c1?.slots?.[0]?.priceBase === '35', `Cancha 1 usa su precio propio ($35) → $${c1?.slots?.[0]?.priceBase}`);
  ok(c1?.slots?.[0]?.isPeak === true, 'Cancha 1 marcada como hora pico');
  ok(c2?.slots?.[0]?.priceBase === '20', `Cancha 2 hereda la franja general ($20) → $${c2?.slots?.[0]?.priceBase}`);
  ok(c1?.slots?.every((s) => s.available), 'todos los turnos libres al inicio');

  console.log('\n── Reservas ──');
  const mk = (extra = {}) => ({
    courtId, date, startTime: '18:30', durationMinutes: 90,
    playerName: 'Leo Pérez', playerPhone: '584141234567', ...extra,
  });
  const b1 = await call('POST', '/club/bookings', { token, body: mk() });
  ok(b1.status === 201, `reservar 18:30-20:00 → ${b1.status}`, JSON.stringify(b1.json).slice(0, 250));
  const accessToken = b1.json?.data?.accessToken;
  ok(!!accessToken, 'la reserva trae token de QR de acceso');
  ok(b1.json?.data?.totalBase === '35', `precio congelado desde el horario ($35) → $${b1.json?.data?.totalBase}`);
  ok(Number(b1.json?.data?.totalBs) > 0, `total en Bs calculado → Bs ${b1.json?.data?.totalBs}`);

  const b2 = await call('POST', '/club/bookings', { token, body: mk() });
  ok(b2.status === 409, `reservar el MISMO horario otra vez → ${b2.status} (debe ser 409)`, JSON.stringify(b2.json).slice(0, 150));

  const b3 = await call('POST', '/club/bookings', { token, body: mk({ startTime: '20:00' }) });
  ok(b3.status === 201, `reservar 20:00-21:30 (contigua) → ${b3.status}`);

  const b4 = await call('POST', '/club/bookings', { token, body: mk({ startTime: '18:30', courtId: courtId2 }) });
  ok(b4.status === 201, `misma hora en OTRA cancha → ${b4.status}`);

  const b5 = await call('POST', '/club/bookings', { token, body: mk({ startTime: '18:45' }) });
  ok(b5.status === 400, `horario que no cae en la parrilla (18:45) → ${b5.status} (debe ser 400)`);

  const b6 = await call('POST', '/club/bookings', { token, body: { ...mk(), priceBase: 0.01 } });
  ok(b6.json?.data?.totalBase !== '0.01', 'el precio lo pone el servidor, no el cliente');

  console.log('\n── Carrera: 6 reservas simultáneas al mismo hueco ──');
  const race = await Promise.all(Array.from({ length: 6 }, () => call('POST', '/club/bookings', { token, body: mk({ startTime: '09:30' }) })));
  const won = race.filter((r) => r.status === 201).length;
  const lost = race.filter((r) => r.status === 409).length;
  ok(won === 1 && lost === 5, `→ ${won} aceptada, ${lost} rechazadas con 409`);

  console.log('\n── Mantenimiento ──');
  const m1 = await call('POST', '/club/maintenance', { token, body: { courtId, date, startTime: '18:30', endTime: '19:30', note: 'Cristales' } });
  ok(m1.status === 409, `bloquear encima de una reserva → ${m1.status} (debe ser 409)`);

  const m2 = await call('POST', '/club/maintenance', { token, body: { courtId, date, startTime: '12:30', endTime: '14:00', note: 'Cambio de red' } });
  ok(m2.status === 201, `bloquear un hueco libre → ${m2.status}`);

  const b7 = await call('POST', '/club/bookings', { token, body: mk({ startTime: '12:30' }) });
  ok(b7.status === 409, `reservar sobre el mantenimiento → ${b7.status} (debe ser 409)`);

  const avail2 = await call('GET', `/club/availability?date=${date}&courtId=${courtId}`, { token });
  const slot1230 = avail2.json?.data?.[0]?.slots?.find((s) => s.startTime === '12:30');
  ok(slot1230?.available === false && slot1230?.reason === 'MAINTENANCE', `el turno 12:30 aparece ocupado por MAINTENANCE → ${slot1230?.reason}`);
  const slot1830 = avail2.json?.data?.[0]?.slots?.find((s) => s.startTime === '18:30');
  ok(slot1830?.reason === 'BOOKING', `el turno 18:30 aparece ocupado por BOOKING → ${slot1830?.reason}`);

  console.log('\n── Cancelar libera el hueco ──');
  const cancel = await call('PATCH', `/club/bookings/${b1.json?.data?.id}/cancel`, { token });
  ok(cancel.status === 200, `cancelar la reserva de las 18:30 → ${cancel.status}`);
  const b8 = await call('POST', '/club/bookings', { token, body: mk({ startTime: '18:30' }) });
  ok(b8.status === 201, `volver a reservar las 18:30 tras cancelar → ${b8.status}`);

  console.log('\n── Página pública del jugador ──');
  const pub = await call('GET', `/public/club/${SLUG}`);
  ok(pub.status === 200, `GET /public/club/:slug sin token → ${pub.status}`);
  ok(pub.json?.data?.courts?.length === 2, `expone 2 canchas → ${pub.json?.data?.courts?.length}`);
  ok(pub.json?.data?.club?.name === 'ZZTEST Club Pádel', 'expone el nombre del club');

  const pubAvail = await call('GET', `/public/club/${SLUG}/availability?date=${date}`);
  ok(pubAvail.status === 200, `disponibilidad pública → ${pubAvail.status}`);

  const pubBook = await call('POST', `/public/club/${SLUG}/bookings`, {
    body: { courtId: courtId2, date, startTime: '20:00', durationMinutes: 90, playerName: 'Jugador Web', playerPhone: '584149998877' },
  });
  ok(pubBook.status === 201, `reserva desde la web del jugador → ${pubBook.status}`, JSON.stringify(pubBook.json).slice(0, 200));
  const webToken = pubBook.json?.data?.accessToken;

  const byToken = await call('GET', `/public/club/bookings/token/${webToken}`);
  ok(byToken.status === 200, `consultar la reserva con el token del QR → ${byToken.status}`);
  ok(byToken.json?.data?.playerName === 'Jugador Web', 'el token resuelve la reserva correcta');

  const badToken = await call('GET', '/public/club/bookings/token/tokenfalso123');
  ok(badToken.status === 404, `token inventado → ${badToken.status} (debe ser 404)`);

  const nonClub = await call('GET', '/public/club/big-bite-burgers');
  ok(nonClub.status === 404, `slug de un restaurante (no club) → ${nonClub.status} (debe ser 404)`);

  console.log('\n── Check-in por QR ──');
  const ci = await call('POST', `/club/bookings/check-in/${webToken}`, { token });
  ok(ci.status === 200, `check-in → ${ci.status}`);
  ok(ci.json?.data?.alreadyCheckedIn === false, 'primer check-in');
  ok(!!ci.json?.data?.booking?.checkedInAt, 'queda registrada la asistencia');
  const ci2 = await call('POST', `/club/bookings/check-in/${webToken}`, { token });
  ok(ci2.json?.data?.alreadyCheckedIn === true, 'segundo check-in avisa que ya entró');

  console.log('\n── Aislamiento entre verticales ──');
  const rest = await call('POST', '/auth/register', {
    body: { slug: `zztest-rest-${stamp}`, restaurantName: 'ZZTEST Resto', ownerName: 'T', email: `zztest-rest-${stamp}@quicktap.club`, password: PASS },
  });
  const restToken = rest.json?.data?.token;
  const cross = await call('GET', '/club/courts', { token: restToken });
  ok(cross.status === 403, `token de restaurante contra /club/courts → ${cross.status} (debe ser 403)`);

  const noAuth = await call('GET', '/club/courts');
  ok(noAuth.status === 401, `sin token → ${noAuth.status} (debe ser 401)`);

  console.log('\n── Calendario ──');
  const cal = await call('GET', `/club/calendar?date=${date}`, { token });
  ok(cal.status === 200, `calendario del día → ${cal.status}`);
  ok(cal.json?.data?.courts?.length === 2, `2 canchas en el calendario → ${cal.json?.data?.courts?.length}`);
  ok(cal.json?.data?.blocks?.length > 0, `${cal.json?.data?.blocks?.length} bloques ocupando canchas`);

  console.log('\n── Limpieza ──');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const del = await prisma.restaurant.deleteMany({ where: { slug: { startsWith: 'zztest-' } } });
  const left = await prisma.restaurant.count({ where: { slug: { startsWith: 'zztest-' } } });
  ok(left === 0, `borrados ${del.count} negocios de prueba, quedan ${left}`);
  await prisma.$disconnect();

  console.log(`\n${'═'.repeat(50)}\n  ${pass} pruebas OK, ${fail} fallidas\n${'═'.repeat(50)}`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
