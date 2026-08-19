import { Router } from 'express';
import { requireRoleOrCashierFullAccess, tenantGuard } from '../../middlewares/auth.middleware';
import { publicBookingRateLimit } from '../../middlewares/rate-limit.middleware';
import { reservationController } from './reservation.controller';

/** Público (sin auth): botón "Mesa" del menú, resuelto por slug. */
export const publicReservationRoutes = Router();
publicReservationRoutes.get('/:slug/tables', reservationController.tableStatuses);
publicReservationRoutes.post('/:slug', publicBookingRateLimit, reservationController.create);

/** Panel del restaurante. */
export const tenantReservationRoutes = Router();
tenantReservationRoutes.use(tenantGuard);

// Aceptar/cancelar y crear/editar reservas es de dueño/admin (o cajero con acceso completo).
const reservationsAccess = requireRoleOrCashierFullAccess('OWNER', 'ADMIN');

// Leerlas queda abierto a todo el equipo — el mesero necesita saber qué reservas tiene el turno.
// Lo que ve cada rol lo recorta el controlador: el mesero no ve las pendientes por aceptar.
tenantReservationRoutes.get('/', reservationController.list);
tenantReservationRoutes.post('/', reservationsAccess, reservationController.createByStaff);
tenantReservationRoutes.patch('/:id', reservationsAccess, reservationController.update);
tenantReservationRoutes.patch('/:id/accept', reservationsAccess, reservationController.accept);
tenantReservationRoutes.patch('/:id/cancel', reservationsAccess, reservationController.cancel);
// Sentar y marcar no-show son acciones de sala: las hace quien está atendiendo.
tenantReservationRoutes.patch('/:id/seat', reservationController.seat);
tenantReservationRoutes.patch('/:id/no-show', reservationController.noShow);

export default tenantReservationRoutes;
