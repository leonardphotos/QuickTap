import { Router } from 'express';
import { requirePremiumPlan, tenantGuard } from '../../middlewares/auth.middleware';
import { orderController } from './order.controller';

/**
 * Rutas protegidas de comandas (panel del restaurante).
 * Base: /api/v1/orders
 */
const router = Router();

router.use(tenantGuard);

router.get('/kitchen', orderController.kitchenQueue);
router.get('/delivery', orderController.deliveryQueue);
router.get('/summary/today', orderController.todaySummary);
router.get('/summary/admin', requirePremiumPlan, orderController.adminSummary);
router.post('/manual', orderController.createManual);
router.patch('/:id/status', orderController.updateStatus);
router.patch('/:id/items', orderController.updateItems);

export default router;
