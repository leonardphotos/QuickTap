import { lazy, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Boxes, CalendarDays, Home, Menu, PanelLeftOpen, Plus, Share2, TriangleAlert } from 'lucide-react';
import { api } from '../../api/client';
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
import { CreateOrderDialog } from '@/components/admin/CreateOrderDialog';
import { EditOrderDialog, type LiveOrder } from '@/components/admin/LiveOrdersPanel';
import { PaymentDialog } from '@/components/admin/PaymentDialog';
import { useCopyToast } from '../../hooks/useCopyToast';
import { usePendingReservationsCount } from '../../hooks/usePendingReservations';
import { usePushRegistration } from '../../hooks/usePushRegistration';
import { useLowStockItems } from '../../hooks/useLowStockItems';
import { useLockScreen } from '../../hooks/useLockScreen';
import { useIsLandscapeTablet } from '../../hooks/useIsLandscapeTablet';
import {
  RESTRICTED_ROLES,
  canAccessPath,
  defaultPathFor,
  isAdminCashier,
  isCanchaRole,
  isKioskRole,
  isNumeroRole,
  isScreenRole,
  isWaiterTabletRole,
} from '../../utils/roles';
import { daysRemaining, graceHoursRemaining, hasFeature } from '../../utils/subscription';
import { visibleNavLinks } from './nav-links';
import { useSyncConflictsCount } from '@/hooks/useSyncConflicts';
import { ConnectivityBanner } from '@/components/admin/ConnectivityBanner';
import { VersionBanner } from '@/components/admin/VersionBanner';
import { AiReportsButton } from '@/components/admin/AiReportsButton';

const WaiterLayout = lazy(() => import('./WaiterLayout'));
const LandscapeStaffLayout = lazy(() => import('./landscape/LandscapeStaffLayout'));
const ComandaKioskPage = lazy(() => import('./ComandaKioskPage'));
const NumeroPage = lazy(() => import('./NumeroPage'));
const WaiterTabletPage = lazy(() => import('./WaiterTabletPage').then((m) => ({ default: m.WaiterTabletPage })));
const ShopLayout = lazy(() => import('./shop/ShopLayout'));
const OfficeLayout = lazy(() => import('./office/OfficeLayout'));
const ClubLayout = lazy(() => import('./club/ClubLayout'));
const CoachLayout = lazy(() => import('./club/CoachLayout'));
const ClubTabletPage = lazy(() => import('./club/ClubTabletPage'));

