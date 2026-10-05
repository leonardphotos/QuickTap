import { api } from '@/api/client';
import { CashSessionControl } from '@/components/admin/CashSessionControl';
import { CreateOrderDialog } from '@/components/admin/CreateOrderDialog';
import { HelpChatWidget } from '@/components/admin/HelpChatWidget';
import { EditOrderDialog,LiveOrdersPanel } from '@/components/admin/LiveOrdersPanel';
import { type LiveOrder } from '@/components/admin/LiveOrdersPanel.shared';
import { LowStockAlert } from '@/components/admin/LowStockAlert';
import { NewOrderAlert } from '@/components/admin/NewOrderAlert';
import { OrderReadyToast } from '@/components/admin/OrderReadyToast';
import { PaymentDialog } from '@/components/admin/PaymentDialog';
import { TableServiceAlert } from '@/components/admin/TableServiceAlert';
import { TodayPaymentMethodsDialog } from '@/components/admin/TodayPaymentMethodsDialog';
import { WaiterProfilePicker } from '@/components/admin/WaiterProfilePicker';
import { CHATBOTS_ENABLED } from '@/config/features';
import { useAuth } from '@/context/AuthContext.shared';
import { ROLE_LABELS } from '@/utils/roles';
import { Bike,ChefHat,Grid2x2,LogOut,Plus,Receipt } from 'lucide-react';
import { lazy,Suspense,useState } from 'react';
import { useNavigate } from 'react-router-dom';

const TableOrdersPage = lazy(() => import('../TableOrdersPage'));
const DeliveryPage = lazy(() => import('../DeliveryPage'));
const KitchenPage = lazy(() => import('../KitchenPage'));

type LandscapeTab = 'mesas' | 'cocina' | 'comandas' | 'repartos';

const TAB_META: Record<LandscapeTab, { title: string; subtitle: string }> = {
  repartos: { title: 'Repartos', subtitle: 'Asignación y seguimiento de entregas' },
  mesas: { title: 'Mesas', subtitle: 'Salón — toca una mesa para ver o crear su pedido' },
  cocina: { title: 'Cocina', subtitle: 'Comandas en preparación' },
  comandas: { title: 'Pedidos', subtitle: 'Todos los pedidos en curso' },
};

/**
 * Panel operativo para tablet en horizontal (Mesero/Cajero): sidebar de iconos fijo a la
 * izquierda en vez de pestañas arriba (WaiterLayout) o el sidebar de escritorio completo
 * (AdminLayout) — ver useIsLandscapeTablet. Cada pantalla reutiliza el mismo componente real
 * que ya usan esos layouts (TableOrdersPage/KitchenPage/LiveOrdersPanel/CreateOrderDialog):
 * este layout es un cambio de shell/navegación, no una reimplementación de la lógica de pedidos.
 */
