import { lazy, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Boxes, CalendarDays, Home, Menu, Share2, TriangleAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import { Toast } from '@/components/ui/toast';
import { NavMenuDrawer } from '@/components/admin/NavMenuDrawer';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { CashSessionControl } from '@/components/admin/CashSessionControl';
import { TodayPaymentMethodsDialog } from '@/components/admin/TodayPaymentMethodsDialog';
import { LowStockAlert } from '@/components/admin/LowStockAlert';
import { NewOrderAlert } from '@/components/admin/NewOrderAlert';
import { OrderReadyToast } from '@/components/admin/OrderReadyToast';
import { LockScreen } from '@/components/admin/LockScreen';
import { HelpChatWidget } from '@/components/admin/HelpChatWidget';
import { useCopyToast } from '../../hooks/useCopyToast';
import { usePendingReservationsCount } from '../../hooks/usePendingReservations';
import { useLowStockItems } from '../../hooks/useLowStockItems';
import { useLockScreen } from '../../hooks/useLockScreen';
import { useIsLandscapeTablet } from '../../hooks/useIsLandscapeTablet';
import { RESTRICTED_ROLES, canAccessPath, defaultPathFor, isAdminCashier, isKioskRole, isNumeroRole, isScreenRole } from '../../utils/roles';
import { daysRemaining, graceHoursRemaining, hasFeature } from '../../utils/subscription';
import { visibleNavLinks } from './nav-links';

const WaiterLayout = lazy(() => import('./WaiterLayout'));
const LandscapeStaffLayout = lazy(() => import('./landscape/LandscapeStaffLayout'));
const ComandaKioskPage = lazy(() => import('./ComandaKioskPage'));
const NumeroPage = lazy(() => import('./NumeroPage'));
const ShopLayout = lazy(() => import('./shop/ShopLayout'));
const ClubLayout = lazy(() => import('./club/ClubLayout'));

export default function AdminLayout() {
  const { user, restaurant, loading, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { copy, toastMessage } = useCopyToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const pendingReservations = usePendingReservationsCount(user?.role, user?.cashierFullAccess);
  const lowStockItems = useLowStockItems(user?.role, user?.canAccessInventory, user?.cashierFullAccess);
  const lockScreen = useLockScreen();
  const isLandscapeTablet = useIsLandscapeTablet();

  if (loading) return <div className="p-10 text-center text-brand-950/50 font-light">Cargando…</div>;
  if (!user || !restaurant) return <Navigate to="/admin/login" replace />;

  // Pantalla de bloqueo: cubre TODO lo que cuelga de AdminLayout (Shop, Waiter, Screen,
  // Kiosco, Numero, panel normal — ver ramas debajo), porque se resuelve antes que cualquiera
  // de ellas. Va antes que "cuenta bloqueada" porque no depende de la suscripción: es una
  // verificación de identidad del dispositivo, no del estado de pago del restaurante.
  if (lockScreen.visible) {
    return <LockScreen mode={lockScreen.mode} onUnlock={lockScreen.unlock} />;
  }

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

  // Local comercial (retail): panel completamente distinto al de restaurante — ver
  // web/src/pages/admin/shop/ShopLayout.tsx. No pasa por canAccessPath/defaultPathFor (esas
  // asumen rutas de restaurante) ni por el resto de esta función; ShopLayout resuelve su
  // propia navegación interna (Panel administrativo / Venta / Inventario).
  if (restaurant.businessType === 'SHOP') {
    return <ShopLayout />;
  }

  // Club deportivo (canchas): mismo criterio que Locales — panel propio, con su
  // navegación interna (Calendario / Reservas / Acceso / Canchas).
  if (restaurant.businessType === 'SPORTS_CLUB') {
    return <ClubLayout />;
  }

  if (!canAccessPath(user.role, pathname, user.canAccessInventory, user.cashierFullAccess)) {
    return <Navigate to={defaultPathFor(user.role)} replace />;
  }

  // Pantalla (kiosco): sin cabecera ni navegación, solo el contenido a pantalla completa.
  // Sí necesita el aviso de pedido nuevo — es la única superficie de este rol para enterarse.
  if (isScreenRole(user.role)) {
    return (
      <div className="min-h-screen bg-white">
        <Outlet />
        <NewOrderAlert onNavigate={() => {}} />
      </div>
    );
  }

  // Comanda (kiosco de autoservicio): sin cabecera ni navegación, pantalla completa.
  if (isKioskRole(user.role)) {
    return (
      <div className="min-h-screen bg-white">
        <ComandaKioskPage />
      </div>
    );
  }

  // Numero: pantalla de solo lectura junto al mostrador, sin cabecera ni navegación.
  if (isNumeroRole(user.role)) {
    return (
      <div className="min-h-screen bg-white">
        <NumeroPage />
      </div>
    );
  }

  // Tablet real en horizontal (Mesero, o Cajero SIN acceso completo): sidebar de iconos + POS en
  // vez del layout móvil de siempre — ver useIsLandscapeTablet/LandscapeStaffLayout. Dueño/Admin
  // (y Cajero con acceso completo) en tablet horizontal siguen viendo el panel de escritorio
  // completo (no tiene sentido limitarlos a 4 pestañas). Mismo criterio de "reemplaza el Outlet
  // normal" que WaiterLayout debajo.
  if (isLandscapeTablet && (user.role === 'WAITER' || (user.role === 'CASHIER' && !user.cashierFullAccess))) {
    return <LandscapeStaffLayout />;
  }

  // Mesero: panel simplificado con pestañas arriba en vez del menú lateral/dock — ver
  // WaiterLayout. Reemplaza el <Outlet/> normal (ignora qué ruta /admin/* haya
  // matcheado; WaiterLayout renderiza sus propias pestañas internamente).
  if (user.role === 'WAITER') {
    return <WaiterLayout />;
  }

  // Mismo criterio que nav-links.ts: canAccessInventory solo aplica a roles restringidos
  // (Mesero/Cocina, y Cajero sin acceso completo); Dueño/Admin/Cajero-con-acceso-completo ven
  // Inventario si el plan lo incluye, sin depender de ese flag por-usuario.
  const cashierRestricted = user.role === 'CASHIER' && !user.cashierFullAccess;
  const canSeeInventory =
    ((!RESTRICTED_ROLES.includes(user.role) && !cashierRestricted) || user.canAccessInventory) &&
    (hasFeature(restaurant, 'inventoryBasic') || hasFeature(restaurant, 'inventoryRecipe'));
  const daysLeft = daysRemaining(restaurant.periodEnd);
  const graceHours = graceHoursRemaining(restaurant.periodEnd);
  const showExpirationWarning = daysLeft <= 3;
  const navLinks = visibleNavLinks(user.role, restaurant, user.canAccessInventory, user.cashierFullAccess);

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

      {/* Menú lateral: solo en pantallas anchas (tablet horizontal / escritorio) — en
          celular la navegación sigue siendo el dock flotante de abajo, más cómodo con el pulgar.
          Insumos por agotarse, compartir y abrir el menú (Ajustes/Cerrar sesión) viven ahí dentro,
          junto al perfil — no hace falta una barra de utilidades aparte arriba del contenido. */}
      <AdminSidebar
        navLinks={navLinks}
        pendingReservations={pendingReservations}
        lowStockItems={isAdminCashier(user.role, user.cashierFullAccess) ? lowStockItems : []}
        onShare={() => copy(`${window.location.origin}/r/${restaurant.slug}`, 'Enlace copiado')}
        onOpenMenu={() => setMenuOpen(true)}
      />

      <div className="lg:pl-[264px]">
        <main className="max-w-5xl lg:max-w-7xl mx-auto px-6 lg:px-8 pt-10 lg:pt-8 pb-28 lg:pb-12">
          {/* Cajero SIN acceso completo no ve Administración en absoluto (ver canAccessPath) —
              abrir/cerrar caja y ver movimientos del día por método de pago son las dos
              habilidades que conserva igual, así que van sueltas acá arriba en vez de perderse. */}
          {user.role === 'CASHIER' && !user.cashierFullAccess && (
            <div className="flex flex-wrap items-center gap-2 mb-6">
              <CashSessionControl />
              <TodayPaymentMethodsDialog />
            </div>
          )}
          <Outlet />
        </main>
      </div>

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
          {isAdminCashier(user.role, user.cashierFullAccess) && (
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
          {canSeeInventory && (
            <Link to="/admin/inventory" className="relative">
              <TextureButton variant="icon" size="icon" className="!h-11 !w-11" aria-label="Inventario">
                <Boxes className="h-5 w-5 text-brand-950/70" />
              </TextureButton>
              {isAdminCashier(user.role, user.cashierFullAccess) && lowStockItems.length > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                  {lowStockItems.length}
                </span>
              )}
            </Link>
          )}
          <TextureButton variant="icon" size="icon" className="!h-11 !w-11" aria-label="Abrir menú" onClick={() => setMenuOpen(true)}>
            <Menu className="h-5 w-5 text-brand-950/70" />
          </TextureButton>
        </div>
      </div>

      <NavMenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />

      <HelpChatWidget />

      <Toast message={toastMessage} />
      <LowStockAlert />
      {/* "Pedido Listo" es solo para Caja — Admin/Dueño no cobran ni despachan a diario, y
          verlo aquí solo distrae. Mesero tampoco lo ve (no está montado en WaiterLayout). */}
      {user.role === 'CASHIER' && <OrderReadyToast />}
      {/* Pedido nuevo que espera aceptación (mesa del cliente, o delivery/pickup): Caja/Admin/
          Dueño lo ven aquí para poder aceptarlo aunque estén con otro diálogo abierto. */}
      {isAdminCashier(user.role, user.cashierFullAccess) && <NewOrderAlert onNavigate={() => navigate('/admin')} />}
    </div>
  );
}
