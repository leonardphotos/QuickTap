/**
 * Limpieza de basura: borra lo que es inequívocamente descartable y manda a una papelera
 * los archivos subidos que ya nadie referencia (para poder devolverlos si algo se escapó).
 *
 *   npx ts-node --transpile-only -P tsconfig.json scripts/db-cleanup.ts            # simulacro
 *   npx ts-node --transpile-only -P tsconfig.json scripts/db-cleanup.ts --aplicar  # ejecuta
 *
 * QUÉ SÍ toca:
 *   · Códigos de verificación de teléfono ya vencidos (OTP caducados: no sirven a nadie).
 *   · Archivos SUBIDOS POR EL USUARIO que ninguna fila referencia → se MUEVEN a uploads/_papelera/.
 *
 * Solo se revisan las carpetas de la lista blanca de abajo. `uploads/whatsapp-sessions/` queda
 * fuera a propósito: son las credenciales y el caché de la sesión de WhatsApp conectada (miles
 * de archivos que ninguna tabla referencia), y borrarlos desconectaría el bot.
 *
 * QUÉ NO toca, a propósito: pedidos (aunque estén cancelados), clientes, movimientos,
 * cierres de caja ni nada que sea historia del negocio. Eso es información del cliente, no
 * basura, y se borra solo si el dueño lo pide expresamente.
 *
 * La búsqueda de referencias recorre TODAS las columnas de imagen del esquema más los JSON
 * que pueden guardar rutas (adjuntos de órdenes de pago, config de métodos de pago, tema).
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--aplicar');

/**
 * Carpetas de subidas de usuario: son las únicas donde "no referenciado" significa de verdad
 * "sobra". Todo lo demás dentro de uploads/ (sesiones de WhatsApp, temporales de servicios)
 * pertenece a otro proceso y no se toca.
 */
const CARPETAS_LIMPIABLES = [
  'products',
  'shop-products',
  'inventory',
  'logos',
  'covers',
  'fullscreen',
  'payment-qr',
  'expense-receipts',
  'expense-quotes',
  'expense-payment-proofs',
  'order-payment-proofs',
  'club-payment-proofs',
  'shop-payment-proofs',
  'plan-payment-proofs',
  'subscription-payment-proofs',
  'whatsapp-payment-proofs',
  'payment-proofs',
  'payment-order-docs',
];

