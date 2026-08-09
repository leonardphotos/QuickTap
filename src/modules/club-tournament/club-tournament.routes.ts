import { Router } from 'express';
import { requireBusinessType, requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { clubTournamentController } from './club-tournament.controller';

/**
 * Base: /api/v1/club-tournament — torneos sociales (Americano / Mexicano).
 *
 * Se corre desde la tablet de la cancha, que es donde están los jugadores
 * cargando resultados; recepción y administración también entran para armarlo
 * o corregir un marcador desde el panel.
 */
const router = Router();
router.use(tenantGuard);
router.use(requireBusinessType('SPORTS_CLUB'));

const organizer = requireRole('OWNER', 'ADMIN', 'CASHIER', 'CANCHA');
// Borrar un torneo entero (con su historial) es de administración.
const admin = requireRole('OWNER', 'ADMIN');

router.get('/active', organizer, clubTournamentController.active);
router.get('/finished', organizer, clubTournamentController.finished);
router.post('/', organizer, clubTournamentController.create);
router.post('/:id/next-round', organizer, clubTournamentController.nextRound);
router.patch('/matches/:matchId', organizer, clubTournamentController.recordScore);
router.post('/:id/finish', organizer, clubTournamentController.finish);
router.delete('/:id', admin, clubTournamentController.remove);

export default router;
