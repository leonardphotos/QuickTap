import { Router } from 'express';
import { tenantGuard } from '../../middlewares/auth.middleware';
import { pushTokenController } from './push-token.controller';

/** Base: /api/v1/push-tokens — cualquier miembro del staff registra SU PROPIO dispositivo
 * (no hace falta ser OWNER/ADMIN: un mesero con la app Android también recibe avisos). */
const router = Router();
router.use(tenantGuard);

router.post('/', pushTokenController.register);
router.delete('/:token', pushTokenController.unregister);

export default router;
