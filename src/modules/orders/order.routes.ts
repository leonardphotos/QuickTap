import { Router } from 'express';
import { requireFeature, requireRole, requireRoleOrCashierFullAccess, tenantGuard } from '../../middlewares/auth.middleware';
import { optimizeImage, uploadOrderPaymentProof } from '../../middlewares/upload.middleware';
import { orderController } from './order.controller';

/**
 * Rutas protegidas de comandas (panel del restaurante).
 * Base: /api/v1/orders
 */
const router = Router();

router.use(tenantGuard);

// Administración (Resumen/Estadísticas/Historial/etc.): dueño/admin, o cajero con acceso
// completo — por defecto Cajero ya NO ve esto (Personal/Mesero/Cocina/Pantalla tampoco).
const adminOnly = requireRoleOrCashierFullAccess('OWNER', 'ADMIN');
// "Movimientos del día por método de pago": la otra habilidad que Cajero conserva siempre,
// sin depender del flag.
const paymentMethodsAccess = requireRole('OWNER', 'ADMIN', 'CASHIER');

router.get('/kitchen', orderController.kitchenQueue);
router.get('/delivery', orderController.deliveryQueue);
router.get('/live', orderController.liveOrders);
router.get('/summary/today', adminOnly, orderController.todaySummary);
router.get('/history', adminOnly, requireFeature('administration'), orderController.history);
// Respaldo completo de cobros en Excel (botón "Descargar historial de ventas" en Ajustes).
// Sin requireFeature: es la copia de seguridad de sus propios datos, la tienen todos los
// planes y los dos verticales (restaurante y local).
router.get('/export/sales-history', requireRole('OWNER', 'ADMIN'), orderController.exportSalesHistory);
// Exporta el Historial de pedidos tal como se está viendo (mismos filtros y rango de fechas).
router.get('/export/history', adminOnly, requireFeature('administration'), orderController.exportHistory);
router.get('/waiters', adminOnly, requireFeature('administration'), orderController.waiters);
router.get('/reports/products', adminOnly, requireFeature('administration'), orderController.productReport);
router.get('/reports/couriers', adminOnly, requireFeature('administration'), orderController.courierReport);
router.get(
  '/reports/payment-methods',
  paymentMethodsAccess,
  requireFeature('administration'),
  orderController.paymentMethodReport,
);
router.get('/reports/sales-stats', adminOnly, requireFeature('administration'), orderController.salesStats);
router.get(
  '/reports/sales-stats/user/:userId',
  adminOnly,
  requireFeature('administration'),
  orderController.salesStatsUserOrders,
);
router.post('/manual', orderController.createManual);
router.post('/:id/accept', orderController.accept);
router.post('/:id/dispatch-courier', orderController.dispatchCourier);
router.post('/:id/send-whatsapp', orderController.sendWhatsapp);
router.post('/:id/print-comanda', orderController.printComanda);
router.post('/:id/print-receipt', orderController.printReceipt);
router.post('/:id/items', orderController.addItem);
router.post('/:id/payments', orderController.addPayment);
router.post('/upload-payment-proof', uploadOrderPaymentProof, optimizeImage(1200, 1200), orderController.uploadPaymentProof);
router.patch('/:id/status', orderController.updateStatus);
router.patch('/:id/kitchen-ready', orderController.markKitchenReady);
router.patch('/:id/kitchen-start', orderController.markKitchenStarted);
router.patch('/:id/items', orderController.updateItems);
router.patch('/:id/customer', orderController.updateCustomer);
router.patch('/:id/channel', orderController.changeChannel);
router.patch('/:id/tip', adminOnly, requireFeature('administration'), orderController.setTip);
router.patch('/:id/awaiting-payment', requireFeature('accountsPayable'), orderController.setAwaitingPayment);
router.delete('/:id', orderController.remove);

export default router;
