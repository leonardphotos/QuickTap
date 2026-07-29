import fs from 'fs';
import path from 'path';
import { env } from '../../config/env';
import { UPLOADS_DIR } from '../../middlewares/upload.middleware';
import { HttpError } from '../../utils/http-error';
import { platformSettingsService } from '../platform-settings/platform-settings.service';

const AI_DIR = path.join(UPLOADS_DIR, 'ai-photo');
fs.mkdirSync(AI_DIR, { recursive: true });

const SERVICE_DOWN_MESSAGE =
  'El servicio de IA para fotos no está disponible ahora mismo. Puedes seguir subiendo la foto manualmente.';
const DISABLED_MESSAGE =
  'La mejora de fotos con IA está desactivada temporalmente por el equipo de QuickTap. Puedes seguir subiendo la foto manualmente.';

async function callAiService(endpoint: 'enhance-image' | 'white-background', file: Express.Multer.File) {
  if (!(await platformSettingsService.getAiPhotoEnabledOrDefault())) {
    throw new HttpError(403, DISABLED_MESSAGE);
  }

  const form = new FormData();
  form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname);

  let response: Response;
  try {
    response = await fetch(`${env.aiPhotoServiceUrl}/${endpoint}`, { method: 'POST', body: form });
  } catch {
    throw new HttpError(503, SERVICE_DOWN_MESSAGE);
  }

  if (!response.ok) {
    throw new HttpError(502, 'El servicio de IA no pudo procesar la imagen. Intenta con otra foto.');
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
  fs.writeFileSync(path.join(AI_DIR, filename), buffer);
  return `/uploads/ai-photo/${filename}`;
}

export const aiPhotoService = {
  /** Botón "Mejorar foto con IA": contraste/brillo/nitidez, sin tocar el fondo. */
  enhance(file: Express.Multer.File) {
    return callAiService('enhance-image', file);
  },
  /** Botón "Fondo blanco con IA": quita el fondo y compone sobre blanco puro con sombra. */
  whiteBackground(file: Express.Multer.File) {
    return callAiService('white-background', file);
  },
};
