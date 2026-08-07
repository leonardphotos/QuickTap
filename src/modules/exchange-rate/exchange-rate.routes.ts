import { Router } from 'express';
import { requireRoleOrCashierFullAccess, tenantGuard } from '../../middlewares/auth.middleware';
import { exchangeRateController } from './exchange-rate.controller';

/** Base: /api/v1/exchange-rates */
const router = Router();
router.use(tenantGuard);

router.get('/', exchangeRateController.summary);
router.post('/refresh', exchangeRateController.refresh);
router.patch('/manual', requireRoleOrCashierFullAccess('OWNER', 'ADMIN', 'STAFF'), exchangeRateController.setManual);

export default router;
