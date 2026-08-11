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

/** Base: /api/v1/public/plans — precios/descripción de los 3 planes (landing + billing). */
export const publicPlanContentRoutes = Router();
publicPlanContentRoutes.get('/', platformSettingsController.getPlanContent);
// Antes de mandarla a getPlanContent como si fuera un plan: moneda en la que se cobra la
// mensualidad — la necesita tanto la landing como el billing autenticado del restaurante.
publicPlanContentRoutes.get('/currency', platformSettingsController.getSubscriptionCurrency);

/** Base: /api/v1/master/plans — editor de precios/descripción del Dashboard maestro. */
export const masterPlanContentRoutes = Router();
masterPlanContentRoutes.use(platformAuthGuard);
masterPlanContentRoutes.get('/', platformSettingsController.getPlanContent);
masterPlanContentRoutes.patch('/', platformSettingsController.updatePlanContent);
masterPlanContentRoutes.get('/currency', platformSettingsController.getSubscriptionCurrency);
masterPlanContentRoutes.patch('/currency', platformSettingsController.updateSubscriptionCurrency);

/** Base: /api/v1/master/message-templates — editor de mensajes del chatbot del master. */
export const masterMessageTemplatesRoutes = Router();
masterMessageTemplatesRoutes.use(platformAuthGuard);
masterMessageTemplatesRoutes.get('/', platformSettingsController.getMessageTemplates);
masterMessageTemplatesRoutes.patch('/', platformSettingsController.updateMessageTemplates);
