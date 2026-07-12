import { Router } from 'express';
import { authGuard } from '../../middlewares/auth.middleware';
import { tableController } from './table.controller';

const router = Router();
router.use(authGuard);

router.get('/', tableController.list);
router.post('/', tableController.create);
router.delete('/:id', tableController.remove);

export default router;
