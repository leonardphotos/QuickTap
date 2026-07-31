import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { MasterAuthProvider } from './context/MasterAuthContext';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const PlansPage = lazy(() => import('./pages/PlansPage'));
const MenuPage = lazy(() => import('./pages/public/MenuPage'));
const LoginPage = lazy(() => import('./pages/admin/LoginPage'));
const StartRegisterPage = lazy(() => import('./pages/admin/StartRegisterPage'));
const ShopRubroPage = lazy(() => import('./pages/admin/ShopRubroPage'));
const RegisterPage = lazy(() => import('./pages/admin/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/admin/ForgotPasswordPage'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const ComandasPage = lazy(() => import('./pages/admin/ComandasPage'));
const KitchenPage = lazy(() => import('./pages/admin/KitchenPage'));
const DeliveryPage = lazy(() => import('./pages/admin/DeliveryPage'));
const ProductsPage = lazy(() => import('./pages/admin/ProductsPage'));
const TablesPage = lazy(() => import('./pages/admin/TablesPage'));
const TableOrdersPage = lazy(() => import('./pages/admin/TableOrdersPage'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'));
const ScreenPage = lazy(() => import('./pages/admin/ScreenPage'));
const BillingPage = lazy(() => import('./pages/admin/BillingPage'));
const AdministrationPage = lazy(() => import('./pages/admin/AdministrationPage'));
const InventoryPage = lazy(() => import('./pages/admin/InventoryPage'));
const ExpensesPage = lazy(() => import('./pages/admin/ExpensesPage'));
const SucursalesPage = lazy(() => import('./pages/admin/SucursalesPage'));
const ReservationsPage = lazy(() => import('./pages/admin/ReservationsPage'));
const QuotesPage = lazy(() => import('./pages/admin/QuotesPage'));
const ComandaKioskPage = lazy(() => import('./pages/admin/ComandaKioskPage'));
const NumeroPage = lazy(() => import('./pages/admin/NumeroPage'));
const WelcomePage = lazy(() => import('./pages/admin/WelcomePage'));
const MasterLoginPage = lazy(() => import('./pages/master/MasterLoginPage'));
const MasterLayout = lazy(() => import('./pages/master/MasterLayout'));
const MasterRestaurantsPage = lazy(() => import('./pages/master/MasterRestaurantsPage'));
const MasterRestaurantDetailPage = lazy(() => import('./pages/master/MasterRestaurantDetailPage'));
const MasterOlaClickImportPage = lazy(() => import('./pages/master/MasterOlaClickImportPage'));
const MasterPromoCodesPage = lazy(() => import('./pages/master/MasterPromoCodesPage'));
const MasterPaymentMethodsPage = lazy(() => import('./pages/master/MasterPaymentMethodsPage'));
const MasterPlansPage = lazy(() => import('./pages/master/MasterPlansPage'));
const MasterProofsPage = lazy(() => import('./pages/master/MasterProofsPage'));
const MasterAdminsPage = lazy(() => import('./pages/master/MasterAdminsPage'));
const MasterSummaryPage = lazy(() => import('./pages/master/MasterSummaryPage'));
const MasterQrNfcRequestsPage = lazy(() => import('./pages/master/MasterQrNfcRequestsPage'));

/** Enlaces viejos tipo quicktap.club/:slug -> redirige a quicktap.club/r/:slug (URL actual del menú). */
function LegacyMenuRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  return <Navigate to={`/r/${slug}${location.search}`} replace />;
}

/** Cada área (público/admin/maestro) se carga por separado: un visitante del menú nunca descarga el panel. */
function RouteFallback() {
  return <div className="min-h-screen flex items-center justify-center text-brand-950/30 font-light text-sm">Cargando…</div>;
}

export default function App() {
  return (
    <AuthProvider>
      <MasterAuthProvider>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            {/* La página de soluciones se fusionó con la Landing (ahora vive debajo del hero). */}
            <Route path="/soluciones" element={<Navigate to="/" replace />} />
            <Route path="/planes" element={<PlansPage />} />

            {/* Menú público (QR de mesa o link general para delivery/pickup) */}
            <Route path="/r/:slug" element={<MenuPage />} />

            {/* Panel del restaurante */}
            <Route path="/admin/login" element={<LoginPage />} />
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
              <Route path="products" element={<ProductsPage />} />
              <Route path="tables" element={<TablesPage />} />
              <Route path="table-orders" element={<TableOrdersPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="billing" element={<BillingPage />} />
              <Route path="administration" element={<AdministrationPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="expenses" element={<ExpensesPage />} />
              <Route path="sucursales" element={<SucursalesPage />} />
              <Route path="reservations" element={<ReservationsPage />} />
              <Route path="quotes" element={<QuotesPage />} />
              <Route path="screen" element={<ScreenPage />} />
              {/* AdminLayout intercepta el rol Comanda antes del Outlet y renderiza el kiosco
                  a pantalla completa — esta ruta solo existe para que /admin/comanda matchee. */}
              <Route path="comanda" element={<ComandaKioskPage />} />
              {/* AdminLayout intercepta el rol Numero antes del Outlet y renderiza la pantalla
                  de avisos a pantalla completa — esta ruta solo existe para que /admin/numero matchee. */}
              <Route path="numero" element={<NumeroPage />} />
            </Route>

            {/* Dashboard maestro (equipo de QuickTap, ve todos los restaurantes) */}
            <Route path="/master/login" element={<MasterLoginPage />} />
            <Route path="/master" element={<MasterLayout />}>
              <Route index element={<MasterRestaurantsPage />} />
              <Route path="restaurants/:id" element={<MasterRestaurantDetailPage />} />
              <Route path="restaurants/:id/olaclick-import" element={<MasterOlaClickImportPage />} />
              <Route path="promo-codes" element={<MasterPromoCodesPage />} />
              <Route path="payment-methods" element={<MasterPaymentMethodsPage />} />
              <Route path="plans" element={<MasterPlansPage />} />
              <Route path="proofs" element={<MasterProofsPage />} />
              <Route path="summary" element={<MasterSummaryPage />} />
              <Route path="qrnfc-requests" element={<MasterQrNfcRequestsPage />} />
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
