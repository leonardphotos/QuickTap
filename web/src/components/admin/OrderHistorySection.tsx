import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Download, DollarSign, Receipt, Wallet } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, formatBase, formatBsAbsolute } from '@/utils/format';
import { PAYMENT_LABELS as ALL_PAYMENT_LABELS } from '@/components/admin/PaymentDialog';
import type { PaymentMethod as AnyPaymentMethod } from '@/types';
import { MetricCard } from '@/components/admin/MetricCard';
import { TextureButton } from '@/components/ui/texture-button';

// -----------------------------------------------------------------------------
//  Historial de pedidos — compartido por Administración → Historial y por
//  Delivery → Historial (mismos filtros, métricas, exportación y detalle).
// -----------------------------------------------------------------------------

export type Range = 'day' | 'week' | 'month' | 'year' | 'all';
export type Channel = 'DINE_IN' | 'DELIVERY' | 'PICKUP' | 'BAR' | 'EXPRESS';
export type HistoryPaymentMethod = 'MOBILE_PAYMENT' | 'ZELLE' | 'CASH' | 'CARD';
/** Quién cargó el pedido: personal, el propio cliente desde su teléfono o la tablet de autoservicio. */
export type OrderSource = 'STAFF' | 'CUSTOMER' | 'KIOSK';

export const RANGE_LABELS: Record<Range, string> = {
  day: 'Hoy',
  week: 'Semana',
  month: 'Este mes',
  year: 'Este año',
  all: 'Todo',
};
export const CHANNEL_ROW_LABELS: Record<Channel, string> = {
  DINE_IN: 'Mesa',
  DELIVERY: 'Delivery',
  PICKUP: 'Pickup',
  BAR: 'Barra',
  EXPRESS: 'Express',
};
export const HISTORY_PAYMENT_LABELS: Record<HistoryPaymentMethod, string> = {
  MOBILE_PAYMENT: 'Pago Móvil',
  ZELLE: 'Zelle',
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
};
const SOURCE_LABELS: Record<OrderSource, string> = {
  STAFF: 'Personal',
  CUSTOMER: 'Cliente',
  KIOSK: 'Autoservicio',
};

