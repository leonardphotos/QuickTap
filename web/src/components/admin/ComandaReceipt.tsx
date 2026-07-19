import { forwardRef, type CSSProperties } from 'react';
import { CURRENCY_SYMBOLS, formatBase, formatBsAbsolute } from '@/utils/format';
import type { LiveOrder } from './LiveOrdersPanel';

const CHANNEL_LABELS: Record<LiveOrder['channel'], string> = {
  DINE_IN: 'Mesa',
  DELIVERY: 'Delivery',
  PICKUP: 'Pick-up',
  BAR: 'Barra',
};

interface Props {
  order: LiveOrder;
  restaurantName: string;
}

/**
 * Plantilla de la comanda imprimible, capturada con html2canvas y descargada
 * en PDF. IMPORTANTE: solo estilos inline con colores hex/rgba planos, nunca
 * clases de Tailwind — Tailwind v4 compila su paleta y los modificadores de
 * opacidad ("/40") a `oklab()`/`color-mix()`, que html2canvas no sabe parsear
 * y hace fallar la captura en silencio.
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
const muted: CSSProperties = { display: 'block', color: 'rgba(0,27,67,0.4)' };
const totalsBlock: CSSProperties = { fontSize: 12, borderTop: '1px solid rgba(0,27,67,0.1)', paddingTop: 8 };
const totalRow: CSSProperties = { ...row, fontWeight: 600, fontSize: 14, marginTop: 4, borderTop: '1px solid rgba(0,27,67,0.1)', paddingTop: 4 };
const footer: CSSProperties = { fontSize: 10, textAlign: 'center', color: 'rgba(0,27,67,0.4)', marginTop: 16 };

export const ComandaReceipt = forwardRef<HTMLDivElement, Props>(({ order, restaurantName }, ref) => {
  const symbol = CURRENCY_SYMBOLS[order.currency as 'USD' | 'EUR'] ?? '$';

  return (
    <div ref={ref} style={container}>
      <div style={center}>
        <p style={title}>{restaurantName}</p>
        <p style={subtitle}>Comanda #{order.orderNumber}</p>
      </div>

      <div style={section}>
        <div style={row}>
          <span>Fecha</span>
          <span>{new Date(order.createdAt).toLocaleString('es-VE')}</span>
        </div>
        <div style={rowGap}>
          <span>Canal</span>
          <span>{order.table ? `Mesa ${order.table.number}` : CHANNEL_LABELS[order.channel]}</span>
        </div>
        {order.placedByUser && (
          <div style={rowGap}>
            <span>Mesero</span>
            <span>{order.placedByUser.name}</span>
          </div>
        )}
      </div>

      {(order.customerName || order.customerPhone || order.customerAddress || order.customerIdNumber) && (
        <div style={section}>
          <p style={sectionLabel}>Datos del cliente</p>
          {order.customerName && (
            <div style={row}>
              <span>Nombre</span>
              <span>{order.customerName}</span>
            </div>
          )}
          {order.customerIdNumber && (
            <div style={rowGap}>
              <span>Cédula/RIF</span>
              <span>{order.customerIdNumber}</span>
            </div>
          )}
          {order.customerPhone && (
            <div style={rowGap}>
              <span>Teléfono</span>
              <span>{order.customerPhone}</span>
            </div>
          )}
          {order.customerAddress && (
            <div style={rowGap}>
              <span style={{ flexShrink: 0 }}>Dirección</span>
              <span style={{ textAlign: 'right' }}>{order.customerAddress}</span>
            </div>
          )}
        </div>
      )}

      <p style={sectionLabel}>Productos</p>
      <div style={{ fontSize: 12, marginBottom: 16 }}>
        {order.items.map((it) => (
          <div key={it.id} style={{ ...row, marginTop: 6 }}>
            <span>
              {it.quantity}× {it.productName}
              {it.variantName && ` (${it.variantName})`}
              {it.modifiers.length > 0 && <span style={muted}>{it.modifiers.map((m) => m.name).join(', ')}</span>}
            </span>
            <span style={{ flexShrink: 0 }}>{formatBase((Number(it.unitPrice) * it.quantity).toFixed(2), symbol)}</span>
          </div>
        ))}
      </div>

      <div style={totalsBlock}>
        <div style={row}>
          <span>Subtotal</span>
          <span>{formatBase(order.subtotalBase, symbol)}</span>
        </div>
        {Number(order.serviceChargeBase) > 0 && (
          <div style={rowGap}>
            <span>Servicio</span>
            <span>{formatBase(order.serviceChargeBase, symbol)}</span>
          </div>
        )}
        {Number(order.ivaBase) > 0 && (
          <div style={rowGap}>
            <span>IVA</span>
            <span>{formatBase(order.ivaBase, symbol)}</span>
          </div>
        )}
        {Number(order.deliveryFeeBase) > 0 && (
          <div style={rowGap}>
            <span>Envío</span>
            <span>{formatBase(order.deliveryFeeBase, symbol)}</span>
          </div>
        )}
        {Number(order.tipBase) > 0 && (
          <div style={rowGap}>
            <span>Propina</span>
            <span>{formatBase(order.tipBase, symbol)}</span>
          </div>
        )}
        <div style={totalRow}>
          <span>Total ({symbol})</span>
          <span>{formatBase(order.totalBase, symbol)}</span>
        </div>
        <div style={{ ...row, fontWeight: 600, fontSize: 14 }}>
          <span>Total (Bs, tasa del día)</span>
          <span>{formatBsAbsolute(order.totalBs)}</span>
        </div>
      </div>

      <p style={footer}>Generado por QuickTap · {new Date().toLocaleString('es-VE')}</p>
    </div>
  );
});
ComandaReceipt.displayName = 'ComandaReceipt';
