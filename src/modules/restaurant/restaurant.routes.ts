import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { FULL_ACCESS_ROLES } from '../../utils/roles';
import { uploadLogo } from '../../middlewares/upload.middleware';
import { restaurantController } from './restaurant.controller';

/** Base: /api/v1/restaurant (el tenant activo, resuelto por JWT). */
const router = Router();
router.use(tenantGuard);

const mutate = requireRole(...FULL_ACCESS_ROLES);

router.patch('/', mutate, restaurantController.update);
router.post('/upload-logo', mutate, uploadLogo, restaurantController.uploadLogo);

export default router;
