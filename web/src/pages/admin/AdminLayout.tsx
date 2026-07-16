import { useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Home, Menu, Settings, Share2, TriangleAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import { Toast } from '@/components/ui/toast';
import { NavMenuDrawer } from '@/components/admin/NavMenuDrawer';
import { useCopyToast } from '../../hooks/useCopyToast';
import { canAccessPath, defaultPathFor, isScreenRole } from '../../utils/roles';
import { daysRemaining, graceHoursRemaining } from '../../utils/subscription';

export default function AdminLayout() {
  const { user, restaurant, loading, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { copy, toastMessage } = useCopyToast();
  const [menuOpen, setMenuOpen] = useState(false);

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
          <TextureButton variant="minimal" size="default" className="mt-6 !w-auto px-6" onClick={logout}>
            Cerrar sesión
          </TextureButton>
        </div>
      </div>
    );
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
      <main className="max-w-5xl mx-auto px-6 pt-10 pb-28">
        <Outlet />
      </main>

      {/* Dock flotante: única navegación del panel, siempre centrada abajo. */}
      <div className="fixed bottom-5 inset-x-0 z-30 flex justify-center pointer-events-none">
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
