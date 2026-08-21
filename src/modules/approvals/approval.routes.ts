import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { approvalController } from './approval.controller';

/** Base: /api/v1/approvals — cambios de un administrador que esperan el visto bueno del dueño. */
const router = Router();
router.use(tenantGuard);

// El administrador ve la lista (para saber en qué quedó lo que pidió), pero configurar qué se
// controla y aprobar son del dueño: si el administrador pudiera hacerlo, el control no serviría.
router.get('/', requireRole('OWNER', 'ADMIN'), approvalController.list);
router.get('/policy', requireRole('OWNER', 'ADMIN'), approvalController.policy);
router.put('/policy', requireRole('OWNER'), approvalController.setPolicy);
router.patch('/:id', requireRole('OWNER'), approvalController.resolve);

export const approvalRoutes = router;
