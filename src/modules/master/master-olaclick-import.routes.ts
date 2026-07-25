import { Router } from 'express';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { masterOlaclickImportController } from './master-olaclick-import.controller';

/**
 * Base: /api/v1/master/olaclick-import
 *
 * Herramienta INTERNA del equipo QuickTap (onboarding de restaurantes que
 * vienen de OlaClick). Protegida por platformAuthGuard — nunca montar esto
 * bajo /api/v1 a secas ni bajo un guard de tenant. Ver README de la
 * migración para el contexto legal de por qué esto es interno y no una
 * función self-service del restaurante.
 */
const router = Router();
router.use(platformAuthGuard);

router.post('/:restaurantId/connect', masterOlaclickImportController.connect);
router.post('/:restaurantId/preview', masterOlaclickImportController.preview);
router.post('/:restaurantId/confirm', masterOlaclickImportController.confirm);
router.get('/:restaurantId/status', masterOlaclickImportController.status);

export default router;
