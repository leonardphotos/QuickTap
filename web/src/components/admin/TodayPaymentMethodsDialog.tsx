import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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

/** Botón "Movimientos de hoy": una de las dos habilidades que Cajero conserva siempre (junto
 * con abrir/cerrar caja), sin necesitar acceso a Administración completa. */
export function TodayPaymentMethodsDialog() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PaymentStatsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';

  useEffect(() => {
    if (!open) return;
    setRows(null);
    setError(null);
    api
      .get('/orders/reports/payment-methods', { params: { range: 'day' } })
      .then((res) => setRows(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el movimiento por método de pago.'));
  }, [open]);

  const totalBase = rows?.reduce((sum, r) => sum + Number(r.totalBase), 0) ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium px-3 py-1.5 rounded-full bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10"
      >
        Movimientos de hoy
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Movimientos de hoy por método de pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {error && <p className="text-sm text-red-600">{error}</p>}
            {!rows && !error && <p className="text-sm text-brand-950/40 font-light">Cargando…</p>}
            {rows && (
              <>
                <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-4">
                  <p className="text-xl font-semibold text-brand-950">{formatBase(totalBase, symbol)}</p>
                  <p className="text-xs text-brand-950/50 font-light">Total cobrado hoy</p>
                </div>
                <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm divide-y divide-brand-950/[0.06]">
                  {rows.length === 0 && <p className="p-5 text-sm text-brand-950/40 font-light">Sin pedidos cobrados hoy.</p>}
                  {rows.map((r) => (
                    <div key={r.method} className="flex items-center justify-between gap-3 px-5 py-4">
                      <p className="font-medium text-brand-950">{PAYMENT_METHOD_LABELS[r.method] ?? r.method}</p>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-brand-950">{formatBase(r.totalBase, symbol)}</p>
                        <p className="text-xs text-brand-950/50 font-light">{r.count} pedidos</p>
                      </div>
                    </div>
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
