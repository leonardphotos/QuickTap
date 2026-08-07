import { Router } from 'express';
import { requireRoleOrCashierFullAccess, tenantGuard } from '../../middlewares/auth.middleware';
import { categoryController } from './category.controller';

const router = Router();
router.use(tenantGuard);

const mutate = requireRoleOrCashierFullAccess('OWNER', 'ADMIN');

router.get('/', categoryController.list);
router.post('/', mutate, categoryController.create);
router.patch('/:id', mutate, categoryController.update);
router.delete('/:id', mutate, categoryController.remove);

export default router;
