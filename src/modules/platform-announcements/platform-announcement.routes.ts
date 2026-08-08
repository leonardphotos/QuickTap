import { Router } from 'express';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { platformAnnouncementController } from './platform-announcement.controller';

/** Base: /api/v1/master/announcements — avisos de actualización editables antes de mandarlos
 * por el chatbot de la plataforma (ver platform-announcement.service.ts). Solo equipo QuickTap. */
const router = Router();
router.use(platformAuthGuard);

router.get('/', platformAnnouncementController.list);
router.post('/', platformAnnouncementController.create);
router.patch('/:id', platformAnnouncementController.update);
router.delete('/:id', platformAnnouncementController.remove);
router.post('/:id/send', platformAnnouncementController.send);

export default router;
