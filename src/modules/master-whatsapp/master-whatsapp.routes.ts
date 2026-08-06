import { Router } from 'express';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { masterWhatsappController } from './master-whatsapp.controller';

/** Base: /api/v1/master/whatsapp — vincula/gestiona el chatbot de WhatsApp de la plataforma
 * (bienvenida a restaurantes nuevos + recordatorios de renovación). Solo equipo QuickTap. */
const router = Router();
router.use(platformAuthGuard);

router.get('/status', masterWhatsappController.getStatus);
router.post('/connect', masterWhatsappController.connect);
router.post('/disconnect', masterWhatsappController.disconnect);
router.patch('/settings', masterWhatsappController.updateSettings);

export default router;
