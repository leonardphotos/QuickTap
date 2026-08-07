import { Router } from 'express';
import { requireRoleOrCashierFullAccess, tenantGuard } from '../../middlewares/auth.middleware';
import { tableController } from './table.controller';

const router = Router();
router.use(tenantGuard);

// GET / y /floor-plan quedan abiertos: la toma de pedidos (mesero/personal) necesita listar
// las mesas. Solo crear/editar/borrar mesas es de dueño/admin (o cajero con acceso completo).
const mutate = requireRoleOrCashierFullAccess('OWNER', 'ADMIN');

router.get('/', tableController.list);
router.get('/floor-plan', tableController.floorPlan);
router.post('/', mutate, tableController.create);
router.patch('/:id', mutate, tableController.update);
router.patch('/:id/service-request/ack', tableController.acknowledgeServiceRequest);
router.delete('/:id', mutate, tableController.remove);

export default router;
