import { Router } from 'express';
import { tenantGuard } from '../../middlewares/auth.middleware';
import { waitlistController } from './waitlist.controller';

/**
 * Lista de espera del salón. Todo es operativo (anotar a quien llega, avisarle, sentarlo), no
 * configuración: lo hace quien está atendiendo la puerta, sin permisos especiales.
 */
const router = Router();
router.use(tenantGuard);

router.get('/', waitlistController.list);
router.post('/', waitlistController.create);
router.patch('/:id', waitlistController.update);
router.patch('/:id/notify', waitlistController.notify);
router.patch('/:id/seat', waitlistController.seat);
router.patch('/:id/cancel', waitlistController.cancel);
router.patch('/:id/no-show', waitlistController.noShow);

export default router;
