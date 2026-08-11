import { Router } from 'express';
import { requireFeature, requireRole, requireRoleOrCashierFullAccess, tenantGuard } from '../../middlewares/auth.middleware';
import { paymentOrderController } from './payment-order.controller';

/** Base: /api/v1/payment-orders — cuentas por pagar a proveedores y sus órdenes de pago. */
const router = Router();
router.use(tenantGuard);
router.use(requireFeature('administration'));

// Mismo criterio que /movements: ver es parte del trabajo del cajero, autorizar un pago no.
router.get('/payables', requireRole('OWNER', 'ADMIN', 'CASHIER'), paymentOrderController.listPayables);
router.get('/', requireRole('OWNER', 'ADMIN', 'CASHIER'), paymentOrderController.list);
router.get('/:id', requireRole('OWNER', 'ADMIN', 'CASHIER'), paymentOrderController.getById);

const mutate = requireRoleOrCashierFullAccess('OWNER', 'ADMIN');
router.post('/', mutate, paymentOrderController.create);
router.post('/:id/pay', mutate, paymentOrderController.pay);
router.post('/:id/cancel', mutate, paymentOrderController.cancel);

export default router;
