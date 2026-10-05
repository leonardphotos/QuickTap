import { CheckCircle2, CircleDollarSign, ClipboardList, Receipt, ShoppingCart, TrendingUp, Wallet } from 'lucide-react';
import { kpis, restaurant } from './data';
import { formatUsd } from './format';

export function ProposalToolbar() {
  const today = new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Caracas' });
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <span className="text-xs tracking-[0.12em] text-muted-foreground">RESTAURANTE</span>
        <h1 className="mt-1 text-[30px] font-semibold tracking-[-1.1px] text-brand-950">Resumen del negocio</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-medium text-brand-950">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          Caja abierta · desde 11:02
        </span>
        <span className="capitalize text-muted-foreground">{today}</span>
      </div>
    </header>
  );
}

function MiniBars({ values }: { values: number[] }) {
  const max = Math.max(...values);
  return (
    <div className="mt-5 flex h-20 items-end justify-between gap-1.5 pb-4" aria-hidden="true">
      {values.map((v, i) => (
        <span key={i} className="w-[7px] rounded-full bg-[#65bce7]" style={{ height: `${6 + (v / max) * 52}px` }} />
      ))}
    </div>
  );
}

function MiniLine({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 230},${70 - ((v - min) / (max - min || 1)) * 55}`).join(' ');
  return (
    <svg viewBox="0 0 230 80" className="-mx-6 mt-5 h-20 w-[calc(100%+3rem)] text-brand-500" aria-hidden="true" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function WelcomeRow() {
  const sales = kpis.find((k) => k.id === 'sales')!;
  const orders = kpis.find((k) => k.id === 'orders')!;
  const ticket = kpis.find((k) => k.id === 'ticket')!;

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr]">
      <section className="flex min-h-[230px] flex-col justify-between gap-5 rounded-3xl bg-accent p-5 sm:gap-6 sm:p-7 md:col-span-2 xl:col-span-1">
        <a href="#" className="inline-flex items-center gap-2 self-start rounded-full bg-white/70 px-3 py-1.5 text-[11px] font-medium text-brand-500">
          <CheckCircle2 className="h-4 w-4" /> {restaurant.plan} · {restaurant.daysLeft} días restantes
        </a>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[30px] font-semibold tracking-[-1px] text-brand-950 text-balance">Hola, {restaurant.user}</h2>
            <p className="mt-1.5 text-[#70776f]">Así va el servicio en {restaurant.name}</p>
          </div>
          {/* Propuesta: el total del día vive en el saludo, con su comparación, en vez de
              repetirse en una tarjeta aparte. */}
          <div className="w-full rounded-2xl bg-white/70 px-4 py-3 sm:w-auto sm:bg-transparent sm:p-0 sm:text-right">
            <p className="text-xs text-muted-foreground">Vendido hoy</p>
            <p className="text-[26px] font-semibold tracking-tight tabular-nums text-brand-950">{formatUsd(sales.valueUsd)}</p>
            <p className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
              <TrendingUp className="h-3.5 w-3.5" /> +{sales.deltaPct.toLocaleString('es-VE')}% {sales.hint}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <a href="#" className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#dcecf5] bg-white px-3 text-[13px] font-medium text-brand-500 transition-transform active:scale-[0.97] sm:px-3.5">
            <ClipboardList className="h-[17px] w-[17px] shrink-0" /> Ver pedidos
          </a>
          <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#dcecf5] bg-white px-3 text-[13px] font-medium text-brand-500 transition-transform active:scale-[0.97] sm:px-3.5">
            <CircleDollarSign className="h-[17px] w-[17px] shrink-0" /> Agregar gasto
          </button>
          <button type="button" className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-brand-500 bg-brand-500 px-3.5 text-[13px] font-medium text-white transition-transform active:scale-[0.97]">
            <ShoppingCart className="h-[17px] w-[17px]" /> Agregar compra
          </button>
        </div>
      </section>

      <section className="relative min-w-0 overflow-hidden rounded-3xl border border-border bg-card px-6 pt-6">
        <span className="text-[13px] text-brand-950">Pedidos de hoy</span>
        <Receipt className="absolute right-5 top-5 h-9 w-9 rounded-xl bg-accent p-2 text-brand-500" aria-hidden="true" />
        <strong className="mt-2 block text-[34px] font-semibold tracking-[-1px] tabular-nums">{orders.valueUsd}</strong>
        <p className="text-sm text-muted-foreground">{orders.hint}</p>
        <MiniBars values={orders.trend} />
      </section>

      <section className="relative min-w-0 overflow-hidden rounded-3xl border border-border bg-card px-6 pt-6">
        <span className="text-[13px] text-brand-950">Ticket promedio</span>
        <Wallet className="absolute right-5 top-5 h-9 w-9 rounded-xl bg-accent p-2 text-brand-500" aria-hidden="true" />
        <strong className="mt-2 block text-[34px] font-semibold tracking-[-1px] tabular-nums">{formatUsd(ticket.valueUsd)}</strong>
        <p className="text-sm text-muted-foreground">Por pedido completado</p>
        <MiniLine values={ticket.trend} />
      </section>
    </div>
  );
}
