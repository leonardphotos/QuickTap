import { Router } from 'express';
import { requireFeature, tenantGuard } from '../../middlewares/auth.middleware';
import { customerController } from './customer.controller';

const router = Router();
router.use(tenantGuard);

router.get('/', customerController.list);
// La ficha CRM (historial, promos, canjes) es del CRM; la lista sigue libre porque la usa
// el selector de cliente al crear pedidos.
router.get('/:id', requireFeature('crm'), customerController.profile);
router.post('/', customerController.create);
router.patch('/:id', customerController.update);
router.delete('/:id', customerController.remove);

export default router;
