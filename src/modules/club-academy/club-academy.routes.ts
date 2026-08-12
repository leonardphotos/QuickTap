import { Router } from 'express';
import { requireBusinessType, requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { publicBookingRateLimit } from '../../middlewares/rate-limit.middleware';
import { clubAcademyController } from './club-academy.controller';

/** Público (sin auth): catálogo de grupos y la ficha del alumno por token opaco. */
export const publicAcademyRoutes = Router();
publicAcademyRoutes.get('/:slug/academy', clubAcademyController.publicAcademy);
// Autoservicio: el alumno se inscribe solo. Protegido por el mismo código de
// WhatsApp que las reservas (lo valida el servicio) y por rate limit.
publicAcademyRoutes.post('/:slug/academy/enroll', publicBookingRateLimit, clubAcademyController.publicEnroll);
publicAcademyRoutes.get('/academy/student/:token', clubAcademyController.publicStudent);
publicAcademyRoutes.post('/academy/student/:token/cancel/:sessionId', clubAcademyController.publicCancel);
publicAcademyRoutes.post('/academy/student/:token/makeup/:sessionId', clubAcademyController.publicMakeup);
// Particular agendada por el propio alumno: bloquea cancha con un hold que vence
// si el club no verifica el pago (ver createPrivateRequest).
publicAcademyRoutes.post('/academy/student/:token/private', publicBookingRateLimit, clubAcademyController.publicPrivateRequest);

const router = Router();
router.use(tenantGuard);
router.use(requireBusinessType('SPORTS_CLUB'));

// Configurar la academia (profesores, grupos, precios, ajustes) es de administración.
const admin = requireRole('OWNER', 'ADMIN');
// Operación diaria: recepción agenda, inscribe y cobra.
const reception = requireRole('OWNER', 'ADMIN', 'CASHIER');
// Consultar agenda y listas: también el profesor.
const staff = requireRole('OWNER', 'ADMIN', 'CASHIER', 'COACH');

// --------------------------------------------------- Portal del entrenador
// Va ANTES de las rutas con :id para que "/me/..." no lo capture ninguna de
// ellas, y siempre resuelve el coachId desde el token — nunca de un parámetro.
router.get('/me/sessions', requireRole('COACH', 'OWNER', 'ADMIN'), clubAcademyController.mySessions);
router.get('/me/sessions/:id/roster', requireRole('COACH', 'OWNER', 'ADMIN'), clubAcademyController.myRoster);
router.post('/me/sessions/:id/attendance', requireRole('COACH', 'OWNER', 'ADMIN'), clubAcademyController.myAttendance);
router.get('/me/availability', requireRole('COACH', 'OWNER', 'ADMIN'), clubAcademyController.myAvailability);
router.put('/me/availability', requireRole('COACH', 'OWNER', 'ADMIN'), clubAcademyController.setMyAvailability);
router.get('/me/earnings', requireRole('COACH', 'OWNER', 'ADMIN'), clubAcademyController.myEarnings);

// ------------------------------------------------------------------ Panel
router.get('/dashboard', staff, clubAcademyController.dashboard);

router.get('/settings', admin, clubAcademyController.getSettings);
router.put('/settings', admin, clubAcademyController.updateSettings);

router.get('/coaches', staff, clubAcademyController.listCoaches);
router.post('/coaches', admin, clubAcademyController.createCoach);
router.get('/coaches/:id', staff, clubAcademyController.getCoachDetail);
router.patch('/coaches/:id', admin, clubAcademyController.updateCoach);
router.delete('/coaches/:id', admin, clubAcademyController.deleteCoach);
router.put('/coaches/:id/availability', admin, clubAcademyController.setAvailability);
router.post('/coaches/:id/time-off', admin, clubAcademyController.addTimeOff);
router.delete('/coaches/:id/time-off/:timeOffId', admin, clubAcademyController.removeTimeOff);
router.get('/coaches/:id/earnings', admin, clubAcademyController.coachEarnings);
router.post('/coaches/:id/payouts', admin, clubAcademyController.payCoach);

router.get('/programs', staff, clubAcademyController.listPrograms);
router.post('/programs', admin, clubAcademyController.createProgram);
router.get('/programs/:id', staff, clubAcademyController.getProgramDetail);
router.patch('/programs/:id', admin, clubAcademyController.updateProgram);
router.delete('/programs/:id', admin, clubAcademyController.deleteProgram);

router.get('/waitlist', staff, clubAcademyController.listWaitlist);
router.post('/waitlist', reception, clubAcademyController.joinWaitlist);
router.delete('/waitlist/:id', reception, clubAcademyController.leaveWaitlist);

router.get('/groups', staff, clubAcademyController.listGroups);
router.post('/groups', admin, clubAcademyController.createGroup);
router.get('/groups/:id', staff, clubAcademyController.getGroupDetail);
router.patch('/groups/:id', admin, clubAcademyController.updateGroup);
router.post('/groups/:id/generate', admin, clubAcademyController.generateSessions);
router.delete('/groups/:id', admin, clubAcademyController.endGroup);
router.get('/conflicts', staff, clubAcademyController.listConflicts);

router.get('/sessions', staff, clubAcademyController.listSessions);
router.post('/sessions', reception, clubAcademyController.createSession);
router.post('/sessions/:id/reassign', reception, clubAcademyController.reassignSession);
router.post('/sessions/:id/cancel', reception, clubAcademyController.cancelSession);
router.get('/sessions/:id/attendance', staff, clubAcademyController.getRoster);
router.post('/sessions/:id/attendance', staff, clubAcademyController.markAttendance);

router.get('/students', staff, clubAcademyController.listStudents);
router.post('/students', reception, clubAcademyController.createStudent);
router.get('/students/:id', staff, clubAcademyController.getStudent);
router.patch('/students/:id', reception, clubAcademyController.updateStudent);
router.get('/students/:id/credits', staff, clubAcademyController.creditLedger);
router.post('/students/:id/credits', admin, clubAcademyController.adjustCredits);

router.post('/enrollments', reception, clubAcademyController.createEnrollment);
router.patch('/enrollments/:id', reception, clubAcademyController.updateEnrollment);

router.post('/packages', reception, clubAcademyController.sellPackage);
router.patch('/packages/:id', admin, clubAcademyController.updatePackage);

router.get('/charges', reception, clubAcademyController.listCharges);
router.post('/charges/generate', admin, clubAcademyController.generateCharges);
router.post('/charges/notify', admin, clubAcademyController.notifyCharges);
router.post('/charges/:id/waive', admin, clubAcademyController.waiveCharge);
router.post('/payments', reception, clubAcademyController.recordPayment);

router.post('/sessions/:id/makeup', reception, clubAcademyController.scheduleMakeup);

router.get('/reports/revenue', admin, clubAcademyController.revenueReport);
router.get('/reports/attendance', admin, clubAcademyController.attendanceReport);
router.get('/reports/retention', admin, clubAcademyController.retentionReport);
router.get('/reports/by-coach', admin, clubAcademyController.revenueByCoachReport);

export default router;
