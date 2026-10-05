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
        <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand-500" />Hoy ($)</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#dcecf5]" />Semana pasada</span>
        </div>
      }
    >
      <div className="relative h-[210px] pb-6 pl-14" role="img" aria-label="Ventas por hora comparadas con la semana pasada">
        <div className="pointer-events-none absolute inset-x-0 bottom-6 top-0 flex flex-col justify-between">
          {[max, max / 2, 0].map((v) => (
            <span key={v} className="border-b border-dashed border-border text-[10px] text-muted-foreground">{formatUsd(v)}</span>
          ))}
        </div>
        <div className="relative flex h-full gap-1.5">
          {hourlySales.map((h) => (
            <div key={h.hour} className="relative flex flex-1 items-end justify-center gap-[3px]" title={`${formatHour(h.hour)} · ${h.today === null ? 'pendiente' : formatUsd(h.today)}`}>
              <i className="w-[6px] rounded-full bg-[#dcecf5]" style={{ height: `${(h.lastWeek / max) * 100}%` }} />
              <i
                className={`w-[10px] rounded-full ${h.hour === CURRENT_HOUR ? 'bg-brand-500 ring-4 ring-accent' : 'bg-brand-500'}`}
                style={{ height: `${((h.today ?? 0) / max) * 100}%`, minHeight: h.today === null ? 0 : 2 }}
              />
              <small className={`absolute -bottom-6 text-[11px] ${h.hour === CURRENT_HOUR ? 'font-semibold text-brand-500' : 'text-muted-foreground'}`}>
                {h.hour % 2 === 0 ? `${h.hour}h` : ''}
              </small>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-5">
        <div className="min-w-0">
          <span className="text-[11px] text-muted-foreground">Total vendido</span>
          <strong className="mt-1.5 block text-xl font-semibold tabular-nums">{formatUsd(sales.valueUsd)}</strong>
        </div>
        <div className="min-w-0">
          <span className="text-[11px] text-muted-foreground">Equivalente en Bs</span>
          <strong className="mt-1.5 block truncate text-xl font-semibold tabular-nums">{formatBs(sales.valueUsd)}</strong>
        </div>
        <div className="min-w-0">
          <span className="text-[11px] text-muted-foreground">Propinas</span>
          <strong className="mt-1.5 block text-xl font-semibold tabular-nums">{formatUsd(tips.valueUsd)}</strong>
        </div>
      </div>
    </Panel>
  );
}
