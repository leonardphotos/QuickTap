import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { CURRENCY_SYMBOLS, formatBase, formatBsAbsolute } from '@/utils/format';
import { useAuth } from '@/context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';

interface ChannelBreakdown {
  DINE_IN: number;
  DELIVERY: number;
  PICKUP: number;
}

interface PeriodSummary {
  ordersCount: number;
  totalBase: string;
  totalBs: string;
  byChannel: ChannelBreakdown;
}

interface AdminSummary {
  currency: string;
  today: PeriodSummary;
  month: PeriodSummary;
  allTime: PeriodSummary;
}

const CHANNEL_LABELS: Record<keyof ChannelBreakdown, string> = {
  DINE_IN: 'En mesa',
  DELIVERY: 'Delivery',
  PICKUP: 'Pickup',
};

const TABS = [
  { id: 'summary', label: 'Resumen' },
  { id: 'history', label: 'Historial de pedidos' },
  { id: 'products', label: 'Productos' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'payments', label: 'Métodos de pago' },
] as const;

/** Administración: resumen, historial de pedidos, propinas y reporte de productos. Exclusivo del plan Premium. */
export default function AdministrationPage() {
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
    </div>
  );
}

function SummaryTab() {
  const { restaurant } = useAuth();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/orders/summary/admin')
      .then((res) => setSummary(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el resumen.'));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!summary) return <p className="text-brand-950/50 font-light">Cargando…</p>;

  return (
    <div className="space-y-8">
      <PeriodSection title="Hoy" period={summary.today} symbol={restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$'} />
      <PeriodSection title="Este mes" period={summary.month} symbol={restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$'} />
      <PeriodSection title="Histórico" period={summary.allTime} symbol={restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$'} />
    </div>
  );
}

function PeriodSection({ title, period, symbol }: { title: string; period: PeriodSummary; symbol: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-brand-950/70 mb-3">{title}</p>
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6">
          <p className="text-2xl font-semibold text-brand-950">{formatBsAbsolute(period.totalBs)}</p>
          <p className="text-xs text-brand-950/50 font-light mt-1">En bolívares</p>
        </div>
        <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6">
          <p className="text-2xl font-semibold text-brand-950">{formatBase(period.totalBase, symbol)}</p>
          <p className="text-xs text-brand-950/50 font-light mt-1">En {symbol}</p>
        </div>
        <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6">
          <p className="text-2xl font-semibold text-brand-950">{period.ordersCount}</p>
          <p className="text-xs text-brand-950/50 font-light mt-1">
            Pedidos ·{' '}
            {(Object.keys(CHANNEL_LABELS) as (keyof ChannelBreakdown)[])
              .filter((k) => period.byChannel[k] > 0)
              .map((k) => `${CHANNEL_LABELS[k]}: ${period.byChannel[k]}`)
              .join(' · ') || 'sin pedidos'}
          </p>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
//  Historial de pedidos + propinas
// -----------------------------------------------------------------------------

type Range = 'day' | 'month' | 'year' | 'all';
type Channel = 'DINE_IN' | 'DELIVERY' | 'PICKUP';
type PaymentMethod = 'MOBILE_PAYMENT' | 'ZELLE' | 'CASH' | 'CARD';

const RANGE_LABELS: Record<Range, string> = { day: 'Hoy', month: 'Este mes', year: 'Este año', all: 'Todo' };
const CHANNEL_ROW_LABELS: Record<Channel, string> = { DINE_IN: 'Mesa', DELIVERY: 'Delivery', PICKUP: 'Pickup' };
const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  MOBILE_PAYMENT: 'Pago Móvil',
  ZELLE: 'Zelle',
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
};

interface HistoryOrder {
  id: string;
  orderNumber: number;
  channel: Channel;
  status: string;
  paymentMethod: PaymentMethod | null;
  totalBase: string;
  totalBs: string;
  tipBase: string;
  currency: string;
  customerName: string | null;
  placedByName: string | null;
  table: string | null;
  createdAt: string;
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

function HistoryTab() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [range, setRange] = useState<Range>('day');
  const [channel, setChannel] = useState<Channel | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [placedBy, setPlacedBy] = useState<'staff' | 'customer' | ''>('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingTip, setEditingTip] = useState<string | null>(null);
  const [tipDraft, setTipDraft] = useState('');

  function load() {
    api
      .get('/orders/history', { params: { range, channel: channel || undefined, paymentMethod: paymentMethod || undefined, placedBy: placedBy || undefined, page } })
      .then((res) => setResult(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el historial.'));
  }

  useEffect(load, [range, channel, paymentMethod, placedBy, page]);
  useEffect(() => setPage(1), [range, channel, paymentMethod, placedBy]);

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
              <span className="text-sm text-brand-950/70">{r.quantity} vendidos</span>
              <span className="text-sm font-medium text-brand-950 w-20">{formatBase(r.revenueBase, symbol)}</span>
            </div>
          </div>
        ))}
      </div>
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
        {rows?.map((r) => (
          <div key={r.method} className="flex items-center justify-between gap-3 px-5 py-4">
            <p className="font-medium text-brand-950">{PAYMENT_METHOD_LABELS[r.method] ?? r.method}</p>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-brand-950">{formatBase(r.totalBase, symbol)}</p>
              <p className="text-xs text-brand-950/50 font-light">{r.count} pedidos</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
