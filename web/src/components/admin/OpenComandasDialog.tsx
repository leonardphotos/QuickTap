import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { LiveOrder } from './LiveOrdersPanel';

const CHANNEL_LABELS: Record<LiveOrder['channel'], string> = {
  DINE_IN: 'Mesa',
  DELIVERY: 'Delivery',
  PICKUP: 'Pickup',
  BAR: 'Barra',
};

/** Saldo pendiente de un pedido: a diferencia de `getPaymentStatus` de LiveOrdersPanel (pensada
 * para colorear tarjetas), acá cuenta como deuda CUALQUIER pedido con saldo > 0, incluso uno sin
 * ningún pago registrado todavía — Caja necesita ver también las comandas que nadie ha cobrado. */
function balanceOf(o: LiveOrder): number {
  const paidBase = o.payments.reduce((acc, p) => acc + Number(p.amountBase) + Number(p.discountBase ?? 0), 0);
  return Math.max(0, Number(o.totalBase) - paidBase);
}

/** Botón "Comandas y deudas" para Caja: todas las comandas abiertas del restaurante (todos los
 * canales, todos los meseros) con su saldo pendiente, agrupadas por quién la tomó. */
export function OpenComandasDialog() {
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<LiveOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';

  useEffect(() => {
    if (!open) return;
    setOrders(null);
    setError(null);
    api
      .get('/orders/live')
      .then((res) => setOrders(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar las comandas.'));
  }, [open]);

  const groups = useMemo(() => {
    if (!orders) return null;
    const withDebt = orders
      .map((o) => ({ order: o, balance: balanceOf(o) }))
      .filter((row) => row.balance > 0.01);

    const byWaiter = new Map<string, { name: string; rows: { order: LiveOrder; balance: number }[] }>();
    for (const row of withDebt) {
      const key = row.order.placedByUser?.id ?? 'sin-mesero';
      const name = row.order.placedByUser?.name ?? 'Sin mesero asignado';
      const bucket = byWaiter.get(key) ?? { name, rows: [] };
      bucket.rows.push(row);
      byWaiter.set(key, bucket);
    }
    return [...byWaiter.values()].sort(
      (a, b) => b.rows.reduce((s, r) => s + r.balance, 0) - a.rows.reduce((s, r) => s + r.balance, 0),
    );
  }, [orders]);

  const totalDebt = groups?.reduce((sum, g) => sum + g.rows.reduce((s, r) => s + r.balance, 0), 0) ?? 0;
  const totalOrders = groups?.reduce((sum, g) => sum + g.rows.length, 0) ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium px-3 py-1.5 rounded-full bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10"
      >
        Comandas y deudas
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Comandas y deudas por mesero</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {error && <p className="text-sm text-red-600">{error}</p>}
            {!orders && !error && <p className="text-sm text-brand-950/40 font-light">Cargando comandas…</p>}

            {groups && groups.length === 0 && (
              <p className="text-sm text-brand-950/40 font-light">Todo cobrado — ninguna comanda con saldo pendiente.</p>
            )}

            {groups && groups.length > 0 && (
              <>
                <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xl font-semibold text-brand-950">{formatBase(totalDebt, symbol)}</p>
                    <p className="text-xs text-brand-950/50 font-light">
                      {totalOrders} comanda{totalOrders === 1 ? '' : 's'} con saldo pendiente
                    </p>
                  </div>
                </div>

                <div className="space-y-3 max-h-[55vh] overflow-y-auto">
                  {groups.map((g) => (
                    <WaiterGroup key={g.name} name={g.name} rows={g.rows} symbol={symbol} />
                  ))}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function WaiterGroup({
  name,
  rows,
  symbol,
}: {
  name: string;
  rows: { order: LiveOrder; balance: number }[];
  symbol: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const subtotal = rows.reduce((s, r) => s + r.balance, 0);

  return (
    <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-brand-950/[0.02]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronDown className={`h-4 w-4 text-brand-950/30 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          <p className="text-sm font-medium text-brand-950 truncate">{name}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-brand-950">{formatBase(subtotal, symbol)}</p>
          <p className="text-xs text-brand-950/50 font-light">
            {rows.length} comanda{rows.length === 1 ? '' : 's'}
          </p>
        </div>
      </button>
      {expanded && (
        <div className="divide-y divide-brand-950/[0.06] border-t border-brand-950/10">
          {rows.map(({ order, balance }) => (
            <div key={order.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-brand-950">
                  #{order.orderNumber} · {CHANNEL_LABELS[order.channel]}
                  {order.table && ` ${order.table.number}`}
                </p>
                <p className="text-xs text-brand-950/40">
                  {order.customerName ?? 'Sin nombre'} · {new Date(order.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <p className="font-semibold text-amber-600 shrink-0">{formatBase(balance, symbol)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
