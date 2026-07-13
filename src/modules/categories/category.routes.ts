import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { FULL_ACCESS_ROLES } from '../../utils/roles';
import { categoryController } from './category.controller';

const router = Router();
router.use(tenantGuard);

const mutate = requireRole(...FULL_ACCESS_ROLES);

router.get('/', categoryController.list);
router.post('/', mutate, categoryController.create);
router.patch('/:id', mutate, categoryController.update);
router.delete('/:id', mutate, categoryController.remove);

export default router;
