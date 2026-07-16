import { Router } from 'express';
import { requireFeature, requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { FULL_ACCESS_ROLES } from '../../utils/roles';
import { movementController } from './movement.controller';

/** Base: /api/v1/movements — botón "Añadir movimiento" en Administración → Resumen. */
const router = Router();
router.use(tenantGuard);
router.use(requireRole(...FULL_ACCESS_ROLES));
router.use(requireFeature('administration'));

router.get('/', movementController.list);
router.post('/', movementController.create);
router.delete('/:id', movementController.remove);

export default router;
