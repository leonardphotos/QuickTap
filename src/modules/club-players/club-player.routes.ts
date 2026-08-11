import { Router } from 'express';
import { requireBusinessType, requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { playerAuthGuard } from '../../middlewares/player-auth.middleware';
import { publicBookingRateLimit } from '../../middlewares/rate-limit.middleware';
import { clubPlayerController } from './club-player.controller';

/**
 * Público del jugador. Todo va limitado por rate limit: estos endpoints mandan
 * WhatsApps y verifican claves, así que sin límite serían un grifo abierto.
 */
export const publicPlayerRoutes = Router();
publicPlayerRoutes.post('/:slug/verify/send', publicBookingRateLimit, clubPlayerController.sendCode);
publicPlayerRoutes.post('/:slug/verify/check', publicBookingRateLimit, clubPlayerController.verifyCode);
publicPlayerRoutes.get('/:slug/account/username-available', clubPlayerController.checkUsername);
publicPlayerRoutes.post('/:slug/account/register', publicBookingRateLimit, clubPlayerController.register);
publicPlayerRoutes.post('/:slug/account/login', publicBookingRateLimit, clubPlayerController.login);

/** Panel del jugador (JWT con scope 'player'). */
export const playerRoutes = Router();
playerRoutes.use(playerAuthGuard);
playerRoutes.get('/me', clubPlayerController.me);
playerRoutes.get('/me/points', clubPlayerController.myPoints);
playerRoutes.get('/leaderboard', clubPlayerController.leaderboard);
playerRoutes.get('/players', clubPlayerController.searchPlayers);
playerRoutes.get('/invites', clubPlayerController.myInvites);
playerRoutes.post('/invites', clubPlayerController.invite);
playerRoutes.post('/invites/:id/respond', clubPlayerController.respondInvite);

/** Panel del club. */
const router = Router();
router.use(tenantGuard);
router.use(requireBusinessType('SPORTS_CLUB'));

const admin = requireRole('OWNER', 'ADMIN');
const reception = requireRole('OWNER', 'ADMIN', 'CASHIER');

router.get('/settings', admin, clubPlayerController.getSettings);
router.put('/settings', admin, clubPlayerController.updateSettings);

router.get('/blacklist', reception, clubPlayerController.listBlacklist);
router.post('/blacklist', reception, clubPlayerController.addBlacklist);
router.post('/blacklist/:id/lift', admin, clubPlayerController.liftBlacklist);

router.get('/customers', reception, clubPlayerController.listCustomers);
router.post('/customers', reception, clubPlayerController.createCustomer);
router.get('/customers/:id/points', reception, clubPlayerController.customerPoints);
router.post('/customers/:id/points', admin, clubPlayerController.adjustPoints);
router.post('/customers/:id/redeem', reception, clubPlayerController.redeemPoints);

export default router;
