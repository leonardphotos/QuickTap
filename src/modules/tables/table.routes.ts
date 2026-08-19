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
// Guardar el plano del salón: mismo permiso que crear/mover mesas.
router.patch('/floor-plan', mutate, tableController.saveFloorPlan);
router.post('/', mutate, tableController.create);
router.patch('/:id', mutate, tableController.update);
router.patch('/:id/service-request/ack', tableController.acknowledgeServiceRequest);
// Unir/separar mesas es una decisión de sala, no de configuración: la toma quien atiende
// (mismo criterio que atender un llamado), no solo dueño/admin.
router.post('/merge', tableController.merge);
router.post('/:id/unmerge', tableController.unmerge);
router.delete('/:id', mutate, tableController.remove);

export default router;
