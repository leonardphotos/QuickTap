import { Banknote, CreditCard, Landmark, Smartphone } from 'lucide-react';
import { channelMeta, channelSales, paymentMethods, topProducts } from './data';
import { formatBs, formatUsd } from './format';
import { Panel } from './Panel';

export function ChannelsCard() {
  const total = channelSales.reduce((sum, c) => sum + c.usd, 0);

  return (
    <Panel title="Canales de venta" subtitle="De dónde vienen los pedidos de hoy">
      <div className="mb-5 flex h-3 w-full overflow-hidden rounded-full bg-brand-950/[0.05]" aria-hidden="true">
        {channelSales.map((c) => (
          <div key={c.channel} className={`${channelMeta[c.channel].color} h-full`} style={{ width: `${(c.usd / total) * 100}%` }} />
        ))}
      </div>
      <ul className="flex flex-col gap-3">
        {channelSales.map((c) => (
          <li key={c.channel} className="flex items-center gap-3 text-sm">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${channelMeta[c.channel].color}`} />
            <span className="flex-1 font-medium text-brand-950">{channelMeta[c.channel].label}</span>
            <span className="text-xs tabular-nums text-brand-950/45">{c.orders} ped.</span>
            <span className="w-12 text-right text-xs font-medium tabular-nums text-brand-950/55">
              {Math.round((c.usd / total) * 100)}%
            </span>
            <span className="w-20 text-right font-semibold tabular-nums text-brand-950">{formatUsd(c.usd)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const methodIcon: Record<string, typeof Banknote> = {
  pm: Smartphone,
  cash: Banknote,
  pos: CreditCard,
  zelle: Landmark,
};

export function PaymentMethodsCard() {
  const max = Math.max(...paymentMethods.map((m) => m.usd));

  return (
    <Panel title="Métodos de pago" subtitle="Cobrado en caja hoy" action="Cuadre">
      <ul className="flex flex-col gap-4">
        {paymentMethods.map((m) => {
          const Icon = methodIcon[m.id];
          return (
            <li key={m.id} className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium text-brand-950">{m.label}</p>
                  <p className="text-sm font-semibold tabular-nums text-brand-950">{formatUsd(m.usd)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-950/[0.05]">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${(m.usd / max) * 100}%` }} />
                  </div>
                  <span className="w-24 text-right text-[11px] tabular-nums text-brand-950/45">{formatBs(m.usd)}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export function TopProductsCard() {
  return (
    <Panel title="Más vendidos" subtitle="Top 5 de hoy por ingresos" action="Productos">
      <ol className="flex flex-col">
        {topProducts.map((p, i) => (
          <li key={p.name} className="flex items-center gap-3 border-b border-brand-950/[0.05] py-2.5 last:border-0">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums ${
                i === 0 ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.05] text-brand-950/60'
              }`}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-brand-950">{p.name}</p>
              <p className="text-xs text-brand-950/45">
                {p.category} · {p.sold} vendidos
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold tabular-nums text-brand-950">{formatUsd(p.usd)}</p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
