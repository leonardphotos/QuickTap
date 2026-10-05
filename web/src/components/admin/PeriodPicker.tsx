import { useMemo } from 'react';
import { type Period,periodLabel,type PeriodMode } from './PeriodPicker.shared';

const MODOS: { id: PeriodMode; label: string }[] = [
  { id: 'day', label: 'Día' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
  { id: 'custom', label: 'Personalizado' },
];

/**
 * Selector de período compartido por los reportes de las tres verticales.
 *
 * Todos los campos son `type="date"` a propósito: `type="week"` y `type="month"` solo los
 * pinta Chromium — en Safari y Firefox degradan a una caja de texto donde hay que tipear
 * "2026-W36" a mano. Con fechas normales se elige cualquier día y el selector resuelve la
 * semana (lunes a domingo) o el mes que lo contiene, y muestra abajo el tramo exacto para
 * que nadie tenga que adivinar qué quedó seleccionado.
 */
export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const etiqueta = useMemo(() => periodLabel(value), [value]);

  return (
    <div className="space-y-2">
      <div className="flex w-max flex-wrap items-center gap-1 rounded-full bg-brand-950/[0.05] p-1">
        {MODOS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange({ ...value, mode: m.id })}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              value.mode === m.id ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {value.mode === 'custom' ? (
          <>
            <label className="text-brand-950/50 text-sm font-medium">
              Desde
              <input
                type="date"
                value={value.from}
                max={value.to || undefined}
                onChange={(e) => onChange({ ...value, from: e.target.value })}
                className="mt-1 block rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-base"
              />
            </label>
            <label className="text-brand-950/50 text-sm font-medium">
              Hasta
              <input
                type="date"
                value={value.to}
                min={value.from || undefined}
                onChange={(e) => onChange({ ...value, to: e.target.value })}
                className="mt-1 block rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-base"
              />
            </label>
          </>
        ) : (
          <label className="text-brand-950/50 text-sm font-medium">
            {value.mode === 'day' ? 'Día' : value.mode === 'week' ? 'Cualquier día de la semana' : 'Cualquier día del mes'}
            <input
              type="date"
              value={value.anchor}
              onChange={(e) => onChange({ ...value, anchor: e.target.value })}
              className="mt-1 block rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-base"
            />
          </label>
        )}
        <span className="pb-1.5 text-xs font-medium text-brand-950/60 first-letter:uppercase">{etiqueta}</span>
      </div>
    </div>
  );
}
