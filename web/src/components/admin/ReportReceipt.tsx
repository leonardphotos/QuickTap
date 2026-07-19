import { forwardRef, type CSSProperties } from 'react';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';
import type { Currency } from '@/types';

export type ReportKind = 'general' | 'products' | 'delivery' | 'payments' | 'history';

export const REPORT_AREA_LABELS: Record<ReportKind, string> = {
  general: 'General',
  products: 'Productos',
  delivery: 'Delivery',
  payments: 'Métodos de pago',
  history: 'Historial de pedidos',
};

const CHANNEL_LABELS: Record<string, string> = { DINE_IN: 'Mesa', DELIVERY: 'Delivery', PICKUP: 'Pickup', BAR: 'Barra' };
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

interface OrderRow {
  orderNumber: number;
  channel: string;
  paymentMethod: string | null;
  totalBase: string;
  createdAt: string;
}

export interface GeneralReportData {
  totalBase: string;
  totalBs: string;
  totalOrders: number;
  incomeBase: string;
  expenseBase: string;
  orders: OrderRow[];
}

export interface ProductReportRow {
  productId: string | null;
  name: string;
  quantity: number;
  revenueBase: string;
}

export interface CourierStatsRow {
  courierId: string;
  name: string;
  deliveries: number;
  totalBase: string;
  totalTipBase: string;
}

export interface PaymentStatsRow {
  method: string;
  count: number;
  totalBase: string;
}

export type ReportData =
  | { kind: 'general'; data: GeneralReportData }
  | { kind: 'products'; data: ProductReportRow[] }
  | { kind: 'delivery'; data: CourierStatsRow[] }
  | { kind: 'payments'; data: PaymentStatsRow[] }
  | { kind: 'history'; data: OrderRow[] };

interface Props {
  restaurantName: string;
  currency: Currency;
  dateLabel: string;
  report: ReportData;
}

/**
 * Plantilla de reporte capturada con html2canvas → PDF. Igual que
 * CashSessionReceipt: solo estilos inline con hex/rgba planos, nunca clases
 * Tailwind (html2canvas no sabe parsear los oklab()/color-mix() de Tailwind v4).
 */
const container: CSSProperties = {
  width: 560,
  background: '#ffffff',
  padding: 28,
  color: '#001b43',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13,
};
const center: CSSProperties = { textAlign: 'center', marginBottom: 18 };
const title: CSSProperties = { fontSize: 19, fontWeight: 600, margin: 0 };
const subtitle: CSSProperties = { fontSize: 14, fontWeight: 500, margin: '4px 0 0' };
const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8 };
const listRow: CSSProperties = { ...row, marginTop: 6, paddingBottom: 6, borderBottom: '1px solid rgba(0,27,67,0.08)' };
const sectionLabel: CSSProperties = { fontSize: 13, fontWeight: 600, marginBottom: 8, marginTop: 18 };
const footer: CSSProperties = { fontSize: 10, textAlign: 'center', color: 'rgba(0,27,67,0.4)', marginTop: 20 };
const EMERALD_700 = '#047857';
const RED_700 = '#b91c1c';

