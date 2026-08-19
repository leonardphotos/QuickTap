import { Router } from 'express';
import { requireBusinessType, requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { publicBookingRateLimit } from '../../middlewares/rate-limit.middleware';
import { optimizeImage, uploadClubCourtPhoto, uploadClubPaymentProof } from '../../middlewares/upload.middleware';
import { clubController } from './club.controller';

/**
 * Público (sin auth): la página del jugador, resuelta por el slug del club.
 * Nunca recibe un restaurantId del cliente — igual que el menú público.
 */
export const publicClubRoutes = Router();
publicClubRoutes.get('/:slug', clubController.publicClub);
publicClubRoutes.get('/:slug/live', clubController.publicLive);
publicClubRoutes.get('/:slug/availability', clubController.publicAvailability);
publicClubRoutes.get('/:slug/products', clubController.publicProducts);
publicClubRoutes.post('/:slug/bookings', publicBookingRateLimit, clubController.publicCreateBooking);
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

// La tablet de la cancha también necesita la lista para armar un torneo (elegir
// en qué canchas se juega). Son solo nombres, sin nada sensible.
router.get('/courts', requireRole('OWNER', 'ADMIN', 'CASHIER', 'WAITER', 'CANCHA'), clubController.listCourts);
router.post('/courts', admin, clubController.createCourt);
router.patch('/courts/:id', admin, clubController.updateCourt);
router.delete('/courts/:id', admin, clubController.deleteCourt);
router.post('/courts/upload-photo', admin, uploadClubCourtPhoto, optimizeImage(900, 900), clubController.uploadCourtPhoto);

router.get('/schedules', staff, clubController.listSchedules);
router.post('/schedules', admin, clubController.createSchedule);
router.patch('/schedules/:id', admin, clubController.updateSchedule);
router.delete('/schedules/:id', admin, clubController.deleteSchedule);

// Ocupación: es información de gestión, no de operación diaria.
router.get('/stats/occupancy', admin, clubController.occupancy);
router.get('/stats/customers', admin, clubController.frequentCustomers);
router.get('/stats/consumption', admin, clubController.consumption);
// Ingresos por método de pago y por origen (cancha/tienda/academia), y quién debe.
router.get('/stats/finance', admin, clubController.finance);
router.get('/stats/debts', admin, clubController.debts);
router.get('/stats/breakeven', admin, clubController.breakEven);

router.get('/panel-courts', staff, clubController.panelCourts);
router.get('/calendar', staff, clubController.calendar);
router.get('/availability', staff, clubController.availability);

router.get('/bookings', staff, clubController.listBookings);
router.post('/bookings', reception, clubController.createBooking);
router.patch('/bookings/:id/cancel', reception, clubController.cancelBooking);
router.post('/bookings/check-in/:accessToken', reception, clubController.checkIn);

// Caja: Pagar / Pago fraccionado / Deuda.
router.post('/bookings/:id/payments', reception, clubController.addBookingPayment);
router.patch('/bookings/:id/awaiting-payment', reception, clubController.setBookingAwaitingPayment);

// Pagos que los jugadores reportan desde la tablet: recepción los verifica desde
// el aviso de la pantalla Canchas y, al aprobar, se cobra de verdad.
router.get('/reported-payments', staff, clubController.listReportedPayments);
router.patch('/reported-payments/:id', reception, clubController.reviewReportedPayment);
router.post(
  '/upload-payment-proof',
  reception,
  uploadClubPaymentProof,
  optimizeImage(1200, 1200),
  clubController.uploadPaymentProof,
);

router.post('/maintenance', reception, clubController.createMaintenance);
router.delete('/blocks/:id', reception, clubController.removeBlock);

export default router;
