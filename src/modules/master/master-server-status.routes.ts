import { Router } from 'express';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { masterServerStatusController } from './master-server-status.controller';

/** Base: /api/v1/master/server-status */
const router = Router();
router.use(platformAuthGuard);

router.get('/', masterServerStatusController.get);
router.post('/refresh-cache', masterServerStatusController.refreshCache);

export default router;
