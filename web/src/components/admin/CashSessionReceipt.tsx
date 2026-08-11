import { forwardRef, type CSSProperties } from 'react';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';
import { ROLE_LABELS } from '@/utils/roles';
import { INCOME_CATEGORY_LABELS, type IncomeCategory } from './IncomeFormDialog';
import { PAYMENT_LABELS } from './PaymentDialog';
import type { Currency, PaymentMethod, UserRole } from '@/types';

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  MOBILE_PAYMENT: 'Pago Móvil',
  ZELLE: 'Zelle',
  CASH: 'Efectivo Bs',
  // Faltaba: el cierre mostraba "CASH_USD" crudo, y es un método que se usa a diario.
  CASH_USD: 'Efectivo $',
  CARD: 'Punto de Venta',
  BINANCE: 'Binance',
  PAYPAL: 'PayPal',
  TRANSFER: 'Transferencia',
};

export interface CashSessionSummary {
  paymentsByMethod: Record<string, { amountBase: string; count: number }>;
  /** Lo que debería haber por método al cerrar: apertura + cobrado + movimientos manuales.
   * Es contra esto que se compara el conteo físico del arqueo. */
  expectedByMethod?: Record<string, string>;
  /** Solo cuando el cajero contó de verdad (ver "Hacer arqueo" en CashSessionControl). */
  arqueo?: {
    byMethod: Record<string, { expected: string; counted: string; difference: string }>;
    totalDifference: string;
  } | null;
  totalPayments: string;
  movements: {
    totalIncome: string;
    totalExpense: string;
    list: {
      id: string;
      type: 'INCOME' | 'EXPENSE';
      amountBase: string;
      description: string;
      incomeCategory: IncomeCategory | null;
      paymentMethod: PaymentMethod | null;
      createdByName: string | null;
      createdAt: string;
    }[];
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
  openedByUser: { name: string; role: string } | null;
  closedByUser: { name: string; role: string } | null;
}

interface Props {
  session: CashSessionData;
  restaurantName: string;
  currency: Currency;
}

/**
 * Plantilla del recibo de cierre de caja, capturada con html2canvas y
 * descargada en PDF. IMPORTANTE: solo estilos inline con colores hex/rgba
 * planos, nunca clases de Tailwind — Tailwind v4 compila su paleta y los
 * modificadores de opacidad ("/40") a `oklab()`/`color-mix()`, que
 * html2canvas no sabe parsear y hace fallar la captura en silencio.
 */
const container: CSSProperties = {
  width: 420,
  background: '#ffffff',
  padding: 24,
  color: '#001b43',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13,
};
const center: CSSProperties = { textAlign: 'center', marginBottom: 16 };
const title: CSSProperties = { fontSize: 18, fontWeight: 600, margin: 0 };
const subtitle: CSSProperties = { fontSize: 14, fontWeight: 500, margin: '4px 0 0' };
const section: CSSProperties = {
  fontSize: 12,
  marginBottom: 16,
  paddingBottom: 12,
  borderBottom: '1px solid rgba(0,27,67,0.1)',
};
const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8 };
const rowGap: CSSProperties = { ...row, marginTop: 2 };
const sectionLabel: CSSProperties = { fontSize: 12, fontWeight: 600, marginBottom: 6 };
const list: CSSProperties = { fontSize: 12, marginBottom: 16 };
const listRow: CSSProperties = { ...row, marginTop: 4 };
const subtotalRow: CSSProperties = { ...row, fontWeight: 600, marginTop: 4, borderTop: '1px solid rgba(0,27,67,0.1)', paddingTop: 4 };
const footer: CSSProperties = { fontSize: 10, textAlign: 'center', color: 'rgba(0,27,67,0.4)', marginTop: 16 };
const EMERALD_700 = '#047857';
const RED_700 = '#b91c1c';

