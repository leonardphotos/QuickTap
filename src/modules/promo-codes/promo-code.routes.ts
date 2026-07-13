import { Router } from 'express';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { promoCodeController } from './promo-code.controller';

/** Base: /api/v1/public/promo-codes — validar un código antes de pagar (sin auth). */
export const publicPromoCodeRoutes = Router();
publicPromoCodeRoutes.get('/:code', promoCodeController.validate);

/** Base: /api/v1/master/promo-codes — CRUD del Dashboard maestro. */
export const masterPromoCodeRoutes = Router();
masterPromoCodeRoutes.use(platformAuthGuard);
masterPromoCodeRoutes.get('/', promoCodeController.list);
masterPromoCodeRoutes.post('/', promoCodeController.create);
masterPromoCodeRoutes.patch('/:id', promoCodeController.update);
masterPromoCodeRoutes.delete('/:id', promoCodeController.remove);