export interface HistoryOrderItem {
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface HistoryOrderPayment {
  method: string;
  referenceNumber: string | null;
  amountBase: string;
  discountBase: string | null;
  createdAt: string;
}

export interface HistoryOrder {
  id: string;
  orderNumber: number;
  channel: Channel;
  status: string;
  paymentMethod: HistoryPaymentMethod | null;
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
  source: OrderSource;
  table: string | null;
  createdAt: string;
  items: HistoryOrderItem[];
  payments: HistoryOrderPayment[];
}

export interface HistoryResult {
  total: number;
  page: number;
  pageSize: number;
  totalBase: string;
  totalBs: string;
  totalTipBase: string;
  avgTicketBase: string;
  orders: HistoryOrder[];
}

/** Fila de un pedido: al presionarla se abre el detalle completo (productos, IVA, servicio, pagos). */
export function OrderDetailRow({
  order,
  symbol,
  highlightProductId,
  onTipSaved,
}: {
  order: HistoryOrder;
  symbol: string;
  highlightProductId?: string | null;
  /** Si se pasa, el detalle permite editar la propina del pedido. */
  onTipSaved?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingTip, setEditingTip] = useState(false);
  const [tipDraft, setTipDraft] = useState('');
  const [tipError, setTipError] = useState<string | null>(null);
  const highlightItem = highlightProductId ? order.items.find((i) => i.productId === highlightProductId) : null;

  async function saveTip() {
    setTipError(null);
    try {
      await api.patch(`/orders/${order.id}/tip`, { tipBase: Number(tipDraft) || 0 });
      setEditingTip(false);
      onTipSaved?.();
    } catch (err: any) {
      setTipError(err.response?.data?.error ?? 'No se pudo guardar la propina.');
    }
  }

  return (
    <div className="px-5 py-3">
      <button onClick={() => setExpanded((e) => !e)} className="flex w-full items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="text-sm font-medium text-brand-950">
            #{order.orderNumber}
            {order.customerName && <span className="font-normal text-brand-950/60"> · {order.customerName}</span>}
          </p>
          <p className="text-xs text-brand-950/40">
            {CHANNEL_ROW_LABELS[order.channel]}
            {order.table && ` ${order.table}`} · {new Date(order.createdAt).toLocaleString('es-VE')}
            {order.source === 'KIOSK' && ' · Autoservicio'}
            {order.source === 'STAFF' && order.placedByName && ` · ${order.placedByName}`}
            {highlightItem && ` · ${highlightItem.quantity}x`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
                  it.productId && it.productId === highlightProductId ? 'font-medium text-brand-500' : 'text-brand-950/70'
                }`}
              >
                <span className="truncate">
                  {it.quantity}x {it.productName} · {formatBase(it.unitPrice, symbol)} c/u
                </span>
                <span className="shrink-0">{formatBase(it.lineTotal, symbol)}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-1 border-t border-brand-950/10 pt-2 text-xs text-brand-950/60">
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
            <div className="flex items-center justify-between gap-2">
              <span>Propina</span>
              {onTipSaved && editingTip ? (
                <span className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={tipDraft}
                    onChange={(e) => setTipDraft(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-16 rounded border border-brand-950/15 px-1.5 py-0.5 text-xs"
                  />
                  <button onClick={saveTip} className="text-xs font-medium text-brand-500">
                    Guardar
                  </button>
                </span>
              ) : onTipSaved ? (
                <button
                  onClick={() => {
                    setEditingTip(true);
                    setTipDraft(order.tipBase);
                  }}
                  className="hover:text-brand-500"
                >
                  {formatBase(order.tipBase, symbol)} ✎
                </button>
              ) : (
                <span>{formatBase(order.tipBase, symbol)}</span>
              )}
            </div>
            {tipError && <p className="text-red-600">{tipError}</p>}
            <div className="flex justify-between font-semibold text-brand-950">
              <span>Total</span>
              <span>{formatBase(order.totalBase, symbol)}</span>
            </div>
            <div className="flex justify-between">
              <span>Equivalente en Bs</span>
              <span>{formatBsAbsolute(order.totalBs)}</span>
            </div>
          </div>
          {order.payments.length > 0 ? (
            <div className="space-y-1 pt-1">
              {order.payments.map((p, i) => (
                <p key={i} className="text-xs text-brand-950/50">
                  {ALL_PAYMENT_LABELS[p.method as AnyPaymentMethod] ?? p.method}
                  {p.referenceNumber && ` · Ref: ${p.referenceNumber}`}
                  {order.payments.length > 1 && ` · ${formatBase(p.amountBase, symbol)}`}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-brand-950/40">
              {order.paymentMethod
                ? HISTORY_PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod
                : 'Sin método de pago registrado'}
            </p>
          )}
          <p className="text-xs text-brand-950/40">
            Origen: {SOURCE_LABELS[order.source]}
            {order.source === 'STAFF' && order.placedByName && ` · ${order.placedByName}`}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Historial de pedidos completo: filtros (rango, desde–hasta, canal, método de pago,
 * origen incluido el autoservicio, mesero), métricas del período, exportación a Excel
 * con esos mismos filtros y detalle expandible de cada pedido.
 */
export function OrderHistorySection({
  channels,
  defaultRange = 'day',
  showChannelFilter = true,
}: {
  /** Restringe el historial a estos canales (Delivery lo usa para ver solo delivery/pickup). */
  channels?: Channel[];
  defaultRange?: Range;
  showChannelFilter?: boolean;
}) {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const channelOptions = channels ?? (['DINE_IN', 'BAR', 'EXPRESS', 'DELIVERY', 'PICKUP'] as Channel[]);

  const [range, setRange] = useState<Range>(defaultRange);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [channel, setChannel] = useState<Channel | ''>(channels?.length === 1 ? channels[0] : '');
  const [paymentMethod, setPaymentMethod] = useState<HistoryPaymentMethod | ''>('');
  const [placedBy, setPlacedBy] = useState<'staff' | 'customer' | 'kiosk' | ''>('');
  const [waiterId, setWaiterId] = useState('');
  const [waiters, setWaiters] = useState<{ id: string; name: string }[]>([]);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Con canales fijos (Delivery) y sin canal elegido, el backend recibe uno solo por
  // petición: se pide el primero y se completa con el resto en el filtro de la pantalla.
  const params = useCallback(
    () => ({
      range: from || to ? undefined : range,
      from: from || undefined,
      to: to || undefined,
      channel: channel || undefined,
      channels: channels && !channel ? channels.join(',') : undefined,
      paymentMethod: paymentMethod || undefined,
      placedBy: placedBy || undefined,
      placedByUserId: waiterId || undefined,
    }),
    [range, from, to, channel, channels, paymentMethod, placedBy, waiterId],
  );

  useEffect(() => {
    api
      .get('/orders/waiters')
      .then((res) => setWaiters(res.data.data))
      .catch(() => setWaiters([]));
  }, []);

  const load = useCallback(() => {
    api
      .get('/orders/history', { params: { ...params(), page } })
      .then((res) => setResult(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el historial.'));
  }, [params, page]);

  useEffect(load, [load]);
  useEffect(() => setPage(1), [range, from, to, channel, paymentMethod, placedBy, waiterId]);

  async function exportExcel() {
    setDownloading(true);
    setError(null);
    try {
      const res = await api.get('/orders/export/history', { params: params(), responseType: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(res.data);
      link.download = `Historial de pedidos - ${(restaurant?.name ?? 'QuickTap').replace(/[\\/:*?"<>|]/g, '').trim()}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      setError('No se pudo generar el archivo. Intenta de nuevo.');
    } finally {
      setDownloading(false);
    }
  }

  const dateActive = !!(from || to);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => {
              setRange(r);
              setFrom('');
              setTo('');
            }}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              !dateActive && range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
        <label className="flex items-center gap-1 text-xs text-brand-950/50">
          Desde
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={`rounded-full border-none px-2.5 py-1 text-xs font-medium ${
              dateActive ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-brand-950/50">
          Hasta
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={`rounded-full border-none px-2.5 py-1 text-xs font-medium ${
              dateActive ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          />
        </label>
        {dateActive && (
          <button
            onClick={() => {
              setFrom('');
              setTo('');
            }}
            className="text-xs font-medium text-brand-950/50 underline"
          >
            Limpiar fechas
          </button>
        )}
        <div className="ml-auto">
          <TextureButton variant="secondary" size="sm" className="!w-auto" disabled={downloading} onClick={exportExcel}>
            <Download className="mr-1 h-3.5 w-3.5" /> {downloading ? 'Generando…' : 'Exportar Excel'}
          </TextureButton>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {showChannelFilter && (
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel | '')}
            className="rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm"
          >
            <option value="">{channels ? 'Delivery y pickup' : 'Todos los canales'}</option>
            {channelOptions.map((c) => (
              <option key={c} value={c}>
                {c === 'DINE_IN' ? 'En mesa' : CHANNEL_ROW_LABELS[c]}
              </option>
            ))}
          </select>
        )}
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as HistoryPaymentMethod | '')}
          className="rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm"
        >
          <option value="">Todos los métodos de pago</option>
          {(Object.keys(HISTORY_PAYMENT_LABELS) as HistoryPaymentMethod[]).map((p) => (
            <option key={p} value={p}>
              {HISTORY_PAYMENT_LABELS[p]}
            </option>
          ))}
        </select>
        <select
          value={placedBy}
          onChange={(e) => setPlacedBy(e.target.value as 'staff' | 'customer' | 'kiosk' | '')}
          className="rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm"
        >
          <option value="">Origen: todos</option>
          <option value="staff">Cargado por el personal</option>
          <option value="customer">Pedido por el cliente</option>
          <option value="kiosk">Autoservicio (tablet)</option>
        </select>
        {waiters.length > 0 && (
          <select
            value={waiterId}
            onChange={(e) => setWaiterId(e.target.value)}
            className="rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm"
          >
            <option value="">Usuario: todos</option>
            {waiters.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard icon={Wallet} title="Ingresos en Bs" value={formatBsAbsolute(result.totalBs)} />
          <MetricCard icon={DollarSign} title={`Ingresos en ${symbol}`} value={formatBase(result.totalBase, symbol)} />
          <MetricCard icon={Receipt} title="Ticket promedio" value={formatBase(result.avgTicketBase, symbol)} />
          <MetricCard icon={Receipt} title="Propinas" value={formatBase(result.totalTipBase, symbol)} />
          <MetricCard icon={Receipt} title="Pedidos" value={String(result.total)} />
        </div>
      )}

      <div className="divide-y divide-brand-950/[0.06] rounded-2xl border border-brand-950/10 bg-white shadow-sm">
        {result?.orders.length === 0 && <p className="p-5 text-sm font-light text-brand-950/40">Sin pedidos en este filtro.</p>}
        {result?.orders.map((o) => (
          <OrderDetailRow key={o.id} order={o} symbol={symbol} onTipSaved={load} />
        ))}
      </div>

      {result && result.total > result.pageSize && (
        <div className="flex items-center justify-center gap-3">
          <TextureButton variant="minimal" size="sm" className="!w-auto" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </TextureButton>
          <span className="text-xs text-brand-950/50">
            Página {result.page} de {Math.ceil(result.total / result.pageSize)}
          </span>
          <TextureButton
            variant="minimal"
            size="sm"
            className="!w-auto"
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
