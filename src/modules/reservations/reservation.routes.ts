import { Router } from 'express';
import { requireRoleOrCashierFullAccess, tenantGuard } from '../../middlewares/auth.middleware';
import { publicBookingRateLimit } from '../../middlewares/rate-limit.middleware';
import { reservationController } from './reservation.controller';

/** Público (sin auth): botón "Mesa" del menú, resuelto por slug. */
export const publicReservationRoutes = Router();
publicReservationRoutes.get('/:slug/tables', reservationController.tableStatuses);
publicReservationRoutes.post('/:slug', publicBookingRateLimit, reservationController.create);

/** Panel del restaurante: ver/cancelar reservas (mismos roles que Mesas). */
export const tenantReservationRoutes = Router();
tenantReservationRoutes.use(tenantGuard);
const reservationsAccess = requireRoleOrCashierFullAccess('OWNER', 'ADMIN');
tenantReservationRoutes.get('/', reservationsAccess, reservationController.list);
tenantReservationRoutes.patch('/:id/accept', reservationsAccess, reservationController.accept);
tenantReservationRoutes.patch('/:id/cancel', reservationsAccess, reservationController.cancel);

export default tenantReservationRoutes;
