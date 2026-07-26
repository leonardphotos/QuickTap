import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { FULL_ACCESS_ROLES } from '../../utils/roles';
import { uploadPhotoToMemory } from '../../middlewares/upload.middleware';
import { aiPhotoController } from './ai-photo.controller';

/**
 * Base: /api/v1/ai-photo. Proxy hacia el microservicio local de IA
 * (ver ai-photo-service/) para los botones "Mejorar foto con IA" y "Fondo
 * blanco con IA" del formulario de productos.
 */
const router = Router();
router.use(tenantGuard, requireRole(...FULL_ACCESS_ROLES));

router.post('/enhance', uploadPhotoToMemory, aiPhotoController.enhance);
router.post('/white-background', uploadPhotoToMemory, aiPhotoController.whiteBackground);

export default router;
