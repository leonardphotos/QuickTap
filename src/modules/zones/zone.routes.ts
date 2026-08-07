import { Router } from 'express';
import { requireRoleOrCashierFullAccess, tenantGuard } from '../../middlewares/auth.middleware';
import { zoneController } from './zone.controller';

/** Base: /api/v1/zones */
const router = Router();
router.use(tenantGuard);

const mutate = requireRoleOrCashierFullAccess('OWNER', 'ADMIN', 'STAFF');

// GET abierto a todos los roles: Mesero/Cocina necesitan ver las zonas
// para ubicarse en Órdenes de Mesa.
router.get('/', zoneController.list);
router.post('/', mutate, zoneController.create);
router.patch('/:id', mutate, zoneController.update);
router.delete('/:id', mutate, zoneController.remove);

export default router;
