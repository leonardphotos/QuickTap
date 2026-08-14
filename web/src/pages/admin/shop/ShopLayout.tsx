import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Home, Receipt, Boxes, Users, Settings, FileText, Landmark, ShoppingBag, CreditCard } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getShopRubro } from '@/data/shopRubros';
import { daysRemaining, graceHoursRemaining } from '@/utils/subscription';
import { TextureButton } from '@/components/ui/texture-button';
import { DailyRatesBadge } from '@/components/DailyRatesBadge';
import { QuoteManager } from '@/components/admin/QuoteManager';
import { useShopSession } from './shopSession';
import ShopDashboardPage from './ShopDashboardPage';
import ShopPosPage from './ShopPosPage';
import ShopOrdersPage from './ShopOrdersPage';
import ShopInventoryPage from './ShopInventoryPage';
import ShopCustomersPage from './ShopCustomersPage';
import ShopSettingsPage from './ShopSettingsPage';
import ShopReceivablesPage from './ShopReceivablesPage';
import ShopBillingPage from './ShopBillingPage';

export type ShopScreen = 'admin' | 'venta' | 'pedidos' | 'inventario' | 'clientes' | 'ajustes' | 'cotizaciones' | 'cuentas' | 'factura';

// Cotizaciones, Cuentas por Cobrar y Facturación no van en el dock flotante de celular (ya tiene
// 5 iconos, más lo dejaría apretado) — se llega a ellas desde los accesos de Inicio
// (ShopDashboardPage), el aviso de vencimiento de abajo y, en escritorio, estos botones extra.
const MORE_TABS: { id: ShopScreen; label: string; icon: typeof FileText }[] = [
  { id: 'cotizaciones', label: 'Cotizaciones', icon: FileText },
  { id: 'cuentas', label: 'Cuentas por Cobrar', icon: Landmark },
  { id: 'factura', label: 'Facturación', icon: CreditCard },
];

function getTabs(rubroId: string | undefined): { id: ShopScreen; label: string; icon: typeof Home }[] {
  return [
    { id: 'venta', label: 'Venta', icon: Receipt },
    { id: 'admin', label: 'Inicio', icon: Home },
    // Sí va en el dock aunque lo apriete a 6 iconos: un pedido de la tienda virtual que entra
    // y nadie ve no sirve de nada, y el dueño está en el celular la mayor parte del día.
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
 * sesión a través de props. En celular/tablet la navegación es un dock flotante y redondeado
 * (mismo patrón que el dock del panel de restaurante, ver AdminLayout.tsx); en escritorio se
 * muestra como pestañas dentro de la cabecera.
 */
export default function ShopLayout() {
  const { user, restaurant, logout } = useAuth();
  const [searchParams] = useSearchParams();
  // Entrada desde "Elegir plan" de la landing seguido de registro (?plan=SHOP&cycle=Y, o de
  // vuelta del checkout de Ramblay): arranca directo en Facturación en vez de Venta.
  const [screen, setScreen] = useState<ShopScreen>(() =>
    searchParams.get('plan') === 'SHOP' || searchParams.get('ramblay') === 'success' ? 'factura' : 'venta',
  );
  const rubro = getShopRubro(restaurant?.shopRubro);
  const session = useShopSession(rubro?.categories ?? []);
  const tabs = getTabs(rubro?.id);

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
  const daysLeft = daysRemaining(restaurant.periodEnd);
  const graceHours = graceHoursRemaining(restaurant.periodEnd);
  const showExpirationWarning = daysLeft <= 3;

  return (
    <div className="min-h-screen bg-[#fafafa]">
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

      <div className="sticky top-0 z-20 bg-white text-brand-950 pt-[env(safe-area-inset-top)] border-b border-brand-950/[0.06]">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[13px] font-bold tracking-tight truncate">{restaurant.name}</span>
            <span className="shrink-0 text-[8px] font-bold bg-brand-500/10 text-brand-500 px-1.5 py-0.5 rounded-full">SHOP</span>
          </div>

          {/* Escritorio: pestañas dentro de la cabecera (no hay dock flotante en lg+). */}
          <nav className="hidden lg:flex items-center gap-1 bg-brand-950/[0.05] p-1 rounded-full shrink-0">
            {[...tabs, ...MORE_TABS].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setScreen(t.id)}
                className={`text-[13px] font-semibold px-3.5 py-2 rounded-full transition-colors whitespace-nowrap ${
                  screen === t.id ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <DailyRatesBadge />
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-5 sm:px-6 py-5 pb-28 lg:pb-8">
        {screen === 'admin' && (
          <ShopDashboardPage session={session} restaurant={restaurant} canSeeMoney={canSeeMoney} userName={user.name} onNavigate={setScreen} />
        )}
        {screen === 'venta' && (
          <ShopPosPage session={session} restaurant={restaurant} rubro={rubro} />
        )}
        {screen === 'pedidos' && <ShopOrdersPage restaurant={restaurant} />}
        {screen === 'inventario' && <ShopInventoryPage session={session} rubro={rubro} restaurant={restaurant} />}
        {screen === 'clientes' && <ShopCustomersPage session={session} restaurant={restaurant} />}
        {screen === 'ajustes' && <ShopSettingsPage onBack={() => setScreen('admin')} session={session} />}
        {screen === 'factura' && <ShopBillingPage restaurant={restaurant} onDone={() => setScreen('admin')} />}
        {screen === 'cotizaciones' && <QuoteManager />}
        {screen === 'cuentas' && <ShopReceivablesPage />}
      </main>

      {/* Dock flotante y redondeado: mismo patrón visual que el dock del panel de restaurante
          (ver AdminLayout.tsx) — solo en celular/tablet, en escritorio la navegación vive en
          la cabecera. El carrito flotante de ShopPosPage se posiciona por encima de este dock. */}
      <div className="lg:hidden fixed bottom-5 inset-x-0 z-30 flex justify-center pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/90 backdrop-blur-md border border-brand-950/[0.08] shadow-lg shadow-brand-950/10 px-3 py-3">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = screen === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setScreen(t.id)}
                aria-label={t.label}
                title={t.label}
                className={`flex items-center justify-center h-11 w-11 rounded-full transition-colors ${
                  active ? 'bg-brand-950 text-white' : 'text-brand-950/60 hover:bg-brand-950/5'
                }`}
              >
                <Icon className="h-5 w-5" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
