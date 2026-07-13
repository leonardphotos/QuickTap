import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { FULL_ACCESS_ROLES } from '../../utils/roles';
import { tableController } from './table.controller';

const router = Router();
router.use(tenantGuard);

const mutate = requireRole(...FULL_ACCESS_ROLES);

router.get('/', tableController.list);
router.get('/floor-plan', tableController.floorPlan);
router.post('/', mutate, tableController.create);
router.patch('/:id', mutate, tableController.update);
router.patch('/:id/service-request/ack', tableController.acknowledgeServiceRequest);
router.delete('/:id', mutate, tableController.remove);

export default router;
