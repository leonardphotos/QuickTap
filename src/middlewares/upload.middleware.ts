import fs from 'fs';
import path from 'path';
import multer from 'multer';
import type SharpFactory from 'sharp';
import { Request, Response, NextFunction } from 'express';
import { badRequest } from '../utils/http-error';
import { asyncHandler } from './error.middleware';

// sharp depende de un binario nativo por plataforma/arquitectura. Si por lo
// que sea no carga en este servidor (SO no soportado, instalación rota),
// esto JAMÁS debe tumbar el proceso completo — sin él, simplemente no se
// redimensionan las imágenes (se sirven tal cual las sube el cliente).
// `import type` de arriba se borra al compilar, así que es seguro aunque
// sharp falle en runtime; el require de abajo es el único acceso real.
let sharp: typeof SharpFactory | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sharp = require('sharp');
} catch (err) {
  console.error('⚠️  No se pudo cargar "sharp": las imágenes subidas no se redimensionarán en el servidor.', err);
}

/**
 * Almacenamiento local en disco para imágenes subidas (fotos de producto,
 * logo del restaurante). El cliente ya comprime/redimensiona la imagen a
 * máx. 800x800 antes de subirla; este límite de 3MB es solo una red de
 * seguridad contra archivos anómalos.
 */
export const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function makeUpload(
  subdir: string,
  fieldName: string,
  allowedMime: Set<string>,
  extByMime: Record<string, string>,
  maxFileSize: number,
  invalidTypeMessage: string,
) {
  const dir = path.join(UPLOADS_DIR, subdir);
  fs.mkdirSync(dir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = extByMime[file.mimetype] ?? path.extname(file.originalname) ?? '';
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      cb(null, unique);
    },
  });

  return multer({
    storage,
    limits: { fileSize: maxFileSize },
    fileFilter: (_req, file, cb) => {
      if (!allowedMime.has(file.mimetype)) {
        cb(badRequest(invalidTypeMessage));
        return;
      }
      cb(null, true);
    },
  }).single(fieldName);
}

function makeImageUpload(subdir: string, fieldName: string) {
  // 10 MB: una foto de comprobante tomada con un teléfono moderno pesa 3-8 MB sin
  // comprimir — con 3 MB los comprobantes reales rebotaban. `optimizeImage` (sharp)
  // las reduce después de recibirlas, así que el límite alto no infla el disco.
  return makeUpload(subdir, fieldName, ALLOWED_MIME, EXT_BY_MIME, 10 * 1024 * 1024, 'Formato de imagen no soportado (usa JPG, PNG o WEBP).');
}

/** Variante de `makeUpload` para múltiples archivos a la vez (carga masiva de fotos de
 * producto por nombre de archivo): mismo storage/validación, pero `.array()` en vez de
 * `.single()`, y conserva `originalname` de cada archivo para poder emparejarlo después. */
function makeImageUploadArray(subdir: string, fieldName: string, maxCount: number) {
  const dir = path.join(UPLOADS_DIR, subdir);
  fs.mkdirSync(dir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = EXT_BY_MIME[file.mimetype] ?? path.extname(file.originalname) ?? '';
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      cb(null, unique);
    },
  });

  return multer({
    storage,
    // Mismo criterio que makeImageUpload: fotos reales de teléfono pesan 3-8 MB.
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME.has(file.mimetype)) {
        cb(badRequest('Formato de imagen no soportado (usa JPG, PNG o WEBP).'));
        return;
      }
      cb(null, true);
    },
  }).array(fieldName, maxCount);
}

export const uploadProductPhoto = makeImageUpload('products', 'photo');
export const uploadProductPhotosBulk = makeImageUploadArray('products', 'photos', 100);
export const uploadInventoryPhoto = makeImageUpload('inventory', 'photo');
export const uploadLogo = makeImageUpload('logos', 'photo');
// QR de Pago Móvil (banco/Suiche 7B) que se muestra al cliente en pantalla al cobrar.
export const uploadPaymentQr = makeImageUpload('payment-qr', 'photo');
// QuickTap Shop: foto del producto en Inventario y comprobante de pago capturado en Venta
// (screenshot de la transferencia/Pago Móvil que sube el cajero al cobrar).
export const uploadShopProductPhoto = makeImageUpload('shop-products', 'photo');
export const uploadShopPaymentProof = makeImageUpload('shop-payment-proofs', 'photo');
// Recibo/factura de un gasto (factura de gasolinera, hotel, restaurante) — ver módulo de Gastos.
export const uploadExpenseReceipt = makeImageUpload('expense-receipts', 'photo');
// Presupuesto/cotización aprobado antes de pagar el gasto.
export const uploadExpenseQuote = makeImageUpload('expense-quotes', 'photo');
// Comprobante de pago del gasto (transferencia/Pago Móvil), aparte de la factura en sí.
export const uploadExpensePaymentProof = makeImageUpload('expense-payment-proofs', 'photo');
// Comprobante de cada abono del "pago fraccionado" de mensualidad/inscripción (ver plan-requests/).
export const uploadPlanPaymentProof = makeImageUpload('plan-payment-proofs', 'photo');
// Comprobante de pago de una comanda (botón "Cobrar" del panel de Pedidos/Mesero) — ver
// order.service.ts addPayment.
export const uploadOrderPaymentProof = makeImageUpload('order-payment-proofs', 'photo');
// Comprobante de pago de una reserva de cancha (botón "Caja" en Canchas) — ver club.service.ts addBookingPayment.
export const uploadClubPaymentProof = makeImageUpload('club-payment-proofs', 'photo');
// Imagen de "Modo Cartelera" (pantalla completa del menú público). Estas
// imágenes suelen ser piezas verticales grandes; `optimizeImage` de abajo
// se encarga de bajarlas a un tamaño razonable para celular.
export const uploadFullscreenImage = makeUpload(
  'fullscreen',
  'photo',
  ALLOWED_MIME,
  EXT_BY_MIME,
  10 * 1024 * 1024,
  'Formato de imagen no soportado (usa JPG, PNG o WEBP).',
);

