import { lazy, Suspense, useState } from 'react';
import { Boxes, ChefHat, Grid2x2, LogOut, Receipt } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { hasFeature } from '../../utils/subscription';
import { LiveOrdersPanel } from '@/components/admin/LiveOrdersPanel';
import { TableServiceAlert } from '@/components/admin/TableServiceAlert';
import { NewOrderAlert } from '@/components/admin/NewOrderAlert';

const TableOrdersPage = lazy(() => import('./TableOrdersPage'));
const KitchenPage = lazy(() => import('./KitchenPage'));
const InventoryPage = lazy(() => import('./InventoryPage'));

type WaiterTab = 'mesas' | 'cocina' | 'comandas' | 'inventario';

/**
 * Panel simplificado para el rol Mesero: pestañas arriba en vez del menú lateral/dock
 * del resto del panel. Cada pestaña renderiza la página real sin modificarla (Mesas =
 * TableOrdersPage, Cocina = KitchenPage, Comandas = LiveOrdersPanel — el mismo widget
 * de "Pedidos" del Dashboard, ya filtrado por mesero — e Inventario = InventoryPage).
 */
export default function WaiterLayout() {
  const { user, restaurant, logout } = useAuth();
  const [tab, setTab] = useState<WaiterTab>('mesas');
  const [payOrderId, setPayOrderId] = useState<string | null>(null);

  if (!user || !restaurant) return null;

  const canSeeInventory =
    user.canAccessInventory && (hasFeature(restaurant, 'inventoryBasic') || hasFeature(restaurant, 'inventoryRecipe'));

  const tabs: { id: WaiterTab; label: string; icon: typeof Grid2x2 }[] = [
    { id: 'mesas', label: 'Mesas', icon: Grid2x2 },
    { id: 'cocina', label: 'Cocina', icon: ChefHat },
    { id: 'comandas', label: 'Comandas', icon: Receipt },
    ...(canSeeInventory ? [{ id: 'inventario' as const, label: 'Inventario', icon: Boxes }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-brand-950/[0.06] bg-white">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={restaurant.logoUrl || '/logo/icono.png'}
            alt=""
            className="h-8 w-8 rounded-full object-cover shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-brand-950 truncate">{restaurant.name}</p>
            <p className="text-xs text-brand-950/50 truncate">Mesero · {user.name}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-1.5 rounded-full border border-brand-950/10 bg-white px-3.5 py-2 text-xs font-medium text-brand-950/60 shrink-0"
        >
          <LogOut className="h-3.5 w-3.5" /> Salir
        </button>
      </header>

      <nav className="flex gap-1.5 px-3 py-2.5 bg-white border-b border-brand-950/[0.06] overflow-x-auto">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 px-2 text-xs font-medium transition-colors ${
                active ? 'bg-brand-500 text-white' : 'text-brand-950/50'
              }`}
            >
              <t.icon className="h-[19px] w-[19px]" />
              {t.label}
            </button>
          );
        })}
      </nav>

      <main className="px-4 py-4 pb-10">
        <Suspense fallback={<div className="p-10 text-center text-brand-950/30 font-light text-sm">Cargando…</div>}>
          {tab === 'mesas' && (
            <TableOrdersPage
              onPayOrder={(orderId) => {
                setPayOrderId(orderId);
                setTab('comandas');
              }}
            />
          )}
          {tab === 'cocina' && <KitchenPage />}
          {tab === 'comandas' && (
            <LiveOrdersPanel autoOpenPaymentOrderId={payOrderId} onAutoOpenHandled={() => setPayOrderId(null)} />
          )}
          {tab === 'inventario' && canSeeInventory && <InventoryPage />}
        </Suspense>
      </main>

      <TableServiceAlert />
      <NewOrderAlert onNavigate={() => setTab('comandas')} />
    </div>
  );
}
