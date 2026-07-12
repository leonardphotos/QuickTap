import { Router } from 'express';
import { authGuard } from '../../middlewares/auth.middleware';
import { orderController } from './order.controller';

/**
 * Rutas protegidas de comandas (panel del restaurante).
 * Base: /api/v1/orders
 */
const router = Router();

router.use(authGuard);

router.get('/kitchen', orderController.kitchenQueue);
router.patch('/:id/status', orderController.updateStatus);

export default router;
