import { Router } from 'express';
import { tenantGuard } from '../../middlewares/auth.middleware';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { planRequestController } from './plan-request.controller';

/**
 * Rutas públicas (sin auth): el prospecto todavía no tiene cuenta en este
 * punto del embudo. Base: /api/v1/public/plan-requests
 */
export const publicPlanRequestRoutes = Router();
publicPlanRequestRoutes.post('/', planRequestController.create);

/** Base: /api/v1/plan-requests — pago de mensualidad, ya autenticado como restaurante. */
export const tenantPlanRequestRoutes = Router();
tenantPlanRequestRoutes.use(tenantGuard);
tenantPlanRequestRoutes.post('/', planRequestController.createRenewal);

/** Base: /api/v1/master/plan-requests — revisión de comprobantes del Dashboard maestro. */
export const masterPlanRequestRoutes = Router();
masterPlanRequestRoutes.use(platformAuthGuard);
masterPlanRequestRoutes.get('/', planRequestController.listByKind);
masterPlanRequestRoutes.post('/:id/approve', planRequestController.approve);
masterPlanRequestRoutes.post('/:id/reject', planRequestController.reject);
masterPlanRequestRoutes.post('/:id/whatsapp-link', planRequestController.whatsappLink);
masterPlanRequestRoutes.patch('/:id', planRequestController.update);
masterPlanRequestRoutes.delete('/:id', planRequestController.remove);
