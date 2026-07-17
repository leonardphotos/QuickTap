import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { FULL_ACCESS_ROLES } from '../../utils/roles';
import { kitchenController } from './kitchen.controller';

const router = Router();
router.use(tenantGuard);

const mutate = requireRole(...FULL_ACCESS_ROLES);

router.get('/', kitchenController.list);
router.post('/', mutate, kitchenController.create);
router.patch('/:id', mutate, kitchenController.update);
router.delete('/:id', mutate, kitchenController.remove);

export default router;
