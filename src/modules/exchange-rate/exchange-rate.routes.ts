import { Router } from 'express';
import { authGuard } from '../../middlewares/auth.middleware';
import { exchangeRateController } from './exchange-rate.controller';

/** Base: /api/v1/exchange-rates */
const router = Router();
router.use(authGuard);

router.get('/', exchangeRateController.summary);
router.post('/refresh', exchangeRateController.refresh);

export default router;
