import './master-theme.css';
import { DailyRatesBadge } from '@/components/DailyRatesBadge';
import { RecurringExpenses } from '@/components/master/RecurringExpenses';
import { MoneyVisibilityToggle } from '@/components/master/MoneyVisibilityToggle';
import { MoneyVisibilityProvider } from '@/context/MoneyVisibilityContext';
import { canManageRestaurant } from '@/utils/master-rbac';
import { LogOut, LayoutGrid, Plus } from 'lucide-react';
import { useEffect } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useMasterAuth } from '../../context/MasterAuthContext.shared';
import { canAccessMasterPath, MASTER_NAV_LINKS } from './master-nav';

export default function MasterLayout() {
  const { admin, loading, logout } = useMasterAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    document.body.classList.add('master-theme');
    return () => document.body.classList.remove('master-theme');
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6 text-center text-sm font-light text-brand-950/50">
        Preparando todo para ti
      </div>
    );
  }
  if (!admin) return <Navigate to="/master/login" replace />;

  const current = MASTER_NAV_LINKS.find(
    (item) => pathname === item.to || (item.to === '/master/restaurants' && pathname.startsWith('/master/restaurants/')),
  );
  if (!canAccessMasterPath(admin.role, pathname)) return <Navigate to="/master/summary" replace />;

  return (
    <MoneyVisibilityProvider>
      <div className={`master-ui min-h-screen text-brand-950 ${pathname === '/master/apps' ? 'bg-[radial-gradient(ellipse_at_top,#e8efff_0%,#f4f5fa_50%,#edf3f8_100%)]' : 'bg-[#f6f7f9]'}` }>
        <a className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[1200] focus:rounded-xl focus:bg-white focus:p-3" href="#master-content">Ir al contenido</a>




        <div className="min-h-screen">
          <header className="sticky top-0 z-20 border-b border-brand-950/[0.07] bg-white/88 backdrop-blur-xl">
            <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
              <Link to="/master/apps" aria-label="Volver a aplicaciones" title="Aplicaciones" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-brand-500 shadow-sm"><LayoutGrid size={20}/></Link>

              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold tracking-tight text-brand-950 text-base">{pathname === '/master/apps' ? 'Aplicaciones' : current?.label ?? 'Dashboard Máster'}</p>
                <p className="hidden truncate font-light text-brand-950/45 sm:block text-xs">{current?.hint ?? 'Administración general de QuickTap'}</p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {canManageRestaurant(admin.role) && (
                  <Link
                    to="/master/restaurants?crear=1"
                    className="hidden items-center gap-1.5 rounded-xl bg-brand-500 px-3.5 py-2.5 text-xs font-semibold text-slate-900 shadow-[0_10px_22px_-14px_rgba(5,151,242,.9)] transition-[background-color,transform] hover:bg-brand-600 active:scale-[.98] sm:inline-flex"
                  >
                    <Plus className="h-3.5 w-3.5" /> Crear negocio
                  </Link>
                )}
                <DailyRatesBadge className="hidden rounded-full bg-brand-500/[0.08] px-3 py-1.5 sm:inline" />
                <button type="button" aria-label="Cerrar sesión" onClick={logout} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><LogOut size={18}/></button>
                <MoneyVisibilityToggle className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-950/[0.08] bg-white text-brand-950/45 shadow-sm transition-[color,transform] duration-150 ease-out-strong hover:text-brand-500 active:scale-95" />
                <div className="hidden items-center gap-2 rounded-xl border border-brand-950/[0.08] bg-white px-2.5 py-1.5 shadow-sm md:flex">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-[11px] font-semibold text-white">
                    {admin.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="max-w-32 truncate text-xs font-medium text-brand-950">{admin.name}</span>
                </div>
              </div>
            </div>
          </header>

          <main id="master-content" className="mx-auto w-full max-w-none px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {pathname !== '/master/apps' && ['ADMIN', 'MANAGER', 'FINANCE', 'AUDITOR'].includes(admin.role) && <RecurringExpenses compact />}
            <Outlet />
          </main>
        </div>
      </div>
    </MoneyVisibilityProvider>
  );
}
