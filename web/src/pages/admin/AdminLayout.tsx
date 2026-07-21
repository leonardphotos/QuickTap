import { useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Home, Menu, Settings, Share2, TriangleAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import { Toast } from '@/components/ui/toast';
import { NavMenuDrawer } from '@/components/admin/NavMenuDrawer';
import { useCopyToast } from '../../hooks/useCopyToast';
import { usePendingReservationsCount } from '../../hooks/usePendingReservations';
import { canAccessPath, defaultPathFor, isAdminCashier, isScreenRole } from '../../utils/roles';
import { daysRemaining, graceHoursRemaining } from '../../utils/subscription';
import { visibleNavLinks } from './nav-links';

export default function AdminLayout() {
  const { user, restaurant, loading, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { copy, toastMessage } = useCopyToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const pendingReservations = usePendingReservationsCount(user?.role);

  if (loading) return <div className="p-10 text-center text-brand-950/50 font-light">Cargando…</div>;
  if (!user || !restaurant) return <Navigate to="/admin/login" replace />;

  // Cuenta bloqueada por falta de pago: nada de panel hasta que el Dashboard
  // maestro la reactive (ver src/utils/subscription.ts en el backend).
  if (restaurant.locked) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <TriangleAlert className="h-10 w-10 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-brand-950 mb-2">Cuenta bloqueada</h1>
          <p className="text-sm text-brand-950/60 font-light">
            {restaurant.suspended
              ? `${restaurant.name} fue bloqueada por el equipo de QuickTap. Contáctanos para más información.`
              : `${restaurant.name} está bloqueada por falta de pago. Contacta al equipo de QuickTap para reactivarla.`}{' '}
            Solo se puede desbloquear desde el Dashboard de administrador.
          </p>
          <TextureButton variant="minimal" size="default" className="mt-6 !w-auto" onClick={logout}>
            Cerrar sesión
          </TextureButton>
        </div>
      </div>
    );
  }

  // Plan recién activado/cambiado (pago manual aprobado o webhook de Ramblay):
  // se muestra la bienvenida una sola vez antes de dejar entrar al panel.
  if (restaurant.pendingWelcomePlan) {
    return <Navigate to="/admin/welcome" replace />;
  }

  if (!canAccessPath(user.role, pathname, user.canAccessInventory)) {
    return <Navigate to={defaultPathFor(user.role)} replace />;
  }

  // Pantalla (kiosco): sin cabecera ni navegación, solo el contenido a pantalla completa.
  if (isScreenRole(user.role)) {
    return (
      <div className="min-h-screen bg-white">
        <Outlet />
      </div>
    );
  }

  const canSeeSettings = canAccessPath(user.role, '/admin/settings');
  const daysLeft = daysRemaining(restaurant.periodEnd);
  const graceHours = graceHoursRemaining(restaurant.periodEnd);
  const showExpirationWarning = daysLeft <= 3;
  const navLinks = visibleNavLinks(user.role, restaurant, user.canAccessInventory);

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {showExpirationWarning && (
        <Link
          to="/admin/billing"
          className="block bg-amber-400 text-amber-950 text-sm font-medium text-center py-2 px-4 hover:bg-amber-300 transition-colors"
        >
          {graceHours !== null
            ? `Hoy vence tu plan. Tienes ${graceHours}h para pagar antes de que se bloquee tu cuenta.`
            : `En ${daysLeft} día${daysLeft === 1 ? '' : 's'} vence tu plan. Actívalo aquí.`}
        </Link>
      )}

      {/* Barra superior: solo en pantallas anchas (tablet horizontal / escritorio) — en
          celular la navegación sigue siendo el dock flotante de abajo, más cómodo con el pulgar. */}
      <div className="hidden lg:block sticky top-0 z-30 backdrop-blur-md bg-white/80 border-b border-brand-950/[0.06]">
        <div className="max-w-7xl mx-auto px-8 h-16 flex items-center justify-between gap-6">
          <Link to="/admin" className="flex items-center gap-2.5 min-w-0 shrink-0">
            <img
              src={restaurant.logoUrl || '/logo/icono.png'}
              alt=""
              className="h-8 w-8 rounded-full object-cover shrink-0"
            />
            <span className="text-sm font-semibold text-brand-950 truncate max-w-40">{restaurant.name}</span>
          </Link>

          <nav className="flex items-center gap-1 rounded-full bg-brand-950/[0.04] p-1 overflow-x-auto">
            {navLinks.map((l) => {
              const active = pathname === l.to;
              const showAlert = l.to === '/admin/reservations' && pendingReservations > 0;
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  className={`relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                    active ? 'bg-brand-500 text-white shadow-[0_6px_16px_-6px_rgba(5,108,242,0.5)]' : 'text-brand-950/60 hover:bg-brand-950/[0.06]'
                  }`}
                >
                  <l.icon className="h-4 w-4" /> {l.label}
                  {showAlert && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                      {pendingReservations}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5 shrink-0">
            <TextureButton
              variant="icon"
              size="icon"
              className="!h-9 !w-9"
              aria-label="Compartir enlace del menú"
              onClick={() => copy(`${window.location.origin}/r/${restaurant.slug}`, 'Enlace copiado')}
            >
              <Share2 className="h-4 w-4 text-brand-950/70" />
            </TextureButton>
            <TextureButton variant="icon" size="icon" className="!h-9 !w-9" aria-label="Abrir menú" onClick={() => setMenuOpen(true)}>
              <Menu className="h-4 w-4 text-brand-950/70" />
            </TextureButton>
          </div>
        </div>
      </div>

      <main className="max-w-5xl lg:max-w-7xl mx-auto px-6 lg:px-8 pt-10 lg:pt-8 pb-28 lg:pb-12">
        <Outlet />
      </main>

      {/* Dock flotante: navegación en celular/tablet vertical (la barra superior la reemplaza en pantallas anchas). */}
      <div className="lg:hidden fixed bottom-5 inset-x-0 z-30 flex justify-center pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-white/90 backdrop-blur-md border border-brand-950/[0.08] shadow-lg shadow-brand-950/10 px-3 py-3">
          <Link to="/admin">
            <TextureButton variant="icon" size="icon" className="!h-11 !w-11" aria-label="Inicio">
              <Home className="h-5 w-5 text-brand-950/70" />
            </TextureButton>
          </Link>
          {pathname !== '/admin' && (
            <TextureButton variant="icon" size="icon" className="!h-11 !w-11" aria-label="Regresar" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5 text-brand-950/70" />
            </TextureButton>
          )}
          <TextureButton
            variant="icon"
            size="icon"
            className="!h-11 !w-11"
            aria-label="Compartir enlace del menú"
            onClick={() => copy(`${window.location.origin}/r/${restaurant.slug}`, 'Enlace copiado')}
          >
            <Share2 className="h-5 w-5 text-brand-950/70" />
          </TextureButton>
          {isAdminCashier(user.role) && (
            <Link to="/admin/reservations" className="relative" aria-label="Reservas">
              <div
                className={`flex items-center justify-center h-11 w-11 rounded-full transition-colors ${
                  pendingReservations > 0
                    ? 'bg-red-500 shadow-[0_8px_20px_-6px_rgba(220,38,38,0.6)] animate-pulse'
                    : 'bg-white border border-brand-950/10'
                }`}
              >
                <CalendarDays className={`h-5 w-5 ${pendingReservations > 0 ? 'text-white' : 'text-brand-950/70'}`} />
              </div>
              {pendingReservations > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-white text-red-600 text-[10px] font-bold flex items-center justify-center ring-2 ring-red-500">
                  {pendingReservations}
                </span>
              )}
            </Link>
          )}
          {canSeeSettings && (
            <Link to="/admin/settings">
              <TextureButton variant="icon" size="icon" className="!h-11 !w-11" aria-label="Ajustes">
                <Settings className="h-5 w-5 text-brand-950/70" />
              </TextureButton>
            </Link>
          )}
          <TextureButton variant="icon" size="icon" className="!h-11 !w-11" aria-label="Abrir menú" onClick={() => setMenuOpen(true)}>
            <Menu className="h-5 w-5 text-brand-950/70" />
          </TextureButton>
        </div>
      </div>

      <NavMenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />

      <Toast message={toastMessage} />
    </div>
  );
}
