import { Router } from 'express';
import { requireFeature, tenantGuard } from '../../middlewares/auth.middleware';
import { orderController } from './order.controller';

/**
 * Rutas protegidas de comandas (panel del restaurante).
 * Base: /api/v1/orders
 */
const router = Router();

router.use(tenantGuard);

router.get('/kitchen', orderController.kitchenQueue);
router.get('/delivery', orderController.deliveryQueue);
router.get('/live', orderController.liveOrders);
router.get('/summary/today', orderController.todaySummary);
router.get('/summary/admin', requireFeature('administration'), orderController.adminSummary);
router.get('/history', requireFeature('administration'), orderController.history);
router.get('/reports/products', requireFeature('administration'), orderController.productReport);
router.get('/reports/couriers', requireFeature('administration'), orderController.courierReport);
router.get('/reports/payment-methods', requireFeature('administration'), orderController.paymentMethodReport);
router.post('/manual', orderController.createManual);
router.post('/:id/accept', orderController.accept);
router.post('/:id/dispatch-courier', orderController.dispatchCourier);
router.post('/:id/items', orderController.addItem);
router.patch('/:id/status', orderController.updateStatus);
router.patch('/:id/items', orderController.updateItems);
router.patch('/:id/customer', orderController.updateCustomer);
router.patch('/:id/tip', requireFeature('administration'), orderController.setTip);
router.patch('/:id/awaiting-payment', requireFeature('accountsPayable'), orderController.setAwaitingPayment);
router.delete('/:id', orderController.remove);

export default router;
