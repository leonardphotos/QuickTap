import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { whatsappBotController } from './whatsapp-bot.controller';

/** Base: /api/v1/whatsapp-bot — vincular/gestionar el chatbot de WhatsApp por QR.
 * Solo Dueño/Admin: vincula el WhatsApp personal/del negocio, es una acción sensible. */
const router = Router();
router.use(tenantGuard);

const manage = requireRole('OWNER', 'ADMIN');

router.get('/status', whatsappBotController.getStatus);
router.post('/connect', manage, whatsappBotController.connect);
router.post('/disconnect', manage, whatsappBotController.disconnect);
router.patch('/settings', manage, whatsappBotController.updateSettings);

export default router;
