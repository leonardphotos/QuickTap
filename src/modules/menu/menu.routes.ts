import { Router } from 'express';
import { publicTableActionRateLimit } from '../../middlewares/rate-limit.middleware';
import { menuController } from './menu.controller';

/**
 * Rutas públicas del menú (sin auth). Base: /api/v1/public
 */
const router = Router();

router.get('/menu/:slug', menuController.getPublicMenu);
router.get('/table-session/:qrToken', menuController.getPublicTableSession);
router.post('/table-session/:qrToken/call-waiter', publicTableActionRateLimit, menuController.callWaiter);
router.post('/table-session/:qrToken/request-bill', publicTableActionRateLimit, menuController.requestBill);
router.post('/table-session/:qrToken/pin', publicTableActionRateLimit, menuController.setPin);
router.post('/table-session/:qrToken/skip-pin', publicTableActionRateLimit, menuController.skipPin);

export default router;
