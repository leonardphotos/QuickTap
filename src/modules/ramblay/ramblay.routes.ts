import { Router } from 'express';
import { ramblayWebhookController } from './ramblay.webhook.controller';

/**
 * Base: /api/v1/public/ramblay — sin auth de sesión (Ramblay no tiene un
 * token nuestro), la seguridad la da la firma verificada en el controller.
 */
export const publicRamblayRoutes = Router();
publicRamblayRoutes.post('/webhook', ramblayWebhookController.handle);
