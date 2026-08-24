import { Router } from 'express';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { masterLiveController } from './master-live.controller';

/** /api/v1/master/live — estadísticas en vivo de toda la plataforma. */
const router = Router();
router.use(platformAuthGuard);
router.get('/', masterLiveController.snapshot);
export default router;
