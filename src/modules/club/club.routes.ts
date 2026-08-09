import { Router } from 'express';
import { requireBusinessType, requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { clubController } from './club.controller';

/**
 * Público (sin auth): la página del jugador, resuelta por el slug del club.
 * Nunca recibe un restaurantId del cliente — igual que el menú público.
 */
export const publicClubRoutes = Router();
publicClubRoutes.get('/:slug', clubController.publicClub);
publicClubRoutes.get('/:slug/live', clubController.publicLive);
publicClubRoutes.get('/:slug/availability', clubController.publicAvailability);
publicClubRoutes.post('/:slug/bookings', clubController.publicCreateBooking);
// La reserva del jugador se consulta con el token opaco del QR, sin sesión.
publicClubRoutes.get('/bookings/token/:accessToken', clubController.publicBookingByToken);

/** Panel del club (JWT). */
const router = Router();
router.use(tenantGuard);
router.use(requireBusinessType('SPORTS_CLUB'));

// Recepción necesita ver el calendario y cobrar; los entrenadores solo consultan.
const staff = requireRole('OWNER', 'ADMIN', 'CASHIER', 'WAITER');
// Configurar canchas, horarios y precios es de administración.
const admin = requireRole('OWNER', 'ADMIN');
// Reservar, cancelar y hacer check-in lo hace recepción en el día a día.
const reception = requireRole('OWNER', 'ADMIN', 'CASHIER');

router.get('/courts', staff, clubController.listCourts);
router.post('/courts', admin, clubController.createCourt);
router.patch('/courts/:id', admin, clubController.updateCourt);
router.delete('/courts/:id', admin, clubController.deleteCourt);

router.get('/schedules', staff, clubController.listSchedules);
router.post('/schedules', admin, clubController.createSchedule);
router.patch('/schedules/:id', admin, clubController.updateSchedule);
router.delete('/schedules/:id', admin, clubController.deleteSchedule);

router.get('/panel-courts', staff, clubController.panelCourts);
router.get('/calendar', staff, clubController.calendar);
router.get('/availability', staff, clubController.availability);

router.get('/bookings', staff, clubController.listBookings);
router.post('/bookings', reception, clubController.createBooking);
router.patch('/bookings/:id/cancel', reception, clubController.cancelBooking);
router.post('/bookings/check-in/:accessToken', reception, clubController.checkIn);

router.post('/maintenance', reception, clubController.createMaintenance);
router.delete('/blocks/:id', reception, clubController.removeBlock);

export default router;
