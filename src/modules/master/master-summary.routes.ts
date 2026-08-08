import { Router } from 'express';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { masterSummaryController } from './master-summary.controller';

/** Base: /api/v1/master/summary */
const router = Router();
router.use(platformAuthGuard);

router.get('/', masterSummaryController.get);
router.get('/live', masterSummaryController.live);

export default router;
