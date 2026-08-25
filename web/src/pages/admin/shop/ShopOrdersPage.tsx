import { useCallback, useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { apiOrigin } from '@/utils/apiOrigin';
import { Bike, Check, Download, MessageCircle, Store, X } from 'lucide-react';
import { api, getToken } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase, formatBs } from '@/utils/format';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useTicketDownload } from './TicketDownloadRig';
import type { RawShopTicket } from './shopApi';

export interface ShopOrder {
  id: string;
  orderNumber: number;
  mode: 'PICKUP' | 'DELIVERY';
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  customerName: string;
  customerPhone: string;
  customerIdNumber?: string | null;
  customerAddress: string | null;
  note: string | null;
  paymentMethod: string | null;
  subtotal: number;
  deliveryFee: number;
  total: number;
  totalBs: number | null;
  shopSaleId: string | null;
  createdAt: string;
  items: { id: string; name: string; v1: string; v2: string; qty: number; price: number }[];
  /** Entradas que la venta emitió al confirmar, si el pedido llevaba algún evento. Solo viene
   *  poblado en la respuesta de POST .../confirm — la lista normal no lo trae. */
  tickets?: RawShopTicket[];
}

const PAYMENT_LABELS: Record<string, string> = {
  MOBILE_PAYMENT: 'Pago Móvil',
  ZELLE: 'Zelle',
  CASH: 'Efectivo Bs',
  CASH_USD: 'Efectivo $',
  CARD: 'Punto de Venta',
  BINANCE: 'Binance',
  PAYPAL: 'PayPal',
  TRANSFER: 'Transferencia',
};

/**
 * Pedidos que entraron por el catálogo público de la tienda virtual (/tienda/:slug).
 *
 * Confirmar es lo que los convierte en venta: recién ahí se descuenta el stock y entran en los
 * reportes. Mientras tanto son solo una intención — si se descontara al llegar, cualquiera
 * podría vaciarle el inventario al local haciendo pedidos falsos desde internet.
 */
export interface PedidoAbierto {
  id: string;
  label: string;
  customerName: string | null;
  items: { name?: string; qty?: number; price?: number; disc?: number }[];
  createdByUserName: string | null;
  updatedAt: string;
}