export const ReportReceipt = forwardRef<HTMLDivElement, Props>(({ restaurantName, currency, dateLabel, report }, ref) => {
  const symbol = CURRENCY_SYMBOLS[currency];

  return (
    <div ref={ref} style={container}>
      <div style={center}>
        <p style={title}>{restaurantName}</p>
        <p style={subtitle}>
          Reporte · {REPORT_AREA_LABELS[report.kind]} · {dateLabel}
        </p>
      </div>

      {report.kind === 'general' && (
        <>
          <div style={{ ...row, fontSize: 14 }}>
            <span>Ventas totales</span>
            <span style={{ fontWeight: 600 }}>{formatBase(report.data.totalBase, symbol)}</span>
          </div>
          <div style={{ ...row, marginTop: 4 }}>
            <span>Pedidos</span>
            <span>{report.data.totalOrders}</span>
          </div>
          <div style={{ ...row, marginTop: 4 }}>
            <span>Ingresos manuales</span>
            <span style={{ color: EMERALD_700 }}>+{formatBase(report.data.incomeBase, symbol)}</span>
          </div>
          <div style={{ ...row, marginTop: 4 }}>
            <span>Egresos</span>
            <span style={{ color: RED_700 }}>−{formatBase(report.data.expenseBase, symbol)}</span>
          </div>
          <div style={{ ...row, marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(0,27,67,0.15)', fontWeight: 600, fontSize: 14 }}>
            <span>Balance final</span>
            <span>
              {formatBase(
                Number(report.data.totalBase) + Number(report.data.incomeBase) - Number(report.data.expenseBase),
                symbol,
              )}
            </span>
          </div>

          <p style={sectionLabel}>Pedidos del día</p>
          {report.data.orders.length === 0 && <p style={{ fontSize: 12, color: 'rgba(0,27,67,0.4)' }}>Sin pedidos.</p>}
          {report.data.orders.map((o) => (
            <div key={o.orderNumber} style={listRow}>
              <span>
                #{o.orderNumber} · {CHANNEL_LABELS[o.channel] ?? o.channel} ·{' '}
                {new Date(o.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span>{formatBase(o.totalBase, symbol)}</span>
            </div>
          ))}
        </>
      )}

      {report.kind === 'products' && (
        <>
          <p style={sectionLabel}>Productos vendidos</p>
          {report.data.length === 0 && <p style={{ fontSize: 12, color: 'rgba(0,27,67,0.4)' }}>Sin ventas.</p>}
          {report.data.map((r, i) => (
            <div key={`${r.productId ?? 'x'}-${r.name}-${i}`} style={listRow}>
              <span>
                {i + 1}. {r.name} ({r.quantity})
              </span>
              <span>{formatBase(r.revenueBase, symbol)}</span>
            </div>
          ))}
        </>
      )}

      {report.kind === 'delivery' && (
        <>
          <p style={sectionLabel}>Movimiento por repartidor</p>
          {report.data.length === 0 && <p style={{ fontSize: 12, color: 'rgba(0,27,67,0.4)' }}>Sin repartidores.</p>}
          {report.data.map((r) => (
            <div key={r.courierId} style={listRow}>
              <span>
                {r.name} ({r.deliveries} entregas)
              </span>
              <span>
                {formatBase(r.totalBase, symbol)}
                {Number(r.totalTipBase) > 0 ? ` · prop. ${formatBase(r.totalTipBase, symbol)}` : ''}
              </span>
            </div>
          ))}
        </>
      )}

      {report.kind === 'payments' && (
        <>
          <p style={sectionLabel}>Movimiento por método de pago</p>
          {report.data.length === 0 && <p style={{ fontSize: 12, color: 'rgba(0,27,67,0.4)' }}>Sin pedidos.</p>}
          {report.data.map((r) => (
            <div key={r.method} style={listRow}>
              <span>
                {PAYMENT_METHOD_LABELS[r.method] ?? r.method} ({r.count})
              </span>
              <span>{formatBase(r.totalBase, symbol)}</span>
            </div>
          ))}
        </>
      )}

      {report.kind === 'history' && (
        <>
          <p style={sectionLabel}>Historial de pedidos</p>
          {report.data.length === 0 && <p style={{ fontSize: 12, color: 'rgba(0,27,67,0.4)' }}>Sin pedidos.</p>}
          {report.data.map((o) => (
            <div key={o.orderNumber} style={listRow}>
              <span>
                #{o.orderNumber} · {CHANNEL_LABELS[o.channel] ?? o.channel} ·{' '}
                {o.paymentMethod ? PAYMENT_METHOD_LABELS[o.paymentMethod] ?? o.paymentMethod : 'Sin método'} ·{' '}
                {new Date(o.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span>{formatBase(o.totalBase, symbol)}</span>
            </div>
          ))}
        </>
      )}

      <p style={footer}>Generado por QuickTap · {new Date().toLocaleString('es-VE')}</p>
    </div>
  );
});
ReportReceipt.displayName = 'ReportReceipt';
