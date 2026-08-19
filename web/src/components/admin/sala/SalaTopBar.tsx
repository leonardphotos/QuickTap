import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { TextureButton } from '@/components/ui/texture-button';
import { MEAL_SERVICES } from '@/utils/meal-services';

/** Suma días a una fecha "YYYY-MM-DD" sin pasar por Date (evita saltos por zona horaria). */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function humanDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const label = dt.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Día que se está mirando, turno de servicio y alta rápida de reservas. */
export function SalaTopBar({
  date,
  onDateChange,
  mealServiceId,
  onMealServiceChange,
  onNewReservation,
  canCreateReservation,
}: {
  date: string;
  onDateChange: (date: string) => void;
  mealServiceId: string;
  onMealServiceChange: (id: string) => void;
  onNewReservation: () => void;
  canCreateReservation: boolean;
}) {
  const today = todayIso();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-full border border-brand-950/10 bg-white p-0.5">
        <button
          type="button"
          onClick={() => onDateChange(shiftDate(date, -1))}
          aria-label="Día anterior"
          className="flex h-7 w-7 items-center justify-center rounded-full text-brand-950/60 hover:bg-brand-950/[0.06]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[7.5rem] px-1 text-center text-xs font-semibold text-brand-950">{humanDate(date)}</span>
        <button
          type="button"
          onClick={() => onDateChange(shiftDate(date, 1))}
          aria-label="Día siguiente"
          className="flex h-7 w-7 items-center justify-center rounded-full text-brand-950/60 hover:bg-brand-950/[0.06]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {date !== today && (
        <button
          type="button"
          onClick={() => onDateChange(today)}
          className="flex items-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-600"
        >
          <CalendarDays className="h-3.5 w-3.5" /> Hoy
        </button>
      )}

      <select
        value={mealServiceId}
        onChange={(e) => onMealServiceChange(e.target.value)}
        className="rounded-full border border-brand-950/10 bg-white px-3 py-1.5 text-xs font-semibold text-brand-950"
      >
        <option value="all">Todo el día</option>
        {MEAL_SERVICES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>

      {canCreateReservation && (
        <TextureButton
          variant="brand"
          size="sm"
          className="!w-auto ml-auto flex items-center gap-1.5"
          onClick={onNewReservation}
        >
          <Plus className="h-3.5 w-3.5" /> Nueva reserva
        </TextureButton>
      )}
    </div>
  );
}
