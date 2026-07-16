import { useEffect, useState } from 'react';
import { ChevronDown, Clock } from 'lucide-react';
import { api } from '@/api/client';
import { CURRENCY_SYMBOLS, formatBase, formatBsAbsolute } from '@/utils/format';
import { useAuth } from '@/context/AuthContext';
import { hasFeature } from '@/utils/subscription';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const BASE_TABS = [
  { id: 'summary', label: 'Resumen' },
  { id: 'history', label: 'Historial de pedidos' },
  { id: 'products', label: 'Productos' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'payments', label: 'Métodos de pago' },
] as const;
const PAYABLE_TAB = { id: 'payable', label: 'Cuentas por pagar' } as const;

/** Administración: resumen, historial de pedidos, propinas y reporte de productos. Planes Pro/Premium. */
export default function AdministrationPage() {
  const { restaurant } = useAuth();
  const canAccountsPayable = hasFeature(restaurant, 'accountsPayable');
  const TABS = canAccountsPayable ? [...BASE_TABS, PAYABLE_TAB] : BASE_TABS;
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('summary');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Administración</h1>
        <p className="text-sm text-brand-950/60 font-light mt-1">Ventas, pedidos, propinas y productos de tu restaurante.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-brand-500 text-white shadow-[0_10px_24px_-8px_rgba(5,108,242,0.5)]'
                : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'summary' && <SummaryTab />}
      {tab === 'history' && <HistoryTab />}
      {tab === 'products' && <ProductsTab />}
      {tab === 'delivery' && <DeliveryTab />}
      {tab === 'payments' && <PaymentsTab />}
      {tab === 'payable' && <PayableTab />}
    </div>
  );
}

