import { ChefHat, ChevronRight, MapPin, Minus, Plus, ShoppingBag, StickyNote, UserRound, X } from 'lucide-react';
import { formatBs, formatUsd } from '../dashboard/format';
import { DELIVERY_FEE, MENU, SAMPLE_CUSTOMER, TABLES, type Channel } from './data';

export interface TicketLine {
  productId: string;
  quantity: number;
}

interface OrderTicketProps {
  channel: Channel;
  lines: TicketLine[];
  tableId: string | null;
  onTableChange: (id: string) => void;
  onAdjust: (productId: string, delta: number) => void;
  onClear: () => void;
  onClose?: () => void;
}

export function computeTotals(lines: TicketLine[], channel: Channel) {
  const subtotal = lines.reduce((sum, l) => sum + (MENU.find((p) => p.id === l.productId)?.price ?? 0) * l.quantity, 0);
  const delivery = channel === 'DELIVERY' && subtotal > 0 ? DELIVERY_FEE : 0;
  const items = lines.reduce((sum, l) => sum + l.quantity, 0);
  return { subtotal, delivery, total: subtotal + delivery, items };
}

export function OrderTicket({ channel, lines, tableId, onTableChange, onAdjust, onClear, onClose }: OrderTicketProps) {
  const { subtotal, delivery, total, items } = computeTotals(lines, channel);
  const empty = lines.length === 0;
  const needsTable = channel === 'DINE_IN' && !tableId;

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold tracking-tight text-brand-950">Pedido actual</h2>
          <p className="text-xs text-muted-foreground">
            {items === 0 ? 'Sin productos' : `${items} ${items === 1 ? 'producto' : 'productos'}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {!empty && (
            <button type="button" onClick={onClear} className="min-h-9 rounded-lg px-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50">
              Vaciar
            </button>
          )}
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Cerrar pedido" className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-brand-950">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-3 text-left transition-colors hover:border-brand-950/20"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-950 text-white">
            <UserRound aria-hidden="true" className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Cliente</span>
            <span className="block truncate text-sm font-semibold text-brand-950">{SAMPLE_CUSTOMER.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{SAMPLE_CUSTOMER.phone}</span>
          </span>
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>

        <ChannelContext channel={channel} tableId={tableId} onTableChange={onTableChange} />

        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 py-10 text-center">
            <ShoppingBag aria-hidden="true" className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-brand-950">Aún no hay productos</p>
            <p className="text-xs text-muted-foreground">Toca un producto del menú para agregarlo.</p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {lines.map((line) => {
              const product = MENU.find((p) => p.id === line.productId);
              if (!product) return null;
              return (
                <li key={line.productId} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-brand-950">{product.name}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">{formatUsd(product.price)} c/u</p>
                  </div>
                  <div className="flex shrink-0 items-center rounded-full border border-border">
                    <button type="button" onClick={() => onAdjust(product.id, -1)} aria-label={`Quitar una unidad de ${product.name}`} className="flex h-9 w-9 items-center justify-center rounded-full text-brand-950 transition-colors hover:bg-muted">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm font-semibold tabular-nums text-brand-950">{line.quantity}</span>
                    <button type="button" onClick={() => onAdjust(product.id, 1)} aria-label={`Agregar una unidad de ${product.name}`} className="flex h-9 w-9 items-center justify-center rounded-full text-brand-950 transition-colors hover:bg-muted">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="w-20 shrink-0 whitespace-nowrap text-right text-sm font-semibold tabular-nums text-brand-950">
                    {formatUsd(product.price * line.quantity)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {!empty && (
          <button type="button" className="flex items-center gap-2 self-start rounded-lg px-1 text-sm font-medium text-brand-500 transition-colors hover:text-brand-950">
            <StickyNote aria-hidden="true" className="h-4 w-4" /> Agregar nota para cocina
          </button>
        )}
      </div>

      <div className="shrink-0 border-t border-border px-5 py-4">
        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatUsd(subtotal)}</dd>
          </div>
          {channel === 'DELIVERY' && (
            <div className="flex justify-between text-muted-foreground">
              <dt>Envío</dt>
              <dd className="tabular-nums">{formatUsd(delivery)}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between pt-1">
            <dt className="font-semibold text-brand-950">Total</dt>
            <dd className="text-[26px] font-semibold tracking-tight tabular-nums text-brand-950">{formatUsd(total)}</dd>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <dt>Equivalente</dt>
            <dd className="tabular-nums">{formatBs(total)}</dd>
          </div>
        </dl>

        {needsTable && !empty && (
          <p role="alert" className="mt-3 rounded-xl bg-accent px-3 py-2 text-xs font-medium text-brand-900">
            Elige una mesa para poder enviar el pedido.
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={empty || needsTable}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold text-brand-950 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ChefHat aria-hidden="true" className="h-4 w-4" /> Enviar a cocina
          </button>
          <button
            type="button"
            disabled={empty || needsTable}
            className="flex min-h-12 items-center justify-center rounded-xl bg-brand-500 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(5,165,245,0.45)] transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
          >
            Cobrar {empty ? '' : formatUsd(total)}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChannelContext({ channel, tableId, onTableChange }: { channel: Channel; tableId: string | null; onTableChange: (id: string) => void }) {
  if (channel === 'DINE_IN') {
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Mesa</legend>
        <div className="grid grid-cols-4 gap-2">
          {TABLES.map((t) => {
            const active = t.id === tableId;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={active}
                onClick={() => onTableChange(t.id)}
                className={`flex min-h-12 flex-col items-center justify-center rounded-xl border text-sm font-semibold transition-colors ${
                  active
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-border bg-card text-brand-950 hover:border-brand-950/20'
                }`}
              >
                {t.label}
                <span className={`text-[10px] font-medium ${active ? 'text-white/75' : t.busy ? 'text-amber-600' : 'text-muted-foreground'}`}>
                  {t.busy ? 'Abierta' : `${t.seats} pers.`}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (channel === 'DELIVERY') {
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor="proposal-address" className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Dirección de entrega
        </label>
        <div className="relative">
          <MapPin aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="proposal-address"
            defaultValue="Av. Francisco de Miranda, Edif. Parque Cristal"
            className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm text-brand-950"
          />
        </div>
        <p className="text-xs text-muted-foreground">Envío calculado por zona · Motorizado: próximo en turno</p>
      </div>
    );
  }

  const hint: Record<Exclude<Channel, 'DINE_IN' | 'DELIVERY'>, string> = {
    EXPRESS: 'Pedido rápido para llevar, sin mesa asignada.',
    BAR: 'Se sirve en la barra y se cobra al momento.',
    PICKUP: 'El cliente lo retira en el local. Te avisamos cuando esté listo.',
  };
  return <p className="rounded-xl bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">{hint[channel]}</p>;
}
