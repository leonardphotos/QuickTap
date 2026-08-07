import { Router } from 'express';
import { requireRoleOrCashierFullAccess, tenantGuard } from '../../middlewares/auth.middleware';
import { quoteController } from './quote.controller';

/** Base: /api/v1/quotes — cotizaciones/presupuestos, compartido por restaurantes y Locales Comerciales. */
const router = Router();
router.use(tenantGuard);

const mutate = requireRoleOrCashierFullAccess('OWNER', 'ADMIN');

router.get('/', quoteController.list);
router.post('/', mutate, quoteController.create);
router.patch('/:id/converted', mutate, quoteController.markConverted);
router.delete('/:id', mutate, quoteController.remove);

export default router;
