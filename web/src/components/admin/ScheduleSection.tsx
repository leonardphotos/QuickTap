import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardHeader, TextureCardTitle, TextureCardContent } from '@/components/ui/texture-card';

interface ScheduleDay {
  dayOfWeek: number;
  isClosed: boolean;
  openTime: string | null;
  closeTime: string | null;
}

// Orden de despliegue lunes→domingo; dayOfWeek sigue Date#getDay() (0=domingo).
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS: Record<number, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
};

function emptyDay(dayOfWeek: number): ScheduleDay {
  return { dayOfWeek, isClosed: false, openTime: '09:00', closeTime: '22:00' };
}

/** Ajustes → Horario: apertura/cierre por día de la semana. Bloquea pedidos (público y staff) fuera de horario. */
export function ScheduleSection() {
  const [days, setDays] = useState<ScheduleDay[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/restaurant/schedule').then((res) => {
      const rows: ScheduleDay[] = res.data.data;
      setDays(rows.map((d) => ({ ...d, openTime: d.openTime ?? '09:00', closeTime: d.closeTime ?? '22:00' })));
    });
  }, []);

  function updateDay(dayOfWeek: number, patch: Partial<ScheduleDay>) {
    setDays((prev) => prev?.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d)) ?? prev);
  }

  async function save() {
    if (!days) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.put('/restaurant/schedule', days);
      setDays(res.data.data);
      setMessage('Horario guardado.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar el horario.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Horario</TextureCardTitle>
        <p className="text-sm text-brand-950/60 font-light">
          Fuera de este horario nadie puede pedir — ni el cliente desde el menú, ni el staff desde el panel.
        </p>
      </TextureCardHeader>
      <TextureCardContent className="space-y-1 divide-y divide-brand-950/[0.06]">
        {days === null ? (
          <p className="text-sm text-brand-950/40 font-light py-3">Cargando…</p>
        ) : (
          DAY_ORDER.map((dayOfWeek) => {
            const day = days.find((d) => d.dayOfWeek === dayOfWeek) ?? emptyDay(dayOfWeek);
            return (
              <div key={dayOfWeek} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3 min-w-[7rem]">
                  <span className="text-sm font-medium text-brand-950">{DAY_LABELS[dayOfWeek]}</span>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-brand-950/60">
                  <input
                    type="checkbox"
                    checked={day.isClosed}
                    onChange={(e) => updateDay(dayOfWeek, { isClosed: e.target.checked })}
                  />
                  Cerrado
                </label>
                {!day.isClosed && (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={day.openTime ?? '09:00'}
                      onChange={(e) => updateDay(dayOfWeek, { openTime: e.target.value })}
                      className="text-sm border border-brand-950/15 rounded-lg px-2 py-1.5"
                    />
                    <span className="text-brand-950/40 text-xs">a</span>
                    <input
                      type="time"
                      value={day.closeTime ?? '22:00'}
                      onChange={(e) => updateDay(dayOfWeek, { closeTime: e.target.value })}
                      className="text-sm border border-brand-950/15 rounded-lg px-2 py-1.5"
                    />
                  </div>
                )}
              </div>
            );
          })
        )}

        {error && <p className="text-sm text-red-600 pt-2">{error}</p>}
        {message && <p className="text-sm text-brand-500 pt-2">{message}</p>}

        <div className="pt-4">
          <TextureButton
            variant="brand"
            size="default"
            disabled={saving || !days}
            onClick={save}
            className="!w-auto disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </TextureButton>
        </div>
      </TextureCardContent>
    </TextureCard>
  );
}
