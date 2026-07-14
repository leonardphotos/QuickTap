import { Router } from 'express';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { masterAdminsController } from './master-admins.controller';

/** Base: /api/v1/master/admins — cuentas del Dashboard maestro (Administrador/Gestor). */
const router = Router();
router.use(platformAuthGuard);

router.get('/', masterAdminsController.list);
router.post('/', masterAdminsController.create);
router.patch('/:id', masterAdminsController.update);

export default router;
