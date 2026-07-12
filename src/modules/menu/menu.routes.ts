import { Router } from 'express';
import { menuController } from './menu.controller';

/**
 * Rutas públicas del menú (sin auth). Base: /api/v1/public
 */
const router = Router();

router.get('/menu/:slug', menuController.getPublicMenu);

export default router;
