import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { Check, ChefHat, Flame } from 'lucide-react';
import { api, getToken } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { hasFullAccess, isAdminCashier } from '../../utils/roles';
import type { Kitchen, OrderItemView, OrderView } from '../../types';
import { formatModifierLabel } from '../../utils/format';
import { TextureCard, TextureCardContent } from '@/components/ui/texture-card';
import { TextureButton } from '@/components/ui/texture-button';
import { KitchenManageDialog } from '@/components/admin/KitchenManageDialog';

const UNASSIGNED_KEY = '__unassigned__';
const CHANNEL_LABELS: Record<string, string> = { DELIVERY: 'Delivery', PICKUP: 'Pickup', BAR: 'Barra' };

interface Ticket {
  order: OrderView;
  items: OrderItemView[];
}

interface Lane {
  key: string;
  label: string;
  tickets: Ticket[];
}

/** Agrupa los ítems pendientes de cada pedido por cocina (snapshot en el ítem): cada
 * comanda se divide en una tarjeta por estación, conservando cliente y mesa/canal. */
function buildLanes(orders: OrderView[], kitchens: Kitchen[]): Lane[] {
  const priorityByName = new Map(kitchens.map((k, i) => [k.name, k.priority ?? i]));
  const byKey = new Map<string, Ticket[]>();

  for (const order of orders) {
    const pendingItems = order.items.filter((it) => !it.kitchenReadyAt);
    const itemsByKey = new Map<string, OrderItemView[]>();
    for (const it of pendingItems) {
      const key = it.kitchenName ?? UNASSIGNED_KEY;
      if (!itemsByKey.has(key)) itemsByKey.set(key, []);
      itemsByKey.get(key)!.push(it);
    }
    for (const [key, items] of itemsByKey) {
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push({ order, items });
    }
  }

  const keys = [...byKey.keys()].filter((k) => k !== UNASSIGNED_KEY);
  keys.sort((a, b) => (priorityByName.get(a) ?? 999) - (priorityByName.get(b) ?? 999) || a.localeCompare(b));
  if (byKey.has(UNASSIGNED_KEY)) keys.push(UNASSIGNED_KEY);

  return keys.map((key) => ({
    key,
    label: key === UNASSIGNED_KEY ? 'Sin asignar' : key,
    tickets: byKey.get(key)!,
  }));
}

