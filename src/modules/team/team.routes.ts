import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { TEAM_MANAGER_ROLES } from '../../utils/roles';
import { teamController } from './team.controller';

/** Base: /api/v1/team — gestión de personal (OWNER/ADMIN únicamente). */
const router = Router();
router.use(tenantGuard);
router.use(requireRole(...TEAM_MANAGER_ROLES));

router.get('/', teamController.list);
router.post('/', teamController.create);
router.patch('/:id', teamController.update);
router.delete('/:id', teamController.remove);

export default router;
