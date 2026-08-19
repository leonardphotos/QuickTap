import { Router } from 'express';
import { tenantGuard } from '../../middlewares/auth.middleware';
import { offlineController } from './offline.controller';

/**
 * Modo sin conexión: lo que el relé de la PC del restaurante baja mientras hay internet, para
 * estar listo el día que se caiga.
 *
 * Solo lectura y acotado al propio restaurante del token — no expone nada que el panel no
 * muestre ya.
 */
const router = Router();
router.use(tenantGuard);

router.get('/catalog-snapshot', offlineController.catalogSnapshot);

export default router;
