import { Router } from 'express';
import { menuController } from './menu.controller';

/**
 * Rutas públicas del menú (sin auth). Base: /api/v1/public
 */
const router = Router();

router.get('/menu/:slug', menuController.getPublicMenu);
router.get('/table-session/:qrToken', menuController.getPublicTableSession);
router.post('/table-session/:qrToken/call-waiter', menuController.callWaiter);
router.post('/table-session/:qrToken/request-bill', menuController.requestBill);
router.post('/table-session/:qrToken/pin', menuController.setPin);
router.post('/table-session/:qrToken/skip-pin', menuController.skipPin);

export default router;