export default function ShopOrdersPage({
  restaurant,
  onRetomarPedido,
}: {
  restaurant: AuthRestaurant;
  /** Devuelve el pedido abierto a la pantalla de Venta para seguir cargándole productos. */
  onRetomarPedido?: (p: PedidoAbierto) => void;
}) {
  const [abiertos, setAbiertos] = useState<PedidoAbierto[]>([]);

  const cargarAbiertos = useCallback(() => {
    api.get('/shop/open-orders').then((r) => setAbiertos(r.data.data)).catch(() => undefined);
  }, []);
  useEffect(cargarAbiertos, [cargarAbiertos]);

  async function descartarAbierto(id: string) {
    if (!window.confirm('¿Descartar este pedido abierto? Lo cargado se pierde.')) return;
    await api.delete(`/shop/open-orders/${id}`).catch(() => undefined);
    cargarAbiertos();
  }

  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  // Entradas recién emitidas al confirmar un pedido, para ofrecer la imagen descargable ahí
  // mismo — es el momento en que el pago ya quedó verificado.
  const [entradasEmitidas, setEntradasEmitidas] = useState<{ order: ShopOrder; tickets: RawShopTicket[] } | null>(null);
  const { rig, descargar, descargando } = useTicketDownload(restaurant);

  const load = useCallback(() => {
    api
      .get('/shop/orders')
      .then((res) => setOrders(res.data.data))
      .catch(() => setError('No pudimos cargar los pedidos.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Un pedido que entra mientras el dueño mira otra cosa tiene que aparecer solo: si hubiera
  // que recargar la página a mano, la tienda virtual no sirve de nada.
  useEffect(() => {
    const socket: Socket = io(apiOrigin() || '/', { auth: { token: getToken() } });
    socket.on('shop:order-new', (order: ShopOrder) => {
      setOrders((prev) => (prev.some((o) => o.id === order.id) ? prev : [order, ...prev]));
    });
    socket.on('shop:order-updated', (order: ShopOrder) => {
      setOrders((prev) => prev.map((o) => (o.id === order.id ? order : o)));
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  async function act(order: ShopOrder, action: 'confirm' | 'cancel') {
    setBusyId(order.id);
    setError(null);
    try {
      const res = await api.post(`/shop/orders/${order.id}/${action}`, {});
      const updated: ShopOrder = res.data.data;
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      if (action === 'confirm' && updated.tickets && updated.tickets.length > 0) {
        setEntradasEmitidas({ order: updated, tickets: updated.tickets });
      }
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo actualizar el pedido.');
    } finally {
      setBusyId(null);
    }
  }

  const pending = orders.filter((o) => o.status === 'PENDING');
  const visible = filter === 'PENDING' ? pending : orders;

  if (loading) return <p className="text-sm text-brand-950/40 font-light">Cargando pedidos…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-brand-950">Pedidos de la tienda</h1>
          <p className="text-sm font-light text-brand-950/50">
            Lo que la gente pide desde tu catálogo en internet. Al confirmar se registra como venta y se
            descuenta del inventario.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-brand-950/[0.05] p-1">
          <FilterTab active={filter === 'PENDING'} onClick={() => setFilter('PENDING')}>
            {`Por atender${pending.length ? ` (${pending.length})` : ''}`}
          </FilterTab>
          <FilterTab active={filter === 'ALL'} onClick={() => setFilter('ALL')}>
            Todos
          </FilterTab>
        </div>
      </div>

      {/* Pedidos abiertos: carritos parados en el POS. Van arriba porque es lo que el cajero
          viene a retomar cuando el cliente vuelve al mostrador. */}
      {abiertos.length > 0 && (
        <section className="rounded-2xl border border-brand-500/25 bg-brand-500/[0.04] p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-brand-950">Pedidos abiertos</h2>
            <span className="text-xs font-light text-brand-950/45">{abiertos.length}</span>
          </div>
          <ul className="space-y-2">
            {abiertos.map((p) => {
              const unidades = p.items.reduce((a, it) => a + (Number(it.qty) || 0), 0);
              const total = p.items.reduce(
                (a, it) => a + (Number(it.price) || 0) * (Number(it.qty) || 0) * (1 - (Number(it.disc) || 0) / 100),
                0,
              );
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-xl bg-white px-3.5 py-3 shadow-sm">
                  <button
                    type="button"
                    onClick={() => onRetomarPedido?.(p)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-[14px] font-semibold text-brand-950">{p.label}</p>
                    <p className="truncate text-[11.5px] font-light text-brand-950/50">
                      {p.items.length} producto{p.items.length === 1 ? '' : 's'}
                      {unidades > 0 && ` · ${unidades} und`} · {formatBase(total, restaurant.currencySymbol ?? '$')}
                      {p.createdByUserName && ` · ${p.createdByUserName}`}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => descartarAbierto(p.id)}
                    aria-label={`Descartar ${p.label}`}
                    className="shrink-0 rounded-lg p-1.5 text-brand-950/35 hover:bg-brand-950/[0.05] hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-950/15 py-12 text-center">
          <p className="text-sm text-brand-950/50 font-light">
            {filter === 'PENDING' ? 'No tienes pedidos por atender.' : 'Todavía no ha entrado ningún pedido.'}
          </p>
          <p className="mt-1 text-xs text-brand-950/35 font-light">
            Comparte el enlace de tu tienda desde Ajustes para empezar a recibirlos.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              restaurant={restaurant}
              busy={busyId === order.id}
              onAct={act}
            />
          ))}
        </ul>
      )}

      {/* Entradas recién emitidas: aparece justo al confirmar un pedido con eventos. El pago ya
          está verificado (es lo que "confirmar" significa acá), así que este es el momento de
          descargar la imagen y mandársela al comprador. */}
      {entradasEmitidas && (
        <Dialog open onOpenChange={(o) => !o && setEntradasEmitidas(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {entradasEmitidas.tickets.length} entrada{entradasEmitidas.tickets.length === 1 ? '' : 's'} lista
                {entradasEmitidas.tickets.length === 1 ? '' : 's'}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm font-light text-brand-950/60">
              Pago confirmado. Descarga la imagen de cada entrada para mandársela a{' '}
              {entradasEmitidas.order.customerName || 'el comprador'}.
            </p>
            <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
              {entradasEmitidas.tickets.map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-xl border border-brand-950/[0.08] px-3 py-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-[11px] font-bold text-brand-500">
                    {t.seatNumber}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-brand-950/70">{t.eventName}</span>
                  <button
                    type="button"
                    onClick={() => descargar(t)}
                    disabled={descargando}
                    className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-brand-500 hover:bg-brand-500/10 disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" /> Descargar
                  </button>
                </div>
              ))}
            </div>
            <DialogFooter>
              {entradasEmitidas.order.customerPhone.replace(/\D/g, '').length >= 7 && (
                <TextureButton
                  variant="minimal"
                  size="default"
                  className="!w-auto"
                  onClick={() => {
                    const enlaces = entradasEmitidas.tickets
                      .map((t) => `Puesto ${t.seatNumber}: ${window.location.origin}/entrada/${t.accessToken}`)
                      .join('\n');
                    const texto = `Tus entradas para ${entradasEmitidas.tickets[0].eventName}:\n${enlaces}`;
                    window.open(
                      `https://wa.me/${entradasEmitidas.order.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`,
                      '_blank',
                      'noopener',
                    );
                  }}
                >
                  <MessageCircle className="h-4 w-4" /> Enviar enlace por WhatsApp
                </TextureButton>
              )}
              <TextureButton variant="brand" size="default" className="!w-auto" onClick={() => setEntradasEmitidas(null)}>
                Listo
              </TextureButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {rig}
    </div>
  );
}

function OrderCard({
  order,
  restaurant,
  busy,
  onAct,
}: {
  order: ShopOrder;
  restaurant: AuthRestaurant;
  busy: boolean;
  onAct: (order: ShopOrder, action: 'confirm' | 'cancel') => void;
}) {
  const symbol = restaurant.currencySymbol ?? '$';
  const rate = restaurant.exchangeRate?.rateBs;
  const waLink = `https://wa.me/${order.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
    `Hola ${order.customerName}, te escribimos por tu pedido #${order.orderNumber}.`,
  )}`;

  return (
    <li className="rounded-2xl border border-brand-950/10 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-brand-950">Pedido #{order.orderNumber}</span>
            <StatusPill status={order.status} />
            <span className="flex items-center gap-1 text-[11px] font-medium text-brand-950/50">
              {order.mode === 'DELIVERY' ? <Bike className="h-3.5 w-3.5" /> : <Store className="h-3.5 w-3.5" />}
              {order.mode === 'DELIVERY' ? 'Delivery' : 'Retiro'}
            </span>
          </div>
          <p className="mt-0.5 text-xs font-light text-brand-950/50">
            {new Date(order.createdAt).toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-brand-950">{formatBase(order.total, symbol)}</p>
          {rate && <p className="text-xs font-light text-brand-950/50">{formatBs(order.total, rate)}</p>}
        </div>
      </div>

      <ul className="mt-3 space-y-0.5 text-sm">
        {order.items.map((it) => (
          <li key={it.id} className="flex justify-between gap-2 text-brand-950/80">
            <span className="min-w-0 truncate font-light">
              {it.qty}× {it.name}
              {(it.v1 || it.v2) && <span className="text-brand-950/40"> · {[it.v1, it.v2].filter(Boolean).join(' ')}</span>}
            </span>
            <span className="shrink-0">{formatBase(it.price * it.qty, symbol)}</span>
          </li>
        ))}
        {order.deliveryFee > 0 && (
          <li className="flex justify-between gap-2 text-brand-950/50 font-light">
            <span>Envío</span>
            <span>{formatBase(order.deliveryFee, symbol)}</span>
          </li>
        )}
      </ul>

      <div className="mt-3 space-y-0.5 border-t border-brand-950/[0.06] pt-3 text-xs text-brand-950/60">
        <p>
          <span className="text-brand-950/40">Cliente:</span> {order.customerName} · {order.customerPhone}
          {order.customerIdNumber ? ` · C.I. ${order.customerIdNumber}` : ''}
        </p>
        {order.customerAddress && (
          <p>
            <span className="text-brand-950/40">Dirección:</span> {order.customerAddress}
          </p>
        )}
        {order.paymentMethod && (
          <p>
            <span className="text-brand-950/40">Pago:</span> {PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}
          </p>
        )}
        {order.note && (
          <p>
            <span className="text-brand-950/40">Nota:</span> {order.note}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a href={waLink} target="_blank" rel="noreferrer">
          <TextureButton variant="minimal" size="sm" className="!w-auto">
            <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
            Escribirle
          </TextureButton>
        </a>

        {order.status === 'PENDING' && (
          <>
            <TextureButton
              variant="brand"
              size="sm"
              disabled={busy}
              className="!w-auto disabled:opacity-50"
              onClick={() => onAct(order, 'confirm')}
            >
              <Check className="mr-1.5 h-3.5 w-3.5" />
              {busy ? 'Confirmando…' : 'Confirmar y registrar venta'}
            </TextureButton>
            <button
              disabled={busy}
              onClick={() => onAct(order, 'cancel')}
              className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-brand-950/45 hover:text-red-600 disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              Cancelar
            </button>
          </>
        )}
        {order.status === 'CONFIRMED' && (
          <span className="text-xs font-light text-emerald-700">
            Registrado como venta. Para revertirlo, devuelve la venta desde el historial.
          </span>
        )}
      </div>
    </li>
  );
}

function StatusPill({ status }: { status: ShopOrder['status'] }) {
  const map = {
    PENDING: { label: 'Por atender', className: 'bg-amber-100 text-amber-700' },
    CONFIRMED: { label: 'Confirmado', className: 'bg-emerald-100 text-emerald-700' },
    CANCELLED: { label: 'Cancelado', className: 'bg-brand-950/10 text-brand-950/50' },
  }[status];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${map.className}`}>{map.label}</span>;
}

function FilterTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
        active ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
      }`}
    >
      {children}
    </button>
  );
}
