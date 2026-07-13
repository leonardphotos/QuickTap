import { Router } from 'express';
import { tenantGuard } from '../../middlewares/auth.middleware';
import { tableSessionController } from './table-session.controller';

/**
 * Base: /api/v1/table-sessions
 * Sin restricción de rol adicional (más allá de estar autenticado): el
 * Mesero también debe poder cerrar/rodar mesas desde Órdenes de Mesa.
 */
const router = Router();
router.use(tenantGuard);

router.patch('/:id/close', tableSessionController.close);
router.patch('/:id/move', tableSessionController.move);

export default router;
