import { Router } from 'express';
import { requireBusinessType, requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { TEAM_MANAGER_ROLES } from '../../utils/roles';
import { clubLinkController } from './club-link.controller';

/**
 * Base: /api/v1/club-link — el puente entre un club deportivo y el restaurante
 * que le prepara los pedidos de las canchas.
 *
 * Conviven acá los dos lados del vínculo porque son la misma conversación:
 * el restaurante genera el código (`/code`), el club lo canjea (`/redeem`).
 * Cada ruta declara de qué lado está: las del club exigen SPORTS_CLUB, las del
 * restaurante no (y `createCode` rechaza explícitamente a un club).
 */
const router = Router();
router.use(tenantGuard);

const manager = requireRole(...TEAM_MANAGER_ROLES);
const clubOnly = requireBusinessType('SPORTS_CLUB');

// --- Lado restaurante ---
// Vincular/desvincular es de dueño/admin; ver la cola de comandas, de cualquiera
// del equipo que esté en cocina (mismo criterio que GET /orders/delivery).
router.post('/code', manager, clubLinkController.createCode);
router.get('/state', manager, clubLinkController.restaurantState);
router.delete('/clubs/:clubId', manager, clubLinkController.unlinkClub);
router.get('/orders', clubLinkController.kitchenOrders);
router.patch('/orders/:id/status', clubLinkController.setOrderStatus);
// Cuentas de las canchas: los pagos que los jugadores reportan desde la tablet.
// Aprobar plata es de dueño/admin, no de quien despacha la cola de comandas.
router.get('/court-payments', clubLinkController.courtPayments);
router.patch('/court-payments/:id', manager, clubLinkController.reviewCourtPayment);

// --- Lado club ---
router.post('/redeem', clubOnly, manager, clubLinkController.redeem);
router.get('/club', clubOnly, clubLinkController.clubState);
// Lleva el id de la tienda: un club puede tener varias vinculadas.
router.delete('/club/:restaurantId', clubOnly, manager, clubLinkController.unlinkFromClub);

export default router;
