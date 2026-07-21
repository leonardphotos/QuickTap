import { Router } from 'express';
import { requireFeature, requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { ADMIN_CASHIER_ROLES } from '../../utils/roles';
import { orderController } from './order.controller';

/**
 * Rutas protegidas de comandas (panel del restaurante).
 * Base: /api/v1/orders
 */
const router = Router();

router.use(tenantGuard);

// "Movimientos del día" y Administración: solo dueño/admin/cajero (Personal/Mesero/Cocina/Pantalla no ven estos datos).
const adminOnly = requireRole(...ADMIN_CASHIER_ROLES);

router.get('/kitchen', orderController.kitchenQueue);
router.get('/delivery', orderController.deliveryQueue);
router.get('/live', orderController.liveOrders);
router.get('/summary/today', adminOnly, orderController.todaySummary);
router.get('/history', adminOnly, requireFeature('administration'), orderController.history);
router.get('/waiters', adminOnly, requireFeature('administration'), orderController.waiters);
router.get('/reports/products', adminOnly, requireFeature('administration'), orderController.productReport);
router.get('/reports/couriers', adminOnly, requireFeature('administration'), orderController.courierReport);
router.get(
  '/reports/payment-methods',
  adminOnly,
  requireFeature('administration'),
  orderController.paymentMethodReport,
);
router.get('/reports/sales-stats', adminOnly, requireFeature('administration'), orderController.salesStats);
router.post('/manual', orderController.createManual);
router.post('/:id/accept', orderController.accept);
router.post('/:id/dispatch-courier', orderController.dispatchCourier);
router.post('/:id/send-whatsapp', orderController.sendWhatsapp);
router.post('/:id/print-comanda', orderController.printComanda);
router.post('/:id/items', orderController.addItem);
router.post('/:id/payments', orderController.addPayment);
router.patch('/:id/status', orderController.updateStatus);
router.patch('/:id/kitchen-ready', orderController.markKitchenReady);
router.patch('/:id/items', orderController.updateItems);
router.patch('/:id/customer', orderController.updateCustomer);
router.patch('/:id/tip', adminOnly, requireFeature('administration'), orderController.setTip);
router.patch('/:id/awaiting-payment', requireFeature('accountsPayable'), orderController.setAwaitingPayment);
router.delete('/:id', orderController.remove);

export default router;
