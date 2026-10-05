import { Bell, Plus, Search } from 'lucide-react';
import { BCV_RATE, restaurant } from './data';

export function ProposalHeader() {
  const today = new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Caja abierta · desde 11:02
          </span>
          <span className="rounded-full bg-brand-950/[0.06] px-2.5 py-1 text-xs font-medium tabular-nums text-brand-950/70">
            BCV Bs {BCV_RATE.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-brand-950 text-balance md:text-[28px]">
          Buenas noches, {restaurant.user}
        </h1>
        <p className="mt-0.5 text-sm capitalize text-muted-foreground">{today}</p>
      </div>

      <div className="flex items-center gap-2">
        <label className="relative hidden flex-1 sm:block md:w-64 md:flex-none">
          <span className="sr-only">Buscar pedido, mesa o producto</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-950/35" />
          <input
            type="search"
            placeholder="Buscar pedido, mesa o producto"
            className="h-10 w-full rounded-xl border border-brand-950/10 bg-white pl-9 pr-3 text-sm text-brand-950 placeholder:text-brand-950/35 focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
          />
        </label>
        <button
          type="button"
          aria-label="Notificaciones (4 nuevas)"
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-950/10 bg-white text-brand-950/70 transition-colors hover:bg-brand-950/[0.03]"
        >
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
        </button>
        <button
          type="button"
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 lg:hidden"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Pedido
        </button>
      </div>
    </header>
  );
}
