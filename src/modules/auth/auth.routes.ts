import { Router } from 'express';
import { authGuard } from '../../middlewares/auth.middleware';
import { authController } from './auth.controller';

/** Base: /api/v1/auth */
const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/me', authGuard, authController.me);

export default router;
