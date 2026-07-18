import { Router } from 'express';
import { requireFeature, requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { ADMIN_CASHIER_ROLES } from '../../utils/roles';
import { movementController } from './movement.controller';

/** Base: /api/v1/movements — botón "Añadir movimiento" en Administración → Resumen. */
const router = Router();
router.use(tenantGuard);
router.use(requireRole(...ADMIN_CASHIER_ROLES));
router.use(requireFeature('administration'));

router.get('/', movementController.list);
router.post('/', movementController.create);
router.delete('/:id', movementController.remove);
router.patch('/:id/mark-paid', movementController.markCreditPaid);

export default router;
