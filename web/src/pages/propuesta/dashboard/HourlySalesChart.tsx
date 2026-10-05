import { CURRENT_HOUR, hourlySales, kpis } from './data';
import { formatBs, formatHour, formatUsd } from './format';
import { Panel } from './Panel';

/** "Ventas de hoy" con la misma estructura que el real (barras por hora + 3 totales), sumando
 * la referencia de la semana pasada como barra fantasma para leer si el turno va bien o mal. */
export function HourlySalesChart() {
  const sales = kpis.find((k) => k.id === 'sales')!;
  const tips = kpis.find((k) => k.id === 'tips')!;
  const max = Math.max(...hourlySales.map((h) => Math.max(h.today ?? 0, h.lastWeek)));

  return (
    <Panel
      title="Ventas de hoy"
      subtitle="Ingresos por hora · hora de Caracas"
      aside={
        <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground sm:flex-col sm:items-end sm:gap-1">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand-500" />Hoy ($)</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#dcecf5]" />Semana pasada</span>
        </div>
      }
    >
      <div className="relative h-[200px] pb-6 pl-12 sm:h-[210px] sm:pl-14" role="img" aria-label="Ventas por hora comparadas con la semana pasada">
        <div className="pointer-events-none absolute inset-x-0 bottom-6 top-0 flex flex-col justify-between">
          {[max, max / 2, 0].map((v) => (
            <span key={v} className="border-b border-dashed border-border text-[10px] text-muted-foreground">{formatUsd(v)}</span>
          ))}
        </div>
        <div className="relative flex h-full min-w-0 gap-0.5 sm:gap-1.5">
          {hourlySales.map((h) => (
            <div key={h.hour} className="relative flex min-w-0 flex-1 items-end justify-center gap-px sm:gap-[3px]" title={`${formatHour(h.hour)} · ${h.today === null ? 'pendiente' : formatUsd(h.today)}`}>
              <i className="w-[30%] max-w-[6px] rounded-full bg-[#dcecf5]" style={{ height: `${(h.lastWeek / max) * 100}%` }} />
              <i
                className={`w-[45%] max-w-[10px] rounded-full ${h.hour === CURRENT_HOUR ? 'bg-brand-500 ring-2 ring-accent sm:ring-4' : 'bg-brand-500'}`}
                style={{ height: `${((h.today ?? 0) / max) * 100}%`, minHeight: h.today === null ? 0 : 2 }}
              />
              <small className={`absolute -bottom-6 whitespace-nowrap text-[10px] sm:text-[11px] ${h.hour === CURRENT_HOUR ? 'font-semibold text-brand-500' : 'text-muted-foreground'}`}>
                {h.hour % 2 === 0 ? `${h.hour}h` : ''}
              </small>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-border pt-5 sm:grid-cols-3">
        <div className="min-w-0">
          <span className="text-[11px] text-muted-foreground">Total vendido</span>
          <strong className="mt-1.5 block text-lg font-semibold tabular-nums sm:text-xl">{formatUsd(sales.valueUsd)}</strong>
        </div>
        <div className="min-w-0 sm:order-last">
          <span className="text-[11px] text-muted-foreground">Propinas</span>
          <strong className="mt-1.5 block text-lg font-semibold tabular-nums sm:text-xl">{formatUsd(tips.valueUsd)}</strong>
        </div>
        <div className="col-span-2 min-w-0 rounded-xl bg-accent px-3 py-2.5 sm:col-span-1 sm:bg-transparent sm:p-0">
          <span className="text-[11px] text-muted-foreground">Equivalente en Bs</span>
          <strong className="mt-1.5 block text-lg font-semibold tabular-nums sm:text-xl">{formatBs(sales.valueUsd)}</strong>
        </div>
      </div>
    </Panel>
  );
}
