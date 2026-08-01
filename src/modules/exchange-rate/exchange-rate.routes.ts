import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { FULL_ACCESS_ROLES } from '../../utils/roles';
import { exchangeRateController } from './exchange-rate.controller';

/** Base: /api/v1/exchange-rates */
const router = Router();
router.use(tenantGuard);

router.get('/', exchangeRateController.summary);
router.post('/refresh', exchangeRateController.refresh);
router.patch('/manual', requireRole(...FULL_ACCESS_ROLES), exchangeRateController.setManual);

export default router;
