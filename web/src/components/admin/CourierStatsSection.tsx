import { api } from '@/api/client';
import { RANGE_LABELS,type Range } from '@/components/admin/OrderHistorySection.shared';
import { Dialog,DialogContent,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext.shared';
import { CURRENCY_SYMBOLS,formatBase } from '@/utils/format';
import { ChevronRight,MapPin,Package } from 'lucide-react';
import { useEffect,useState } from 'react';

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

interface CourierDelivery {
  id: string;
  orderNumber: number;
  status: 'NEEDS_CONFIRMATION' | 'NEEDS_PAYMENT' | 'PENDING' | 'KITCHEN' | 'SERVED' | 'CANCELLED';
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerNote: string | null;
  deliveryFeeBase: string;
  totalBase: string;
  totalBs: string;
  tipBase: string;
  currency: 'USD' | 'EUR';
  createdAt: string;
  deliveryDispatchedAt: string | null;
  items: { productName: string; variantName: string | null; quantity: number }[];
}

interface CourierDetail {
  courier: Pick<CourierStatsRow, 'name' | 'whatsappPhone' | 'isActive'>;
  deliveries: CourierDelivery[];
}

const STATUS_LABELS: Record<CourierDelivery['status'], string> = {
  NEEDS_CONFIRMATION: 'Por confirmar',
  NEEDS_PAYMENT: 'Pendiente de pago',
  PENDING: 'Pendiente',
  KITCHEN: 'En cocina',
  SERVED: 'Entregado',
  CANCELLED: 'Cancelado',
};

function formatDispatchDate(value: string | null) {
  if (!value) return 'Sin hora de despacho';
  return new Date(value).toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Cuánto ha movido cada motorizado en el período: entregas, monto despachado y propinas.
 * Vive dentro de la pantalla de Delivery (antes era la pestaña "Delivery" de Administración),
 * que es donde el dueño ya está mirando el reparto.
 */
export function CourierStatsSection() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [range, setRange] = useState<Range>('month');
  const [rows, setRows] = useState<CourierStatsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CourierDetail | null>(null);
  const [loadingCourierId, setLoadingCourierId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/orders/reports/couriers', { params: { range } })
      .then((res) => setRows(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el movimiento de delivery.'));
  }, [range]);

  async function openDetail(courierId: string) {
    setLoadingCourierId(courierId);
    try {
      const res = await api.get(`/orders/reports/couriers/${courierId}/deliveries`, { params: { range } });
      setDetail(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo cargar el detalle del repartidor.');
    } finally {
      setLoadingCourierId(null);
    }
  }

  if (error) return <p className="text-red-600 text-base">{error}</p>;

  const totals = (rows ?? []).reduce(
    (acc, r) => ({
      deliveries: acc.deliveries + r.deliveries,
      totalBase: acc.totalBase + Number(r.totalBase),
      tips: acc.tips + Number(r.totalTipBase),
    }),
    { deliveries: 0, totalBase: 0, tips: 0 },
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-950/10 bg-white shadow-sm">
        <div className="hidden items-center gap-3 border-b border-brand-950/[0.06] px-5 py-2 text-[11px] font-medium uppercase tracking-wide text-brand-950/40 sm:flex">
          <span className="flex-1">Repartidor</span>
          <span className="w-40 text-right">Entregas / Total</span>
        </div>
        <div className="divide-y divide-brand-950/[0.06]">
          {rows?.length === 0 && (
            <p className="p-5 font-light text-brand-950/40 text-base">
              Agrega repartidores en Ajustes → Equipo de Delivery para ver su movimiento aquí.
            </p>
          )}
          {rows?.map((r) => (
            <button
              key={r.courierId}
              type="button"
              onClick={() => openDetail(r.courierId)}
              disabled={loadingCourierId === r.courierId}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-brand-950/[0.025] disabled:opacity-60"
            >
              <div>
                <p className="flex items-center gap-1.5 font-medium text-brand-950 text-base">
                  {r.name}
                  {!r.isActive && <span className="text-xs font-light text-brand-950/40">(inactivo)</span>}
                </p>
                <p className="font-light text-brand-950/40 text-xs">{r.whatsappPhone}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold text-brand-950 text-base">{r.deliveries} entregas</p>
                <p className="font-light text-brand-950/50 text-xs">
                  {formatBase(r.totalBase, symbol)}
                  {Number(r.totalTipBase) > 0 && ` · propinas ${formatBase(r.totalTipBase, symbol)}`}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-brand-950/35" />
            </button>
          ))}
          {(rows?.length ?? 0) > 0 && (
            <div className="flex items-center justify-between gap-3 bg-brand-950/[0.02] px-5 py-3 text-sm font-semibold text-brand-950">
              <span>Total · {RANGE_LABELS[range]}</span>
              <span className="text-right">
                {totals.deliveries} entregas · {formatBase(totals.totalBase.toFixed(2), symbol)}
                {totals.tips > 0 && ` · propinas ${formatBase(totals.tips.toFixed(2), symbol)}`}
              </span>
            </div>
          )}
        </div>
      </div>

      {detail && (
        <Dialog open onOpenChange={(open) => !open && setDetail(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Entregas de {detail.courier.name}</DialogTitle>
              <p className="text-brand-950/50 text-base">{detail.courier.whatsappPhone} · {detail.deliveries.length} en {RANGE_LABELS[range].toLowerCase()}</p>
            </DialogHeader>
            <div className="space-y-3">
              {detail.deliveries.length === 0 && <p className="py-8 text-center text-brand-950/45 text-base">No hay entregas en este período.</p>}
              {detail.deliveries.map((delivery) => (
                <article key={delivery.id} className="rounded-2xl border border-brand-950/10 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-brand-950 text-base">Pedido #{delivery.orderNumber}</p>
                      <p className="text-brand-950/45 text-xs">Despachado: {formatDispatchDate(delivery.deliveryDispatchedAt)}</p>
                    </div>
                    <span className="rounded-full bg-brand-950/[0.06] px-2 py-1 text-xs font-medium text-brand-950/65">{STATUS_LABELS[delivery.status]}</span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-brand-950/70">
                    <p><span className="font-medium text-brand-950">Cliente:</span> {delivery.customerName || 'Sin nombre'}{delivery.customerPhone ? ` · ${delivery.customerPhone}` : ''}</p>
                    {delivery.customerAddress && <p className="flex gap-1.5 text-base"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />{delivery.customerAddress}</p>}
                    <p className="flex gap-1.5 text-base"><Package className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" /><span>{delivery.items.map((item) => `${item.quantity}x ${item.productName}${item.variantName ? ` (${item.variantName})` : ''}`).join(' · ')}</span></p>
                    {delivery.customerNote && <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-amber-900 text-xs">Nota: {delivery.customerNote}</p>}
                  </div>
                  <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-brand-950/[0.07] pt-3 text-xs">
                    <span className="text-brand-950/50">Envío: {formatBase(delivery.deliveryFeeBase, symbol)}</span>
                    {Number(delivery.tipBase) > 0 && <span className="text-brand-950/50">Propina: {formatBase(delivery.tipBase, symbol)}</span>}
                    <span className="font-semibold text-brand-950">Total: {formatBase(delivery.totalBase, symbol)}</span>
                  </div>
                </article>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
