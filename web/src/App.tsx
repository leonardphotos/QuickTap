import { subdomainHandle } from './pages/connect/connect-api';
import { lazy, Suspense , useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { appFlavor, isInstalledApp } from './utils/native-platform';
import { MasterAuthProvider } from './context/MasterAuthContext';

const ConnectPage = lazy(() => import('./pages/connect/ConnectPage'));
const ConnectTerms = lazy(() => import('./pages/connect/ConnectTerms'));
const RecipeCostPage = lazy(() => import('./pages/tools/RecipeCostPage'));
const RestaurantWelcomePage = lazy(() => import('./pages/RestaurantWelcomePage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
// QuickTap Wallet: portal del cliente final. Árbol propio y perezoso, igual que el panel y el
// dashboard maestro — quien entra a ver sus compras no debe descargar nada de los otros dos.
const WalletLoginPage = lazy(() => import('./pages/wallet/WalletLoginPage'));
const WalletDashboardPage = lazy(() => import('./pages/wallet/WalletDashboardPage'));
const WalletInfoPage = lazy(() => import('./pages/wallet/WalletInfoPage'));

/**
 * Al navegar a otra ruta, la vista arranca arriba. Sin esto, la SPA conserva el scroll de la
 * pagina anterior: entrar a /wallet/conoce desde el banner (que vive a media landing) abria
 * la pagina nueva por el final. Solo reacciona al pathname: los anclas (#funciones) no lo
 * cambian y siguen funcionando igual.
 */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
const PlansPage = lazy(() => import('./pages/PlansPage'));
const TutorialsPage = lazy(() => import('./pages/TutorialsPage'));
const LegalPage = lazy(() => import('./pages/LegalPage'));
const DashboardProposalPage = lazy(() => import('./pages/propuesta/dashboard/DashboardProposalPage'));
const SettingsProposalPage = lazy(() => import('./pages/propuesta/ajustes/SettingsProposalPage'));
const CreateOrderProposalPage = lazy(() => import('./pages/propuesta/pedido/CreateOrderProposalPage'));
const OrdersProposalPage = lazy(() => import('./pages/propuesta/pedidos/OrdersProposalPage'));
const PaymentProposalPage = lazy(() => import('./pages/propuesta/pago/PaymentProposalPage'));
const NewInventoryItemProposalPage = lazy(() => import('./pages/propuesta/inventario/NewInventoryItemProposalPage'));
const ServicePage = lazy(() => import('./pages/seo/ServicePage'));
const VerticalPage = lazy(() => import('./pages/seo/VerticalPage'));
const ComparativaPage = lazy(() => import('./pages/seo/ComparativaPage'));
const MenuPage = lazy(() => import('./pages/public/MenuPage'));
const ChefRecipesPage = lazy(() => import('./pages/public/ChefRecipesPage'));
const ShopStorefrontPage = lazy(() => import('./pages/public/shop/ShopStorefrontPage'));
const ShopTicketPage = lazy(() => import('./pages/public/ShopTicketPage'));
const LoginPage = lazy(() => import('./pages/admin/LoginPage'));
const ImpersonatePage = lazy(() => import('./pages/admin/ImpersonatePage'));
const StartRegisterPage = lazy(() => import('./pages/admin/StartRegisterPage'));
const ShopRubroPage = lazy(() => import('./pages/admin/ShopRubroPage'));
const RegisterPage = lazy(() => import('./pages/admin/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/admin/ForgotPasswordPage'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const ComandasPage = lazy(() => import('./pages/admin/ComandasPage'));
const KitchenPage = lazy(() => import('./pages/admin/KitchenPage'));
const DeliveryPage = lazy(() => import('./pages/admin/DeliveryPage'));
const ClubOrdersPage = lazy(() => import('./pages/admin/ClubOrdersPage'));
const ProductsPage = lazy(() => import('./pages/admin/ProductsPage'));
const TablesPage = lazy(() => import('./pages/admin/TablesPage'));
const TableOrdersPage = lazy(() => import('./pages/admin/TableOrdersPage'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'));
const AssistantPage = lazy(() => import('./pages/admin/AssistantPage'));
const ScreenPage = lazy(() => import('./pages/admin/ScreenPage'));
const BillingPage = lazy(() => import('./pages/admin/BillingPage'));
const AdministrationPage = lazy(() => import('./pages/admin/AdministrationPage'));
const InventoryPage = lazy(() => import('./pages/admin/InventoryPage'));
const ExpensesPage = lazy(() => import('./pages/admin/ExpensesPage'));
const PurchasesPage = lazy(() => import('./pages/admin/PurchasesPage'));
const InternalMenuPage = lazy(() => import('./pages/admin/InternalMenuPage'));
const SucursalesPage = lazy(() => import('./pages/admin/SucursalesPage'));
const ReservationsPage = lazy(() => import('./pages/admin/ReservationsPage'));
const SyncConflictsPage = lazy(() => import('./pages/admin/SyncConflictsPage'));
const QuotesPage = lazy(() => import('./pages/admin/QuotesPage'));
const ComandaKioskPage = lazy(() => import('./pages/admin/ComandaKioskPage'));
const NumeroPage = lazy(() => import('./pages/admin/NumeroPage'));
const WaiterTabletPage = lazy(() => import('./pages/admin/WaiterTabletPage').then((m) => ({ default: m.WaiterTabletPage })));
const CourierPage = lazy(() => import('./pages/admin/CourierPage'));
const WelcomePage = lazy(() => import('./pages/admin/WelcomePage'));
const ClubPublicPage = lazy(() => import('./pages/public/ClubPublicPage'));
const ClubTicketPage = lazy(() => import('./pages/public/ClubTicketPage'));
const AppointmentBookingPage = lazy(() => import('./pages/public/AppointmentBookingPage'));
const DeliveryTrackingPage = lazy(() => import('./pages/public/DeliveryTrackingPage'));
const MasterLoginPage = lazy(() => import('./pages/master/MasterLoginPage'));
const MasterLayout = lazy(() => import('./pages/master/MasterLayout'));
const MasterRestaurantsPage = lazy(() => import('./pages/master/MasterRestaurantsPage'));
const MasterRestaurantDetailPage = lazy(() => import('./pages/master/MasterRestaurantDetailPage'));
const MasterOlaClickImportPage = lazy(() => import('./pages/master/MasterOlaClickImportPage'));
const MasterCatalogAiPage = lazy(() => import('./pages/master/MasterCatalogAiPage'));
const MasterAiUsagePage = lazy(() => import('./pages/master/MasterAiUsagePage'));
const MasterAssistantPage = lazy(() => import('./pages/master/MasterAssistantPage'));
const MasterPromoCodesPage = lazy(() => import('./pages/master/MasterPromoCodesPage'));
const MasterPaymentMethodsPage = lazy(() => import('./pages/master/MasterPaymentMethodsPage'));
const MasterPlansPage = lazy(() => import('./pages/master/MasterPlansPage'));
const MasterWhatsappPage = lazy(() => import('./pages/master/MasterWhatsappPage'));
const MasterProofsPage = lazy(() => import('./pages/master/MasterProofsPage'));
const MasterAdminsPage = lazy(() => import('./pages/master/MasterAdminsPage'));
const MasterAppsPage = lazy(() => import('./pages/master/MasterAppsPage'));
const MasterSummaryPage = lazy(() => import('./pages/master/MasterSummaryPage'));
const MasterAdministrationPage = lazy(() => import('./pages/master/MasterAdministrationPage'));
const MasterFunnelPage = lazy(() => import('./pages/master/MasterFunnelPage'));
const MasterBillingNoticesPage = lazy(() => import('./pages/master/MasterBillingNoticesPage'));
const MasterPrintingPage = lazy(() => import('./pages/master/MasterPrintingPage'));
const MasterLivePage = lazy(() => import('./pages/master/MasterLivePage'));
const MasterQuotesPage = lazy(() => import('./pages/master/MasterQuotesPage'));
const MasterQrNfcRequestsPage = lazy(() => import('./pages/master/MasterQrNfcRequestsPage'));
const MasterAdvisorLeadsPage = lazy(() => import('./pages/master/MasterAdvisorLeadsPage'));

/** Enlaces viejos tipo quicktap.club/:slug -> redirige a quicktap.club/r/:slug (URL actual del menú). */
function LegacyMenuRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  return <Navigate to={`/r/${slug}${location.search}`} replace />;
}

/** /planes -> /precios (slug SEO del cluster de precio), conservando query y hash —
 * el flujo de registro llega con ?plan=... y no debe perderlo. */
function PlanesRedirect() {
  const location = useLocation();
  return <Navigate to={`/precios${location.search}${location.hash}`} replace />;
}

/** Cada área (público/admin/maestro) se carga por separado: un visitante del menú nunca descarga el panel. */
function RouteFallback() {
  return <div className="min-h-screen flex items-center justify-center text-brand-950/30 font-light text-sm">Preparando todo para ti</div>;
}

export default function App() {
  const profileHost = subdomainHandle(window.location.hostname);
  if (profileHost) return <Suspense fallback={<RouteFallback />}><ConnectPage publicHandle={profileHost}/></Suspense>;
  return (
    <AuthProvider>
      <MasterAuthProvider>
        <Suspense fallback={<RouteFallback />}>
          <ScrollToTop />
          <Routes>
            <Route path="/menu-gratis" element={<ConnectPage />} />
            <Route path="/m/:handle" element={<ConnectPage />} />
            <Route path="/menu-gratis/condiciones" element={<ConnectTerms />} />
            <Route path="/connect" element={<ConnectPage />} />
            <Route path="/connect/p/:handle" element={<ConnectPage />} />
            <Route path="/connect/condiciones" element={<ConnectTerms />} />
            {/*
              Quien instala la app (Android o el escritorio de Windows) es personal del
              restaurante, no un visitante: la landing existe para vender el producto y ahí solo
              mete un paso de más antes de lo único que van a usar. Se entra directo al login,
              que a su vez rebota a /admin si la sesión sigue viva, así que no obliga a escribir
              la clave en cada arranque. En el navegador no cambia nada.
            */}
            <Route
              path="/"
              element={
                isInstalledApp() ? (
                  <Navigate to={appFlavor() === 'wallet' ? '/wallet' : '/admin/login'} replace />
                ) : (
                  <LandingPage />
                )
              }
            />
            {/* La página de soluciones se fusionó con la Landing (ahora vive debajo del hero). */}
            <Route path="/soluciones" element={<Navigate to="/" replace />} />
            {/* /precios es el slug SEO canónico (cluster de precio); /planes queda como redirección. */}
            <Route path="/herramientas/calculadora-costo-plato" element={<RecipeCostPage />} />
            <Route path="/precios" element={<PlansPage />} />
            <Route path="/planes" element={<PlanesRedirect />} />
            <Route path="/legal" element={<LegalPage />} />
            <Route path="/propuesta/dashboard" element={<DashboardProposalPage />} />
            <Route path="/propuesta/ajustes" element={<SettingsProposalPage />} />
            <Route path="/propuesta/pedido" element={<CreateOrderProposalPage />} />
            <Route path="/propuesta/pedidos" element={<OrdersProposalPage />} />
            <Route path="/propuesta/pago" element={<PaymentProposalPage />} />
            <Route path="/propuesta/inventario/nuevo" element={<NewInventoryItemProposalPage />} />

            {/* QuickTap Wallet (quicktap.club/wallet) */}
            <Route path="/wallet" element={<WalletLoginPage />} />
            <Route path="/wallet/conoce" element={<WalletInfoPage />} />
            <Route path="/bienvenida" element={<RestaurantWelcomePage />} />
            <Route path="/tutoriales" element={<TutorialsPage />} />
            <Route path="/wallet/mis-compras" element={<WalletDashboardPage />} />
            {/* El portal se llamó QuickTap Pass y su enlace circuló impreso y por WhatsApp:
                /pass sigue entrando, redirigido, en vez de dar 404. */}
            <Route path="/pass" element={<Navigate to="/wallet" replace />} />
            <Route path="/pass/mis-compras" element={<Navigate to="/wallet/mis-compras" replace />} />

            {/* Páginas SEO por cluster de intención — contenido en web/src/data/seoPages.ts,
                meta del lado del servidor en src/modules/seo/static-pages.ts (backend). */}
            <Route path="/menu-digital-qr" element={<ServicePage slug="menu-digital-qr" />} />
            <Route path="/autopedido-comandas" element={<ServicePage slug="autopedido-comandas" />} />
            <Route path="/pedidos-whatsapp" element={<ServicePage slug="pedidos-whatsapp" />} />
            <Route path="/software-delivery" element={<ServicePage slug="software-delivery" />} />
            <Route path="/menu-pantalla-tv" element={<ServicePage slug="menu-pantalla-tv" />} />
            <Route path="/inventario-costos" element={<ServicePage slug="inventario-costos" />} />
            <Route path="/para/:vertical" element={<VerticalPage />} />
            <Route path="/comparativa" element={<ComparativaPage />} />
            <Route path="/terminos" element={<Navigate to="/legal#terminos" replace />} />
            <Route path="/privacidad" element={<Navigate to="/legal#privacidad" replace />} />

            {/* Menú público (QR de mesa o link general para delivery/pickup) */}
            <Route path="/r/:slug" element={<MenuPage />} />
            {/* Acceso temporal de cocina: receta e ingredientes, sin sesión del panel. */}
            <Route path="/recetas/:slug" element={<ChefRecipesPage />} />

            {/* Tienda virtual del Local Comercial: catálogo y pedido, sin cuenta. */}
            <Route path="/tienda/:slug" element={<ShopStorefrontPage />} />
            {/* La entrada de un evento: pública, el asistente la abre desde su teléfono. */}
            <Route path="/entrada/:accessToken" element={<ShopTicketPage />} />

            {/* Club deportivo: reserva del jugador y su QR de acceso, sin cuenta. */}
            <Route path="/club/:slug" element={<ClubPublicPage />} />
            <Route path="/acceso/:accessToken" element={<ClubTicketPage />} />
            <Route path="/citas/:slug" element={<AppointmentBookingPage />} />
            <Route path="/delivery/seguimiento/:token" element={<DeliveryTrackingPage />} />

            {/* Panel del restaurante */}
            <Route path="/admin/login" element={<LoginPage />} />
            <Route path="/admin/impersonate" element={<ImpersonatePage />} />
            {/* Primer paso del registro: elige el rubro/vertical antes de cualquier dato. */}
            <Route path="/empezar" element={<StartRegisterPage />} />
            {/* Solo para "Locales Comerciales": elegir uno de los 23 rubros de retail. */}
            <Route path="/admin/register/rubro" element={<ShopRubroPage />} />
            <Route path="/admin/register" element={<RegisterPage />} />
            <Route path="/admin/forgot-password" element={<ForgotPasswordPage />} />
            {/* Pantalla única post-pago, sin el chrome de AdminLayout (ver Restaurant.pendingWelcomePlan). */}
            <Route path="/admin/welcome" element={<WelcomePage />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="comandas" element={<ComandasPage />} />
              <Route path="kitchen" element={<KitchenPage />} />
              <Route path="delivery" element={<DeliveryPage />} />
              {/* Pedidos que llegan desde las canchas de un club vinculado. */}
              <Route path="canchas" element={<ClubOrdersPage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="tables" element={<TablesPage />} />
              <Route path="table-orders" element={<TableOrdersPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="assistant" element={<AssistantPage />} />
              <Route path="billing" element={<BillingPage />} />
              <Route path="administration" element={<AdministrationPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="expenses" element={<ExpensesPage />} />
              <Route path="purchases" element={<PurchasesPage />} />
              <Route path="internal-menu" element={<InternalMenuPage />} />
              <Route path="sucursales" element={<SucursalesPage />} />
              <Route path="reservations" element={<ReservationsPage />} />
              <Route path="pedidos-por-revisar" element={<SyncConflictsPage />} />
              <Route path="quotes" element={<QuotesPage />} />
              <Route path="screen" element={<ScreenPage />} />
              {/* AdminLayout intercepta el rol Comanda antes del Outlet y renderiza el kiosco
                  a pantalla completa — esta ruta solo existe para que /admin/comanda matchee. */}
              <Route path="comanda" element={<ComandaKioskPage />} />
              {/* AdminLayout intercepta el rol Numero antes del Outlet y renderiza la pantalla
                  de avisos a pantalla completa — esta ruta solo existe para que /admin/numero matchee. */}
              <Route path="numero" element={<NumeroPage />} />
              {/* AdminLayout intercepta el rol Tablet de meseros antes del Outlet y renderiza el
                  teclado a pantalla completa — esta ruta solo existe para que /admin/waiter-tablet
                  matchee (y para que dueño/admin puedan entrar a previsualizarla). */}
              <Route path="waiter-tablet" element={<WaiterTabletPage />} />
              {/* AdminLayout convierte este rol en su portal móvil exclusivo de entregas. */}
              <Route path="motorizado" element={<CourierPage />} />
              <Route path="citas/*" element={<DashboardPage />} />
            </Route>

            {/* Dashboard maestro (equipo de QuickTap, ve todos los restaurantes) */}
            <Route path="/master/login" element={<MasterLoginPage />} />
            <Route path="/master" element={<MasterLayout />}>
              {/* Entrar al máster abre el panel de aplicaciones. */}
              <Route index element={<Navigate to="/master/apps" replace />} />
              <Route path="restaurants" element={<MasterRestaurantsPage />} />
              <Route path="restaurants/:id" element={<MasterRestaurantDetailPage />} />
              <Route path="restaurants/:id/olaclick-import" element={<MasterOlaClickImportPage />} />
              <Route path="catalog-ai" element={<MasterCatalogAiPage />} />
              <Route path="ai-usage" element={<MasterAiUsagePage />} />
              <Route path="assistant" element={<MasterAssistantPage />} />
              <Route path="promo-codes" element={<MasterPromoCodesPage />} />
              <Route path="payment-methods" element={<MasterPaymentMethodsPage />} />
              <Route path="plans" element={<MasterPlansPage />} />
              <Route path="whatsapp" element={<MasterWhatsappPage />} />
              <Route path="proofs" element={<MasterProofsPage />} />
              <Route path="apps" element={<MasterAppsPage />} />
              <Route path="summary" element={<MasterSummaryPage />} />
              <Route path="administration" element={<MasterAdministrationPage />} />
              <Route path="funnel" element={<MasterFunnelPage />} />
              <Route path="live" element={<MasterLivePage />} />
              <Route path="printing" element={<MasterPrintingPage />} />
              <Route path="billing-notices" element={<MasterBillingNoticesPage />} />
              <Route path="quotes" element={<MasterQuotesPage />} />
              <Route path="qrnfc-requests" element={<MasterQrNfcRequestsPage />} />
              <Route path="advisor-leads" element={<MasterAdvisorLeadsPage />} />
              <Route path="admins" element={<MasterAdminsPage />} />
            </Route>

            {/* Compatibilidad con enlaces viejos (quicktap.club/:slug) de antes de que existiera /r/:slug */}
            <Route path="/:slug" element={<LegacyMenuRedirect />} />

            <Route path="*" element={<div className="p-10 text-center text-gray-500">Página no encontrada.</div>} />
          </Routes>
        </Suspense>
      </MasterAuthProvider>
    </AuthProvider>
  );
}
