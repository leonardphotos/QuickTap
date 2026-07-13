import { Router } from 'express';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { platformSettingsController } from './platform-settings.controller';

/** Base: /api/v1/public/payment-methods — datos de pago para la pasarela (landing + billing autenticado). */
export const publicPlatformSettingsRoutes = Router();
publicPlatformSettingsRoutes.get('/', platformSettingsController.getPaymentMethods);

/** Base: /api/v1/master/payment-methods — editor del Dashboard maestro. */
export const masterPlatformSettingsRoutes = Router();
masterPlatformSettingsRoutes.use(platformAuthGuard);
masterPlatformSettingsRoutes.get('/', platformSettingsController.getPaymentMethods);
masterPlatformSettingsRoutes.patch('/', platformSettingsController.updatePaymentMethods);
