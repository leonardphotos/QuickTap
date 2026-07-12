import { Router } from 'express';
import { authGuard } from '../../middlewares/auth.middleware';
import { restaurantController } from './restaurant.controller';

/** Base: /api/v1/restaurant (el tenant activo, resuelto por JWT). */
const router = Router();
router.use(authGuard);

router.patch('/', restaurantController.update);

export default router;