/** Toda ruta /uploads/... que aparezca en un JSON, sin importar cómo se llame la clave. */
function collectFromJson(value: unknown, into: Set<string>) {
  if (!value) return;
  if (typeof value === 'string') {
    if (value.includes('/uploads/')) into.add(path.basename(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectFromJson(v, into);
    return;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) collectFromJson(v, into);
  }
}

async function referencedFiles(): Promise<Set<string>> {
  const referenced = new Set<string>();
  const add = (v?: string | null) => {
    if (v) referenced.add(path.basename(v));
  };

  const [
    products,
    restaurants,
    inventory,
    movements,
    shopProducts,
    orderPayments,
    orderVerifications,
    planPayments,
    subVerifications,
    clubBookingPayments,
    clubAcademyPayments,
    clubDebtVerifications,
    clubCoaches,
    paymentOrders,
  ] = await Promise.all([
    prisma.product.findMany({ select: { photoUrl: true, importedImageUrl: true } }),
    prisma.restaurant.findMany({
      select: { logoUrl: true, fullscreenImageUrl: true, theme: true, paymentMethodsConfig: true },
    }),
    prisma.inventoryItem.findMany({ select: { photoUrl: true } }),
    prisma.movement.findMany({ select: { receiptImageUrl: true, quoteImageUrl: true, paymentProofImageUrl: true } }),
    prisma.shopProduct.findMany({ select: { photoUrl: true } }),
    prisma.orderPayment.findMany({ select: { proofImageUrl: true } }),
    prisma.orderPaymentVerification.findMany({ select: { proofImageUrl: true } }),
    prisma.planRequestPayment.findMany({ select: { proofImageUrl: true } }),
    prisma.subscriptionPaymentVerification.findMany({ select: { proofImageUrl: true } }),
    prisma.clubBookingPayment.findMany({ select: { proofImageUrl: true } }),
    prisma.clubAcademyPayment.findMany({ select: { proofImageUrl: true } }),
    prisma.clubDebtPaymentVerification.findMany({ select: { proofImageUrl: true } }),
    prisma.clubCoach.findMany({ select: { photoUrl: true } }),
    prisma.paymentOrder.findMany({ select: { attachments: true } }),
  ]);

  products.forEach((p) => {
    add(p.photoUrl);
    add(p.importedImageUrl);
  });
  restaurants.forEach((r) => {
    add(r.logoUrl);
    add(r.fullscreenImageUrl);
    collectFromJson(r.theme, referenced);
    collectFromJson(r.paymentMethodsConfig, referenced);
  });
  inventory.forEach((i) => add(i.photoUrl));
  movements.forEach((m) => {
    add(m.receiptImageUrl);
    add(m.quoteImageUrl);
    add(m.paymentProofImageUrl);
  });
  shopProducts.forEach((p) => add(p.photoUrl));
  [orderPayments, orderVerifications, planPayments, subVerifications, clubBookingPayments, clubAcademyPayments, clubDebtVerifications].forEach(
    (rows) => rows.forEach((r: { proofImageUrl: string | null }) => add(r.proofImageUrl)),
  );
  clubCoaches.forEach((c) => add(c.photoUrl));
  paymentOrders.forEach((o) => collectFromJson(o.attachments, referenced));

  return referenced;
}

async function main() {
  console.log(APPLY ? '▶ LIMPIEZA (aplicando cambios)\n' : '▶ Simulacro: no se borra nada. Usa --aplicar para ejecutar.\n');

  // 1) OTP de teléfono ya vencidos.
  const expiredWhere = { expiresAt: { lt: new Date() } };
  const expired = await prisma.clubPhoneVerification.count({ where: expiredWhere });
  if (APPLY && expired > 0) await prisma.clubPhoneVerification.deleteMany({ where: expiredWhere });
  console.log(`Códigos de verificación vencidos: ${expired}${APPLY && expired ? ' → borrados' : ''}`);

  // 2) Archivos sin referencia → papelera (no se borran: si algo se escapó, se devuelven).
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const trashDir = path.join(uploadsDir, '_papelera');
  if (!fs.existsSync(uploadsDir)) {
    console.log('No hay carpeta uploads/ en este entorno.');
    await prisma.$disconnect();
    return;
  }

  const referenced = await referencedFiles();
  const orphans: { file: string; size: number }[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (full.startsWith(trashDir)) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.name !== '.DS_Store' && !referenced.has(entry.name)) {
        orphans.push({ file: full, size: fs.statSync(full).size });
      }
    }
  };
  for (const carpeta of CARPETAS_LIMPIABLES) {
    const dir = path.join(uploadsDir, carpeta);
    if (fs.existsSync(dir)) walk(dir);
  }

  const mb = (orphans.reduce((acc, o) => acc + o.size, 0) / 1024 / 1024).toFixed(1);
  console.log(`Archivos sin referencia: ${orphans.length} (${mb} MB)`);
  console.log(`Archivos referenciados vivos: ${referenced.size}`);

  if (APPLY && orphans.length > 0) {
    fs.mkdirSync(trashDir, { recursive: true });
    for (const o of orphans) {
      const destino = path.join(trashDir, path.basename(o.file));
      fs.renameSync(o.file, destino);
    }
    console.log(`→ movidos a ${trashDir} (revisar unos días y borrar la carpeta si todo está bien)`);
  } else if (orphans.length > 0) {
    console.log('   ejemplos:', orphans.slice(0, 5).map((o) => path.basename(o.file)).join(', '));
  }

  await prisma.$disconnect();
}

main();