export default function LandscapeStaffLayout() {
  const { user, restaurant, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<LandscapeTab>('comandas');
  const [existingOrders, setExistingOrders] = useState<LiveOrder[]>([]);
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<LiveOrder | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<{ order: LiveOrder; mode: 'full' | 'split' } | null>(null);
  // Segundo inicio de sesión: en la tablet compartida, tocar el avatar reabre la cuadrícula de
  // meseros (misma pantalla del login) sin pedir correo/clave otra vez. Solo Mesero — Cajero
  // llega a este mismo layout pero cambiar de mesero no es lo suyo.
  const [switchingUser, setSwitchingUser] = useState(false);

  if (!user || !restaurant) return null;

  function loadExistingOrders() {
    api.get('/orders/live').then((res) => setExistingOrders(res.data.data));
  }

  function openCreateOrder() {
    loadExistingOrders();
    setCreateOrderOpen(true);
  }

  const NAV_ITEMS: { id: 'crear' | LandscapeTab; label: string; icon: typeof Grid2x2 }[] = [
    { id: 'crear', label: 'Crear pedido', icon: Plus },
    { id: 'comandas', label: 'Pedidos', icon: Receipt },
    { id: 'cocina', label: 'Cocina', icon: ChefHat },
    { id: 'mesas', label: 'Mesas', icon: Grid2x2 },
    ...(user?.role === 'CASHIER' && restaurant?.subscriptionPlan !== 'ESSENTIAL' ? [{ id: 'repartos' as const, label: 'Repartos', icon: Bike }] : []),
  ];

  const meta = TAB_META[tab];

  return (
    <div className="grid h-screen supports-[height:100dvh]:h-dvh overflow-hidden" style={{ gridTemplateColumns: '88px minmax(0, 1fr)' }}>
      {/* ---------- Sidebar ---------- */}
      <aside className="quicktap-glass-sidebar flex flex-col items-center gap-1.5 py-4">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-400 text-sm font-bold text-white">
          QT
        </div>
        <BounceNavigation className="flex w-full flex-col items-center gap-2 px-2" aria-label="Secciones del local">{NAV_ITEMS.map((item) => {
          const active = item.id === tab;
          return (
            <button
              key={item.id}
              aria-current={active ? 'page' : undefined}
              type="button"
              onClick={() => (item.id === 'crear' ? openCreateOrder() : setTab(item.id))}
              className={`flex min-h-[80px] w-full flex-col items-center justify-center gap-2 rounded-2xl px-1 py-3 text-center text-[10.5px] leading-tight font-medium transition-colors ${
                item.id === 'crear'
                  ? 'text-emerald-400 hover:text-emerald-300'
                  : active
                    ? 'bg-brand-500/25 text-white shadow-[inset_3px_0_0_#38bdf8]'
                    : 'text-white/50 hover:text-white/80'
              }`}
            >
              <item.icon className="h-[21px] w-[21px] shrink-0" aria-hidden="true" />
              <span className="flex min-h-7 w-full items-center justify-center">{item.label}</span>
            </button>
          );
        })}</BounceNavigation>
        <div className="mt-auto flex flex-col items-center gap-2">
          <span className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-semibold text-white/70">
            {ROLE_LABELS[user.role]}
          </span>
          <button
            type="button"
            onClick={logout}
            aria-label="Cerrar sesión"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white/50 hover:bg-white/10 hover:text-white/80"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* ---------- Contenido ---------- */}
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b border-brand-950/[0.08] bg-white px-6 py-3.5">
          <div>
            <h1 className="text-[17px] font-semibold text-brand-950">{meta.title}</h1>
            <p className="font-light text-brand-950/45 text-xs">{meta.subtitle}</p>
          </div>
          <div className="flex items-center gap-2.5">
            {/* Cajero (sin acceso completo, único rol que llega acá aparte de Mesero) conserva
                abrir/cerrar caja y ver los movimientos del día por método de pago, aunque no
                vea Administración. */}
            {user.role === 'CASHIER' && (
              <>
                <CashSessionControl />
                <TodayPaymentMethodsDialog />
              </>
            )}
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-[11.5px] font-semibold text-emerald-600">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> En vivo
            </div>
            {user.role === 'WAITER' ? (
              <button
                type="button"
                onClick={() => setSwitchingUser(true)}
                title="Cambiar de mesero"
                className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-brand-500 text-[13px] font-semibold text-white hover:brightness-110"
              >
                {user.name?.[0]?.toUpperCase() ?? '?'}
              </button>
            ) : (
              <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-brand-500 text-[13px] font-semibold text-white">
                {user.name?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
          </div>
        </div>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
          <Suspense fallback={<div className="p-10 text-center text-sm font-light text-brand-950/30">Cargando…</div>}>
            {tab === 'mesas' && (
              <div className="px-6 py-5">
                <TableOrdersPage />
              </div>
            )}
            {tab === 'repartos' && <div className="px-4 py-3"><DeliveryPage /></div>}
            {tab === 'cocina' && <KitchenPage />}
            {tab === 'comandas' && (
              <div className="px-4 py-3">
                <LiveOrdersPanel hideCreateButton compactLayout />
              </div>
            )}
          </Suspense>
        </main>
      </div>

      <TableServiceAlert />
      <NewOrderAlert
        onNavigate={(orderId) => {
          setTab('comandas');
          navigate(`/admin/comandas?order=${encodeURIComponent(orderId)}`);
        }}
      />
      <LowStockAlert />
      {CHATBOTS_ENABLED && <HelpChatWidget />}
      {user.role === 'CASHIER' && <OrderReadyToast />}

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

      {switchingUser && <WaiterProfilePicker onClose={() => setSwitchingUser(false)} />}
    </div>
  );
}
import { BounceNavigation } from '@/components/ui/bounce-navigation';
