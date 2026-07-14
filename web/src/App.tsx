import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { MasterAuthProvider } from './context/MasterAuthContext';
import LandingPage from './pages/LandingPage';
import MenuPage from './pages/public/MenuPage';
import LoginPage from './pages/admin/LoginPage';
import RegisterPage from './pages/admin/RegisterPage';
import AdminLayout from './pages/admin/AdminLayout';
import DashboardPage from './pages/admin/DashboardPage';
import KitchenPage from './pages/admin/KitchenPage';
import DeliveryPage from './pages/admin/DeliveryPage';
import ProductsPage from './pages/admin/ProductsPage';
import TablesPage from './pages/admin/TablesPage';
import TableOrdersPage from './pages/admin/TableOrdersPage';
import SettingsPage from './pages/admin/SettingsPage';
import ScreenPage from './pages/admin/ScreenPage';
import BillingPage from './pages/admin/BillingPage';
import MasterLoginPage from './pages/master/MasterLoginPage';
import MasterLayout from './pages/master/MasterLayout';
import MasterRestaurantsPage from './pages/master/MasterRestaurantsPage';
import MasterRestaurantDetailPage from './pages/master/MasterRestaurantDetailPage';
import MasterPromoCodesPage from './pages/master/MasterPromoCodesPage';
import MasterPaymentMethodsPage from './pages/master/MasterPaymentMethodsPage';
import MasterProofsPage from './pages/master/MasterProofsPage';
import MasterAdminsPage from './pages/master/MasterAdminsPage';
import MasterSummaryPage from './pages/master/MasterSummaryPage';
import MasterQrNfcRequestsPage from './pages/master/MasterQrNfcRequestsPage';

/** Enlaces viejos tipo quicktap.club/:slug -> redirige a quicktap.club/r/:slug (URL actual del menú). */
function LegacyMenuRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  return <Navigate to={`/r/${slug}${location.search}`} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <MasterAuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />

          {/* Menú público (QR de mesa o link general para delivery/pickup) */}
          <Route path="/r/:slug" element={<MenuPage />} />

          {/* Panel del restaurante */}
          <Route path="/admin/login" element={<LoginPage />} />
          <Route path="/admin/register" element={<RegisterPage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="kitchen" element={<KitchenPage />} />
            <Route path="delivery" element={<DeliveryPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="tables" element={<TablesPage />} />
            <Route path="table-orders" element={<TableOrdersPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="screen" element={<ScreenPage />} />
          </Route>

          {/* Dashboard maestro (equipo de QuickTap, ve todos los restaurantes) */}
          <Route path="/master/login" element={<MasterLoginPage />} />
          <Route path="/master" element={<MasterLayout />}>
            <Route index element={<MasterRestaurantsPage />} />
            <Route path="restaurants/:id" element={<MasterRestaurantDetailPage />} />
            <Route path="promo-codes" element={<MasterPromoCodesPage />} />
            <Route path="payment-methods" element={<MasterPaymentMethodsPage />} />
            <Route path="proofs" element={<MasterProofsPage />} />
            <Route path="summary" element={<MasterSummaryPage />} />
            <Route path="qrnfc-requests" element={<MasterQrNfcRequestsPage />} />
            <Route path="admins" element={<MasterAdminsPage />} />
          </Route>

          {/* Compatibilidad con enlaces viejos (quicktap.club/:slug) de antes de que existiera /r/:slug */}
          <Route path="/:slug" element={<LegacyMenuRedirect />} />

          <Route path="*" element={<div className="p-10 text-center text-gray-500">Página no encontrada.</div>} />
        </Routes>
      </MasterAuthProvider>
    </AuthProvider>
  );
}
