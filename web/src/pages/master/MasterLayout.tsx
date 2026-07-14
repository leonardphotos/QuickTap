import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Receipt, ShieldCheck, Store, Tag, Users, Wallet } from 'lucide-react';
import { useMasterAuth } from '../../context/MasterAuthContext';
import { TextureButton } from '@/components/ui/texture-button';

const NAV_LINKS = [
  { to: '/master', label: 'Restaurantes', icon: Store },
  { to: '/master/proofs', label: 'Comprobantes', icon: Receipt },
  { to: '/master/promo-codes', label: 'Códigos promo', icon: Tag },
  { to: '/master/payment-methods', label: 'Datos de pago', icon: Wallet },
  { to: '/master/admins', label: 'Usuarios', icon: Users },
];

export default function MasterLayout() {
  const { admin, loading, logout } = useMasterAuth();
  const { pathname } = useLocation();

  if (loading) return <div className="p-10 text-center text-brand-950/50 font-light">Cargando…</div>;
  if (!admin) return <Navigate to="/master/login" replace />;

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-brand-950/[0.06]">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="h-5 w-5 text-brand-500 shrink-0" />
            <p className="font-medium text-brand-950 truncate text-[15px]">Dashboard de administrador</p>
          </div>
          <nav className="hidden sm:flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  pathname === l.to ? 'bg-brand-950 text-white' : 'text-brand-950/60 hover:bg-brand-950/[0.06]'
                }`}
              >
                <l.icon className="h-3.5 w-3.5" /> {l.label}
              </Link>
            ))}
          </nav>
          <TextureButton variant="icon" size="icon" aria-label="Salir" onClick={logout} className="shrink-0">
            <LogOut className="h-4 w-4 text-brand-950/70" />
          </TextureButton>
        </div>
        <nav className="sm:hidden flex items-center gap-1 overflow-x-auto px-4 pb-3 -mt-1">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                pathname === l.to ? 'bg-brand-950 text-white' : 'text-brand-950/60 bg-brand-950/[0.06]'
              }`}
            >
              <l.icon className="h-3.5 w-3.5" /> {l.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}
