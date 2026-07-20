import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { TEAM_MANAGER_ROLES } from '../../utils/roles';
import { branchController } from './branch.controller';

/** Base: /api/v1/branches — sucursales (OWNER/ADMIN únicamente). */
const router = Router();
router.use(tenantGuard);
router.use(requireRole(...TEAM_MANAGER_ROLES));

router.get('/', branchController.list);
router.post('/', branchController.create);
router.post('/:id/switch', branchController.switchToBranch);
router.post('/switch-to-parent', branchController.switchToParent);

router.get('/reports/summary', branchController.consolidatedSummary);
router.get('/reports/sales', branchController.salesByBranch);
router.get('/reports/inventory', branchController.inventoryByBranch);
router.get('/reports/top-products', branchController.topProductsByBranch);
router.get('/reports/employees', branchController.employeesByBranch);

export default router;
