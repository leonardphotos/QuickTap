import { ChefHat, ChevronRight, Lock, MapPin, Minus, Plus, Printer, RotateCcw, Trash2, UserRound, UtensilsCrossed, X } from 'lucide-react';
import { formatBs, formatUsd } from '../../dashboard/format';
import { DELIVERY_FEE, MENU, type Channel } from '../../pedido/data';
import type { TicketLine } from '../../pedido/OrderTicket';
import type { ProposalOrder } from '../data';
import type { SentLine } from './editData';

interface EditOrderTicketProps {
  order: ProposalOrder;
  channel: Channel;
  sent: SentLine[];
  pending: TicketLine[];
  paid: number | 'full';
  onAdjustPending: (productId: string, delta: number) => void;
  onToggleVoid: (key: string) => void;
  onSendPending: () => void;
  onCharge?: () => void;
  onClose?: () => void;
}

const priceOf = (productId: string) => MENU.find((p) => p.id === productId)?.price ?? 0;

export function computeEditTotals(sent: SentLine[], pending: TicketLine[], channel: Channel, paid: number | 'full') {
  const sentSubtotal = sent.filter((l) => !l.voided).reduce((s, l) => s + priceOf(l.productId) * l.quantity, 0);
  const pendingSubtotal = pending.reduce((s, l) => s + priceOf(l.productId) * l.quantity, 0);
  const delivery = channel === 'DELIVERY' ? DELIVERY_FEE : 0;
  const total = sentSubtotal + pendingSubtotal + delivery;
  const paidAmount = paid === 'full' ? total : Math.min(paid, total);
  const pendingCount = pending.reduce((s, l) => s + l.quantity, 0);
  return { subtotal: sentSubtotal + pendingSubtotal, delivery, total, paidAmount, due: total - paidAmount, pendingCount };
}

