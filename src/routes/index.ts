import { Router } from 'express';
import productRoutes from '../modules/products/product.routes';
import menuRoutes from '../modules/menu/menu.routes';
import orderRoutes from '../modules/orders/order.routes';
import { orderController } from '../modules/orders/order.controller';
import authRoutes from '../modules/auth/auth.routes';
import categoryRoutes from '../modules/categories/category.routes';
import tableRoutes from '../modules/tables/table.routes';
import zoneRoutes from '../modules/zones/zone.routes';
import teamRoutes from '../modules/team/team.routes';
import tableSessionRoutes from '../modules/table-sessions/table-session.routes';
import exchangeRateRoutes from '../modules/exchange-rate/exchange-rate.routes';
import { exchangeRateController } from '../modules/exchange-rate/exchange-rate.controller';
import restaurantRoutes from '../modules/restaurant/restaurant.routes';
import {
  publicPlanRequestRoutes,
  tenantPlanRequestRoutes,
  masterPlanRequestRoutes,
} from '../modules/plan-requests/plan-request.routes';
import { tenantQrNfcRequestRoutes, masterQrNfcRequestRoutes } from '../modules/qr-nfc-requests/qr-nfc-request.routes';
import masterSummaryRoutes from '../modules/master/master-summary.routes';
import platformAuthRoutes from '../modules/platform-auth/platform-auth.routes';
import { publicPromoCodeRoutes, masterPromoCodeRoutes } from '../modules/promo-codes/promo-code.routes';
import {
  publicPlatformSettingsRoutes,
  masterPlatformSettingsRoutes,
} from '../modules/platform-settings/platform-settings.routes';
import masterRestaurantsRoutes from '../modules/master/master-restaurants.routes';
import masterAdminsRoutes from '../modules/master/master-admins.routes';
import inventoryRoutes from '../modules/inventory/inventory.routes';

/**
 * Enrutador raíz de la API v1.
 *
 *   /api/v1/products              -> protegido (panel)
 *   /api/v1/orders                -> protegido (panel/cocina)
 *   /api/v1/public/menu/:slug     -> público (QR)
 *   /api/v1/public/checkout/*     -> público (comensal / cliente)
 */
const router = Router();

// --- Auth ---
router.use('/auth', authRoutes);
router.use('/master-auth', platformAuthRoutes);

// --- Panel del restaurante (requieren JWT) ---
router.use('/products', productRoutes);
router.use('/orders', orderRoutes);
router.use('/categories', categoryRoutes);
router.use('/tables', tableRoutes);
router.use('/zones', zoneRoutes);
router.use('/team', teamRoutes);
router.use('/table-sessions', tableSessionRoutes);
router.use('/exchange-rates', exchangeRateRoutes);
router.use('/restaurant', restaurantRoutes);
router.use('/plan-requests', tenantPlanRequestRoutes);
router.use('/qr-nfc-requests', tenantQrNfcRequestRoutes);
router.use('/inventory', inventoryRoutes);

// --- Público ---
router.use('/public', menuRoutes);
router.post('/public/checkout/dine-in', orderController.checkoutDineIn);
router.post('/public/checkout/delivery/:slug', orderController.checkoutDelivery);
// Tasa BCV para la landing (precios de planes en $ y Bs): es un dato global, no de un restaurante.
router.get('/public/exchange-rate', exchangeRateController.summary);
router.use('/public/plan-requests', publicPlanRequestRoutes);
router.use('/public/promo-codes', publicPromoCodeRoutes);
router.use('/public/payment-methods', publicPlatformSettingsRoutes);

// --- Dashboard maestro (equipo de QuickTap, ve todos los restaurantes) ---
router.use('/master/promo-codes', masterPromoCodeRoutes);
router.use('/master/payment-methods', masterPlatformSettingsRoutes);
router.use('/master/plan-requests', masterPlanRequestRoutes);
router.use('/master/qr-nfc-requests', masterQrNfcRequestRoutes);
router.use('/master/summary', masterSummaryRoutes);
router.use('/master/restaurants', masterRestaurantsRoutes);
router.use('/master/admins', masterAdminsRoutes);

export default router;
