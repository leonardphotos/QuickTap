import { ActiveOrdersPreview } from '@/components/admin/ActiveOrdersPreview';
import { CreateOrderDialog } from '@/components/admin/CreateOrderDialog';
import { HelpChatWidget } from '@/components/admin/HelpChatWidget';
import { EditOrderDialog,LiveOrdersPanel } from '@/components/admin/LiveOrdersPanel';
import { type LiveOrder } from '@/components/admin/LiveOrdersPanel.shared';
import { LowStockAlert } from '@/components/admin/LowStockAlert';
import { NewOrderAlert } from '@/components/admin/NewOrderAlert';
import { PaymentDialog } from '@/components/admin/PaymentDialog';
import { TableServiceAlert } from '@/components/admin/TableServiceAlert';
import { WaiterProfilePicker } from '@/components/admin/WaiterProfilePicker';
import { TextureButton } from '@/components/ui/texture-button';
import { CHATBOTS_ENABLED } from '@/config/features';
import { Boxes,ChefHat,Grid2x2,LogOut,Plus,Receipt,Users } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { lazy,Suspense,useRef,useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext.shared';
import { useLowStockItems } from '../../hooks/useLowStockItems';
import { hasFeature } from '../../utils/subscription';

const TableOrdersPage = lazy(() => import('./TableOrdersPage'));
const KitchenPage = lazy(() => import('./KitchenPage'));
const InventoryPage = lazy(() => import('./InventoryPage'));

type WaiterTab = 'mesas' | 'cocina' | 'comandas' | 'inventario';

// Botón flotante "Nuevo pedido": el mesero lo puede arrastrar a donde le quede
// más cómodo (una mano, una zona sin tapar la mesa que está mirando, etc.) — la
// posición se guarda en localStorage por dispositivo.
const FAB_SIZE = 64;
const FAB_MARGIN = 8;
const FAB_STORAGE_KEY = 'qt_waiter_fab_pos';

function clampFabPosition(left: number, top: number) {
  const maxLeft = Math.max(FAB_MARGIN, window.innerWidth - FAB_SIZE - FAB_MARGIN);
  const maxTop = Math.max(FAB_MARGIN, window.innerHeight - FAB_SIZE - FAB_MARGIN);
  return { left: Math.min(Math.max(FAB_MARGIN, left), maxLeft), top: Math.min(Math.max(FAB_MARGIN, top), maxTop) };
}

function loadFabPosition() {
  try {
    const saved = localStorage.getItem(FAB_STORAGE_KEY);
    if (saved) return JSON.parse(saved) as { left: number; top: number };
  } catch {
    // localStorage corrupto o inaccesible: se usa la posición por defecto.
  }
  return clampFabPosition(20, window.innerHeight - FAB_SIZE - 20);
}

/**
 * Panel simplificado para el rol Mesero: pestañas arriba en vez del menú lateral/dock
 * del resto del panel. Cada pestaña renderiza la página real sin modificarla (Mesas =
 * TableOrdersPage, Cocina = KitchenPage, Comandas = LiveOrdersPanel — el mismo widget
 * de "Pedidos" del Dashboard, ya filtrado por mesero — e Inventario = InventoryPage).
 */
export default function WaiterLayout() {
  const { user, restaurant, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<WaiterTab>('comandas');
  // Segundo inicio de sesión: "Cambiar" reabre la misma cuadrícula de perfiles del login,
  // usando la sesión ya activa (no hace falta correo/clave de nuevo) para elegir a otro mesero.
  const [switchingUser, setSwitchingUser] = useState(false);
  const [existingOrders, setExistingOrders] = useState<LiveOrder[]>([]);
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<LiveOrder | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<{ order: LiveOrder; mode: 'full' | 'split' } | null>(null);
  const [fabPos, setFabPos] = useState(loadFabPosition);
  const fabDrag = useRef<{ startX: number; startY: number; startLeft: number; startTop: number; moved: boolean } | null>(
    null,
  );
  // Antes del `return null`: si se llamara después, al cerrar sesión (user pasa a null)
  // React renderizaría menos hooks que en el render anterior y el panel truena.
  const lowStockItems = useLowStockItems(user?.role, user?.canAccessInventory);

  if (!user || !restaurant) return null;

  function loadExistingOrders() {
    api.get('/orders/live').then((res) => setExistingOrders(res.data.data));
  }

  function openCreateOrder() {
    loadExistingOrders();
    setCreateOrderOpen(true);
  }

  function handleFabPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    fabDrag.current = { startX: e.clientX, startY: e.clientY, startLeft: fabPos.left, startTop: fabPos.top, moved: false };
  }

  function handleFabPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const drag = fabDrag.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) setFabPos(clampFabPosition(drag.startLeft + dx, drag.startTop + dy));
  }

  function handleFabPointerUp() {
    const drag = fabDrag.current;
    fabDrag.current = null;
    if (drag?.moved) {
      setFabPos((pos) => {
        localStorage.setItem(FAB_STORAGE_KEY, JSON.stringify(pos));
        return pos;
      });
    } else {
      openCreateOrder();
    }
  }

  const canSeeInventory =
    user.canAccessInventory && (hasFeature(restaurant, 'inventoryBasic') || hasFeature(restaurant, 'inventoryRecipe'));

  const tabs: { id: WaiterTab; label: string; icon: typeof Grid2x2 }[] = [
    { id: 'comandas', label: 'Pedidos', icon: Receipt },
    { id: 'cocina', label: 'Cocina', icon: ChefHat },
    { id: 'mesas', label: 'Mesas', icon: Grid2x2 },
    ...(canSeeInventory ? [{ id: 'inventario' as const, label: 'Inventario', icon: Boxes }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#f7f9fc]">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-brand-950/[0.06] bg-white/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-[0_1px_0_rgba(0,27,67,0.02)] backdrop-blur-xl">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={restaurant.logoUrl || '/logo/icono.png?v=20261002'}
            alt=""
            className="h-8 w-8 rounded-full object-cover shrink-0"
          />
          <div className="min-w-0">
            <p className="font-semibold text-brand-950 truncate text-base">{restaurant.name}</p>
            <p className="text-brand-950/50 truncate text-xs">Mesero · {user.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setSwitchingUser(true)}
            className="flex h-10 items-center gap-1.5 rounded-full border border-brand-950/10 bg-white px-3 text-xs font-medium text-brand-950/60 transition-[color,background-color,transform] duration-150 ease-out-strong hover:bg-brand-950/[0.035] hover:text-brand-950 active:scale-[0.97] motion-reduce:transition-none"
          >
            <Users className="h-3.5 w-3.5" /> Cambiar
          </button>
          <button
            type="button"
            onClick={logout}
            className="flex h-10 items-center gap-1.5 rounded-full border border-brand-950/10 bg-white px-3 text-xs font-medium text-brand-950/60 transition-[color,background-color,transform] duration-150 ease-out-strong hover:bg-red-50 hover:text-red-600 active:scale-[0.97] motion-reduce:transition-none"
          >
            <LogOut className="h-3.5 w-3.5" /> Salir
          </button>
        </div>
      </header>

      {switchingUser && <WaiterProfilePicker onClose={() => setSwitchingUser(false)} />}

      <AnimatedTabs wrapperClassName="sticky top-[65px] z-20 border-b border-brand-950/[0.06] bg-white/90 px-3 py-2.5 backdrop-blur-xl" className="min-w-full bg-transparent" label="Secciones del mesero">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <AnimatedTab active={active}
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-w-[72px] flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-xs font-medium transition-[color,background-color,box-shadow,transform] duration-150 ease-out-strong active:scale-[0.97] motion-reduce:transition-none ${
                active
                  ? 'bg-brand-500 text-white shadow-[0_8px_18px_-12px_rgba(0,154,255,0.75)]'
                  : 'text-brand-950/50 hover:bg-brand-950/[0.035] hover:text-brand-950/75'
              }`}
            >
              <t.icon className="h-[19px] w-[19px]" />
              {t.label}
              {t.id === 'inventario' && lowStockItems.length > 0 && (
                <span className="absolute top-1 right-3 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                  {lowStockItems.length}
                </span>
              )}
            </AnimatedTab>
          );
        })}
      </AnimatedTabs>

      <main className="mx-auto w-full max-w-7xl px-4 py-4 pb-28">
        <Suspense fallback={<div className="p-10 text-center text-brand-950/30 font-light text-sm">Cargando…</div>}>
          {tab === 'mesas' && (
            <div className="space-y-8">
              <TableOrdersPage />
              <ActiveOrdersPreview />
            </div>
          )}
          {tab === 'cocina' && <KitchenPage />}
          {tab === 'comandas' && <LiveOrdersPanel hideCreateButton />}
          {tab === 'inventario' && canSeeInventory && <InventoryPage />}
        </Suspense>
      </main>

      <TableServiceAlert />
      <NewOrderAlert
        onNavigate={(orderId) => {
          setTab('comandas');
          navigate(`/admin/comandas?order=${encodeURIComponent(orderId)}`);
        }}
      />
      <LowStockAlert />
      {CHATBOTS_ENABLED && <HelpChatWidget />}

      {/* Botón flotante "Nuevo pedido": visible en cualquier pestaña, y el mesero lo puede
       * arrastrar a donde le quede más cómodo (la posición se recuerda en este dispositivo). */}
      <TextureButton
        variant="success"
        size="icon"
        onPointerDown={handleFabPointerDown}
        onPointerMove={handleFabPointerMove}
        onPointerUp={handleFabPointerUp}
        onPointerCancel={handleFabPointerUp}
        aria-label="Crear pedido (mantén presionado y arrastra para moverlo)"
        style={{ position: 'fixed', left: fabPos.left, top: fabPos.top, touchAction: 'none' }}
        className="z-30 !h-16 !w-16 rounded-full shadow-[0_14px_34px_-12px_rgba(0,27,67,0.45)] transition-[transform,box-shadow] duration-150 ease-out-strong active:scale-95 motion-reduce:transition-none"
      >
        <Plus className="h-8 w-8" strokeWidth={2.5} />
      </TextureButton>

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
import { AnimatedTabs, AnimatedTab } from '@/components/ui/animated-tabs';
