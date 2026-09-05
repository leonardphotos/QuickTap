import { Router } from 'express';
import { blockIfDemo, blockIfDemoRoleChange, requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { TEAM_MANAGER_ROLES } from '../../utils/roles';
import { teamController } from './team.controller';

/** Base: /api/v1/team — gestión de personal (OWNER/ADMIN únicamente). */
const router = Router();
router.use(tenantGuard);
router.get('/consumption-users', teamController.listConsumptionUsers);
router.use(requireRole(...TEAM_MANAGER_ROLES));

router.get('/', teamController.list);
router.post('/', teamController.create);
router.patch('/:id', blockIfDemoRoleChange, teamController.update);
router.patch('/:id/tables', teamController.assignTables);
router.patch('/:id/pin', teamController.setPin);
router.delete('/:id', blockIfDemo, teamController.remove);

export default router;
