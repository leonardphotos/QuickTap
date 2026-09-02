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
import pushTokenRoutes from '../modules/push-tokens/push-token.routes';
import tableSessionRoutes from '../modules/table-sessions/table-session.routes';
import waitlistRoutes from '../modules/waitlist/waitlist.routes';
import offlineRoutes from '../modules/offline/offline.routes';
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
import masterLiveRoutes from '../modules/master/master-live.routes';
import { presenciaController } from '../modules/master/master-live.controller';
import masterQuotesRoutes from '../modules/master/master-quotes.routes';
import { masterAdvisorLeadRoutes, publicAdvisorLeadRoutes } from '../modules/advisor-leads/advisor-lead.routes';
import masterServerStatusRoutes from '../modules/master/master-server-status.routes';
import platformAuthRoutes from '../modules/platform-auth/platform-auth.routes';
import { publicPromoCodeRoutes, masterPromoCodeRoutes } from '../modules/promo-codes/promo-code.routes';
import {
  publicPlatformSettingsRoutes,
  masterPlatformSettingsRoutes,
  publicPlanContentRoutes,
  masterPlanContentRoutes,
  masterMessageTemplatesRoutes,
} from '../modules/platform-settings/platform-settings.routes';
import masterRestaurantsRoutes from '../modules/master/master-restaurants.routes';
import masterAdminsRoutes from '../modules/master/master-admins.routes';
import masterOlaclickImportRoutes from '../modules/master/master-olaclick-import.routes';
import masterCatalogAiRoutes from '../modules/master/master-catalog-ai.routes';
import masterWhatsappRoutes from '../modules/master-whatsapp/master-whatsapp.routes';
import whatsappLinkRoutes from '../modules/whatsapp-link/whatsapp-link.routes';
import { masterWhatsappLinkRouter, waWebhookRouter } from '../modules/whatsapp-link/whatsapp-link.master-routes';
import masterAnnouncementRoutes from '../modules/platform-announcements/platform-announcement.routes';
import {
  publicRegistrationFunnelRoutes,
  masterRegistrationFunnelRoutes,
} from '../modules/registration-funnel/registration-funnel.routes';
import inventoryRoutes from '../modules/inventory/inventory.routes';
import movementRoutes from '../modules/movements/movement.routes';
import paymentOrderRoutes from '../modules/payment-orders/payment-order.routes';
import bankAccountRoutes from '../modules/bank-accounts/bank-account.routes';
import payrollRoutes from '../modules/payroll/payroll.routes';
import cashSessionRoutes from '../modules/cash-sessions/cash-session.routes';
import kpiRoutes from '../modules/reports/kpi.routes';
import costStructureRoutes from '../modules/cost-structure/cost-structure.routes';
import accountingRoutes from '../modules/accounting/accounting.routes';
import wasteRoutes from '../modules/waste/waste.routes';
import deliveryCourierRoutes from '../modules/delivery-couriers/delivery-courier.routes';
import deliveryZoneRoutes from '../modules/delivery-zones/delivery-zone.routes';
import kitchenRoutes from '../modules/kitchens/kitchen.routes';
import whatsappBotRoutes from '../modules/whatsapp-bot/whatsapp-bot.routes';
import customerRoutes from '../modules/customers/customer.routes';
import promotionRoutes from '../modules/promotions/promotion.routes';
import supplierRoutes from '../modules/suppliers/supplier.routes';
import quoteRoutes from '../modules/quotes/quote.routes';
import modifierCategoryRoutes from '../modules/modifier-categories/modifier-category.routes';
import { publicReservationRoutes, tenantReservationRoutes } from '../modules/reservations/reservation.routes';
import walletRoutes from '../modules/wallet/wallet.routes';
import { publicRamblayRoutes } from '../modules/ramblay/ramblay.routes';
import branchRoutes from '../modules/branches/branch.routes';
import aiPhotoRoutes from '../modules/ai-photo/ai-photo.routes';
import shopRoutes from '../modules/shop/shop.routes';
import { approvalRoutes } from '../modules/approvals/approval.routes';
import { officeRoutes } from '../modules/accounting-office/accounting.routes';
import publicShopRoutes from '../modules/shop/shop-storefront.routes';
import { shopTicketsController } from '../modules/shop/shop-tickets.controller';
import clubRoutes, { publicClubRoutes } from '../modules/club/club.routes';
import clubAcademyRoutes, { publicAcademyRoutes } from '../modules/club-academy/club-academy.routes';
import clubLinkRoutes from '../modules/club-link/club-link.routes';
import clubPlayerRoutes, { playerRoutes, publicPlayerRoutes } from '../modules/club-players/club-player.routes';
import clubTabletRoutes from '../modules/club-tablet/club-tablet.routes';
import clubTournamentRoutes from '../modules/club-tournament/club-tournament.routes';
import { tenantFiscalInvoicingRoutes, masterFiscalInvoicingRoutes } from '../modules/fiscal-invoicing/fiscal-invoicing.routes';
import { publicBookingRateLimit } from '../middlewares/rate-limit.middleware';

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
router.use('/whatsapp-bot', whatsappBotRoutes);
router.use('/customers', customerRoutes);
// CRM: promociones personalizadas con código canjeable.
router.use('/promotions', promotionRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/modifier-categories', modifierCategoryRoutes);
router.use('/tables', tableRoutes);
router.use('/zones', zoneRoutes);
router.use('/team', teamRoutes);
router.use('/push-tokens', pushTokenRoutes);
router.use('/table-sessions', tableSessionRoutes);
router.use('/waitlist', waitlistRoutes);
router.use('/offline', offlineRoutes);
router.use('/exchange-rates', exchangeRateRoutes);
router.use('/restaurant', restaurantRoutes);
router.use('/plan-requests', tenantPlanRequestRoutes);
router.use('/qr-nfc-requests', tenantQrNfcRequestRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/movements', movementRoutes);
router.use('/payment-orders', paymentOrderRoutes);
router.use('/bank-accounts', bankAccountRoutes);
router.use('/payroll', payrollRoutes);
router.use('/cash-sessions', cashSessionRoutes);
// Panel general de KPIs del Dashboard.
router.use('/kpis', kpiRoutes);
// Estructura de costo por producto (calculadora + estadísticas), Administración.
router.use('/cost-structure', costStructureRoutes);
// Estados financieros NIIF (Estado de resultados / Situación financiera), Contabilidad.
router.use('/accounting', accountingRoutes);
// Registro e indicadores de merma (Inventario → Merma).
router.use('/waste', wasteRoutes);
router.use('/delivery-couriers', deliveryCourierRoutes);
router.use('/delivery-zones', deliveryZoneRoutes);
router.use('/quotes', quoteRoutes);
router.use('/reservations', tenantReservationRoutes);
router.use('/branches', branchRoutes);
router.use('/ai-photo', aiPhotoRoutes);
router.use('/shop', shopRoutes);
router.use('/approvals', approvalRoutes);
// Vertical Administrativo: contabilidad multi-empresa (distinto del /accounting de restaurantes).
router.use('/office', officeRoutes);
// Antes de '/club': si fuera después, cada petición de academia pasaría primero
// por el router de canchas y correría su tenantGuard sin necesidad.
router.use('/club/academy', clubAcademyRoutes);
router.use('/club/players', clubPlayerRoutes);
router.use('/club', clubRoutes);
// Puente club <-> restaurante: el vínculo por código y la cola de comandas de las canchas.
router.use('/club-link', clubLinkRoutes);
// Tablet fija de la cancha (rol CANCHA): el jugador escanea su QR y pide desde ahí.
router.use('/club-tablet', clubTabletRoutes);
// Torneos sociales (Americano/Mexicano) que se corren desde la tablet.
router.use('/club-tournament', clubTournamentRoutes);
router.use('/fiscal-invoicing', tenantFiscalInvoicingRoutes);

// --- Público ---
router.use('/public', menuRoutes);
router.post('/public/checkout/dine-in', publicBookingRateLimit, orderController.checkoutDineIn);
router.post('/public/checkout/delivery/:slug', publicBookingRateLimit, orderController.checkoutDelivery);
router.get('/public/checkout/delivery/:slug/quote', orderController.deliveryQuote);
// Tasa BCV para la landing (precios de planes en $ y Bs): es un dato global, no de un restaurante.
router.get('/public/exchange-rate', exchangeRateController.summary);
router.use('/public/plan-requests', publicPlanRequestRoutes);
// Plan Elite: no se contrata solo, se pide que llame un asesor.
router.use('/public/advisor-leads', publicAdvisorLeadRoutes);
router.use('/public/promo-codes', publicPromoCodeRoutes);
router.use('/public/payment-methods', publicPlatformSettingsRoutes);
router.use('/public/plans', publicPlanContentRoutes);
router.use('/public/reservations', publicReservationRoutes);
// QuickTap Wallet: portal del cliente final (quicktap.club/wallet) — ver modules/pass.
router.use('/public/wallet', walletRoutes);
// Latido de presencia de las páginas públicas: alimenta el contador de "personas en la
// página" del Dashboard maestro. Anónimo y sin sesión (ver presenciaController).
router.post('/public/presence', presenciaController.latido);
// Embudo de registro: lo llama el navegador de quien todavía se está registrando.
router.use('/public/registration-funnel', publicRegistrationFunnelRoutes);
router.use('/public/ramblay', publicRamblayRoutes);
// Página del jugador del club: disponibilidad y reserva, resueltas por slug.
router.use('/public/club', publicClubRoutes);
router.use('/public/club', publicAcademyRoutes);
router.use('/public/club', publicPlayerRoutes);
// Panel del jugador: tercer ámbito de auth (scope 'player'), fuera de /public
// porque sí lleva token, y fuera de las rutas del panel porque no es staff.
router.use('/player', playerRoutes);
// Tienda virtual del Local Comercial: catálogo y checkout, resueltos por slug.
router.use('/public/shop', publicShopRoutes);
// La entrada de un evento: pública a propósito, el asistente la abre desde su teléfono sin
// tener cuenta. El token opaco del QR es lo único que da acceso, igual que /acceso/:token del
// club (ver shop-tickets.service.ts).
router.get('/public/tickets/:accessToken', shopTicketsController.publico);

// --- Dashboard maestro (equipo de QuickTap, ve todos los restaurantes) ---
router.use('/master/promo-codes', masterPromoCodeRoutes);
router.use('/master/registration-funnel', masterRegistrationFunnelRoutes);
router.use('/master/payment-methods', masterPlatformSettingsRoutes);
router.use('/master/plans', masterPlanContentRoutes);
router.use('/master/message-templates', masterMessageTemplatesRoutes);
router.use('/master/plan-requests', masterPlanRequestRoutes);
router.use('/master/advisor-leads', masterAdvisorLeadRoutes);
router.use('/master/qr-nfc-requests', masterQrNfcRequestRoutes);
router.use('/master/summary', masterSummaryRoutes);
// Estadísticas en vivo de toda la plataforma (pedidos, visitantes y plata por vertical).
router.use('/master/live', masterLiveRoutes);
router.use('/master/quotes', masterQuotesRoutes);
router.use('/master/server-status', masterServerStatusRoutes);
router.use('/master/restaurants', masterRestaurantsRoutes);
router.use('/master/restaurants', masterFiscalInvoicingRoutes);
router.use('/master/admins', masterAdminsRoutes);
// Migración interna OlaClick → QuickTap (ver src/modules/master/master-olaclick-import.*).
router.use('/master/olaclick-import', masterOlaclickImportRoutes);
router.use('/master/catalog-ai', masterCatalogAiRoutes);
router.use('/master/whatsapp', masterWhatsappRoutes);
// WhatsApp vinculado (Evolution): la instancia de cada negocio y la de la plataforma.
router.use('/whatsapp-link', whatsappLinkRoutes);
router.use('/master/whatsapp-link', masterWhatsappLinkRouter);
router.use('/public/wa-webhook', waWebhookRouter);
router.use('/master/announcements', masterAnnouncementRoutes);

export default router;
