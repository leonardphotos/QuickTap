import { CalendarClock, Info, PackageX, Timer } from 'lucide-react';
import { alerts, tableStateMeta, tables, topProducts, type Alert, type TableState } from './data';
import { formatUsd } from './format';
import { Panel } from './Panel';

const legendOrder: TableState[] = ['free', 'busy', 'bill', 'reserved'];

export function TablesCard() {
  const busy = tables.filter((t) => t.state === 'busy' || t.state === 'bill').length;

  return (
    <Panel
      title="Salón"
      subtitle={`${busy} de ${tables.length} mesas ocupadas · ${Math.round((busy / tables.length) * 100)}% de ocupación`}
      action="Mesas"
    >
      <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
        {tables.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className={`flex aspect-[4/3] w-full flex-col justify-between rounded-2xl border p-2.5 text-left transition-transform active:scale-[0.97] ${tableStateMeta[t.state].tile}`}
            >
              <span className="text-sm font-semibold tabular-nums">Mesa {t.id}</span>
              <span className="text-[11px] font-medium tabular-nums opacity-80">
                {t.minutes !== undefined ? `${t.guests} pers. · ${t.minutes} min` : tableStateMeta[t.state].label}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {legendOrder.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${tableStateMeta[s].legend}`} />
            {tableStateMeta[s].label}
          </span>
        ))}
      </div>
    </Panel>
  );
}

const toneStyles: Record<Alert['tone'], string> = {
  danger: 'bg-red-50 text-red-600',
  warning: 'bg-amber-50 text-amber-700',
  info: 'bg-accent text-brand-500',
};

const alertIcon: Record<string, typeof Info> = {
  stock: PackageX,
  res: CalendarClock,
  kitchen: Timer,
  plan: Info,
};

export function AttentionCard() {
  return (
    <Panel
      title="Requiere atención"
      subtitle="Lo que no puede esperar al cierre"
      aside={
        <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-semibold tabular-nums text-white">
          {alerts.length}
        </span>
      }
    >
      <ul className="flex flex-col">
        {alerts.map((a) => {
          const Icon = alertIcon[a.id] ?? Info;
          return (
            <li key={a.id}>
              <a href="#" className="-mx-2 flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-[#f3f9fd]">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneStyles[a.tone]}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground text-pretty">{a.detail}</p>
                  <p className="mt-1 text-xs font-medium text-brand-500">{a.action} ↗</p>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export function TopProductsCard() {
  const max = Math.max(...topProducts.map((p) => p.usd));
  return (
    <Panel title="Lo más vendido" subtitle="Hoy, por ingresos" action="Productos">
      <ol className="flex flex-col gap-4">
        {topProducts.map((p, i) => (
          <li key={p.name} className="flex items-center gap-3">
            <span className="w-4 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="shrink-0 text-sm font-semibold tabular-nums">{formatUsd(p.usd)}</p>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(p.usd / max) * 100}%` }} />
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{p.sold} und.</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
