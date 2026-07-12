import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const links = [
  { to: '/admin/kitchen', label: '🍳 Cocina' },
  { to: '/admin/products', label: '🍔 Productos' },
  { to: '/admin/categories', label: '📂 Categorías' },
  { to: '/admin/tables', label: '🔳 Mesas / QR' },
];

export default function AdminLayout() {
  const { user, restaurant, loading, logout } = useAuth();

  if (loading) return <div className="p-10 text-center text-gray-500">Cargando…</div>;
  if (!user || !restaurant) return <Navigate to="/admin/login" replace />;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-bold text-gray-900">{restaurant.name}</p>
            <p className="text-xs text-gray-500">/{restaurant.slug} · {user.name}</p>
          </div>
          <button onClick={logout} className="text-sm text-gray-500">
            Salir
          </button>
        </div>
        <nav className="max-w-5xl mx-auto px-4 flex gap-4 text-sm border-t">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `py-2.5 border-b-2 ${isActive ? 'border-gray-900 text-gray-900 font-medium' : 'border-transparent text-gray-500'}`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
