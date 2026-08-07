import { Router } from 'express';
import { requireFeature, requireRoleOrCashierFullAccess, tenantGuard } from '../../middlewares/auth.middleware';
import { supplierController } from './supplier.controller';

const router = Router();
router.use(tenantGuard);
router.use(requireRoleOrCashierFullAccess('OWNER', 'ADMIN'));
router.use(requireFeature('administration'));

router.get('/', supplierController.list);
router.post('/', supplierController.create);
router.patch('/:id', supplierController.update);
router.delete('/:id', supplierController.remove);

export default router;
