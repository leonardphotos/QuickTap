import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { badRequest } from '../utils/http-error';

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
  return makeUpload(subdir, fieldName, ALLOWED_MIME, EXT_BY_MIME, 3 * 1024 * 1024, 'Formato de imagen no soportado (usa JPG, PNG o WEBP).');
}

export const uploadProductPhoto = makeImageUpload('products', 'photo');
export const uploadLogo = makeImageUpload('logos', 'photo');
// Imagen de "Modo Cartelera" (pantalla completa del menú público). Estas
// imágenes suelen ser piezas verticales grandes (ej. 2000x7000px) que el
// cliente sube sin recomprimir, por eso el límite de tamaño es mayor.
export const uploadFullscreenImage = makeUpload(
  'fullscreen',
  'photo',
  ALLOWED_MIME,
  EXT_BY_MIME,
  15 * 1024 * 1024,
  'Formato de imagen no soportado (usa JPG, PNG o WEBP).',
);

// Foto de portada del banner del menú público (se muestra con un degradado hacia blanco).
export const uploadCoverImage = makeImageUpload('covers', 'photo');

// Comprobante de pago (Pago Móvil / Binance / transferencia): foto o PDF del recibo.
const PROOF_ALLOWED_MIME = new Set([...ALLOWED_MIME, 'application/pdf']);
const PROOF_EXT_BY_MIME: Record<string, string> = { ...EXT_BY_MIME, 'application/pdf': '.pdf' };
export const uploadPaymentProof = makeUpload(
  'payment-proofs',
  'comprobante',
  PROOF_ALLOWED_MIME,
  PROOF_EXT_BY_MIME,
  5 * 1024 * 1024,
  'Formato no soportado (usa JPG, PNG, WEBP o PDF).',
);
