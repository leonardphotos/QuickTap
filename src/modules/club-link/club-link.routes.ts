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

// --- Lado club ---
router.post('/redeem', clubOnly, manager, clubLinkController.redeem);
router.get('/club', clubOnly, clubLinkController.clubState);
router.delete('/club', clubOnly, manager, clubLinkController.unlinkFromClub);

export default router;
