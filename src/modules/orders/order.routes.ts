import { Router } from 'express';
import { tenantGuard } from '../../middlewares/auth.middleware';
import { orderController } from './order.controller';

/**
 * Rutas protegidas de comandas (panel del restaurante).
 * Base: /api/v1/orders
 */
const router = Router();

router.use(tenantGuard);

router.get('/kitchen', orderController.kitchenQueue);
router.get('/summary/today', orderController.todaySummary);
router.patch('/:id/status', orderController.updateStatus);

export default router;
