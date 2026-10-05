import { ArrowLeft, Bike, Martini, Store, UtensilsCrossed, Zap } from 'lucide-react';
import type { Channel } from './data';

export const CHANNELS: { value: Channel; label: string; icon: typeof Bike }[] = [
  { value: 'DINE_IN', label: 'Mesa', icon: UtensilsCrossed },
  { value: 'EXPRESS', label: 'Express', icon: Zap },
  { value: 'BAR', label: 'Barra', icon: Martini },
  { value: 'DELIVERY', label: 'Delivery', icon: Bike },
  { value: 'PICKUP', label: 'Pick-up', icon: Store },
];

interface OrderTopBarProps {
  channel: Channel;
  onChannelChange: (channel: Channel) => void;
  hasDraft: boolean;
}

export function OrderTopBar({ channel, onChannelChange, hasDraft }: OrderTopBarProps) {
  return (
    <header className="shrink-0 border-b border-border bg-card">
      <div className="flex flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:gap-6">
        <div className="flex min-w-0 items-center gap-3 lg:flex-1">
          <a
            href="/propuesta/dashboard"
            aria-label="Volver al resumen"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-brand-950 transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </a>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight text-brand-950">Crear pedido</h1>
            <p role="status" className="truncate text-xs text-muted-foreground">
              {hasDraft ? 'Borrador guardado en este dispositivo · Sin enviar a cocina' : 'Se guarda como borrador al agregar productos'}
            </p>
          </div>
          <button
            type="button"
            className="min-h-10 shrink-0 rounded-full border border-border px-4 text-sm font-semibold text-brand-950 transition-colors hover:bg-muted lg:hidden"
          >
            Guardar y salir
          </button>
        </div>

        <div
          role="group"
          aria-label="Tipo de pedido"
          className="grid grid-cols-5 gap-1 rounded-full border border-border bg-muted p-1 lg:w-[30rem] lg:shrink-0"
        >
          {CHANNELS.map((opt) => {
            const active = channel === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() => onChannelChange(opt.value)}
                className={`flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full px-1 text-xs font-semibold transition-colors sm:text-sm ${
                  active ? 'bg-brand-500 text-white shadow-sm' : 'text-brand-950/65 hover:bg-card hover:text-brand-950'
                }`}
              >
                <opt.icon aria-hidden="true" className="hidden h-4 w-4 shrink-0 sm:block" />
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="hidden min-h-10 shrink-0 rounded-full border border-border px-4 text-sm font-semibold text-brand-950 transition-colors hover:bg-muted lg:block"
        >
          Guardar y salir
        </button>
      </div>
    </header>
  );
}
