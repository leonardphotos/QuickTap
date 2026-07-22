import { Router } from 'express';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { authRateLimit } from '../../middlewares/rate-limit.middleware';
import { platformAuthController } from './platform-auth.controller';

/** Base: /api/v1/master-auth */
const router = Router();

router.post('/login', authRateLimit, platformAuthController.login);
router.get('/me', platformAuthGuard, platformAuthController.me);

export default router;
