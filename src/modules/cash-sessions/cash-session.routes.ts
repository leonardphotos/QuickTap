import { Router } from 'express';
import { requireFeature, requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { FULL_ACCESS_ROLES } from '../../utils/roles';
import { cashSessionController } from './cash-session.controller';

/** Base: /api/v1/cash-sessions — botón "Abrir Caja" / "Cerrar Caja" en Administración → Resumen. */
const router = Router();
router.use(tenantGuard);
router.use(requireRole(...FULL_ACCESS_ROLES));
router.use(requireFeature('administration'));

router.get('/', cashSessionController.list);
router.get('/current', cashSessionController.current);
router.post('/open', cashSessionController.open);
router.get('/:id/preview', cashSessionController.previewClose);
router.post('/:id/close', cashSessionController.close);
router.get('/:id', cashSessionController.getById);

export default router;
