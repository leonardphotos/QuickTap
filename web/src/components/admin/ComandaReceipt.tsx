import { forwardRef } from 'react';
import { CURRENCY_SYMBOLS, formatBase, formatBsAbsolute } from '@/utils/format';
import type { LiveOrder } from './LiveOrdersPanel';

const CHANNEL_LABELS: Record<LiveOrder['channel'], string> = {
  DINE_IN: 'Mesa',
  DELIVERY: 'Delivery',
  PICKUP: 'Pick-up',
};

interface Props {
  order: LiveOrder;
  restaurantName: string;
}

/** Plantilla de la comanda imprimible, capturada con html2canvas y descargada en PDF. */
export const ComandaReceipt = forwardRef<HTMLDivElement, Props>(({ order, restaurantName }, ref) => {
  const symbol = CURRENCY_SYMBOLS[order.currency as 'USD' | 'EUR'] ?? '$';

  return (
    <div ref={ref} className="w-[420px] bg-white p-6 text-brand-950 font-sans">
      <div className="text-center mb-4">
        <p className="text-lg font-semibold">{restaurantName}</p>
        <p className="text-sm font-medium mt-1">Comanda #{order.orderNumber}</p>
      </div>

      <div className="text-xs space-y-0.5 mb-4 border-b border-black/10 pb-3">
        <div className="flex justify-between">
          <span>Fecha</span>
          <span>{new Date(order.createdAt).toLocaleString('es-VE')}</span>
        </div>
        <div className="flex justify-between">
          <span>Canal</span>
          <span>{order.table ? `Mesa ${order.table.number}` : CHANNEL_LABELS[order.channel]}</span>
        </div>
        {order.placedByUser && (
          <div className="flex justify-between">
            <span>Mesero</span>
            <span>{order.placedByUser.name}</span>
          </div>
        )}
      </div>

      {(order.customerName || order.customerPhone || order.customerAddress || order.customerIdNumber) && (
        <div className="text-xs space-y-0.5 mb-4 border-b border-black/10 pb-3">
          <p className="font-semibold mb-1">Datos del cliente</p>
          {order.customerName && (
            <div className="flex justify-between">
              <span>Nombre</span>
              <span>{order.customerName}</span>
            </div>
          )}
          {order.customerIdNumber && (
            <div className="flex justify-between">
              <span>Cédula/RIF</span>
              <span>{order.customerIdNumber}</span>
            </div>
          )}
          {order.customerPhone && (
            <div className="flex justify-between">
              <span>Teléfono</span>
              <span>{order.customerPhone}</span>
            </div>
          )}
          {order.customerAddress && (
            <div className="flex justify-between gap-4">
              <span className="shrink-0">Dirección</span>
              <span className="text-right">{order.customerAddress}</span>
            </div>
          )}
        </div>
      )}

      <p className="text-xs font-semibold mb-1.5">Productos</p>
      <div className="text-xs space-y-1.5 mb-4">
        {order.items.map((it) => (
          <div key={it.id} className="flex justify-between gap-2">
            <span>
              {it.quantity}× {it.productName}
              {it.modifiers.length > 0 && <span className="block text-black/40">{it.modifiers.join(', ')}</span>}
            </span>
            <span className="shrink-0">{formatBase((Number(it.unitPrice) * it.quantity).toFixed(2), symbol)}</span>
          </div>
        ))}
      </div>

      <div className="text-xs space-y-1 border-t border-black/10 pt-2">
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
        {Number(order.tipBase) > 0 && (
          <div className="flex justify-between">
            <span>Propina</span>
            <span>{formatBase(order.tipBase, symbol)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-sm pt-1 border-t border-black/10">
          <span>Total ({symbol})</span>
          <span>{formatBase(order.totalBase, symbol)}</span>
        </div>
        <div className="flex justify-between font-semibold text-sm">
          <span>Total (Bs, tasa del día)</span>
          <span>{formatBsAbsolute(order.totalBs)}</span>
        </div>
      </div>

      <p className="text-[10px] text-center text-black/40 mt-4">Generado por QuickTap · {new Date().toLocaleString('es-VE')}</p>
    </div>
  );
});
ComandaReceipt.displayName = 'ComandaReceipt';