function SummaryTab() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [range, setRange] = useState<Range>('day');
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/orders/history', { params: { range, pageSize: 100 } })
      .then((res) => setResult(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el resumen.'));
  }, [range]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {(['day', 'week', 'month', 'year'] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      {result && (
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6">
            <p className="text-2xl font-semibold text-brand-950">{formatBsAbsolute(result.totalBs)}</p>
            <p className="text-xs text-brand-950/50 font-light mt-1">En bolívares</p>
          </div>
          <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6">
            <p className="text-2xl font-semibold text-brand-950">{formatBase(result.totalBase, symbol)}</p>
            <p className="text-xs text-brand-950/50 font-light mt-1">En {symbol}</p>
          </div>
          <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6">
            <p className="text-2xl font-semibold text-brand-950">{result.total}</p>
            <p className="text-xs text-brand-950/50 font-light mt-1">Pedidos · {RANGE_LABELS[range]}</p>
          </div>
        </div>
      )}

      <div>
        <p className="text-sm font-medium text-brand-950/70 mb-3">Detalle de ventas · {RANGE_LABELS[range]}</p>
        <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm divide-y divide-brand-950/[0.06] max-h-[36rem] overflow-y-auto">
          {result?.orders.length === 0 && <p className="p-5 text-sm text-brand-950/40 font-light">Sin ventas en este período.</p>}
          {result?.orders.map((o) => (
            <OrderDetailRow key={o.id} order={o} symbol={symbol} />
          ))}
        </div>
        {result && result.total > result.pageSize && (
          <p className="text-xs text-brand-950/40 mt-2 text-center">
            Mostrando los {result.pageSize} pedidos más recientes de {result.total}.
          </p>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
//  Historial de pedidos + propinas
// -----------------------------------------------------------------------------

type Range = 'day' | 'week' | 'month' | 'year' | 'all';
type Channel = 'DINE_IN' | 'DELIVERY' | 'PICKUP';
type PaymentMethod = 'MOBILE_PAYMENT' | 'ZELLE' | 'CASH' | 'CARD';

const RANGE_LABELS: Record<Range, string> = { day: 'Hoy', week: 'Semana', month: 'Este mes', year: 'Este año', all: 'Todo' };
const CHANNEL_ROW_LABELS: Record<Channel, string> = { DINE_IN: 'Mesa', DELIVERY: 'Delivery', PICKUP: 'Pickup' };
const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  MOBILE_PAYMENT: 'Pago Móvil',
  ZELLE: 'Zelle',
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
};

interface HistoryOrderItem {
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

interface HistoryOrder {
  id: string;
  orderNumber: number;
  channel: Channel;
  status: string;
  paymentMethod: PaymentMethod | null;
  subtotalBase: string;
  serviceChargeBase: string;
  ivaBase: string;
  deliveryFeeBase: string;
  totalBase: string;
  totalBs: string;
  tipBase: string;
  currency: string;
  customerName: string | null;
  placedByName: string | null;
  table: string | null;
  createdAt: string;
  items: HistoryOrderItem[];
}

interface HistoryResult {
  total: number;
  page: number;
  pageSize: number;
  totalBase: string;
  totalBs: string;
  totalTipBase: string;
  orders: HistoryOrder[];
}

/** Fila expandible de una venta: resumen + detalle completo (productos, IVA, servicio, envío). */
function OrderDetailRow({
  order,
  symbol,
  highlightProductId,
}: {
  order: HistoryOrder;
  symbol: string;
  highlightProductId?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const highlightItem = highlightProductId ? order.items.find((i) => i.productId === highlightProductId) : null;

  return (
    <div className="px-5 py-3">
      <button onClick={() => setExpanded((e) => !e)} className="w-full flex items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="text-sm font-medium text-brand-950">
            #{order.orderNumber}
            {order.customerName && <span className="font-normal text-brand-950/60"> · {order.customerName}</span>}
          </p>
          <p className="text-xs text-brand-950/40">
            {CHANNEL_ROW_LABELS[order.channel]}
            {order.table && ` ${order.table}`} · {new Date(order.createdAt).toLocaleString('es-VE')}
            {highlightItem && ` · ${highlightItem.quantity}x`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-semibold text-brand-950">{formatBase(order.totalBase, symbol)}</span>
          <ChevronDown className={`h-4 w-4 text-brand-950/30 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {expanded && (
        <div className="mt-3 space-y-2 border-t border-brand-950/10 pt-3">
          <ul className="space-y-1">
            {order.items.map((it, idx) => (
              <li
                key={idx}
                className={`flex justify-between gap-2 text-xs ${
                  it.productId && it.productId === highlightProductId ? 'text-brand-500 font-medium' : 'text-brand-950/70'
                }`}
              >
                <span className="truncate">
                  {it.quantity}x {it.productName} · {formatBase(it.unitPrice, symbol)} c/u
                </span>
                <span className="shrink-0">{formatBase(it.lineTotal, symbol)}</span>
              </li>
            ))}
          </ul>
          <div className="text-xs text-brand-950/60 space-y-1 pt-2 border-t border-brand-950/10">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatBase(order.subtotalBase, symbol)}</span>
            </div>
            {Number(order.serviceChargeBase) > 0 && (
              <div className="flex justify-between">
                <span>Servicio</span>
                <span>{formatBase(order.serviceChargeBase, symbol)}</span>
              </div>
            )}
            {Number(order.ivaBase) > 0 && (
              <div className="flex justify-between">
                <span>IVA</span>
                <span>{formatBase(order.ivaBase, symbol)}</span>
              </div>
            )}
            {Number(order.deliveryFeeBase) > 0 && (
              <div className="flex justify-between">
                <span>Envío</span>
                <span>{formatBase(order.deliveryFeeBase, symbol)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-brand-950">
              <span>Total</span>
              <span>{formatBase(order.totalBase, symbol)}</span>
            </div>
            <div className="flex justify-between">
              <span>Equivalente en Bs</span>
              <span>{formatBsAbsolute(order.totalBs)}</span>
            </div>
          </div>
          <p className="text-xs text-brand-950/40">
            {order.paymentMethod ? PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod : 'Sin método de pago registrado'}
            {order.placedByName && ` · Mesero: ${order.placedByName}`}
          </p>
        </div>
      )}
    </div>
  );
}

/** Ventana con el listado detallado de pedidos que cumplen un filtro (drill-down desde Productos / Métodos de pago). */
function OrdersListDialog({
  title,
  params,
  highlightProductId,
  onClose,
}: {
  title: string;
  params: Record<string, string | number | undefined>;
  highlightProductId?: string | null;
  onClose: () => void;
}) {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/orders/history', { params: { ...params, pageSize: 100 } })
      .then((res) => setResult(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el detalle.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {result && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-brand-950/10 p-3">
                <p className="text-lg font-semibold text-brand-950">{formatBase(result.totalBase, symbol)}</p>
                <p className="text-xs text-brand-950/50 font-light">
                  {result.total} pedido{result.total === 1 ? '' : 's'}
                </p>
              </div>
              <div className="rounded-xl border border-brand-950/10 p-3">
                <p className="text-lg font-semibold text-brand-950">{formatBsAbsolute(result.totalBs)}</p>
                <p className="text-xs text-brand-950/50 font-light">En bolívares</p>
              </div>
            </div>
          )}
          <div className="rounded-2xl border border-brand-950/10 divide-y divide-brand-950/[0.06] max-h-96 overflow-y-auto">
            {result?.orders.length === 0 && <p className="p-5 text-sm text-brand-950/40 font-light">Sin movimientos.</p>}
            {result?.orders.map((o) => (
              <OrderDetailRow key={o.id} order={o} symbol={symbol} highlightProductId={highlightProductId} />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HistoryTab() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [range, setRange] = useState<Range>('day');
  const [channel, setChannel] = useState<Channel | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [placedBy, setPlacedBy] = useState<'staff' | 'customer' | ''>('');
  const [waiterId, setWaiterId] = useState('');
  const [waiters, setWaiters] = useState<{ id: string; name: string }[]>([]);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingTip, setEditingTip] = useState<string | null>(null);
  const [tipDraft, setTipDraft] = useState('');

  useEffect(() => {
    api.get('/orders/waiters').then((res) => setWaiters(res.data.data));
  }, []);

  function load() {
    api
      .get('/orders/history', {
        params: {
          range,
          channel: channel || undefined,
          paymentMethod: paymentMethod || undefined,
          placedBy: placedBy || undefined,
          placedByUserId: waiterId || undefined,
          page,
        },
      })
      .then((res) => setResult(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el historial.'));
  }

  useEffect(load, [range, channel, paymentMethod, placedBy, waiterId, page]);
  useEffect(() => setPage(1), [range, channel, paymentMethod, placedBy, waiterId]);

  async function saveTip(orderId: string) {
    try {
      await api.patch(`/orders/${orderId}/tip`, { tipBase: Number(tipDraft) || 0 });
      setEditingTip(null);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar la propina.');
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={channel} onChange={(e) => setChannel(e.target.value as Channel | '')} className="text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5">
          <option value="">Todos los canales</option>
          <option value="DINE_IN">En mesa</option>
          <option value="DELIVERY">Delivery</option>
          <option value="PICKUP">Pickup</option>
        </select>
        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | '')} className="text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5">
          <option value="">Todos los métodos de pago</option>
          {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((p) => (
            <option key={p} value={p}>
              {PAYMENT_LABELS[p]}
            </option>
          ))}
        </select>
        {(channel === 'DINE_IN' || channel === '') && (
          <select value={placedBy} onChange={(e) => setPlacedBy(e.target.value as 'staff' | 'customer' | '')} className="text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5">
            <option value="">Mesa: cliente o mesero</option>
            <option value="customer">Solo pedido por el cliente</option>
            <option value="staff">Solo cargado por un mesero</option>
          </select>
        )}
        {waiters.length > 0 && (
          <select value={waiterId} onChange={(e) => setWaiterId(e.target.value)} className="text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5">
            <option value="">Mesero: todos</option>
            {waiters.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {result && (
        <div className="grid sm:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-5">
            <p className="text-xl font-semibold text-brand-950">{formatBsAbsolute(result.totalBs)}</p>
            <p className="text-xs text-brand-950/50 font-light mt-1">Ingresos en Bs</p>
          </div>
          <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-5">
            <p className="text-xl font-semibold text-brand-950">{formatBase(result.totalBase, symbol)}</p>
            <p className="text-xs text-brand-950/50 font-light mt-1">Ingresos en {symbol}</p>
          </div>
          <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-5">
            <p className="text-xl font-semibold text-brand-950">{formatBase(result.totalTipBase, symbol)}</p>
            <p className="text-xs text-brand-950/50 font-light mt-1">Propinas</p>
          </div>
          <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-5">
            <p className="text-xl font-semibold text-brand-950">{result.total}</p>
            <p className="text-xs text-brand-950/50 font-light mt-1">Pedidos</p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm divide-y divide-brand-950/[0.06] overflow-x-auto">
        {result?.orders.length === 0 && <p className="p-5 text-sm text-brand-950/40 font-light">Sin pedidos en este filtro.</p>}
        {result?.orders.map((o) => (
          <div key={o.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm min-w-[560px]">
            <div className="w-16 shrink-0 font-medium text-brand-950">#{o.orderNumber}</div>
            <div className="w-24 shrink-0 text-brand-950/60">{CHANNEL_ROW_LABELS[o.channel]}</div>
            <div className="w-28 shrink-0 text-brand-950/60">
              {o.channel === 'DINE_IN' ? (o.placedByName ? `Mesero: ${o.placedByName}` : 'Cliente') : (o.paymentMethod ? PAYMENT_LABELS[o.paymentMethod] : '—')}
            </div>
            <div className="w-28 shrink-0 text-brand-950">{formatBsAbsolute(o.totalBs)}</div>
            <div className="w-28 shrink-0">
              {editingTip === o.id ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={tipDraft}
                    onChange={(e) => setTipDraft(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-16 border border-brand-950/15 rounded px-1.5 py-0.5 text-xs"
                  />
                  <button onClick={() => saveTip(o.id)} className="text-xs text-brand-500 font-medium">
                    Guardar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setEditingTip(o.id);
                    setTipDraft(o.tipBase);
                  }}
                  className="text-brand-950/60 hover:text-brand-500"
                >
                  {formatBase(o.tipBase, symbol)} ✎
                </button>
              )}
            </div>
            <div className="flex-1 text-right text-xs text-brand-950/40">{new Date(o.createdAt).toLocaleString('es-VE')}</div>
          </div>
        ))}
      </div>

      {result && result.total > result.pageSize && (
        <div className="flex items-center justify-center gap-3">
          <TextureButton variant="minimal" size="sm" className="!w-auto px-4" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </TextureButton>
          <span className="text-xs text-brand-950/50">
            Página {result.page} de {Math.ceil(result.total / result.pageSize)}
          </span>
          <TextureButton
            variant="minimal"
            size="sm"
            className="!w-auto px-4"
            disabled={page >= Math.ceil(result.total / result.pageSize)}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </TextureButton>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
//  Reporte de productos
// -----------------------------------------------------------------------------

interface ProductReportRow {
  productId: string | null;
  name: string;
  quantity: number;
  revenueBase: string;
}

function ProductsTab() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [range, setRange] = useState<Range>('month');
  const [rows, setRows] = useState<ProductReportRow[] | null>(null);
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const [error, setError] = useState<string | null>(null);
  const [detailProduct, setDetailProduct] = useState<{ productId: string; name: string } | null>(null);

  useEffect(() => {
    api
      .get('/orders/reports/products', { params: { range } })
      .then((res) => setRows(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el reporte.'));
  }, [range]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  const sorted = rows ? [...rows].sort((a, b) => (order === 'desc' ? b.quantity - a.quantity : a.quantity - b.quantity)) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
        <span className="w-px h-4 bg-brand-950/10 mx-1" />
        <button
          onClick={() => setOrder('desc')}
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${order === 'desc' ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'}`}
        >
          Más vendidos
        </button>
        <button
          onClick={() => setOrder('asc')}
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${order === 'asc' ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'}`}
        >
          Menos vendidos
        </button>
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm divide-y divide-brand-950/[0.06]">
        {sorted?.length === 0 && <p className="p-5 text-sm text-brand-950/40 font-light">Sin ventas en este rango.</p>}
        {sorted?.map((r, i) => (
          <div key={r.productId ?? r.name} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs text-brand-950/30 font-medium w-5 shrink-0">{i + 1}</span>
              <p className="text-sm font-medium text-brand-950 truncate">{r.name}</p>
            </div>
            <div className="flex items-center gap-4 shrink-0 text-right">
              {r.productId ? (
                <button
                  onClick={() => setDetailProduct({ productId: r.productId!, name: r.name })}
                  className="text-sm text-brand-500 hover:text-brand-400 font-medium underline decoration-dotted underline-offset-2"
                >
                  {r.quantity} vendidos
                </button>
              ) : (
                <span className="text-sm text-brand-950/70">{r.quantity} vendidos</span>
              )}
              <span className="text-sm font-medium text-brand-950 w-20">{formatBase(r.revenueBase, symbol)}</span>
            </div>
          </div>
        ))}
      </div>

      {detailProduct && (
        <OrdersListDialog
          title={`${detailProduct.name} · ${RANGE_LABELS[range]}`}
          params={{ productId: detailProduct.productId, range }}
          highlightProductId={detailProduct.productId}
          onClose={() => setDetailProduct(null)}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
//  Delivery: movimiento por repartidor
// -----------------------------------------------------------------------------

interface CourierStatsRow {
  courierId: string;
  name: string;
  whatsappPhone: string;
  isActive: boolean;
  deliveries: number;
  totalBase: string;
  totalBs: string;
  totalTipBase: string;
}

function DeliveryTab() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [range, setRange] = useState<Range>('month');
  const [rows, setRows] = useState<CourierStatsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/orders/reports/couriers', { params: { range } })
      .then((res) => setRows(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el movimiento de delivery.'));
  }, [range]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm divide-y divide-brand-950/[0.06]">
        {rows?.length === 0 && (
          <p className="p-5 text-sm text-brand-950/40 font-light">
            Agrega repartidores en Ajustes → Equipo de Delivery para ver su movimiento aquí.
          </p>
        )}
        {rows?.map((r) => (
          <div key={r.courierId} className="flex items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="font-medium text-brand-950 flex items-center gap-1.5">
                {r.name}
                {!r.isActive && <span className="text-xs text-brand-950/40 font-light">(inactivo)</span>}
              </p>
              <p className="text-xs text-brand-950/40 font-light">{r.whatsappPhone}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-brand-950">{r.deliveries} entregas</p>
              <p className="text-xs text-brand-950/50 font-light">
                {formatBase(r.totalBase, symbol)}
                {Number(r.totalTipBase) > 0 && ` · propinas ${formatBase(r.totalTipBase, symbol)}`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
//  Métodos de pago: movimiento por método
// -----------------------------------------------------------------------------

interface PaymentStatsRow {
  method: string;
  count: number;
  totalBase: string;
  totalBs: string;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  MOBILE_PAYMENT: 'Pago Móvil',
  ZELLE: 'Zelle',
  CASH: 'Efectivo',
  CARD: 'Punto de Venta',
  BINANCE: 'Binance',
  PAYPAL: 'PayPal',
  TRANSFER: 'Transferencia',
  SIN_METODO: 'Sin especificar',
};

function PaymentsTab() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [range, setRange] = useState<Range>('month');
  const [rows, setRows] = useState<PaymentStatsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailMethod, setDetailMethod] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/orders/reports/payment-methods', { params: { range } })
      .then((res) => setRows(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el movimiento por método de pago.'));
  }, [range]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm divide-y divide-brand-950/[0.06]">
        {rows?.length === 0 && <p className="p-5 text-sm text-brand-950/40 font-light">Sin pedidos en este rango.</p>}
        {rows?.map((r) =>
          r.method === 'SIN_METODO' ? (
            <div key={r.method} className="flex items-center justify-between gap-3 px-5 py-4">
              <p className="font-medium text-brand-950">{PAYMENT_METHOD_LABELS[r.method] ?? r.method}</p>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-brand-950">{formatBase(r.totalBase, symbol)}</p>
                <p className="text-xs text-brand-950/50 font-light">{r.count} pedidos</p>
              </div>
            </div>
          ) : (
            <button
              key={r.method}
              onClick={() => setDetailMethod(r.method)}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-brand-950/[0.02] transition-colors"
            >
              <p className="font-medium text-brand-950">{PAYMENT_METHOD_LABELS[r.method] ?? r.method}</p>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-brand-950">{formatBase(r.totalBase, symbol)}</p>
                <p className="text-xs text-brand-950/50 font-light">{r.count} pedidos</p>
              </div>
            </button>
          ),
        )}
      </div>

      {detailMethod && (
        <OrdersListDialog
          title={`${PAYMENT_METHOD_LABELS[detailMethod] ?? detailMethod} · ${RANGE_LABELS[range]}`}
          params={{ paymentMethod: detailMethod, range }}
          onClose={() => setDetailMethod(null)}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
//  Cuentas por pagar: cuentas abiertas marcadas con el botón del reloj en Pedidos
// -----------------------------------------------------------------------------

interface PayableOrder {
  id: string;
  orderNumber: number;
  channel: Channel;
  customerName: string | null;
  totalBase: string;
  totalBs: string;
  currency: string;
  createdAt: string;
}

function PayableTab() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [orders, setOrders] = useState<PayableOrder[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get('/orders/live')
      .then((res) => setOrders((res.data.data as (PayableOrder & { awaitingPayment: boolean })[]).filter((o) => o.awaitingPayment)))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar las cuentas por pagar.'));
  }

  useEffect(load, []);

  async function markPaid(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.patch(`/orders/${id}/status`, { status: 'SERVED' });
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo marcar como pagado.');
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-5">
      <p className="text-sm text-brand-950/60 font-light">
        Cuentas abiertas marcadas con el botón del reloj en Pedidos, esperando a que el cliente pague.
      </p>
      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm divide-y divide-brand-950/[0.06]">
        {orders?.length === 0 && (
          <p className="p-5 text-sm text-brand-950/40 font-light">No hay cuentas pendientes por pagar.</p>
        )}
        {orders?.map((o) => (
          <div key={o.id} className="flex items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="h-4 w-4 text-amber-500 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-brand-950 truncate">
                  #{o.orderNumber}
                  {o.customerName && <span className="font-normal text-brand-950/60"> · {o.customerName}</span>}
                </p>
                <p className="text-xs text-brand-950/40 font-light">
                  {CHANNEL_ROW_LABELS[o.channel]} · {new Date(o.createdAt).toLocaleString('es-VE')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm font-semibold text-brand-950">{formatBase(o.totalBase, symbol)}</span>
              <TextureButton
                variant="brand"
                size="sm"
                className="!w-auto px-3"
                disabled={busyId === o.id}
                onClick={() => markPaid(o.id)}
              >
                Marcar pagado
              </TextureButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
