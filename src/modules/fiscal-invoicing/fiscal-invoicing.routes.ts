import { Router } from 'express';
import { tenantGuard, requireRole } from '../../middlewares/auth.middleware';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { fiscalInvoicingController } from './fiscal-invoicing.controller';

/** Base: /api/v1/fiscal-invoicing — panel del restaurante, solo lectura de su propio estado. */
export const tenantFiscalInvoicingRoutes = Router();
tenantFiscalInvoicingRoutes.use(tenantGuard);
tenantFiscalInvoicingRoutes.get('/status', requireRole('OWNER', 'ADMIN'), fiscalInvoicingController.status);
tenantFiscalInvoicingRoutes.get('/orders/:orderId', requireRole('OWNER', 'ADMIN', 'CASHIER'), fiscalInvoicingController.orderInvoice);

/** Base: /api/v1/master/restaurants — activación/config, solo el equipo QuickTap. */
export const masterFiscalInvoicingRoutes = Router();
masterFiscalInvoicingRoutes.use(platformAuthGuard);
masterFiscalInvoicingRoutes.patch('/:id/fiscal-invoicing', fiscalInvoicingController.enable);
