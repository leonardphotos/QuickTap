import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { promotionController } from './promotion.controller';

/** Base: /api/v1/promotions — campañas del CRM con código canjeable. */
const router = Router();
router.use(tenantGuard);

// Validar un código lo hace quien cobra (cajero incluido); administrar campañas, no.
router.get('/validate', requireRole('OWNER', 'ADMIN', 'CASHIER', 'WAITER'), promotionController.validate);

const manage = requireRole('OWNER', 'ADMIN');
router.get('/', requireRole('OWNER', 'ADMIN', 'CASHIER'), promotionController.list);
router.get('/:id', requireRole('OWNER', 'ADMIN', 'CASHIER'), promotionController.detail);
router.post('/', manage, promotionController.create);
router.patch('/:id', manage, promotionController.update);
router.delete('/:id', manage, promotionController.remove);
router.post('/:id/targets/:customerId/sent', manage, promotionController.markSent);

export default router;
