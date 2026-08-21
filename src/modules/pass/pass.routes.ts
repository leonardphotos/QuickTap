import { Router } from 'express';
import { authRateLimit } from '../../middlewares/rate-limit.middleware';
import { passController } from './pass.controller';
import { passGuard } from './pass.middleware';

/**
 * Base: /api/v1/public/pass — QuickTap Pass, el portal del cliente final.
 *
 * Público: quien entra acá no tiene cuenta en ningún negocio, se identifica con su teléfono y su
 * cédula. El login lleva el mismo límite de tráfico que el resto de las rutas de credenciales
 * del proyecto: no bloquea a ningún cliente, solo frena el intento automatizado de adivinar
 * cédulas a gran escala.
 */
const router = Router();

router.post('/login', authRateLimit, passController.login);
router.get('/me', passGuard, passController.me);

export default router;
