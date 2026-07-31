import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { ADMIN_CASHIER_ROLES } from '../../utils/roles';
import { quoteController } from './quote.controller';

/** Base: /api/v1/quotes — cotizaciones/presupuestos, compartido por restaurantes y Locales Comerciales. */
const router = Router();
router.use(tenantGuard);

const mutate = requireRole(...ADMIN_CASHIER_ROLES);

router.get('/', quoteController.list);
router.post('/', mutate, quoteController.create);
router.patch('/:id/converted', mutate, quoteController.markConverted);
router.delete('/:id', mutate, quoteController.remove);

export default router;
