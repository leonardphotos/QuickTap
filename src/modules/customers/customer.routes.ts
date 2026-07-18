import { Router } from 'express';
import { tenantGuard } from '../../middlewares/auth.middleware';
import { customerController } from './customer.controller';

const router = Router();
router.use(tenantGuard);

router.get('/', customerController.list);
router.post('/', customerController.create);
router.patch('/:id', customerController.update);
router.delete('/:id', customerController.remove);

export default router;
