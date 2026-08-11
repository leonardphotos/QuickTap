import { Router } from 'express';
import { requireFeature, requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { payrollController } from './payroll.controller';

/** Base: /api/v1/payroll — personal en nómina y sus pagos. */
const router = Router();
router.use(tenantGuard);
router.use(requireFeature('administration'));
// Sueldos ajenos no son cosa del cajero: toda la nómina es solo dueño/administrador.
router.use(requireRole('OWNER', 'ADMIN'));

router.get('/', payrollController.list);
router.post('/', payrollController.create);
router.patch('/:id', payrollController.update);
router.delete('/:id', payrollController.deactivate);
router.get('/:id/payments', payrollController.payments);
router.post('/:id/payments', payrollController.pay);

export default router;
