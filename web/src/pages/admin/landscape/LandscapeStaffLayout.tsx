import { lazy, Suspense, useState } from 'react';
import { ChefHat, Grid2x2, LogOut, Plus, Receipt } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS } from '@/utils/roles';
import { LiveOrdersPanel, EditOrderDialog, type LiveOrder } from '@/components/admin/LiveOrdersPanel';
import { TableServiceAlert } from '@/components/admin/TableServiceAlert';
import { NewOrderAlert } from '@/components/admin/NewOrderAlert';
import { OrderReadyToast } from '@/components/admin/OrderReadyToast';
import { LowStockAlert } from '@/components/admin/LowStockAlert';
import { HelpChatWidget } from '@/components/admin/HelpChatWidget';
import { CreateOrderDialog } from '@/components/admin/CreateOrderDialog';
import { PaymentDialog } from '@/components/admin/PaymentDialog';
import { CashSessionControl } from '@/components/admin/CashSessionControl';
import { TodayPaymentMethodsDialog } from '@/components/admin/TodayPaymentMethodsDialog';

const TableOrdersPage = lazy(() => import('../TableOrdersPage'));
const KitchenPage = lazy(() => import('../KitchenPage'));

type LandscapeTab = 'mesas' | 'cocina' | 'comandas';

const TAB_META: Record<LandscapeTab, { title: string; subtitle: string }> = {
  mesas: { title: 'Mesas', subtitle: 'Salón — toca una mesa para ver o crear su pedido' },
  cocina: { title: 'Cocina', subtitle: 'Comandas en preparación' },
  comandas: { title: 'Comandas', subtitle: 'Todos los pedidos en curso' },
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
  const [tab, setTab] = useState<LandscapeTab>('mesas');
  const [existingOrders, setExistingOrders] = useState<LiveOrder[]>([]);
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<LiveOrder | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<{ order: LiveOrder; mode: 'full' | 'split' } | null>(null);

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
    { id: 'comandas', label: 'Comandas', icon: Receipt },
    { id: 'mesas', label: 'Mesas', icon: Grid2x2 },
    { id: 'cocina', label: 'Cocina', icon: ChefHat },
  ];

  const meta = TAB_META[tab];

  return (
    <div className="grid h-screen overflow-hidden" style={{ gridTemplateColumns: '88px 1fr' }}>
      {/* ---------- Sidebar ---------- */}
      <aside className="flex flex-col items-center gap-1.5 bg-brand-950 py-4">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-400 text-sm font-bold text-white">
          QT
        </div>
        {NAV_ITEMS.map((item) => {
          const active = item.id === tab;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => (item.id === 'crear' ? openCreateOrder() : setTab(item.id))}
              className={`flex w-16 flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-[10.5px] font-medium transition-colors ${
                item.id === 'crear'
                  ? 'text-emerald-400 hover:text-emerald-300'
                  : active
                    ? 'bg-brand-500/20 text-white'
                    : 'text-white/50 hover:text-white/80'
              }`}
            >
              <item.icon className="h-[21px] w-[21px]" />
              {item.label}
            </button>
          );
        })}
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
      <div className="flex min-w-0 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b border-brand-950/[0.08] bg-white px-6 py-3.5">
          <div>
            <h1 className="text-[17px] font-semibold text-brand-950">{meta.title}</h1>
            <p className="text-xs font-light text-brand-950/45">{meta.subtitle}</p>
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
            <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-brand-500 text-[13px] font-semibold text-white">
              {user.name?.[0]?.toUpperCase() ?? '?'}
            </div>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto">
          <Suspense fallback={<div className="p-10 text-center text-sm font-light text-brand-950/30">Cargando…</div>}>
            {tab === 'mesas' && (
              <div className="px-6 py-5">
                <TableOrdersPage />
              </div>
            )}
            {tab === 'cocina' && <KitchenPage />}
            {tab === 'comandas' && (
              <div className="px-6 py-5">
                <LiveOrdersPanel hideCreateButton />
              </div>
            )}
          </Suspense>
        </main>
      </div>

      <TableServiceAlert />
      <NewOrderAlert onNavigate={() => setTab('comandas')} />
      <LowStockAlert />
      <HelpChatWidget />
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
    </div>
  );
}
