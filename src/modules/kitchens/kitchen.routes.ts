import { Router } from 'express';
import { requireRoleOrCashierFullAccess, tenantGuard } from '../../middlewares/auth.middleware';
import { kitchenController } from './kitchen.controller';

const router = Router();
router.use(tenantGuard);

const mutate = requireRoleOrCashierFullAccess('OWNER', 'ADMIN', 'STAFF');

router.get('/', kitchenController.list);
router.post('/', mutate, kitchenController.create);
router.patch('/:id', mutate, kitchenController.update);
router.delete('/:id', mutate, kitchenController.remove);

export default router;
