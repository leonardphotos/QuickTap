import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { TEAM_MANAGER_ROLES } from '../../utils/roles';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { optimizeImage, uploadPlanPaymentProof } from '../../middlewares/upload.middleware';
import { planRequestController } from './plan-request.controller';

/**
 * Rutas públicas (sin auth): el prospecto todavía no tiene cuenta en este
 * punto del embudo. Base: /api/v1/public/plan-requests
 */
export const publicPlanRequestRoutes = Router();
// El comprobante es opcional (multer no exige el campo "photo"): si el prospecto lo adjunta,
// se reenvía al número verificador por WhatsApp (ver planRequestController#create).
publicPlanRequestRoutes.post('/', uploadPlanPaymentProof, optimizeImage(1200, 1200), planRequestController.create);
publicPlanRequestRoutes.post('/ramblay-checkout', planRequestController.createRamblayCheckout);

/** Base: /api/v1/plan-requests — pago de mensualidad, ya autenticado como restaurante. */
export const tenantPlanRequestRoutes = Router();
tenantPlanRequestRoutes.use(tenantGuard);
// Subir, bajar o pagar el plan es del dueño/administrador. Antes bastaba con tener sesión del
// local: un mesero o una pantalla podían dejar programada una BAJA de plan para la renovación.
const soloDuenio = requireRole(...TEAM_MANAGER_ROLES);
tenantPlanRequestRoutes.get('/quote', planRequestController.getQuote);
tenantPlanRequestRoutes.get('/my-plan', planRequestController.myPlan);
tenantPlanRequestRoutes.post('/upgrade', soloDuenio, uploadPlanPaymentProof, optimizeImage(1200, 1200), planRequestController.createUpgrade);
tenantPlanRequestRoutes.post('/downgrade', soloDuenio, planRequestController.scheduleDowngrade);
tenantPlanRequestRoutes.delete('/downgrade', soloDuenio, planRequestController.cancelDowngrade);
tenantPlanRequestRoutes.get('/installment/pending', planRequestController.getPendingInstallment);
tenantPlanRequestRoutes.post('/installment', soloDuenio, planRequestController.createInstallment);
tenantPlanRequestRoutes.post('/', soloDuenio, uploadPlanPaymentProof, optimizeImage(1200, 1200), planRequestController.createRenewal);
tenantPlanRequestRoutes.post('/ramblay-checkout', soloDuenio, planRequestController.createRenewalRamblayCheckout);
// "Pago fraccionado": un abono con su comprobante por cada llamada, hasta cubrir priceUsd.
tenantPlanRequestRoutes.post(
  '/:id/payments',
  soloDuenio,
  uploadPlanPaymentProof,
  optimizeImage(1200, 1200),
  planRequestController.addPayment,
);

/** Base: /api/v1/master/plan-requests — revisión de comprobantes del Dashboard maestro. */
export const masterPlanRequestRoutes = Router();
masterPlanRequestRoutes.use(platformAuthGuard);
masterPlanRequestRoutes.get('/', planRequestController.listByKind);
masterPlanRequestRoutes.post('/:id/approve', planRequestController.approve);
masterPlanRequestRoutes.post('/:id/reject', planRequestController.reject);
masterPlanRequestRoutes.post('/:id/whatsapp-link', planRequestController.whatsappLink);
masterPlanRequestRoutes.patch('/:id', planRequestController.update);
masterPlanRequestRoutes.delete('/:id', planRequestController.remove);
