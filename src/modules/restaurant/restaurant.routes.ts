import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { FULL_ACCESS_ROLES } from '../../utils/roles';
import { optimizeImage, uploadCoverImage, uploadFullscreenImage, uploadLogo } from '../../middlewares/upload.middleware';
import { restaurantController } from './restaurant.controller';

/** Base: /api/v1/restaurant (el tenant activo, resuelto por JWT). */
const router = Router();
router.use(tenantGuard);

const mutate = requireRole(...FULL_ACCESS_ROLES);

router.patch('/', mutate, restaurantController.update);
router.post('/upload-logo', mutate, uploadLogo, optimizeImage(900, 900), restaurantController.uploadLogo);
router.post(
  '/upload-cover-image',
  mutate,
  uploadCoverImage,
  optimizeImage(1200, 1200),
  restaurantController.uploadCoverImage,
);
router.post(
  '/upload-fullscreen-image',
  mutate,
  uploadFullscreenImage,
  optimizeImage(1440, 2560, 78),
  restaurantController.uploadFullscreenImage,
);

export default router;
