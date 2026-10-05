import { CalendarClock, Info, PackageX, Timer } from 'lucide-react';
import { alerts, tableStateMeta, tables, type Alert, type TableState } from './data';
import { Panel } from './Panel';

const legendOrder: TableState[] = ['free', 'busy', 'bill', 'reserved'];

export function TablesCard() {
  const busy = tables.filter((t) => t.state === 'busy' || t.state === 'bill').length;

  return (
    <Panel
      title="Salón"
      subtitle={`${busy} de ${tables.length} mesas ocupadas · ${Math.round((busy / tables.length) * 100)}% de ocupación`}
      action="Mesas"
      className="xl:col-span-2"
    >
      <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
        {tables.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className={`flex aspect-[4/3] w-full flex-col justify-between rounded-xl border p-2.5 text-left transition-transform active:scale-[0.97] ${tableStateMeta[t.state].tile}`}
            >
              <span className="text-sm font-semibold tabular-nums">Mesa {t.id}</span>
              <span className="text-[11px] font-medium tabular-nums opacity-80">
                {t.minutes !== undefined ? `${t.guests} pers. · ${t.minutes} min` : tableStateMeta[t.state].label}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-medium text-brand-950/55">
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

const toneStyles: Record<Alert['tone'], { icon: string; button: string }> = {
  danger: { icon: 'bg-red-100 text-red-600', button: 'text-red-700 hover:bg-red-50' },
  warning: { icon: 'bg-amber-100 text-amber-700', button: 'text-amber-800 hover:bg-amber-50' },
  info: { icon: 'bg-brand-500/10 text-brand-600', button: 'text-brand-600 hover:bg-brand-500/10' },
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
      <ul className="flex flex-col gap-1">
        {alerts.map((a) => {
          const Icon = alertIcon[a.id] ?? Info;
          return (
            <li key={a.id} className="flex items-start gap-3 rounded-xl py-2">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneStyles[a.tone].icon}`}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-brand-950">{a.title}</p>
                <p className="text-xs leading-relaxed text-brand-950/50 text-pretty">{a.detail}</p>
              </div>
              <button
                type="button"
                className={`shrink-0 rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${toneStyles[a.tone].button}`}
              >
                {a.action}
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
