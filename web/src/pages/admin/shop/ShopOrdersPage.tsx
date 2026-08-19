import { useCallback, useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_ORIGIN } from '@/utils/apiOrigin';
import { Bike, Check, MessageCircle, Store, X } from 'lucide-react';
import { api, getToken } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase, formatBs } from '@/utils/format';

export interface ShopOrder {
  id: string;
  orderNumber: number;
  mode: 'PICKUP' | 'DELIVERY';
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  customerName: string;
  customerPhone: string;
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
export default function ShopOrdersPage({ restaurant }: { restaurant: AuthRestaurant }) {
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');

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
    const socket: Socket = io(API_ORIGIN || '/', { auth: { token: getToken() } });
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
