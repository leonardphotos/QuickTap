import { forwardRef } from 'react';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';
import type { Currency } from '@/types';

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  MOBILE_PAYMENT: 'Pago Móvil',
  ZELLE: 'Zelle',
  CASH: 'Efectivo',
  CARD: 'Punto de Venta',
  BINANCE: 'Binance',
  PAYPAL: 'PayPal',
  TRANSFER: 'Transferencia',
};

export interface CashSessionSummary {
  paymentsByMethod: Record<string, { amountBase: string; count: number }>;
  totalPayments: string;
  movements: {
    totalIncome: string;
    totalExpense: string;
    list: { id: string; type: 'INCOME' | 'EXPENSE'; amountBase: string; description: string; createdByName: string | null; createdAt: string }[];
  };
  totalNet: string;
}

export interface CashSessionData {
  id: string;
  closeNumber: number | null;
  openedAt: string;
  closedAt: string | null;
  openingBalances: Record<string, string | number>;
  closingSummary: CashSessionSummary | null;
  openedByUser: { name: string } | null;
  closedByUser: { name: string } | null;
}

interface Props {
  session: CashSessionData;
  restaurantName: string;
  currency: Currency;
}

/** Plantilla del recibo de cierre de caja, capturada con html2canvas y descargada en PDF. */
export const CashSessionReceipt = forwardRef<HTMLDivElement, Props>(({ session, restaurantName, currency }, ref) => {
  const symbol = CURRENCY_SYMBOLS[currency];
  const summary = session.closingSummary;

  return (
    <div ref={ref} className="w-[420px] bg-white p-6 text-brand-950 font-sans">
      <div className="text-center mb-4">
        <p className="text-lg font-semibold">{restaurantName}</p>
        <p className="text-sm font-medium mt-1">Cierre de caja {session.closeNumber ? `#${session.closeNumber}` : ''}</p>
      </div>

      <div className="text-xs space-y-0.5 mb-4 border-b border-black/10 pb-3">
        <div className="flex justify-between">
          <span>Apertura</span>
          <span>{new Date(session.openedAt).toLocaleString('es-VE')}</span>
        </div>
        {session.closedAt && (
          <div className="flex justify-between">
            <span>Cierre</span>
            <span>{new Date(session.closedAt).toLocaleString('es-VE')}</span>
          </div>
        )}
        {session.openedByUser && (
          <div className="flex justify-between">
            <span>Abierta por</span>
            <span>{session.openedByUser.name}</span>
          </div>
        )}
        {session.closedByUser && (
          <div className="flex justify-between">
            <span>Cerrada por</span>
            <span>{session.closedByUser.name}</span>
          </div>
        )}
      </div>

      <p className="text-xs font-semibold mb-1.5">Saldo de apertura por método</p>
      <div className="text-xs space-y-1 mb-4">
        {Object.entries(session.openingBalances).map(([method, amount]) => (
          <div key={method} className="flex justify-between">
            <span>{PAYMENT_METHOD_LABELS[method] ?? method}</span>
            <span>{formatBase(amount, symbol)}</span>
          </div>
        ))}
      </div>

      {summary && (
        <>
          <p className="text-xs font-semibold mb-1.5">Ventas del turno por método</p>
          <div className="text-xs space-y-1 mb-4">
            {Object.entries(summary.paymentsByMethod).map(([method, row]) => (
              <div key={method} className="flex justify-between">
                <span>
                  {PAYMENT_METHOD_LABELS[method] ?? method} ({row.count})
                </span>
                <span>{formatBase(row.amountBase, symbol)}</span>
              </div>
            ))}
            <div className="flex justify-between font-semibold pt-1 border-t border-black/10">
              <span>Total ventas</span>
              <span>{formatBase(summary.totalPayments, symbol)}</span>
            </div>
          </div>

          {summary.movements.list.length > 0 && (
            <>
              <p className="text-xs font-semibold mb-1.5">Movimientos manuales</p>
              <div className="text-xs space-y-1 mb-4">
                {summary.movements.list.map((m) => (
                  <div key={m.id} className="flex justify-between">
                    <span>{m.description}</span>
                    <span className={m.type === 'INCOME' ? 'text-emerald-700' : 'text-red-700'}>
                      {m.type === 'INCOME' ? '+' : '−'}
                      {formatBase(m.amountBase, symbol)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between pt-1 border-t border-black/10">
                  <span>Ingresos</span>
                  <span>+{formatBase(summary.movements.totalIncome, symbol)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Egresos</span>
                  <span>−{formatBase(summary.movements.totalExpense, symbol)}</span>
                </div>
              </div>
            </>
          )}

          <div className="border-t border-black/20 pt-2 space-y-0.5">
            <div className="flex justify-between font-semibold text-sm">
              <span>Total neto</span>
              <span>{formatBase(summary.totalNet, symbol)}</span>
            </div>
          </div>
        </>
      )}

      <p className="text-[10px] text-center text-black/40 mt-4">Generado por QuickTap · {new Date().toLocaleString('es-VE')}</p>
    </div>
  );
});
CashSessionReceipt.displayName = 'CashSessionReceipt';
