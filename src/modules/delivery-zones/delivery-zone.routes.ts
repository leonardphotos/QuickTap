import { Router } from 'express';
import { requireRoleOrCashierFullAccess, tenantGuard } from '../../middlewares/auth.middleware';
import { deliveryZoneController } from './delivery-zone.controller';

/** Base: /api/v1/delivery-zones — zonas de envío con precio fijo (Ajustes). */
const router = Router();
router.use(tenantGuard);

const mutate = requireRoleOrCashierFullAccess('OWNER', 'ADMIN', 'STAFF');

router.get('/', deliveryZoneController.list);
router.post('/', mutate, deliveryZoneController.create);
router.post('/bulk', mutate, deliveryZoneController.bulkCreate);
router.patch('/:id', mutate, deliveryZoneController.update);
router.delete('/:id', mutate, deliveryZoneController.remove);

export default router;