export const CashSessionReceipt = forwardRef<HTMLDivElement, Props>(({ session, restaurantName, currency }, ref) => {
  const symbol = CURRENCY_SYMBOLS[currency];
  const summary = session.closingSummary;

  return (
    <div ref={ref} style={container}>
      <div style={center}>
        <p style={title}>{restaurantName}</p>
        <p style={subtitle}>Cierre de caja {session.closeNumber ? `#${session.closeNumber}` : ''}</p>
      </div>

      <div style={section}>
        <div style={row}>
          <span>Apertura</span>
          <span>{new Date(session.openedAt).toLocaleString('es-VE')}</span>
        </div>
        {session.closedAt && (
          <div style={rowGap}>
            <span>Cierre</span>
            <span>{new Date(session.closedAt).toLocaleString('es-VE')}</span>
          </div>
        )}
        {session.openedByUser && (
          <div style={rowGap}>
            <span>Abierta por</span>
            <span>
              {session.openedByUser.name} ({ROLE_LABELS[session.openedByUser.role as UserRole] ?? session.openedByUser.role})
            </span>
          </div>
        )}
        {session.closedByUser && (
          <div style={rowGap}>
            <span>Cerrada por</span>
            <span>
              {session.closedByUser.name} ({ROLE_LABELS[session.closedByUser.role as UserRole] ?? session.closedByUser.role})
            </span>
          </div>
        )}
      </div>

      <p style={sectionLabel}>Saldo de apertura por método</p>
      <div style={list}>
        {Object.entries(session.openingBalances).map(([method, amount]) => (
          <div key={method} style={listRow}>
            <span>{PAYMENT_METHOD_LABELS[method] ?? method}</span>
            <span>{formatBase(amount, symbol)}</span>
          </div>
        ))}
      </div>

      {summary && (
        <>
          <p style={sectionLabel}>Ventas del turno por método</p>
          <div style={list}>
            {Object.entries(summary.paymentsByMethod).map(([method, r]) => (
              <div key={method} style={listRow}>
                <span>
                  {PAYMENT_METHOD_LABELS[method] ?? method} ({r.count})
                </span>
                <span>{formatBase(r.amountBase, symbol)}</span>
              </div>
            ))}
            <div style={subtotalRow}>
              <span>Total ventas</span>
              <span>{formatBase(summary.totalPayments, symbol)}</span>
            </div>
          </div>

          {summary.movements.list.length > 0 && (
            <>
              <p style={sectionLabel}>Movimientos manuales</p>
              <div style={list}>
                {summary.movements.list.map((m) => (
                  <div key={m.id} style={listRow}>
                    <span>
                      {m.description}
                      {m.incomeCategory && ` · ${INCOME_CATEGORY_LABELS[m.incomeCategory]}`}
                      {m.paymentMethod && ` · ${PAYMENT_LABELS[m.paymentMethod]}`}
                    </span>
                    <span style={{ color: m.type === 'INCOME' ? EMERALD_700 : RED_700 }}>
                      {m.type === 'INCOME' ? '+' : '−'}
                      {formatBase(m.amountBase, symbol)}
                    </span>
                  </div>
                ))}
                <div style={subtotalRow}>
                  <span>Ingresos</span>
                  <span>+{formatBase(summary.movements.totalIncome, symbol)}</span>
                </div>
                <div style={rowGap}>
                  <span>Egresos</span>
                  <span>−{formatBase(summary.movements.totalExpense, symbol)}</span>
                </div>
              </div>
            </>
          )}

          {summary.arqueo && (
            <>
              <p style={sectionLabel}>Arqueo (conteo físico)</p>
              <div style={list}>
                {Object.entries(summary.arqueo.byMethod)
                  .filter(([, r]) => Number(r.expected) !== 0 || Number(r.counted) !== 0)
                  .map(([method, r]) => (
                    <div key={method} style={listRow}>
                      <span>
                        {PAYMENT_METHOD_LABELS[method] ?? method} · contado {formatBase(r.counted, symbol)} de{' '}
                        {formatBase(r.expected, symbol)}
                      </span>
                      <span style={{ color: Number(r.difference) === 0 ? undefined : Number(r.difference) > 0 ? EMERALD_700 : RED_700 }}>
                        {Number(r.difference) > 0 ? '+' : ''}
                        {formatBase(r.difference, symbol)}
                      </span>
                    </div>
                  ))}
                <div style={subtotalRow}>
                  <span>
                    {Number(summary.arqueo.totalDifference) === 0
                      ? 'Cuadra exacto'
                      : Number(summary.arqueo.totalDifference) > 0
                        ? 'Sobrante'
                        : 'Faltante'}
                  </span>
                  <span
                    style={{
                      color:
                        Number(summary.arqueo.totalDifference) === 0
                          ? undefined
                          : Number(summary.arqueo.totalDifference) > 0
                            ? EMERALD_700
                            : RED_700,
                    }}
                  >
                    {formatBase(Math.abs(Number(summary.arqueo.totalDifference)), symbol)}
                  </span>
                </div>
              </div>
            </>
          )}

          <div style={{ borderTop: '1px solid rgba(0,27,67,0.2)', paddingTop: 8 }}>
            <div style={{ ...row, fontWeight: 600, fontSize: 14 }}>
              <span>Total neto</span>
              <span>{formatBase(summary.totalNet, symbol)}</span>
            </div>
          </div>
        </>
      )}

      <p style={footer}>Generado por QuickTap · {new Date().toLocaleString('es-VE')}</p>
    </div>
  );
});
CashSessionReceipt.displayName = 'CashSessionReceipt';
