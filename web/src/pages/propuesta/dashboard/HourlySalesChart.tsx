import { CURRENT_HOUR, hourlySales } from './data';
import { formatHour, formatUsd } from './format';
import { Panel } from './Panel';

export function HourlySalesChart() {
  const max = Math.max(...hourlySales.map((p) => Math.max(p.today ?? 0, p.lastWeek)));
  const ceiling = Math.ceil(max / 50) * 50;
  const gridLines = [ceiling, ceiling / 2, 0];
  const peak = hourlySales.reduce((best, p) => ((p.today ?? 0) > (best.today ?? 0) ? p : best));

  return (
    <Panel
      title="Ventas por hora"
      subtitle={`Pico de hoy a las ${formatHour(peak.hour)} · ${formatUsd(peak.today ?? 0)}`}
      className="xl:col-span-2"
      aside={
        <div className="flex shrink-0 items-center gap-3 text-[11px] font-medium text-brand-950/55">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-brand-500" /> Hoy
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-brand-950/15" /> Semana pasada
          </span>
        </div>
      }
    >
      <div className="relative flex flex-1 gap-3" role="img" aria-label="Gráfico de ventas por hora de hoy comparado con la semana pasada">
        <div className="flex h-52 flex-col justify-between pb-6 text-right text-[10px] tabular-nums text-brand-950/35">
          {gridLines.map((g) => (
            <span key={g}>${g}</span>
          ))}
        </div>

        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[calc(13rem-1.5rem)] flex-col justify-between">
            {gridLines.map((g) => (
              <div key={g} className="border-t border-dashed border-brand-950/[0.07]" />
            ))}
          </div>

          <div className="relative flex h-52 items-end gap-1.5 sm:gap-2.5">
            {hourlySales.map((p) => {
              const isNow = p.hour === CURRENT_HOUR;
              const future = p.today === null;
              return (
                <div key={p.hour} className="group flex h-full flex-1 flex-col items-center justify-end">
                  <div className="relative flex h-[calc(100%-1.5rem)] w-full items-end justify-center gap-0.5">
                    <div
                      className="w-full max-w-3 rounded-t-[3px] bg-brand-950/[0.12]"
                      style={{ height: `${(p.lastWeek / ceiling) * 100}%` }}
                    />
                    {!future && (
                      <div
                        className={`w-full max-w-3 rounded-t-[3px] transition-colors ${isNow ? 'bg-brand-500/50' : 'bg-brand-500 group-hover:bg-brand-600'}`}
                        style={{ height: `${((p.today ?? 0) / ceiling) * 100}%` }}
                      />
                    )}
                    <div className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-brand-950 px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover:block">
                      {future ? `Semana pasada ${formatUsd(p.lastWeek)}` : `${formatUsd(p.today ?? 0)} · antes ${formatUsd(p.lastWeek)}`}
                    </div>
                  </div>
                  <span className={`mt-2 h-4 text-[10px] tabular-nums ${isNow ? 'font-semibold text-brand-600' : 'text-brand-950/40'}`}>
                    {isNow ? 'Ahora' : p.hour}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Panel>
  );
}
