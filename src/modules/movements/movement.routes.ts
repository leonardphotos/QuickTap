import { Router } from 'express';
import { requireFeature, requireRole, requireRoleOrCashierFullAccess, tenantGuard } from '../../middlewares/auth.middleware';
import { movementController } from './movement.controller';

/** Base: /api/v1/movements — botón "Añadir movimiento" en Administración → Resumen. */
const router = Router();
router.use(tenantGuard);
router.use(requireFeature('administration'));

// Ver los movimientos del día (por método de pago, ingresos/egresos manuales) es una de las
// dos habilidades que Cajero conserva siempre, sin depender de `cashierFullAccess`. Crear/borrar
// movimientos y marcar créditos pagados sí requiere acceso completo (dueño/admin, o cajero con el flag).
router.get('/', requireRole('OWNER', 'ADMIN', 'CASHIER'), movementController.list);
const mutate = requireRoleOrCashierFullAccess('OWNER', 'ADMIN');
router.post('/', mutate, movementController.create);
router.delete('/:id', mutate, movementController.remove);
router.patch('/:id/mark-paid', mutate, movementController.markCreditPaid);

export default router;
