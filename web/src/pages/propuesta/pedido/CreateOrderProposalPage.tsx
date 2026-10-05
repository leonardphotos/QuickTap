import { useState } from 'react';
import { ChevronUp } from 'lucide-react';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import '../proposal.css';
import { formatUsd } from '../dashboard/format';
import type { Channel, MenuProduct } from './data';
import { MenuCatalog } from './MenuCatalog';
import { OrderTicket, computeTotals, type TicketLine } from './OrderTicket';
import { OrderTopBar } from './OrderTopBar';

const INITIAL_LINES: TicketLine[] = [
  { productId: 'p1', quantity: 2 },
  { productId: 'p8', quantity: 1 },
  { productId: 'p11', quantity: 2 },
];

/**
 * Propuesta de rediseño de Crear pedido (CreateOrderDialog), con datos de ejemplo. Junta en una
 * sola pantalla lo que hoy son pasos separados: el menú queda a la izquierda y el ticket siempre
 * visible a la derecha, con cliente, mesa/dirección, líneas, totales y acciones en un mismo lugar.
 */
export default function CreateOrderProposalPage() {
  useDocumentMeta('Propuesta · Crear pedido | QuickTap');
  const [channel, setChannel] = useState<Channel>('DINE_IN');
  const [lines, setLines] = useState<TicketLine[]>(INITIAL_LINES);
  const [tableId, setTableId] = useState<string | null>('t3');
  const [ticketOpen, setTicketOpen] = useState(false);

  const quantityFor = (id: string) => lines.find((l) => l.productId === id)?.quantity ?? 0;

  const adjust = (productId: string, delta: number) =>
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      if (!existing) return delta > 0 ? [...prev, { productId, quantity: delta }] : prev;
      return prev
        .map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0);
    });

  const addProduct = (product: MenuProduct) => adjust(product.id, 1);
  const { total, items } = computeTotals(lines, channel);

  const ticketProps = {
    channel,
    lines,
    tableId,
    onTableChange: setTableId,
    onAdjust: adjust,
    onClear: () => setLines([]),
  };

  return (
    <div className="qt-proposal flex h-dvh flex-col overflow-hidden">
      <OrderTopBar channel={channel} onChannelChange={setChannel} hasDraft={lines.length > 0} />

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-y-auto px-4 pb-28 pt-5 sm:px-6 lg:pb-8">
          <MenuCatalog quantityFor={quantityFor} onAdd={addProduct} />
        </main>

        <aside aria-label="Pedido actual" className="hidden w-[400px] shrink-0 border-l border-border lg:block">
          <OrderTicket {...ticketProps} />
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setTicketOpen(true)}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-brand-500 px-4 text-white"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs tabular-nums">{items}</span>
            Ver pedido
          </span>
          <span className="flex items-center gap-1.5 text-base font-semibold tabular-nums">
            {formatUsd(total)} <ChevronUp aria-hidden="true" className="h-4 w-4" />
          </span>
        </button>
      </div>

      {ticketOpen && (
        <div className="fixed inset-0 z-40 flex flex-col lg:hidden" role="dialog" aria-modal="true" aria-label="Pedido actual">
          <button type="button" aria-label="Cerrar pedido" onClick={() => setTicketOpen(false)} className="h-16 shrink-0 bg-brand-950/40" />
          <div className="min-h-0 flex-1 overflow-hidden rounded-t-3xl">
            <OrderTicket {...ticketProps} onClose={() => setTicketOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
