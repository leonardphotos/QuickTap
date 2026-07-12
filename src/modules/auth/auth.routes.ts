import { Router } from 'express';
import { authGuard } from '../../middlewares/auth.middleware';
import { authController } from './auth.controller';

/** Base: /api/v1/auth */
const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', authGuard, authController.me);

export default router;
