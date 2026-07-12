import { Router } from 'express';
import { authGuard } from '../../middlewares/auth.middleware';
import { categoryController } from './category.controller';

const router = Router();
router.use(authGuard);

router.get('/', categoryController.list);
router.post('/', categoryController.create);
router.patch('/:id', categoryController.update);
router.delete('/:id', categoryController.remove);

export default router;
