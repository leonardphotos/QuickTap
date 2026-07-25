import { Link, useLocation } from 'react-router-dom';
import { Menu, PackageX, Share2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS } from '@/utils/roles';
import { PLAN_LABELS, type AdminNavLink } from '@/pages/admin/nav-links';
import type { LowStockItem } from '@/hooks/useLowStockItems';

interface AdminSidebarProps {
  navLinks: AdminNavLink[];
  pendingReservations: number;
  lowStockItems: LowStockItem[];
  onShare: () => void;
  onOpenMenu: () => void;
}

/**
 * Menú lateral del panel (escritorio / iPad horizontal, >=1024px). En celular
 * y tablet vertical la navegación sigue siendo el dock flotante de AdminLayout —
 * esta barra ni se monta ahí (contenedor `hidden lg:flex`).
 */
export function AdminSidebar({ navLinks, pendingReservations, lowStockItems, onShare, onOpenMenu }: AdminSidebarProps) {
  const { user, restaurant } = useAuth();
  const { pathname } = useLocation();

  if (!restaurant) return null;

  const planLabel = restaurant.subscriptionPlan ? (PLAN_LABELS[restaurant.subscriptionPlan] ?? restaurant.subscriptionPlan) : null;

  return (
    <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-[264px] bg-gradient-to-b from-brand-950 to-brand-900 px-4 py-6 overflow-y-auto">
      <Link to="/admin" className="flex items-center gap-3 px-2 mb-7 shrink-0 min-w-0">
        <img src={restaurant.logoUrl || '/logo/icono.png'} alt="" className="h-10 w-10 rounded-xl object-cover shrink-0" />
        <span className="text-white font-semibold text-[17px] tracking-tight truncate">{restaurant.name}</span>
      </Link>

      <nav className="flex-1 flex flex-col gap-0.5">
        {navLinks.map((l) => {
          const active = pathname === l.to;
          const showAlert = l.to === '/admin/reservations' && pendingReservations > 0;
          return (
            <Link
              key={l.to}
              to={l.to}
              className={`relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14.5px] font-medium transition-colors ${
                active ? 'bg-brand-500/20 text-white' : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <l.icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-sky-300' : 'opacity-80'}`} />
              <span className="truncate">{l.label}</span>
              {showAlert && (
                <span className="absolute right-3 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-brand-900">
                  {pendingReservations}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2 mt-2 shrink-0">
        {lowStockItems.length > 0 && (
          <Link
            to="/admin/inventory"
            className="relative flex items-center justify-center h-9 w-9 rounded-full bg-red-500/15 hover:bg-red-500/25 transition-colors"
            aria-label="Insumos por agotarse"
            title={`Insumos por agotarse: ${lowStockItems.map((i) => i.name).join(', ')}`}
          >
            <PackageX className="h-4 w-4 text-red-400" />
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-brand-900">
              {lowStockItems.length}
            </span>
          </Link>
        )}
        <button
          type="button"
          onClick={onShare}
          aria-label="Compartir enlace del menú"
          className="flex items-center justify-center h-9 w-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
        >
          <Share2 className="h-4 w-4 text-white/70" />
        </button>
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Abrir menú"
          className="flex items-center justify-center h-9 w-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
        >
          <Menu className="h-4 w-4 text-white/70" />
        </button>
      </div>

      {user && (
        <div className="flex items-center gap-2.5 rounded-2xl bg-white/[0.06] px-3 py-3 mt-3 shrink-0 min-w-0">
          <div className="h-9 w-9 rounded-full bg-brand-500 flex items-center justify-center text-white font-semibold text-sm shrink-0">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold truncate">{user.name}</p>
            <p className="text-white/50 text-xs truncate">{ROLE_LABELS[user.role] ?? user.role}{planLabel ? ` · ${planLabel}` : ''}</p>
          </div>
        </div>
      )}
    </aside>
  );
}
