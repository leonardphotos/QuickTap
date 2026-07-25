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
import masterServerStatusRoutes from '../modules/master/master-server-status.routes';
import platformAuthRoutes from '../modules/platform-auth/platform-auth.routes';
import { publicPromoCodeRoutes, masterPromoCodeRoutes } from '../modules/promo-codes/promo-code.routes';
import {
  publicPlatformSettingsRoutes,
  masterPlatformSettingsRoutes,
  publicPlanContentRoutes,
  masterPlanContentRoutes,
} from '../modules/platform-settings/platform-settings.routes';
import masterRestaurantsRoutes from '../modules/master/master-restaurants.routes';
import masterAdminsRoutes from '../modules/master/master-admins.routes';
import masterOlaclickImportRoutes from '../modules/master/master-olaclick-import.routes';
import inventoryRoutes from '../modules/inventory/inventory.routes';
import movementRoutes from '../modules/movements/movement.routes';
import cashSessionRoutes from '../modules/cash-sessions/cash-session.routes';
import deliveryCourierRoutes from '../modules/delivery-couriers/delivery-courier.routes';
import deliveryZoneRoutes from '../modules/delivery-zones/delivery-zone.routes';
import kitchenRoutes from '../modules/kitchens/kitchen.routes';
import customerRoutes from '../modules/customers/customer.routes';
import supplierRoutes from '../modules/suppliers/supplier.routes';
import modifierCategoryRoutes from '../modules/modifier-categories/modifier-category.routes';
import { publicReservationRoutes, tenantReservationRoutes } from '../modules/reservations/reservation.routes';
import { publicRamblayRoutes } from '../modules/ramblay/ramblay.routes';
import branchRoutes from '../modules/branches/branch.routes';

/**
 * Enrutador raíz de la API v1.
 *
 *   /api/v1/products              -> protegido (panel)
 *   /api/v1/orders                -> protegido (panel/cocina)
 *   /api/v1/public/menu/:slug     -> público (QR)
 *   /api/v1/public/checkout/*     -> público (comensal / cliente)
 */
const router = Router();

// Ping de latencia (Dashboard maestro → gauge de velocidad): sin DB, sin
// auth, la respuesta más liviana posible para medir solo el round-trip de
// red + Node. Vive bajo /api/v1 (a diferencia de /health en app.ts) porque
// Nginx en producción solo proxea /api/, /uploads/ y /socket.io/ al backend
// — /health quedaría atrapado por el catch-all del SPA.
router.get('/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// --- Auth ---
router.use('/auth', authRoutes);
router.use('/master-auth', platformAuthRoutes);

// --- Panel del restaurante (requieren JWT) ---
router.use('/products', productRoutes);
router.use('/orders', orderRoutes);
router.use('/categories', categoryRoutes);
router.use('/kitchens', kitchenRoutes);
router.use('/customers', customerRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/modifier-categories', modifierCategoryRoutes);
router.use('/tables', tableRoutes);
router.use('/zones', zoneRoutes);
router.use('/team', teamRoutes);
router.use('/table-sessions', tableSessionRoutes);
router.use('/exchange-rates', exchangeRateRoutes);
router.use('/restaurant', restaurantRoutes);
router.use('/plan-requests', tenantPlanRequestRoutes);
router.use('/qr-nfc-requests', tenantQrNfcRequestRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/movements', movementRoutes);
router.use('/cash-sessions', cashSessionRoutes);
router.use('/delivery-couriers', deliveryCourierRoutes);
router.use('/delivery-zones', deliveryZoneRoutes);
router.use('/reservations', tenantReservationRoutes);
router.use('/branches', branchRoutes);

// --- Público ---
router.use('/public', menuRoutes);
router.post('/public/checkout/dine-in', orderController.checkoutDineIn);
router.post('/public/checkout/delivery/:slug', orderController.checkoutDelivery);
router.get('/public/checkout/delivery/:slug/quote', orderController.deliveryQuote);
// Tasa BCV para la landing (precios de planes en $ y Bs): es un dato global, no de un restaurante.
router.get('/public/exchange-rate', exchangeRateController.summary);
router.use('/public/plan-requests', publicPlanRequestRoutes);
router.use('/public/promo-codes', publicPromoCodeRoutes);
router.use('/public/payment-methods', publicPlatformSettingsRoutes);
router.use('/public/plans', publicPlanContentRoutes);
router.use('/public/reservations', publicReservationRoutes);
router.use('/public/ramblay', publicRamblayRoutes);

// --- Dashboard maestro (equipo de QuickTap, ve todos los restaurantes) ---
router.use('/master/promo-codes', masterPromoCodeRoutes);
router.use('/master/payment-methods', masterPlatformSettingsRoutes);
router.use('/master/plans', masterPlanContentRoutes);
router.use('/master/plan-requests', masterPlanRequestRoutes);
router.use('/master/qr-nfc-requests', masterQrNfcRequestRoutes);
router.use('/master/summary', masterSummaryRoutes);
router.use('/master/server-status', masterServerStatusRoutes);
router.use('/master/restaurants', masterRestaurantsRoutes);
router.use('/master/admins', masterAdminsRoutes);
// Migración interna OlaClick → QuickTap (ver src/modules/master/master-olaclick-import.*).
router.use('/master/olaclick-import', masterOlaclickImportRoutes);

export default router;
