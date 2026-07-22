import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { ADMIN_CASHIER_ROLES } from '../../utils/roles';
import { reservationController } from './reservation.controller';

/** Público (sin auth): botón "Mesa" del menú, resuelto por slug. */
export const publicReservationRoutes = Router();
publicReservationRoutes.get('/:slug/tables', reservationController.tableStatuses);
publicReservationRoutes.post('/:slug', reservationController.create);

/** Panel del restaurante: ver/cancelar reservas (mismos roles que Mesas). */
export const tenantReservationRoutes = Router();
tenantReservationRoutes.use(tenantGuard);
tenantReservationRoutes.get('/', requireRole(...ADMIN_CASHIER_ROLES), reservationController.list);
tenantReservationRoutes.patch('/:id/accept', requireRole(...ADMIN_CASHIER_ROLES), reservationController.accept);
tenantReservationRoutes.patch('/:id/cancel', requireRole(...ADMIN_CASHIER_ROLES), reservationController.cancel);

export default tenantReservationRoutes;
