import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const links = [
  { to: '/admin/kitchen', label: '🍳 Cocina' },
  { to: '/admin/products', label: '🍔 Productos' },
  { to: '/admin/categories', label: '📂 Categorías' },
  { to: '/admin/tables', label: '🔳 Mesas / QR' },
  { to: '/admin/settings', label: '⚙️ Ajustes' },
];

export default function AdminLayout() {
  const { user, restaurant, loading, logout } = useAuth();

  if (loading) return <div className="p-10 text-center text-brand-950/50 font-light">Cargando…</div>;
  if (!user || !restaurant) return <Navigate to="/admin/login" replace />;

  return (
    <div className="min-h-screen bg-brand-950/[0.03]">
      <header className="bg-white border-b border-brand-950/10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-semibold text-brand-950">{restaurant.name}</p>
            <p className="text-xs text-brand-950/50 font-light">/{restaurant.slug} · {user.name}</p>
          </div>
          <button onClick={logout} className="text-sm text-brand-950/50 hover:text-brand-950">
            Salir
          </button>
        </div>
        <nav className="max-w-5xl mx-auto px-4 flex gap-4 text-sm border-t border-brand-950/10">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `py-2.5 border-b-2 ${isActive ? 'border-brand-500 text-brand-950 font-medium' : 'border-transparent text-brand-950/50'}`
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
