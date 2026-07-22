import { Router } from 'express';
import { authGuard } from '../../middlewares/auth.middleware';
import { authRateLimit, passwordResetRateLimit } from '../../middlewares/rate-limit.middleware';
import { authController } from './auth.controller';

/** Base: /api/v1/auth */
const router = Router();

router.post('/register', authRateLimit, authController.register);
router.post('/login', authRateLimit, authController.login);
router.post('/forgot-password', passwordResetRateLimit, authController.forgotPassword);
router.post('/reset-password', passwordResetRateLimit, authController.resetPassword);
router.get('/me', authGuard, authController.me);

export default router;
