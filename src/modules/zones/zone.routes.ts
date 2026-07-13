import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { FULL_ACCESS_ROLES } from '../../utils/roles';
import { zoneController } from './zone.controller';

/** Base: /api/v1/zones */
const router = Router();
router.use(tenantGuard);

const mutate = requireRole(...FULL_ACCESS_ROLES);

// GET abierto a todos los roles: Mesero/Cocina necesitan ver las zonas
// para ubicarse en Órdenes de Mesa.
router.get('/', zoneController.list);
router.post('/', mutate, zoneController.create);
router.patch('/:id', mutate, zoneController.update);
router.delete('/:id', mutate, zoneController.remove);

export default router;
