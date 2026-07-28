import { useState } from 'react';
import { Receipt } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getShopRubro } from '@/data/shopRubros';
import { TextureButton } from '@/components/ui/texture-button';
import { ROLE_LABELS } from '@/utils/roles';
import { useShopSession } from './shopSession';
import ShopDashboardPage from './ShopDashboardPage';
import ShopPosPage from './ShopPosPage';
import ShopInventoryPage from './ShopInventoryPage';
import ShopCustomersPage from './ShopCustomersPage';
import ShopSettingsPage from './ShopSettingsPage';

type ShopScreen = 'admin' | 'venta' | 'inventario' | 'clientes' | 'ajustes';

function getTabs(rubroId: string | undefined): { id: ShopScreen; label: string }[] {
  return [
    { id: 'admin', label: 'Panel administrativo' },
    { id: 'inventario', label: rubroId === 'agencia_publicidad' ? 'Servicios' : 'Inventario' },
    { id: 'clientes', label: 'Clientes' },
  ];
}

/**
 * Panel de QuickTap Shop: reemplaza por completo la cabecera/navegación de restaurante
 * (AdminLayout ya interceptó el render antes de llegar acá — ver AdminLayout.tsx). Mantiene
 * el estado de la sesión (catálogo/carrito/ventas/caja) en un solo lugar vía useShopSession y
 * decide qué pantalla mostrar; las páginas son componentes "tontos" que solo leen/mutan esa
 * sesión a través de props.
 */
export default function ShopLayout() {
  const { user, restaurant, logout } = useAuth();
  const [screen, setScreen] = useState<ShopScreen>('admin');
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

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <div className="sticky top-0 z-20 bg-white border-b border-brand-950/[0.06]">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setScreen('ajustes')}
            className="flex items-center gap-3 min-w-0 text-left rounded-xl hover:bg-brand-950/[0.04] -mx-2 -my-1 px-2 py-1 transition-colors"
            title="Abrir Ajustes del negocio"
          >
            <img src={restaurant.logoUrl || '/logo/icono.png'} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-brand-950 truncate">{restaurant.name}</span>
                <span className="shrink-0 text-[10px] font-bold bg-brand-500/10 text-brand-500 px-2 py-0.5 rounded-full">Shop</span>
              </div>
              <span className="text-xs text-brand-950/40">{rubro.emoji} {rubro.label}</span>
            </div>
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            <nav className="flex items-center gap-1 bg-brand-950/[0.05] p-1 rounded-full">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setScreen(t.id)}
                  className={`text-[13px] font-semibold px-3.5 py-2 rounded-full transition-colors ${
                    screen === t.id ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
            {restaurant.exchangeRate && (
              <span className="text-xs font-semibold bg-brand-500/10 text-brand-500 px-3 py-2 rounded-full whitespace-nowrap">
                Bs {Number(restaurant.exchangeRate.rateBs).toFixed(2)}
              </span>
            )}
            <span className="text-xs font-medium text-brand-950/50 bg-brand-950/[0.05] px-3 py-2 rounded-full whitespace-nowrap">
              {ROLE_LABELS[user.role]}
            </span>
            {/* En celular el acceso a Venta es el botón flotante de abajo — acá solo se ve desde tablet/escritorio. */}
            <TextureButton
              variant="brand"
              size="lg"
              className="!w-auto hidden lg:inline-flex"
              onClick={() => setScreen('venta')}
            >
              <Receipt className="h-5 w-5" /> Venta
            </TextureButton>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-5 sm:px-6 py-6 pb-28 lg:pb-6">
        {screen === 'admin' && <ShopDashboardPage session={session} restaurant={restaurant} canSeeMoney={canSeeMoney} />}
        {screen === 'venta' && (
          <ShopPosPage session={session} restaurant={restaurant} rubro={rubro} onPaymentSuccess={() => setScreen('admin')} />
        )}
        {screen === 'inventario' && <ShopInventoryPage session={session} rubro={rubro} restaurant={restaurant} />}
        {screen === 'clientes' && <ShopCustomersPage session={session} restaurant={restaurant} />}
        {screen === 'ajustes' && <ShopSettingsPage onBack={() => setScreen('admin')} />}
      </main>

      {/* Botón flotante de Venta: solo en formato teléfono (< lg), y desaparece cuando ya estás
          en el panel de Venta (no tiene sentido un atajo hacia la pantalla en la que ya estás). */}
      {screen !== 'venta' && (
        <div className="lg:hidden fixed bottom-5 inset-x-0 z-30 flex justify-center pointer-events-none">
          <button
            type="button"
            onClick={() => setScreen('venta')}
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-brand-500 text-white font-semibold text-[15px] pl-5 pr-6 py-3.5 shadow-lg shadow-brand-500/30 active:scale-95 transition-transform"
          >
            <Receipt className="h-5 w-5" /> Venta
          </button>
        </div>
      )}
    </div>
  );
}