// Foto de portada del banner del menú público (se muestra con un degradado hacia blanco).
export const uploadCoverImage = makeImageUpload('covers', 'photo');

/**
 * Subida en memoria (sin tocar disco) para el proxy hacia el microservicio
 * de IA (`ai-photo.service.ts`): necesita el buffer del archivo para
 * reenviarlo tal cual, no un path de un archivo ya guardado.
 */
export const uploadPhotoToMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(badRequest('Formato de imagen no soportado (usa JPG, PNG o WEBP).'));
      return;
    }
    cb(null, true);
  },
}).single('photo');

/**
 * Subida en memoria de un .xlsx (importar insumos/recetas) — se lee directo con ExcelJS desde
 * el buffer, nunca toca disco, no hace falta guardarlo después de procesarlo.
 */
const SPREADSHEET_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Algunos navegadores/SO mandan este genérico para .xlsx en vez del MIME correcto.
  'application/octet-stream',
]);
export const uploadSpreadsheet = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!SPREADSHEET_MIME.has(file.mimetype) && !file.originalname.toLowerCase().endsWith('.xlsx')) {
      cb(badRequest('Formato no soportado (usa un archivo .xlsx).'));
      return;
    }
    cb(null, true);
  },
}).single('file');

/**
 * Redimensiona/recomprime la imagen recién subida (en el mismo archivo, sin
 * cambiar de nombre ni extensión). El cliente ya comprime antes de subir,
 * pero esto es la garantía real: sin importar lo que llegue, nunca se sirve
 * al público una imagen más pesada o grande que esto.
 */
export function optimizeImage(maxWidth: number, maxHeight: number, quality = 80) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!sharp || !req.file || req.file.mimetype === 'application/pdf') return next();

    const filePath = req.file.path;
    const tmpPath = `${filePath}.tmp`;
    let pipeline = sharp(filePath).rotate().resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true });

    if (req.file.mimetype === 'image/png') {
      pipeline = pipeline.png({ compressionLevel: 9 });
    } else if (req.file.mimetype === 'image/webp') {
      pipeline = pipeline.webp({ quality });
    } else {
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
    }

    await pipeline.toFile(tmpPath);
    const { size } = fs.statSync(tmpPath);
    fs.renameSync(tmpPath, filePath);
    req.file.size = size;
    next();
  });
}

/** Igual que `optimizeImage`, pero para `req.files` (subida masiva con `.array()`). */
export function optimizeImages(maxWidth: number, maxHeight: number, quality = 80) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!sharp || files.length === 0) return next();

    for (const file of files) {
      if (file.mimetype === 'application/pdf') continue;
      const filePath = file.path;
      const tmpPath = `${filePath}.tmp`;
      let pipeline = sharp(filePath).rotate().resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true });

      if (file.mimetype === 'image/png') {
        pipeline = pipeline.png({ compressionLevel: 9 });
      } else if (file.mimetype === 'image/webp') {
        pipeline = pipeline.webp({ quality });
      } else {
        pipeline = pipeline.jpeg({ quality, mozjpeg: true });
      }

      await pipeline.toFile(tmpPath);
      const { size } = fs.statSync(tmpPath);
      fs.renameSync(tmpPath, filePath);
      file.size = size;
    }
    next();
  });
}

/**
 * Comprime una imagen que llegó como Buffer (comprobantes recibidos por los bots de
 * WhatsApp, que no pasan por multer ni por `optimizeImage`). Mismo criterio: JPEG
 * mozjpeg q80 dentro de 1200×1200 — un comprobante es texto de una captura, no
 * necesita más. Si sharp no está disponible o falla, devuelve el buffer original:
 * mejor guardar la foto pesada que perder el comprobante.
 */
export async function compressImageBuffer(buffer: Buffer, maxWidth = 1200, maxHeight = 1200, quality = 80): Promise<Buffer> {
  if (!sharp) return buffer;
  try {
    const out = await sharp(buffer)
      .rotate()
      .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    // Con imágenes ya pequeñas la recompresión puede pesar MÁS que el original.
    return out.length < buffer.length ? out : buffer;
  } catch {
    return buffer;
  }
}