export function EditOrderTicket({ order, channel, sent, pending, paid, onAdjustPending, onToggleVoid, onSendPending, onCharge, onClose }: EditOrderTicketProps) {
  const { subtotal, delivery, total, paidAmount, due, pendingCount } = computeEditTotals(sent, pending, channel, paid);
  const locked = paid === 'full';

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold tracking-tight text-brand-950">Resumen del pedido</h2>
          <p className="text-xs text-muted-foreground">Comanda {order.id} · {order.time.toLowerCase()}</p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Cerrar resumen" className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-brand-950">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-2">
          <ContextRow icon={<UserRound aria-hidden="true" className="h-4 w-4" />} label="Cliente" value={order.customer} />
          {channel === 'DINE_IN' && <ContextRow icon={<UtensilsCrossed aria-hidden="true" className="h-4 w-4" />} label="Mesa" value={order.table.startsWith('Mesa') ? order.table : 'Sin mesa asignada'} />}
          {channel === 'DELIVERY' && <ContextRow icon={<MapPin aria-hidden="true" className="h-4 w-4" />} label="Entrega" value="Av. Francisco de Miranda, Edif. Parque Cristal" />}
        </div>

        <section aria-labelledby="sent-heading" className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 id="sent-heading" className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Enviado a cocina</h3>
            <span className="text-xs text-muted-foreground">{sent.filter((l) => !l.voided).length} líneas</span>
          </div>
          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
            {sent.map((line) => {
              const product = MENU.find((p) => p.id === line.productId);
              if (!product) return null;
              return (
                <li key={line.key} className="flex items-start gap-3 px-3 py-3">
                  <span className={`mt-0.5 flex h-6 min-w-6 items-center justify-center rounded-md bg-muted px-1 text-xs font-semibold tabular-nums ${line.voided ? 'text-muted-foreground' : 'text-brand-950'}`}>{line.quantity}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-semibold ${line.voided ? 'text-muted-foreground line-through' : 'text-brand-950'}`}>{product.name}</p>
                    {line.note && <p className="truncate text-xs italic text-muted-foreground">{line.note}</p>}
                    <StateChip state={line.state} voided={line.voided} />
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`whitespace-nowrap text-sm font-semibold tabular-nums ${line.voided ? 'text-muted-foreground line-through' : 'text-brand-950'}`}>{formatUsd(product.price * line.quantity)}</span>
                    {!locked && (
                      <button type="button" onClick={() => onToggleVoid(line.key)} className="flex min-h-7 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-brand-950">
                        {line.voided ? <><RotateCcw aria-hidden="true" className="h-3 w-3" /> Restaurar</> : 'Anular'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {!locked && (
          <section aria-labelledby="pending-heading" className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 id="pending-heading" className="text-[11px] font-medium uppercase tracking-[0.08em] text-brand-500">Nuevo por enviar</h3>
              {pendingCount > 0 && <span className="text-xs font-medium text-brand-500">{pendingCount} {pendingCount === 1 ? 'producto' : 'productos'}</span>}
            </div>
            {pending.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-xs leading-relaxed text-muted-foreground">
                Toca un producto del menú para sumarlo a esta comanda.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-brand-500/15 rounded-2xl border border-brand-500/30 bg-brand-500/[0.06]">
                {pending.map((line) => {
                  const product = MENU.find((p) => p.id === line.productId);
                  if (!product) return null;
                  return (
                    <li key={line.productId} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-brand-950">{product.name}</p>
                        <p className="text-xs tabular-nums text-muted-foreground">{formatUsd(product.price)} c/u</p>
                      </div>
                      <div className="flex shrink-0 items-center rounded-full border border-border bg-card">
                        <button type="button" onClick={() => onAdjustPending(product.id, -1)} aria-label={`Quitar una unidad de ${product.name}`} className="flex h-9 w-9 items-center justify-center rounded-full text-brand-950 transition-colors hover:bg-muted">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-6 text-center text-sm font-semibold tabular-nums text-brand-950">{line.quantity}</span>
                        <button type="button" onClick={() => onAdjustPending(product.id, 1)} aria-label={`Agregar una unidad de ${product.name}`} className="flex h-9 w-9 items-center justify-center rounded-full text-brand-950 transition-colors hover:bg-muted">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="w-20 shrink-0 whitespace-nowrap text-right text-sm font-semibold tabular-nums text-brand-950">{formatUsd(product.price * line.quantity)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {locked && (
          <p className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <Lock aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Este pedido ya está cobrado. Para cambiarlo usa «Corregir o anular», que deja registro del ajuste.
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-border px-5 py-4">
        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between text-muted-foreground"><dt>Subtotal</dt><dd className="tabular-nums">{formatUsd(subtotal)}</dd></div>
          {delivery > 0 && <div className="flex justify-between text-muted-foreground"><dt>Envío</dt><dd className="tabular-nums">{formatUsd(delivery)}</dd></div>}
          {paidAmount > 0 && <div className="flex justify-between text-emerald-600"><dt>Abonado</dt><dd className="tabular-nums">−{formatUsd(paidAmount)}</dd></div>}
          <div className="flex items-baseline justify-between pt-1">
            <dt className="font-semibold text-brand-950">{locked ? 'Total cobrado' : 'Por cobrar'}</dt>
            <dd className="text-[26px] font-semibold tracking-tight tabular-nums text-brand-950">{formatUsd(locked ? total : due)}</dd>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground"><dt>Equivalente</dt><dd className="tabular-nums">{formatBs(locked ? total : due)}</dd></div>
        </dl>

        {locked ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold text-brand-950 transition-colors hover:bg-muted">
              <Printer aria-hidden="true" className="h-4 w-4" /> Reimprimir
            </button>
            <button type="button" className="flex min-h-12 items-center justify-center rounded-xl bg-brand-950 text-sm font-semibold text-white transition-[filter] hover:brightness-110">
              Corregir o anular
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onSendPending}
                disabled={pendingCount === 0}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold text-brand-950 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ChefHat aria-hidden="true" className="h-4 w-4" /> {pendingCount > 0 ? `Enviar ${pendingCount}` : 'Enviar a cocina'}
              </button>
              <button
                type="button"
                onClick={onCharge}
                disabled={due <= 0}
                className="flex min-h-12 items-center justify-center rounded-xl bg-brand-500 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(5,165,245,0.45)] transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
              >
                Cobrar {formatUsd(due)}
              </button>
            </div>
            <div className="flex items-center justify-between pt-1">
              <button type="button" className="flex min-h-9 items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-brand-950">
                <Printer aria-hidden="true" className="h-4 w-4" /> Imprimir cuenta
              </button>
              <button type="button" className="flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50">
                <Trash2 aria-hidden="true" className="h-4 w-4" /> Eliminar pedido
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ContextRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <button type="button" className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-3 text-left transition-colors hover:border-brand-950/20">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-brand-950">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
        <span className="block truncate text-sm font-semibold text-brand-950">{value}</span>
      </span>
      <span className="shrink-0 text-xs font-medium text-brand-500">Cambiar</span>
      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function StateChip({ state, voided }: { state: SentLine['state']; voided?: boolean }) {
  if (voided) return <span className="mt-1 inline-flex rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600">Anulado</span>;
  return state === 'served' ? (
    <span className="mt-1 inline-flex rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">Servido</span>
  ) : (
    <span className="mt-1 inline-flex rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">En preparación</span>
  );
}
