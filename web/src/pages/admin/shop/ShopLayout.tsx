import { useState } from 'react';
import { PanelLeftOpen } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Landmark, Menu, ShieldCheck, Boxes, Building2, Calculator, FileText, Home, Lock, Receipt, Settings, ShoppingBag, Users, Wallet } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getShopRubro } from '@/data/shopRubros';
import { TextureButton } from '@/components/ui/texture-button';
import { DailyRatesBadge } from '@/components/DailyRatesBadge';
import { useShopSession } from './shopSession';
import ShopDashboardPage from './ShopDashboardPage';
import ShopPosPage from './ShopPosPage';
import ShopOrdersPage from './ShopOrdersPage';
import ShopInventoryPage from './ShopInventoryPage';
import { CrmHub } from '@/components/admin/crm/CrmHub';
import ShopSettingsPage from './ShopSettingsPage';
import ShopApprovalsPage from './ShopApprovalsPage';
import ShopPassPage from './ShopPassPage';
import { ShopSidebar, type ShopSidebarTab } from './ShopSidebar';
import { PLAN_LABELS } from '@/pages/admin/nav-links';
import ShopBillingPage from './ShopBillingPage';
import { PlanUpgradeNotice } from '@/components/admin/PlanUpgradeNotice';
import { allowsBranches, daysRemaining, graceHoursRemaining, hasFeature, type FeatureFlag } from '@/utils/subscription';
import ShopSucursalesPage from './ShopSucursalesPage';
import ShopAdministracionPage, { type ShopAdminTab } from './ShopAdministracionPage';
import { ShopNavDrawer } from './ShopNavDrawer';

// 'cotizaciones' y 'cuentas' siguen acá aunque ya no sean pantallas propias: son los accesos
// de Inicio, y irA() los traduce a Administración parada en esa pestaña. Los demás destinos
// administrativos se sacaron del tipo a propósito — navegar a uno ahora no compila, en vez de
// dejar la pantalla en blanco.
export type ShopScreen =
  | 'admin'
  | 'administracion'
  | 'venta'
  | 'pedidos'
  | 'inventario'
  | 'clientes'
  | 'ajustes'
  | 'cotizaciones'
  | 'cuentas'
  | 'sucursales'
  | 'factura'
  | 'pass'
  | 'solicitudes';

// Pantallas que no son de operación diaria. En escritorio salen en la cabecera; en celular,
// en el menú lateral junto con las demás.
// `feature` marca las pantallas de Elite Shop: con el plan Shop base se ven (con candado)
// pero abren el aviso de mejora — así el dueño sabe qué gana al subir de plan.
const MORE_TABS: { id: ShopScreen; label: string; icon: typeof FileText; feature?: FeatureFlag | 'branches' }[] = [
  // Estadísticas, Ventas por unidad, Gastos, Compras, Cotizaciones, Cuentas por Cobrar,
  // Órdenes de pago, Contabilidad y Cuentas bancarias ya no van sueltas acá: viven dentro de
  // Administración, igual que en restaurantes. Antes la lista mezclaba las pantallas de
  // operación diaria con las de cierre de mes, y quien entraba a facturar tenía delante las
  // dos cosas. Las que quedan no son administración: Pass es el portal del comprador,
  // Solicitudes son aprobaciones del día y Sucursales es su propio nivel (en restaurantes
  // también vive fuera de Administración).
  { id: 'administracion', label: 'Administración', icon: Calculator },
  // Acceso directo: abre Administración parada en su pestaña (ver irA). Se lista aparte
  // porque es lo que más se consulta desde el mostrador y no vale hacer dos toques.
  { id: 'cuentas', label: 'Cuentas por cobrar', icon: Landmark },
  { id: 'pass', label: 'QuickTap Pass', icon: Wallet },
  { id: 'solicitudes', label: 'Solicitudes', icon: ShieldCheck },
  { id: 'sucursales', label: 'Sucursales', icon: Building2, feature: 'branches' },
];

