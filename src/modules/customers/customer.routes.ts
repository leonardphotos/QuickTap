import { Router } from 'express';
import { requireFeature, requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { TEAM_MANAGER_ROLES } from '../../utils/roles';
import { customerController } from './customer.controller';

const router = Router();
router.use(tenantGuard);

router.get('/', customerController.list);
// La ficha CRM (historial, promos, canjes) es del CRM; la lista sigue libre porque la usa
// el selector de cliente al crear pedidos.
router.get('/:id', requireFeature('crm'), customerController.profile);
// Crear queda al alcance de cualquiera que tome pedidos: CustomerPicker da de alta al cliente
// en el mismo momento de cobrar. Editar y borrar la ficha, en cambio, son del CRM — sin este
// guard cualquier sesión del local (una tablet de kiosco, una pantalla) podía reescribir
// teléfonos o vaciar la base de clientes entera.
router.post('/', customerController.create);
router.patch('/:id', requireRole(...TEAM_MANAGER_ROLES), customerController.update);
router.delete('/:id', requireRole(...TEAM_MANAGER_ROLES), customerController.remove);

export default router;
