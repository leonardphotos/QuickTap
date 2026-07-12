import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import MenuPage from './pages/public/MenuPage';
import LoginPage from './pages/admin/LoginPage';
import RegisterPage from './pages/admin/RegisterPage';
import AdminLayout from './pages/admin/AdminLayout';
import KitchenPage from './pages/admin/KitchenPage';
import ProductsPage from './pages/admin/ProductsPage';
import CategoriesPage from './pages/admin/CategoriesPage';
import TablesPage from './pages/admin/TablesPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/admin/login" replace />} />

        {/* Menú público (QR de mesa o link general para delivery/pickup) */}
        <Route path="/r/:slug" element={<MenuPage />} />

        {/* Panel del restaurante */}
        <Route path="/admin/login" element={<LoginPage />} />
        <Route path="/admin/register" element={<RegisterPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="kitchen" element={<KitchenPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="tables" element={<TablesPage />} />
        </Route>

        <Route path="*" element={<div className="p-10 text-center text-gray-500">Página no encontrada.</div>} />
      </Routes>
    </AuthProvider>
  );
}
