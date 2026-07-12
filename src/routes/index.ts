import { Router } from 'express';
import productRoutes from '../modules/products/product.routes';
import menuRoutes from '../modules/menu/menu.routes';
import orderRoutes from '../modules/orders/order.routes';
import { orderController } from '../modules/orders/order.controller';

/**
 * Enrutador raíz de la API v1.
 *
 *   /api/v1/products              -> protegido (panel)
 *   /api/v1/orders                -> protegido (panel/cocina)
 *   /api/v1/public/menu/:slug     -> público (QR)
 *   /api/v1/public/checkout/*     -> público (comensal / cliente)
 */
const router = Router();

// --- Panel del restaurante (requieren JWT) ---
router.use('/products', productRoutes);
router.use('/orders', orderRoutes);

// --- Público ---
router.use('/public', menuRoutes);
router.post('/public/checkout/dine-in', orderController.checkoutDineIn);
router.post('/public/checkout/delivery/:slug', orderController.checkoutDelivery);

export default router;
