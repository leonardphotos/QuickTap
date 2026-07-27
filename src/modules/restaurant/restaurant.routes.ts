import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { FULL_ACCESS_ROLES, TEAM_MANAGER_ROLES } from '../../utils/roles';
import { optimizeImage, uploadCoverImage, uploadFullscreenImage, uploadLogo, uploadPaymentQr } from '../../middlewares/upload.middleware';
import { restaurantController } from './restaurant.controller';

/** Base: /api/v1/restaurant (el tenant activo, resuelto por JWT). */
const router = Router();
router.use(tenantGuard);

const mutate = requireRole(...FULL_ACCESS_ROLES);

router.patch('/', mutate, restaurantController.update);
router.patch('/welcome-seen', restaurantController.markWelcomeSeen);
// Código para eliminar comandas (Ajustes): solo Dueño/Admin lo crean o cambian.
router.patch('/delete-order-pin', requireRole(...TEAM_MANAGER_ROLES), restaurantController.setDeleteOrderPin);
// Entorno Demo Efímero: código de administrador que exime del reset automático.
router.post('/demo-admin-unlock', requireRole(...TEAM_MANAGER_ROLES), restaurantController.demoAdminUnlock);
router.get('/schedule', restaurantController.getSchedule);
router.put('/schedule', mutate, restaurantController.updateSchedule);
router.post('/upload-logo', mutate, uploadLogo, optimizeImage(900, 900), restaurantController.uploadLogo);
router.post('/upload-payment-qr', mutate, uploadPaymentQr, optimizeImage(900, 900), restaurantController.uploadPaymentQr);
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
