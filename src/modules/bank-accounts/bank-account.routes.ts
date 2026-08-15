import { Router } from 'express';
import { requireFeature, requireRole, requireRoleOrCashierFullAccess, tenantGuard } from '../../middlewares/auth.middleware';
import { bankAccountController } from './bank-account.controller';

/** Base: /api/v1/bank-accounts — cuentas bancarias, caja chica y su libro de movimientos. */
const router = Router();
router.use(tenantGuard);
// Cuentas bancarias son contabilidad avanzada (Elite / Elite Shop / Club).
router.use(requireFeature('accounting'));

// Mismo criterio que /movements: ver saldos es parte del trabajo del cajero; crear cuentas,
// transferir y ajustar es de dueño/admin (o cajero con acceso completo).
router.get('/', requireRole('OWNER', 'ADMIN', 'CASHIER'), bankAccountController.list);
router.get('/:id/transactions', requireRole('OWNER', 'ADMIN', 'CASHIER'), bankAccountController.transactions);

const mutate = requireRoleOrCashierFullAccess('OWNER', 'ADMIN');
router.post('/', mutate, bankAccountController.create);
router.post('/transfer', mutate, bankAccountController.transfer);
router.patch('/:id', mutate, bankAccountController.update);
router.delete('/:id', mutate, bankAccountController.remove);
router.post('/:id/adjust', mutate, bankAccountController.adjust);

export default router;
