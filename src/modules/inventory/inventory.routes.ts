import { Router } from 'express';
import { requirePremiumPlan, tenantGuard } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/auth.middleware';
import { FULL_ACCESS_ROLES } from '../../utils/roles';
import { inventoryController } from './inventory.controller';

/** Base: /api/v1/inventory — solo plan Premium. */
const router = Router();
router.use(tenantGuard);
router.use(requirePremiumPlan);

const mutate = requireRole(...FULL_ACCESS_ROLES);

router.get('/', inventoryController.list);
router.post('/', mutate, inventoryController.create);
router.patch('/:id', mutate, inventoryController.update);
router.delete('/:id', mutate, inventoryController.remove);

export default router;
