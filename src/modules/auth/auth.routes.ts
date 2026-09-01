import { Router } from 'express';
import { authGuard } from '../../middlewares/auth.middleware';
import { authRateLimit, lockPinRateLimit, passwordResetRateLimit, switchUserRateLimit, identifyWaiterRateLimit } from '../../middlewares/rate-limit.middleware';
import { authController } from './auth.controller';

/** Base: /api/v1/auth */
const router = Router();

router.post('/register', authRateLimit, authController.register);
router.post('/login', authRateLimit, authController.login);
router.post('/google', authRateLimit, authController.google);
router.post('/forgot-password', passwordResetRateLimit, authController.forgotPassword);
router.post('/reset-password', passwordResetRateLimit, authController.resetPassword);
router.get('/me', authGuard, authController.me);
// Pantalla de bloqueo: cada usuario (cualquier rol) gestiona su propio PIN de 4 dígitos.
router.patch('/lock-pin', authGuard, authController.setLockPin);
router.post('/verify-lock-pin', authGuard, lockPinRateLimit, authController.verifyLockPin);
// Segundo inicio de sesión (tablet compartida de meseros, ver auth.service.switchUser):
// sin tenantGuard a propósito, igual que el resto de /auth/* — un restaurante con la
// suscripción bloqueada no debe perder ni siquiera esto.
router.get('/switchable-waiters', authGuard, authController.switchableWaiters);
router.post('/switch-user', authGuard, switchUserRateLimit, authController.switchUser);
router.post('/identify-waiter', authGuard, identifyWaiterRateLimit, authController.identifyWaiter);
// Sin authGuard a propósito: navigator.sendBeacon (cierre de pestaña) no puede mandar
// headers, así que el token viaja en el body — auth.controller.logout lo valida a mano.
router.post('/logout', authController.logout);

export default router;
