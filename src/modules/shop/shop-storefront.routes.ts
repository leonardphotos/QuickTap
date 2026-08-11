import { Router } from 'express';
import { publicBookingRateLimit } from '../../middlewares/rate-limit.middleware';
import { shopStorefrontController } from './shop-storefront.controller';

/**
 * Base: /api/v1/public/shop — catálogo público de la tienda virtual de un Local Comercial.
 * Sin auth: el inquilino se resuelve por `slug`, nunca por un id que mande el cliente.
 */
const router = Router();

router.get('/:slug', shopStorefrontController.getStorefront);
// Mismo límite que las reservas y el checkout del menú: evita que alguien inunde de pedidos
// falsos la pantalla del local desde un solo equipo.
router.post('/:slug/checkout', publicBookingRateLimit, shopStorefrontController.checkout);

export default router;