function getTabs(rubroId: string | undefined): { id: ShopScreen; label: string; icon: typeof Home }[] {
  return [
    { id: 'venta', label: 'Venta', icon: Receipt },
    { id: 'admin', label: 'Inicio', icon: Home },
    { id: 'pedidos', label: 'Pedidos', icon: ShoppingBag },
    { id: 'inventario', label: rubroId === 'agencia_publicidad' ? 'Servicios' : 'Inventario', icon: Boxes },
    { id: 'clientes', label: 'Clientes', icon: Users },
    { id: 'ajustes', label: 'Ajustes', icon: Settings },
  ];
}

/**
 * Panel de QuickTap Shop: reemplaza por completo la cabecera/navegación de restaurante
 * (AdminLayout ya interceptó el render antes de llegar acá — ver AdminLayout.tsx). Mantiene
 * el estado de la sesión (catálogo/carrito/ventas/caja) en un solo lugar vía useShopSession y
 * decide qué pantalla mostrar; las páginas son componentes "tontos" que solo leen/mutan esa
 * sesión a través de props. En celular/tablet la navegación es un menú lateral desplegable
 * (ShopNavDrawer) que se abre desde la cabecera; en escritorio se
 * muestra como pestañas dentro de la cabecera.
 */
export default function ShopLayout() {
  const { user, restaurant, logout, switchToParent } = useAuth();
  const [searchParams] = useSearchParams();
  // Entrada desde "Elegir plan" de la landing seguido de registro (?plan=SHOP&cycle=Y, o de
  // vuelta del checkout de Ramblay): arranca directo en Facturación en vez de Venta.
  const [screen, setScreen] = useState<ShopScreen>(() =>
    ['SHOP', 'ELITE_SHOP'].includes(searchParams.get('plan') ?? '') || searchParams.get('ramblay') === 'success'
      ? 'factura'
      : 'venta',
  );
  const rubro = getShopRubro(restaurant?.shopRubro);
  const session = useShopSession(rubro?.categories ?? []);
  const [adminTab, setAdminTab] = useState<ShopAdminTab>('estadisticas');
  const [menuOpen, setMenuOpen] = useState(false);
  /** Pedido abierto que se está retomando en la pantalla de Venta (ver ShopOpenOrder). */
  const [pedidoAbierto, setPedidoAbierto] = useState<{ id: string; label: string } | null>(null);

  /**
   * Cotizaciones y Cuentas por Cobrar se mudaron dentro de Administración, pero siguen siendo
   * accesos de Inicio: en vez de dejar esos botones muertos, abren Administración ya parada en
   * su pestaña.
   */
  function irA(destino: ShopScreen) {
    if (destino === 'cotizaciones' || destino === 'cuentas') {
      setAdminTab(destino);
      setScreen('administracion');
      return;
    }
    setScreen(destino);
  }
  const tabs = getTabs(rubro?.id);

  // Menú lateral (solo pantallas anchas), espejo del panel de restaurantes. Va acá arriba, antes
  // de los retornos tempranos de abajo: un hook después de un `return` se saltea en algunos
  // renders y React rompe con "rendered more hooks than during the previous render".
  const [sidebarHidden, setSidebarHidden] = useState(() => localStorage.getItem('qt-shop-sidebar-hidden') === '1');
  function toggleSidebar() {
    setSidebarHidden((prev) => {
      const next = !prev;
      localStorage.setItem('qt-shop-sidebar-hidden', next ? '1' : '0');
      return next;
    });
  }

  if (!user || !restaurant) return null;

  if (!rubro) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa] px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold text-brand-950 mb-2">No se encontró el rubro de este negocio</h1>
          <p className="text-sm text-brand-950/50 font-light mb-6">
            Esta cuenta quedó marcada como Local Comercial pero no tiene un rubro válido asignado.
          </p>
          <TextureButton variant="minimal" size="default" className="!w-auto" onClick={logout}>
            Cerrar sesión
          </TextureButton>
        </div>
      </div>
    );
  }

  if (session.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
        <p className="text-sm text-brand-950/40 font-light">Cargando…</p>
      </div>
    );
  }

  const canSeeMoney = user.role === 'OWNER' || user.role === 'ADMIN';
  const isEliteShop = restaurant.subscriptionPlan === 'ELITE_SHOP';
  const canBranches = allowsBranches(restaurant.subscriptionPlan);
  // Una sucursal no ve la pestaña Sucursales (no puede tener las suyas); solo Dueño/Admin.
  const moreTabs = MORE_TABS.filter((t) => t.id !== 'sucursales' || (canSeeMoney && !restaurant.parentRestaurantId));
  const isLocked = (t: (typeof MORE_TABS)[number]) =>
    t.feature === 'branches' ? !canBranches : t.feature ? !hasFeature(restaurant, t.feature) : false;
  const daysLeft = daysRemaining(restaurant.periodEnd);
  const graceHours = graceHoursRemaining(restaurant.periodEnd);
  const showExpirationWarning = daysLeft <= 3;


  const sidebarTabs: ShopSidebarTab[] = [
    ...tabs.map((t) => ({ ...t, locked: false })),
    ...moreTabs.map((t) => ({ ...t, locked: isLocked(t) })),
  ];
  const planLabel = restaurant.subscriptionPlan
    ? (PLAN_LABELS[restaurant.subscriptionPlan] ?? restaurant.subscriptionPlan)
    : null;
  // Cocina no vende; el resto de los roles del local sí.
  const puedeVender = user.role !== 'KITCHEN';

  // 'cuentas' no es una pantalla propia sino una pestaña de Administración: para que el menú
  // resalte la fila correcta hay que traducirlo acá, si no siempre se vería activa Administración.
  const screenActivo: ShopScreen = screen === 'administracion' && adminTab === 'cuentas' ? 'cuentas' : screen;

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <ShopSidebar
        tabs={sidebarTabs}
        screen={screenActivo}
        onSelect={irA}
        businessName={restaurant.name}
        logoUrl={restaurant.logoUrl}
        planLabel={planLabel}
        userName={user.name}
        userRole={user.role}
        onHide={toggleSidebar}
        hidden={sidebarHidden}
        onShare={() => {
          navigator.clipboard?.writeText(`${window.location.origin}/tienda/${restaurant.slug}`);
        }}
        onOpenMenu={() => setScreen('ajustes')}
        onCreateOrder={puedeVender ? () => setScreen('venta') : null}
      />

      {/* Con el menú oculto: botón para devolverlo, igual que en el panel de restaurantes. */}
      {sidebarHidden && (
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Mostrar menú lateral"
          title="Mostrar menú lateral"
          className="fixed left-4 top-4 z-40 hidden h-10 w-10 items-center justify-center rounded-xl bg-brand-950 text-white shadow-lg lg:flex"
        >
          <PanelLeftOpen className="h-[18px] w-[18px]" />
        </button>
      )}

      {showExpirationWarning && (
        <button
          type="button"
          onClick={() => setScreen('factura')}
          className="block w-full bg-amber-400 text-amber-950 text-sm font-medium text-center py-2 px-4 hover:bg-amber-300 transition-colors"
        >
          {graceHours !== null
            ? `Hoy vence tu plan. Tienes ${graceHours}h para pagar antes de que se bloquee tu cuenta.`
            : `En ${daysLeft} día${daysLeft === 1 ? '' : 's'} vence tu plan. Actívalo aquí.`}
        </button>
      )}

      <div className={`sticky top-0 z-20 bg-white text-brand-950 pt-[env(safe-area-inset-top)] border-b border-brand-950/[0.06] transition-[padding] duration-300 ${sidebarHidden ? "lg:pl-0" : "lg:pl-[264px]"}`}>
        <div className="max-w-7xl mx-auto px-5 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Abre el menú lateral: en celular es la única puerta a todas las pantallas. */}
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menú"
              className="-ml-1.5 mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-brand-950 hover:bg-brand-950/[0.05] lg:hidden"
            >
              <Menu className="h-[20px] w-[20px]" />
            </button>
            <span className="text-[13px] font-bold tracking-tight truncate">{restaurant.name}</span>
            <span className="shrink-0 text-[8px] font-bold bg-brand-500/10 text-brand-500 px-1.5 py-0.5 rounded-full">
              {isEliteShop ? 'ELITE SHOP' : 'SHOP'}
            </span>
            {restaurant.parentRestaurantId && (
              <button
                type="button"
                onClick={switchToParent}
                className="shrink-0 rounded-full border border-brand-950/15 px-2 py-0.5 text-[10px] font-semibold text-brand-950/60 hover:bg-brand-950/[0.04]"
              >
                ← Sede principal
              </button>
            )}
          </div>

          {/* Escritorio: pestañas dentro de la cabecera (en celular manda el menú lateral). */}
          <nav className="hidden items-center gap-1 bg-brand-950/[0.05] p-1 rounded-full min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[...tabs.map((t) => ({ ...t, locked: false })), ...moreTabs.map((t) => ({ ...t, locked: isLocked(t) }))].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => irA(t.id)}
                className={`text-[13px] font-semibold px-3.5 py-2 rounded-full transition-colors whitespace-nowrap ${
                  screenActivo === t.id ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
                }`}
              >
                <span className={t.locked ? 'opacity-60' : ''}>{t.label}</span>
                {t.locked && <Lock className="ml-1 inline h-3 w-3 text-brand-950/35" />}
              </button>
            ))}
          </nav>

          <DailyRatesBadge />
        </div>
      </div>

      <main className={`max-w-7xl mx-auto px-5 sm:px-6 py-5 pb-8 transition-[padding] duration-300 ${sidebarHidden ? "lg:pl-5" : "lg:pl-[284px]"}`}>
        {screen === 'admin' && (
          <ShopDashboardPage session={session} restaurant={restaurant} canSeeMoney={canSeeMoney} userName={user.name} />
        )}
        {screen === 'venta' && (
          <ShopPosPage
            session={session}
            restaurant={restaurant}
            rubro={rubro}
            pedidoAbierto={pedidoAbierto}
            onPedidoAbiertoChange={setPedidoAbierto}
          />
        )}
        {screen === 'pedidos' && (
          <ShopOrdersPage
            restaurant={restaurant}
            onRetomarPedido={(p) => {
              // El carrito guardado vuelve tal cual y la pantalla salta a Venta: retomar un
              // pedido es seguir vendiéndolo, no revisarlo.
              session.reemplazarCarrito(p.items as never);
              setPedidoAbierto({ id: p.id, label: p.label });
              setScreen('venta');
            }}
          />
        )}
        {screen === 'inventario' && <ShopInventoryPage session={session} rubro={rubro} restaurant={restaurant} />}
        {screen === 'clientes' && (
          <div className="flex flex-col gap-5">
            <h1 className="text-[20px] font-bold tracking-tight text-brand-950">Clientes</h1>
            <CrmHub />
          </div>
        )}
        {screen === 'solicitudes' && <ShopApprovalsPage />}
        {screen === 'administracion' && (
          <ShopAdministracionPage
            restaurant={restaurant}
            session={session}
            onGoToBilling={() => setScreen('factura')}
            tab={adminTab}
            onTabChange={setAdminTab}
          />
        )}
        {screen === 'ajustes' && <ShopSettingsPage onBack={() => setScreen('admin')} session={session} />}
        {screen === 'factura' && <ShopBillingPage restaurant={restaurant} onDone={() => setScreen('admin')} />}
        {screen === 'pass' && <ShopPassPage />}
        {screen === 'sucursales' && !canBranches && (
          <PlanUpgradeNotice feature="Sucursales" onGoToBilling={() => setScreen('factura')} />
        )}
        {screen === 'sucursales' && canBranches && <ShopSucursalesPage />}
      </main>

      <ShopNavDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        principales={tabs.map((t) => ({ ...t, locked: false }))}
        secundarios={moreTabs.map((t) => ({ ...t, locked: isLocked(t) }))}
        activo={screenActivo}
        onNavigate={irA}
      />
    </div>
  );
}
