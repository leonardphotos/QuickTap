import { Router } from 'express';
import { tenantGuard } from '../../middlewares/auth.middleware';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { qrNfcRequestController } from './qr-nfc-request.controller';

/** Base: /api/v1/qr-nfc-requests — cotización, ya autenticado como restaurante. */
export const tenantQrNfcRequestRoutes = Router();
tenantQrNfcRequestRoutes.use(tenantGuard);
tenantQrNfcRequestRoutes.post('/', qrNfcRequestController.create);

/** Base: /api/v1/master/qr-nfc-requests — revisión desde el Dashboard maestro. */
export const masterQrNfcRequestRoutes = Router();
masterQrNfcRequestRoutes.use(platformAuthGuard);
masterQrNfcRequestRoutes.get('/', qrNfcRequestController.list);
masterQrNfcRequestRoutes.post('/:id/approve', qrNfcRequestController.approve);
