import { Router } from 'express';
import { requireFeature, requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { ADMIN_CASHIER_ROLES } from '../../utils/roles';
import { supplierController } from './supplier.controller';

const router = Router();
router.use(tenantGuard);
router.use(requireRole(...ADMIN_CASHIER_ROLES));
router.use(requireFeature('administration'));

router.get('/', supplierController.list);
router.post('/', supplierController.create);
router.patch('/:id', supplierController.update);
router.delete('/:id', supplierController.remove);

export default router;
