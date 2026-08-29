import { Router } from 'express';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { registrationFunnelController } from './registration-funnel.controller';

/**
 * Base: /api/v1/public/registration-funnel — SIN autenticación a propósito: lo llama el
 * navegador de alguien que todavía no tiene cuenta (ver RegisterPage.tsx). No lee ni escribe
 * nada de ningún tenant, solo su propio intento de registro.
 */
export const publicRegistrationFunnelRoutes = Router();
publicRegistrationFunnelRoutes.post('/', registrationFunnelController.track);

/** Base: /api/v1/master/registration-funnel — solo el equipo QuickTap. */
export const masterRegistrationFunnelRoutes = Router();
masterRegistrationFunnelRoutes.use(platformAuthGuard);
masterRegistrationFunnelRoutes.get('/', registrationFunnelController.overview);
masterRegistrationFunnelRoutes.patch('/:id/contacted', registrationFunnelController.setContacted);
