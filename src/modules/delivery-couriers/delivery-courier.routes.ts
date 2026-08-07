import { Router } from 'express';
import { requireRoleOrCashierFullAccess, tenantGuard } from '../../middlewares/auth.middleware';
import { deliveryCourierController } from './delivery-courier.controller';

/** Base: /api/v1/delivery-couriers — "Equipo de Delivery" (Ajustes). */
const router = Router();
router.use(tenantGuard);

const mutate = requireRoleOrCashierFullAccess('OWNER', 'ADMIN', 'STAFF');

router.get('/', deliveryCourierController.list);
router.post('/', mutate, deliveryCourierController.create);
router.patch('/:id', mutate, deliveryCourierController.update);
router.delete('/:id', mutate, deliveryCourierController.remove);

export default router;
