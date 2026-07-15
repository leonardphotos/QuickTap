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
router.get('/history', requirePremiumPlan, orderController.history);
router.get('/reports/products', requirePremiumPlan, orderController.productReport);
router.post('/manual', orderController.createManual);
router.post('/:id/accept', orderController.accept);
router.patch('/:id/status', orderController.updateStatus);
router.patch('/:id/items', orderController.updateItems);
router.patch('/:id/tip', requirePremiumPlan, orderController.setTip);

export default router;
