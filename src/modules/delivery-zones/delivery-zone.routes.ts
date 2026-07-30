import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { FULL_ACCESS_ROLES } from '../../utils/roles';
import { deliveryZoneController } from './delivery-zone.controller';

/** Base: /api/v1/delivery-zones — zonas de envío con precio fijo (Ajustes). */
const router = Router();
router.use(tenantGuard);

const mutate = requireRole(...FULL_ACCESS_ROLES);

router.get('/', deliveryZoneController.list);
router.post('/', mutate, deliveryZoneController.create);
router.post('/bulk', mutate, deliveryZoneController.bulkCreate);
router.patch('/:id', mutate, deliveryZoneController.update);
router.delete('/:id', mutate, deliveryZoneController.remove);

export default router;
