import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronUp } from 'lucide-react';
import { formatUsd } from '../../dashboard/format';
import type { Channel, MenuProduct } from '../../pedido/data';
import { MenuCatalog } from '../../pedido/MenuCatalog';
import type { TicketLine } from '../../pedido/OrderTicket';
import { statusMeta, type ProposalOrder } from '../data';
import { CHANNEL_FROM_ORDER, CHANNEL_OPTIONS, PAID_BY_ORDER, SENT_BY_ORDER, type SentLine } from './editData';
import { EditOrderTicket, computeEditTotals } from './EditOrderTicket';

const STATUS_CHIP: Record<ProposalOrder['status'], string> = {
  new: 'bg-brand-500/10 text-brand-500',
  kitchen: 'bg-amber-50 text-amber-700',
  ready: 'bg-emerald-50 text-emerald-700',
  paid: 'bg-muted text-muted-foreground',
};

interface EditOrderSheetProps {
  order: ProposalOrder;
  onClose: () => void;
}

/**
 * Propuesta de rediseño de "Editar pedido" (EditOrderDialog) al abrir una comanda. Mantiene la
 * estructura de Crear pedido, pero el ticket separa lo ya enviado a cocina de lo nuevo por
 * enviar, y muestra abonos y saldo pendiente.
 */
export function EditOrderSheet({ order, onClose }: EditOrderSheetProps) {
  const [channel, setChannel] = useState<Channel>(CHANNEL_FROM_ORDER[order.channel]);
  const [sent, setSent] = useState<SentLine[]>(SENT_BY_ORDER[order.id] ?? []);
  const [pending, setPending] = useState<TicketLine[]>([]);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const paid = PAID_BY_ORDER[order.id] ?? 0;
  const locked = paid === 'full';

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const sentQty = (id: string) => sent.filter((l) => l.productId === id && !l.voided).reduce((s, l) => s + l.quantity, 0);
  const quantityFor = (id: string) => sentQty(id) + (pending.find((l) => l.productId === id)?.quantity ?? 0);

  const adjustPending = (productId: string, delta: number) =>
    setPending((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      if (!existing) return delta > 0 ? [...prev, { productId, quantity: delta }] : prev;
      return prev.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0);
    });

  const addProduct = (product: MenuProduct) => {
    if (!locked) adjustPending(product.id, 1);
  };

  const sendPending = () => {
    const count = pending.reduce((s, l) => s + l.quantity, 0);
    setSent((prev) => [...prev, ...pending.map((l, i) => ({ key: `n${Date.now()}-${i}`, productId: l.productId, quantity: l.quantity, state: 'preparing' as const }))]);
    setPending([]);
    setNotice(`${count} ${count === 1 ? 'producto enviado' : 'productos enviados'} a cocina`);
    window.setTimeout(() => setNotice(null), 2600);
  };

  const toggleVoid = (key: string) => setSent((prev) => prev.map((l) => (l.key === key ? { ...l, voided: !l.voided } : l)));

  const { due, total, pendingCount } = computeEditTotals(sent, pending, channel, paid);
  const ticketProps = { order, channel, sent, pending, paid, onAdjustPending: adjustPending, onToggleVoid: toggleVoid, onSendPending: sendPending };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="edit-order-title" className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-card px-4 py-3 sm:px-6">
        <button type="button" onClick={onClose} aria-label="Volver a pedidos" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-brand-950 transition-colors hover:bg-muted">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 id="edit-order-title" className="truncate text-lg font-semibold tracking-tight text-brand-950">Pedido {order.id}</h1>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CHIP[order.status]}`}>{statusMeta[order.status].label}</span>
          </div>
          <p className="truncate text-xs text-muted-foreground">{order.customer} · {order.table} · {order.time}</p>
        </div>

        <div role="group" aria-label="Tipo de pedido" className="order-last flex w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1 md:order-none md:w-auto">
          {CHANNEL_OPTIONS.map((option) => {
            const active = channel === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                disabled={locked}
                onClick={() => setChannel(option.value)}
                className={`min-h-9 flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 md:flex-none ${active ? 'bg-card text-brand-950 shadow-sm' : 'text-muted-foreground hover:text-brand-950'}`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <button type="button" onClick={onClose} className="flex min-h-10 shrink-0 items-center rounded-xl bg-brand-950 px-5 text-sm font-semibold text-white transition-[filter] hover:brightness-110">
          Listo
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className={`min-w-0 flex-1 overflow-y-auto px-4 pb-28 pt-5 sm:px-6 lg:pb-8 ${locked ? 'pointer-events-none opacity-50' : ''}`} aria-disabled={locked}>
          <MenuCatalog quantityFor={quantityFor} onAdd={addProduct} />
        </main>
        <aside aria-label="Resumen del pedido" className="hidden w-[400px] shrink-0 border-l border-border lg:block">
          <EditOrderTicket {...ticketProps} />
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card px-4 py-3 lg:hidden">
        <button type="button" onClick={() => setSummaryOpen(true)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-brand-500 px-4 text-white">
          <span className="flex items-center gap-2 text-sm font-semibold">
            {pendingCount > 0 && <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs tabular-nums">+{pendingCount}</span>}
            Ver resumen
          </span>
          <span className="flex items-center gap-1.5 text-base font-semibold tabular-nums">
            {formatUsd(locked ? total : due)} <ChevronUp aria-hidden="true" className="h-4 w-4" />
          </span>
        </button>
      </div>

      {summaryOpen && (
        <div className="fixed inset-0 z-20 flex flex-col lg:hidden" role="dialog" aria-modal="true" aria-label="Resumen del pedido">
          <button type="button" aria-label="Cerrar resumen" onClick={() => setSummaryOpen(false)} className="h-16 shrink-0 bg-brand-950/40" />
          <div className="min-h-0 flex-1 overflow-hidden rounded-t-3xl">
            <EditOrderTicket {...ticketProps} onClose={() => setSummaryOpen(false)} />
          </div>
        </div>
      )}

      {notice && (
        <div role="status" className="pointer-events-none fixed bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full bg-brand-950 px-4 py-2 text-sm font-medium text-white shadow-lg lg:bottom-6">
          {notice}
        </div>
      )}
    </div>
  );
}
