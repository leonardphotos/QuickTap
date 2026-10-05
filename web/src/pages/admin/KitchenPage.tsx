import { KitchenManageDialog } from '@/components/admin/KitchenManageDialog';
import { TextureButton } from '@/components/ui/texture-button';
import './KitchenPage.css';
import { useKitchenArrival } from '@/hooks/useKitchenArrival';
import { apiOrigin } from '@/utils/apiOrigin';
import { Check,ChefHat,Clock,Flame,Plus } from 'lucide-react';
import { useEffect,useRef,useState } from 'react';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { api,getToken } from '../../api/client';
import { useAuth } from '../../context/AuthContext.shared';
import type { Kitchen,OrderItemView,OrderView } from '../../types';
import { formatModifierLabel } from '../../utils/format';
import { hasFullAccess,isAdminCashier } from '../../utils/roles';

const UNASSIGNED_KEY = '__unassigned__';
const CHANNEL_LABELS: Record<string, string> = { DELIVERY: 'Delivery', PICKUP: 'Pickup', BAR: 'Barra', EXPRESS: 'Express' };

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
  const { user, restaurant } = useAuth();
  const canManage = hasFullAccess(user?.role, user?.cashierFullAccess);
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [kitchens, setKitchens] = useState<Kitchen[]>([]);
  const [connected, setConnected] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const arrival = useKitchenArrival();
  const requestId = useRef(0);
  // null = sin filtro (se muestran todas las cocinas); si no, solo las estaciones marcadas.
  const [selectedLanes, setSelectedLanes] = useState<Set<string> | null>(null);

  function load() {
    const request = ++requestId.current;
    api.get('/orders/kitchen').then((res) => {
      if (request !== requestId.current) return;
      const next: OrderView[] = res.data.data;
      arrival.observe(buildLanes(next, []).flatMap(lane => lane.tickets.map(ticket => JSON.stringify([lane.key, ticket.order.id, ticket.batch]))));
      setOrders(next);
    }).catch(() => { if (request === requestId.current) setError('No se pudieron actualizar las comandas. Reintenta para ver la cola actual.'); }).finally(() => { if (request === requestId.current) setLoading(false); });
    api.get('/kitchens').then((res) => setKitchens(res.data.data)).catch(() => setError('No se pudieron cargar las estaciones de cocina.'));
  }

  useEffect(() => {
    load();

    const socket: Socket = io(apiOrigin() || '/', { auth: { token: getToken() } });
    socket.on('connect', () => { setConnected(true); load(); });
    socket.on('disconnect', () => setConnected(false));
    socket.on('order:new', () => load());
    socket.on('order:updated', () => load());
    const refreshVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', refreshVisible);

    return () => {
      requestId.current++;
      document.removeEventListener('visibilitychange', refreshVisible);
      socket.disconnect();
    };
  }, []);

  async function markReady(orderId: string, kitchenName: string | null, kitchenBatch: number) {
    await runAction(orderId, () => api.patch(`/orders/${orderId}/kitchen-ready`, { kitchenName, kitchenBatch }));
  }

  async function markStarted(orderId: string, kitchenName: string | null, kitchenBatch: number) {
    await runAction(orderId, () => api.patch(`/orders/${orderId}/kitchen-start`, { kitchenName, kitchenBatch }));
  }

  async function acceptOrder(orderId: string) {
    await runAction(orderId, () => api.post(`/orders/${orderId}/accept`));
  }

  async function cancelOrder(orderId: string) {
    if (!confirm('¿Cancelar este pedido completo?')) return;
    await runAction(orderId, () => api.patch(`/orders/${orderId}/status`, { status: 'CANCELLED' }));
  }

  async function runAction(orderId: string, action: () => Promise<unknown>) {
    if (busyOrder) return;
    setBusyOrder(orderId);
    setError(null);
    try { await action(); load(); }
    catch (e: any) { setError(e.response?.data?.error ?? 'No se pudo actualizar la comanda. Intenta nuevamente.'); }
    finally { setBusyOrder(null); }
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
    <div className="qt-kitchen space-y-6">
      <header className="rounded-[28px] border border-brand-950/10 bg-white p-5 sm:p-7">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="mr-auto"><p className="mb-2 font-semibold uppercase tracking-widest text-brand-600 text-xs">Del pedido al plato</p><h1 className="text-3xl font-semibold tracking-tight text-brand-950">Cocina</h1></div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${connected ? 'bg-brand-400/15 text-brand-800' : 'bg-brand-950/10 text-brand-950/50'}`}>
          {connected ? '● En vivo' : '○ Conectando…'}
        </span>
        {canManage && (
          <TextureButton
            variant="minimal"
            size="sm"
            className="!w-auto [&>div]:min-h-11 flex items-center gap-1.5"
            onClick={() => setManageOpen(true)}
          >
            <ChefHat className="h-3.5 w-3.5" /> Cocinas
          </TextureButton>
        )}
      </div>
      <p className="mt-3 text-brand-950/60 text-base">Cada estación tiene sus comandas. Las que llevan más tiempo esperando aparecen primero.</p>
      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-brand-950/10 pt-5">
        {[
          ['Comandas en cola', lanes.reduce((n, lane) => n + lane.tickets.length, 0)],
          ['En preparación', lanes.reduce((n, lane) => n + lane.tickets.filter((t) => t.items.every((i) => i.kitchenStartedAt)).length, 0)],
          ['Estaciones con pedidos', lanes.length],
        ].map(([label, value]) => <div key={label}><p className="text-2xl font-semibold tabular-nums text-brand-950">{loading ? '—' : value}</p><p className="mt-1 text-brand-950/60 text-xs">{label}</p></div>)}
      </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 text-xs text-brand-950/60">
        <button type="button" onClick={arrival.activateSound} disabled={arrival.soundReady} className="min-h-11 rounded-xl border border-brand-950/10 bg-white px-4 font-semibold text-brand-600 disabled:text-brand-950/50">{arrival.soundReady ? 'Sonido de cocina activado' : 'Activar sonido'}</button>
        <span>El sonido solo se reproduce mientras Cocina está abierta y visible.</span>
        {arrival.soundError && <p role="status" className="w-full text-amber-700 text-base">{arrival.soundError}</p>}
      </div>
      {arrival.fresh.size > 0 && <div className="qt-kitchen-arrival" role="status" aria-live="polite">
        <div><strong>{arrival.fresh.size === 1 ? 'Nueva comanda en cocina' : `${arrival.fresh.size} nuevas comandas en cocina`}</strong><p className="mt-1 text-xs">Revisa los tickets nuevos antes de continuar.</p></div>
        <button type="button" onClick={() => setSelectedLanes(null)}>Ver todas</button>
        <button type="button" onClick={arrival.acknowledge}>Entendido</button>
      </div>}

      {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error} <button className="ml-2 underline" onClick={() => { setError(null); load(); }}>Reintentar</button></div>}

      {filterOptions.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-brand-950/10 bg-white p-3 [&>button]:min-h-11 [&>button]:px-4">
          <button
            aria-pressed={selectedLanes === null}
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
              aria-pressed={selectedLanes === null || selectedLanes.has(o.key)}
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
        <div className="rounded-3xl border border-brand-950/10 bg-white py-12 text-center"><ChefHat className="mx-auto mb-3 h-9 w-9 text-brand-500" /><p role="status" className="text-brand-950/60 text-base">{loading ? 'Preparando la cola de cocina…' : error ? 'No se pudo verificar la cola de cocina.' : lanes.length ? 'No hay comandas en las estaciones seleccionadas.' : 'Todo al día. No hay comandas pendientes.'}</p></div>
      )}

      <div className="space-y-8">
        {visibleLanes.map((lane) => (
          <section key={lane.key} className="qt-kitchen-station">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-lg font-semibold text-brand-950">{lane.label}</h2>
              <span className="text-xs bg-brand-950/[0.06] text-brand-950/50 px-2 py-0.5 rounded-full">
                {lane.tickets.length}
              </span>
            </div>
            <div className="qt-kitchen-tickets">
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
                <article
                  key={`${lane.key}-${ticket.order.id}-${ticket.batch}`}
                  className={`qt-kitchen-ticket ${arrival.fresh.has(JSON.stringify([lane.key, ticket.order.id, ticket.batch])) ? 'qt-kitchen-ticket-new' : ''}`}
                  aria-label={`Comanda ${ticket.order.orderNumber}, ${lane.label}, tanda ${ticket.batch}`}
                >
                  <div className="qt-kitchen-print-slot"><div className="qt-kitchen-paper space-y-3">
                    <div className="qt-kitchen-print-heading"><p>{restaurant?.name ?? 'QuickTap'}</p><span>ORDEN DE COCINA · {lane.label}</span></div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-brand-950 break-words min-w-0 text-base">
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
                          ? `Mesa ${ticket.order.table?.number ?? 'sin asignar'}`
                          : CHANNEL_LABELS[ticket.order.channel] ?? ticket.order.channel}
                      </span>
                      {ticket.batch > 1 && (
                        // Lo que entró después de que la comanda ya estaba en cocina. Sin esta
                        // marca el cocinero no distingue lo nuevo de lo que ya tenía en fuego.
                        <span className="inline-flex items-center gap-1 text-xs bg-sky-100 text-brand-500 px-2 py-0.5 rounded-full font-medium">
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
                    <p className="qt-kitchen-print-time text-base">Entrada: {new Date(ticket.arrivedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Caracas' })} · Tanda {ticket.batch}</p>
                    <ul className="qt-kitchen-items text-sm space-y-1">
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

                    <div className="qt-kitchen-print-end" aria-hidden="true">*** FIN DE COMANDA ***</div>
                  </div>
                  </div>
                  <fieldset disabled={busyOrder !== null} aria-label="Acciones de la comanda" className="qt-kitchen-actions disabled:opacity-60">
                    {ticket.order.status === 'PENDING' ? (
                      // PENDING acá siempre es delivery/pickup recién llegado del cliente: solo
                      // Caja/Admin/Dueño lo puede aceptar (implica coordinar cobro/despacho).
                      // Cocina/Mesero solo ven que está esperando, sin poder tocarlo.
                      (user?.role === 'CASHIER' || isAdminCashier(user?.role, user?.cashierFullAccess)) ? (
                        <button
                          onClick={() => acceptOrder(ticket.order.id)}
                          className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium py-2 transition-colors"
                        >
                          <Check className="h-4 w-4" /> Aceptar pedido
                        </button>
                      ) : (
                        <p className="text-center text-brand-950/40 py-2 text-xs">Esperando que Caja lo acepte…</p>
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
                    {busyOrder === ticket.order.id && <p role="status" className="mt-2 text-center text-brand-950/60 text-xs">Actualizando comanda…</p>}
                  </fieldset>
                </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {manageOpen && (
        <KitchenManageDialog open={manageOpen} onOpenChange={setManageOpen} kitchens={kitchens} onChanged={load} />
      )}
    </div>
  );
}
