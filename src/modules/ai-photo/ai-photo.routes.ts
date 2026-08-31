import { Router } from 'express';
import { AI_PHOTO_ENABLED } from '../../config/features';
import { requireRoleOrCashierFullAccess, tenantGuard } from '../../middlewares/auth.middleware';
import { uploadPhotoToMemory } from '../../middlewares/upload.middleware';
import { serviceUnavailable } from '../../utils/http-error';
import { aiPhotoController } from './ai-photo.controller';

/**
 * Base: /api/v1/ai-photo. Proxy hacia el microservicio local de IA
 * (ver ai-photo-service/) para los botones "Mejorar foto con IA" y "Fondo
 * blanco con IA" del formulario de productos.
 */
const router = Router();
router.use(tenantGuard, requireRoleOrCashierFullAccess('OWNER', 'ADMIN', 'STAFF'));

// Apagado (AI_PHOTO_ENABLED). Corta ANTES de uploadPhotoToMemory: si no, cada llamada de una
// pestaña vieja igual subiría la imagen entera a memoria para descartarla después.
router.use((_req, _res, next) =>
  next(AI_PHOTO_ENABLED ? undefined : serviceUnavailable('El retoque de fotos con IA está desactivado por ahora.')),
);

router.post('/enhance', uploadPhotoToMemory, aiPhotoController.enhance);
router.post('/white-background', uploadPhotoToMemory, aiPhotoController.whiteBackground);

export default router;
