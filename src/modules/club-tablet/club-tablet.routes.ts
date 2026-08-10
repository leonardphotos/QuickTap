import { Router } from 'express';
import { requireBusinessType, requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { clubTabletController } from './club-tablet.controller';

/**
 * Base: /api/v1/club-tablet — la tablet fija de la cancha (rol CANCHA).
 *
 * La tablet inicia sesión una sola vez con su propio usuario y se queda
 * abierta; lo que identifica al jugador en cada uso es el QR de su reserva, no
 * la sesión. Por eso todas las rutas reciben el accessToken y ninguna confía en
 * él para resolver el tenant: el club sale del JWT, como siempre.
 *
 * Dueño/Admin/Cajero también entran para poder probar la pantalla sin montar la
 * tablet.
 */
const router = Router();
router.use(tenantGuard);
router.use(requireBusinessType('SPORTS_CLUB'));

const tablet = requireRole('OWNER', 'ADMIN', 'CASHIER', 'CANCHA');

router.get('/court', tablet, clubTabletController.court);
router.get('/session/:accessToken', tablet, clubTabletController.session);
router.get('/catalog', tablet, clubTabletController.catalog);
router.post('/orders', tablet, clubTabletController.createOrder);

export default router;
