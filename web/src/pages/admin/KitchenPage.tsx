import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { apiOrigin } from '@/utils/apiOrigin';
import { Check, ChefHat, Clock, Flame, Plus } from 'lucide-react';
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
  /** Tanda dentro del pedido: 1 = la comanda original, 2+ = una ronda añadida después. */
  batch: number;
  /** Cuándo llegó ESTA tanda a cocina — de acá sale el contador de la tarjeta. */
  arrivedAt: number;
}

/** Tiempo de espera en mm:ss (o h:mm pasada la hora, que a esa altura los segundos sobran). */
function formatEspera(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')} h`;
  return `${m}:${String(sec).padStart(2, '0')}`;
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
    // Doble agrupación: por estación (cada cocina ve lo suyo) y dentro de ella por tanda, para
    // que lo que se añadió a una comanda ya abierta salga en una tarjeta aparte y no se mezcle
    // con lo que ya estaba en fuego. En Pedidos sigue siendo un único pedido.
    const itemsByKey = new Map<string, OrderItemView[]>();
    for (const it of pendingItems) {
      const key = `${it.kitchenName ?? UNASSIGNED_KEY}\u0000${it.kitchenBatch ?? 1}`;
      if (!itemsByKey.has(key)) itemsByKey.set(key, []);
      itemsByKey.get(key)!.push(it);
    }
    for (const [compuesta, items] of itemsByKey) {
      const [key, batchRaw] = compuesta.split('\u0000');
      if (!byKey.has(key)) byKey.set(key, []);
      // La tanda llega cuando entra su primer ítem. Si el ítem no trae fecha (pedido guardado
      // antes de esta versión) se usa la del pedido, que es lo que era de hecho.
      const arrivedAt = items.reduce(
        (min, it) => Math.min(min, it.createdAt ? new Date(it.createdAt).getTime() : Number.POSITIVE_INFINITY),
        Number.POSITIVE_INFINITY,
      );
      byKey.get(key)!.push({
        order,
        items,
        batch: Number(batchRaw) || 1,
        arrivedAt: Number.isFinite(arrivedAt) ? arrivedAt : new Date(order.createdAt).getTime(),
      });
    }
  }
  // Lo que más lleva esperando, primero: es el orden en el que cocina tiene que sacarlo.
  for (const tickets of byKey.values()) tickets.sort((a, b) => a.arrivedAt - b.arrivedAt);

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

    const socket: Socket = io(apiOrigin() || '/', { auth: { token: getToken() } });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('order:new', () => load());
    socket.on('order:updated', () => load());

    return () => {
      socket.disconnect();
    };
  }, []);

  async function markReady(orderId: string, kitchenName: string | null, kitchenBatch: number) {
    await api.patch(`/orders/${orderId}/kitchen-ready`, { kitchenName, kitchenBatch });
    load();
  }

  async function markStarted(orderId: string, kitchenName: string | null, kitchenBatch: number) {
    await api.patch(`/orders/${orderId}/kitchen-start`, { kitchenName, kitchenBatch });
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

  // Un solo reloj para todas las tarjetas: los contadores se recalculan en el render, así que
  // basta con forzar un render por segundo en vez de un intervalo por comanda.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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
                // Contador de espera de ESTA tanda. Los tramos son la señal que de verdad usa
                // el cocinero: normal hasta 10 min, ámbar hasta 20, rojo pasados los 20.
                const espera = ahora - ticket.arrivedAt;
                const minutos = espera / 60000;
                const tonoEspera =
                  minutos >= 20
                    ? 'bg-red-100 text-red-700'
                    : minutos >= 10
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-brand-950/[0.06] text-brand-950/60';
                return (
                <TextureCard
                  key={`${lane.key}-${ticket.order.id}-${ticket.batch}`}
                  className={`transition-shadow duration-300 hover:shadow-md ${
                    ticket.order.status === 'PENDING' ? 'ring-1 ring-amber-300' : started ? 'ring-1 ring-orange-300' : ''
                  }`}
                >
                  <TextureCardContent className="px-4 py-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-brand-950 truncate">
                        #{ticket.order.orderNumber}
                        {ticket.batch > 1 && (
                          <span className="font-normal text-brand-950/60"> · añadido {ticket.batch - 1}</span>
                        )}
                        {ticket.order.customerName && (
                          <span className="font-normal text-brand-950/60"> · {ticket.order.customerName}</span>
                        )}
                      </p>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full shrink-0 ${tonoEspera}`}
                        title="Tiempo que lleva esta comanda en cocina"
                      >
                        <Clock className="h-3 w-3" /> {formatEspera(espera)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs bg-brand-950/[0.06] px-2 py-0.5 rounded-full">
                        {ticket.order.channel === 'DINE_IN'
                          ? `Mesa ${ticket.order.table?.number ?? ''}`
                          : CHANNEL_LABELS[ticket.order.channel] ?? ticket.order.channel}
                      </span>
                      {ticket.batch > 1 && (
                        // Lo que entró después de que la comanda ya estaba en cocina. Sin esta
                        // marca el cocinero no distingue lo nuevo de lo que ya tenía en fuego.
                        <span className="inline-flex items-center gap-1 text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-medium">
                          <Plus className="h-3 w-3" /> Añadido a la comanda
                        </span>
                      )}
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
                            onClick={() => markStarted(ticket.order.id, lane.key === UNASSIGNED_KEY ? null : lane.key, ticket.batch)}
                            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-700 text-sm font-medium py-2 transition-colors"
                          >
                            <Flame className="h-4 w-4" /> En proceso
                          </button>
                        )}
                        <button
                          onClick={() => markReady(ticket.order.id, lane.key === UNASSIGNED_KEY ? null : lane.key, ticket.batch)}
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
