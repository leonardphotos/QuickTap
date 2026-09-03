/* Simulador de flujos del vertical restaurante. Reporta ANOMALIAS, no solo resultados. */
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const p = new PrismaClient();
const API = 'http://localhost:4000/api/v1';

const fallos = [];
const notas = [];
function check(cond, titulo, detalle) {
  if (!cond) { fallos.push({ titulo, detalle }); console.log('  ✗ ' + titulo + '\n      ' + detalle); }
  else console.log('  ✓ ' + titulo);
}
function nota(t, d) { notas.push({ t, d }); console.log('  · ' + t + (d ? '\n      ' + d : '')); }

async function api(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* sin cuerpo */ }
  return { status: res.status, body: json };
}

const n = (x) => Number(x ?? 0);
const r2 = (x) => Math.round(x * 100) / 100;

(async () => {
  const rest = await p.restaurant.findUnique({ where: { slug: 'auditoria-qt' } });
  const user = await p.user.findFirst({ where: { restaurantId: rest.id, role: 'OWNER' } });
  const token = jwt.sign({ userId: user.id, restaurantId: rest.id, role: 'OWNER' }, process.env.JWT_SECRET, { expiresIn: '2h' });
  const prods = await p.product.findMany({ where: { restaurantId: rest.id } });
  const HAM = prods.find((x) => x.name === 'Hamburguesa').id;
  const REF = prods.find((x) => x.name === 'Refresco').id;
  const mesas = await p.table.findMany({ where: { restaurantId: rest.id }, orderBy: { number: 'asc' } });

  module.exports = { rest, token, HAM, REF, mesas };
  global.__ctx = { p, api, check, nota, fallos, notas, rest, token, HAM, REF, mesas, n, r2 };
  await require('./escenarios.js')();
  await require('./escenarios2.js')();
  await require('./escenarios3.js')();
  await require('./escenarios4.js')();
  await require('./escenarios5.js')();
  await require('./escenarios6.js')();
  await require('./escenarios7.js')();

  console.log('\n' + '='.repeat(70));
  console.log('FALLOS: ' + fallos.length + '   |   NOTAS: ' + notas.length);
  if (fallos.length) { console.log('\nDETALLE DE FALLOS:'); fallos.forEach((f, i) => console.log(` ${i + 1}. ${f.titulo}\n    ${f.detalle}`)); }
  await p.$disconnect();
})();