export default function KitchenPage() {
  const { user } = useAuth();
  const canManage = hasFullAccess(user?.role, user?.cashierFullAccess);
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [kitchens, setKitchens] = useState<Kitchen[]>([]);
  const [connected, setConnected] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  // null = sin filtro (se muestran todas las cocinas); si no, solo las estaciones marcadas.
  const [selectedLanes, setSelectedLanes] = useState<Set<string> | null>(null);

  function load() {
    api.get('/orders/kitchen').then((res) => setOrders(res.data.data));
    api.get('/kitchens').then((res) => setKitchens(res.data.data));
  }

  useEffect(() => {
    load();

    const socket: Socket = io('/', { auth: { token: getToken() } });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('order:new', () => load());
    socket.on('order:updated', () => load());

    return () => {
      socket.disconnect();
    };
  }, []);

  async function markReady(orderId: string, kitchenName: string | null) {
    await api.patch(`/orders/${orderId}/kitchen-ready`, { kitchenName });
    load();
  }

  async function markStarted(orderId: string, kitchenName: string | null) {
    await api.patch(`/orders/${orderId}/kitchen-start`, { kitchenName });
    load();
  }

  async function acceptOrder(orderId: string) {
    await api.post(`/orders/${orderId}/accept`);
    load();
  }

  async function cancelOrder(orderId: string) {
    if (!confirm('¿Cancelar este pedido completo?')) return;
    await api.patch(`/orders/${orderId}/status`, { status: 'CANCELLED' });
    load();
  }

  const lanes = buildLanes(orders, kitchens);
  const filterOptions = [...kitchens.map((k) => ({ key: k.name, label: k.name })), { key: UNASSIGNED_KEY, label: 'Sin asignar' }];

  function toggleLaneFilter(key: string) {
    setSelectedLanes((prev) => {
      const base = prev ?? new Set(filterOptions.map((o) => o.key));
      const next = new Set(base);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const visibleLanes = selectedLanes === null ? lanes : lanes.filter((l) => selectedLanes.has(l.key));

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Cola de Cocina</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full ${connected ? 'bg-brand-400/15 text-brand-800' : 'bg-brand-950/10 text-brand-950/50'}`}>
          {connected ? '● En vivo' : '○ Conectando…'}
        </span>
        {canManage && (
          <TextureButton
            variant="minimal"
            size="sm"
            className="!w-auto flex items-center gap-1.5 ml-auto"
            onClick={() => setManageOpen(true)}
          >
            <ChefHat className="h-3.5 w-3.5" /> Cocinas
          </TextureButton>
        )}
      </div>

      {filterOptions.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSelectedLanes(null)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              selectedLanes === null ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          >
            Todas
          </button>
          {filterOptions.map((o) => (
            <button
              key={o.key}
              onClick={() => toggleLaneFilter(o.key)}
              className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                selectedLanes === null || selectedLanes.has(o.key)
                  ? 'bg-brand-500 text-white'
                  : 'bg-brand-950/[0.06] text-brand-950/50'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {visibleLanes.length === 0 && (
        <p className="text-sm text-brand-950/40 py-10 text-center font-light">No hay comandas pendientes.</p>
      )}

      <div className="space-y-8">
        {visibleLanes.map((lane) => (
          <div key={lane.key}>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-lg font-semibold text-brand-950">{lane.label}</h2>
              <span className="text-xs bg-brand-950/[0.06] text-brand-950/50 px-2 py-0.5 rounded-full">
                {lane.tickets.length}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {lane.tickets.map((ticket) => {
                // "En proceso": la estación ya tocó el botón en todos sus ítems de esta comanda.
                const started = ticket.items.length > 0 && ticket.items.every((it) => it.kitchenStartedAt);
                return (
                <TextureCard
                  key={`${lane.key}-${ticket.order.id}`}
                  className={`transition-shadow duration-300 hover:shadow-md ${
                    ticket.order.status === 'PENDING' ? 'ring-1 ring-amber-300' : started ? 'ring-1 ring-orange-300' : ''
                  }`}
                >
                  <TextureCardContent className="px-4 py-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-brand-950 truncate">
                        #{ticket.order.orderNumber}
                        {ticket.order.customerName && (
                          <span className="font-normal text-brand-950/60"> · {ticket.order.customerName}</span>
                        )}
                      </p>
                      <span className="text-xs bg-brand-950/[0.06] px-2 py-0.5 rounded-full shrink-0">
                        {ticket.order.channel === 'DINE_IN'
                          ? `Mesa ${ticket.order.table?.number ?? ''}`
                          : CHANNEL_LABELS[ticket.order.channel] ?? ticket.order.channel}
                      </span>
                    </div>
                    {ticket.order.status === 'PENDING' && (
                      <span className="inline-block text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                        Pendiente de aceptar
                      </span>
                    )}
                    {ticket.order.status !== 'PENDING' && started && (
                      <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                        <Flame className="h-3 w-3" /> En proceso
                      </span>
                    )}
                    <ul className="text-sm space-y-1 font-light">
                      {ticket.items.map((it) => (
                        <li key={it.id}>
                          <span className="font-medium">{it.quantity}x</span> {it.productName}
                          {it.variantName && <span className="text-brand-950/50"> ({it.variantName})</span>}
                          {it.modifiers.length > 0 && (
                            <span className="text-brand-950/50"> ({it.modifiers.map(formatModifierLabel).join(', ')})</span>
                          )}
                          {it.note && <span className="block text-xs text-brand-950/50">Nota: {it.note}</span>}
                        </li>
                      ))}
                    </ul>

                    {ticket.order.status === 'PENDING' ? (
                      // PENDING acá siempre es delivery/pickup recién llegado del cliente: solo
                      // Caja/Admin/Dueño lo puede aceptar (implica coordinar cobro/despacho).
                      // Cocina/Mesero solo ven que está esperando, sin poder tocarlo.
                      isAdminCashier(user?.role, user?.cashierFullAccess) ? (
                        <button
                          onClick={() => acceptOrder(ticket.order.id)}
                          className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium py-2 transition-colors"
                        >
                          <Check className="h-4 w-4" /> Aceptar pedido
                        </button>
                      ) : (
                        <p className="text-center text-xs text-brand-950/40 py-2">Esperando que Caja lo acepte…</p>
                      )
                    ) : (
                      <div className="space-y-2">
                        {!started && (
                          <button
                            onClick={() => markStarted(ticket.order.id, lane.key === UNASSIGNED_KEY ? null : lane.key)}
                            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-700 text-sm font-medium py-2 transition-colors"
                          >
                            <Flame className="h-4 w-4" /> En proceso
                          </button>
                        )}
                        <button
                          onClick={() => markReady(ticket.order.id, lane.key === UNASSIGNED_KEY ? null : lane.key)}
                          className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium py-2 transition-colors"
                        >
                          <Check className="h-4 w-4" /> Listo
                        </button>
                      </div>
                    )}
                    <button
                      onClick={() => cancelOrder(ticket.order.id)}
                      className="w-full text-center text-xs text-red-500 hover:text-red-600 pt-1"
                    >
                      Cancelar pedido completo
                    </button>
                  </TextureCardContent>
                </TextureCard>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {manageOpen && (
        <KitchenManageDialog open={manageOpen} onOpenChange={setManageOpen} kitchens={kitchens} onChanged={load} />
      )}
    </div>
  );
}