export default function AdminLayout() {
  const { user, restaurant, loading, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { copy, toastMessage } = useCopyToast();
  // Arriba de cualquier return condicional: un hook no puede llamarse a veces sí y a veces no.
  const syncConflicts = useSyncConflictsCount(user?.role, user?.cashierFullAccess);
  const [menuOpen, setMenuOpen] = useState(false);
  // Menú lateral oculto a voluntad (escritorio/iPad horizontal): se recuerda entre
  // navegaciones para que no reaparezca en cada cambio de pestaña.
  const [sidebarHidden, setSidebarHidden] = useState(() => localStorage.getItem('qt-sidebar-hidden') === '1');
  function toggleSidebar() {
    setSidebarHidden((h) => {
      const next = !h;
      localStorage.setItem('qt-sidebar-hidden', next ? '1' : '0');
      return next;
    });
  }
  usePushRegistration();
  const pendingReservations = usePendingReservationsCount(user?.role, user?.cashierFullAccess);
  const lowStockItems = useLowStockItems(user?.role, user?.canAccessInventory, user?.cashierFullAccess);
  const lockScreen = useLockScreen();
  const isLandscapeTablet = useIsLandscapeTablet();

  // "Crear pedido" global (botón + verde del dock de celular): igual que en WaiterLayout, vive
  // acá arriba de todo para poder abrirse desde cualquier pestaña del panel, no solo desde el
  // Dashboard — antes solo existía como botón suelto en Resumen, atado a LiveOrdersPanel.
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [existingOrders, setExistingOrders] = useState<LiveOrder[]>([]);
  const [editingOrder, setEditingOrder] = useState<LiveOrder | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<{ order: LiveOrder; mode: 'full' | 'split' } | null>(null);
  function loadExistingOrders() {
    api.get('/orders/live').then((res) => setExistingOrders(res.data.data));
  }
  function openCreateOrder() {
    loadExistingOrders();
    setCreateOrderOpen(true);
  }

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
  // Vertical Administrativo: contabilidad multi-empresa. Mismo criterio que Locales y Club —
  // panel propio, con su navegación interna (Panel / Asientos / Cuentas / Reportes).
  if (restaurant.businessType === 'ADMIN_OFFICE') {
    return <OfficeLayout />;
  }

  if (restaurant.businessType === 'SPORTS_CLUB') {
    // Tablet fija de una cancha: kiosco a pantalla completa, sin nada del panel.
    // Va antes que ClubLayout porque este rol no tiene panel que mostrar.
    if (isCanchaRole(user.role)) {
      return <ClubTabletPage />;
    }
    // Profesor de academia: su propio portal, con alcance solo a lo suyo. Va antes
    // que ClubLayout porque no debe ver el panel del club (caja, reservas, ajustes).
    if (user.role === 'COACH') {
      return <CoachLayout />;
    }
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

  // Tablet de meseros: sin cabecera ni navegación, solo el teclado de 4 dígitos a pantalla
  // completa — la propia página ya arranca en fixed inset-0, no necesita el contenido normal
  // del Outlet (esta ES la pantalla dedicada, no una ruta más dentro del panel).
  if (isWaiterTabletRole(user.role)) {
    return <WaiterTabletPage />;
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
  const navLinks = visibleNavLinks(user.role, restaurant, user.canAccessInventory, user.cashierFullAccess, syncConflicts);
  const canCreateOrder = isAdminCashier(user.role, user.cashierFullAccess);

  // Dock flotante de celular: se arma como lista (en vez de JSX fijo) para poder insertar el
  // botón verde "Crear pedido" justo en el medio de los íconos, sin importar cuáles de los
  // condicionales (Volver/Reservas/Inventario) terminen apareciendo.
  const dockItems: { key: string; node: React.ReactNode }[] = [
    {
      key: 'home',
      node: (
        <Link to="/admin">
          <TextureButton variant="icon" size="icon" className="!h-11 !w-11" aria-label="Inicio">
            <Home className="h-5 w-5 text-brand-950/70" />
          </TextureButton>
        </Link>
      ),
    },
  ];
  if (pathname !== '/admin') {
    dockItems.push({
      key: 'back',
      node: (
        <TextureButton variant="icon" size="icon" className="!h-11 !w-11" aria-label="Regresar" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5 text-brand-950/70" />
        </TextureButton>
      ),
    });
  }
  dockItems.push({
    key: 'share',
    node: (
      <TextureButton
        variant="icon"
        size="icon"
        className="!h-11 !w-11"
        aria-label="Compartir enlace del menú"
        onClick={() => copy(`${window.location.origin}/r/${restaurant.slug}`, 'Enlace copiado')}
      >
        <Share2 className="h-5 w-5 text-brand-950/70" />
      </TextureButton>
    ),
  });
  if (isAdminCashier(user.role, user.cashierFullAccess)) {
    dockItems.push({
      key: 'reservations',
      node: (
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
      ),
    });
  }
  if (canSeeInventory) {
    dockItems.push({
      key: 'inventory',
      node: (
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
      ),
    });
  }
  if (canCreateOrder) {
    dockItems.splice(Math.ceil(dockItems.length / 2), 0, {
      key: 'create-order',
      node: (
        <TextureButton variant="success" size="icon" className="!h-12 !w-12" aria-label="Crear pedido" onClick={openCreateOrder}>
          <Plus className="h-5 w-5" strokeWidth={2.5} />
        </TextureButton>
      ),
    });
  }

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

      {/* Menú hamburguesa de celular: botón suelto arriba a la derecha, sin barra ni logo —
          en pantallas anchas lo reemplaza el menú lateral. */}
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        aria-label="Abrir menú"
        className="lg:hidden fixed top-4 right-4 z-30 h-9 w-9 rounded-full bg-white border border-brand-950/10 flex items-center justify-center shadow-sm"
      >
        <Menu className="h-4.5 w-4.5 text-brand-950/70" />
      </button>

      {/* Menú lateral: solo en pantallas anchas (tablet horizontal / escritorio) — en
          celular la navegación sigue siendo el dock flotante de abajo, más cómodo con el pulgar.
          Insumos por agotarse, compartir y abrir el menú (Ajustes/Cerrar sesión) viven ahí dentro,
          junto al perfil — no hace falta una barra de utilidades aparte arriba del contenido.
          Siempre montado (nunca se desmonta) para poder deslizarlo con una transición en vez de
          aparecer/desaparecer de golpe; oculto se saca de foco/tabulación con `inert`. */}
      <AdminSidebar
        navLinks={navLinks}
        pendingReservations={pendingReservations}
        lowStockItems={isAdminCashier(user.role, user.cashierFullAccess) ? lowStockItems : []}
        onShare={() => copy(`${window.location.origin}/r/${restaurant.slug}`, 'Enlace copiado')}
        onOpenMenu={() => setMenuOpen(true)}
        onHide={toggleSidebar}
        hidden={sidebarHidden}
        onCreateOrder={canCreateOrder ? openCreateOrder : null}
      />

      {/* Con el menú oculto: botón flotante para volver a mostrarlo (solo en pantallas anchas,
          donde existe el menú lateral; en celular la navegación es el dock de abajo). Entra con
          una pequeña aparición (fade + subida) en vez de aparecer de golpe. */}
      {sidebarHidden && (
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Mostrar menú lateral"
          title="Mostrar menú lateral"
          style={{ animation: 'var(--animate-rise)' }}
          className="hidden lg:flex motion-reduce:!opacity-100 fixed top-5 left-5 z-40 items-center justify-center h-10 w-10 rounded-xl bg-brand-950 text-white/80 hover:text-white shadow-lg shadow-brand-950/20 hover:bg-brand-900 transition-colors"
        >
          <PanelLeftOpen className="h-[18px] w-[18px]" />
        </button>
      )}

      {/* Con el menú oculto, el contenido recupera el ancho completo; en pantallas grandes se le
          deja un poco más de margen superior (lg:pt-20 más abajo) para que el título de cada
          página no quede pegado al botón flotante de arriba. La transición del padding acompaña
          la del menú lateral, para que ambos se sientan como un solo movimiento. */}
      <div
        className={`transition-[padding-left] duration-300 ease-out motion-reduce:transition-none ${
          sidebarHidden ? 'lg:pl-0' : 'lg:pl-[264px]'
        }`}
      >
        <VersionBanner />
        <AiReportsButton />
        <ConnectivityBanner />
        <main
          className={`max-w-5xl lg:max-w-7xl mx-auto px-6 lg:px-8 pt-10 pb-28 lg:pb-12 transition-[padding-top] duration-300 ease-out motion-reduce:transition-none ${
            sidebarHidden ? 'lg:pt-20' : 'lg:pt-8'
          }`}
        >
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

      {/* Dock flotante: navegación en celular/tablet vertical (la barra superior fija ya cubre logo +
          menú; este dock es para las acciones frecuentes — Inicio, Compartir, etc. — más el botón
          verde de "Crear pedido" en el centro). */}
      <div className="lg:hidden fixed bottom-5 inset-x-0 z-30 flex justify-center pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-white/90 backdrop-blur-md border border-brand-950/[0.08] shadow-lg shadow-brand-950/10 px-3 py-3">
          {dockItems.map((item) => (
            <div key={item.key}>{item.node}</div>
          ))}
        </div>
      </div>

      <NavMenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />

      <Toast message={toastMessage} />
      <LowStockAlert />
      {/* "Pedido Listo" es solo para Caja — Admin/Dueño no cobran ni despachan a diario, y
          verlo aquí solo distrae. Mesero tampoco lo ve (no está montado en WaiterLayout). */}
      {user.role === 'CASHIER' && <OrderReadyToast />}
      {/* Pedido nuevo que espera aceptación (mesa del cliente, o delivery/pickup): Caja/Admin/
          Dueño lo ven aquí para poder aceptarlo aunque estén con otro diálogo abierto. */}
      {isAdminCashier(user.role, user.cashierFullAccess) && <NewOrderAlert onNavigate={() => navigate('/admin')} />}

      {/* "Crear pedido" global (botón verde del dock): mismo wizard de 3 pasos que en
          WaiterLayout, disponible desde cualquier pestaña del panel. */}
      {createOrderOpen && (
        <CreateOrderDialog
          existingOrders={existingOrders}
          onClose={() => setCreateOrderOpen(false)}
          onCreated={(newOrder, paymentMode) => {
            setCreateOrderOpen(false);
            if (newOrder && paymentMode) setPaymentDialog({ order: newOrder, mode: paymentMode });
          }}
          onSelectExisting={(orderId) => {
            setCreateOrderOpen(false);
            const target = existingOrders.find((o) => o.id === orderId);
            if (target) setEditingOrder(target);
          }}
        />
      )}

      {editingOrder && (
        <EditOrderDialog order={editingOrder} onClose={() => setEditingOrder(null)} onSaved={loadExistingOrders} />
      )}

      {paymentDialog && (
        <PaymentDialog
          order={paymentDialog.order}
          mode={paymentDialog.mode}
          onClose={() => setPaymentDialog(null)}
          onPaid={loadExistingOrders}
        />
      )}
    </div>
  );
}
