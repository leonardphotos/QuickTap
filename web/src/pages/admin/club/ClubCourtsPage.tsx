import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/hooks/useToast';
import { clubApi, SPORT_LABELS, WEEKDAY_LABELS, type ClubCourt, type ClubSchedule, type ClubSport } from './clubApi';

interface Props {
  restaurant: Pick<AuthRestaurant, 'currencySymbol' | 'exchangeRate'>;
}

export default function ClubCourtsPage({ restaurant }: Props) {
  const [courts, setCourts] = useState<ClubCourt[] | null>(null);
  const [schedules, setSchedules] = useState<ClubSchedule[]>([]);
  const { show, toastMessage } = useToast();

  const load = useCallback(() => {
    Promise.all([clubApi.listCourts(), clubApi.listSchedules()])
      .then(([c, s]) => {
        setCourts(c);
        setSchedules(s);
      })
      .catch(() => show('No se pudo cargar la configuración.'));
  }, [show]);

  useEffect(load, [load]);

  const money = (v: string) => formatBase(Number(v), restaurant.currencySymbol);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[20px] font-bold text-brand-950 tracking-tight">Canchas y horarios</h1>

      <NewCourtForm onSaved={() => { load(); show('Cancha creada.'); }} />

      <section>
        <h2 className="mb-3 text-[15px] font-bold text-brand-950">Tus canchas</h2>
        {courts === null && <p className="text-brand-950/40 font-light">Cargando…</p>}
        {courts?.length === 0 && (
          <p className="rounded-2xl border border-dashed border-brand-950/10 p-5 text-[13px] text-brand-950/40 font-light">
            Todavía no has creado ninguna cancha.
          </p>
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {courts?.filter((c) => c.active).map((court) => (
            <div key={court.id} className="rounded-2xl border border-brand-950/[0.06] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-brand-950 truncate">{court.name}</p>
                  <p className="text-[12px] text-brand-950/45 font-light">
                    {SPORT_LABELS[court.sport]}
                    {court.indoor ? ' · Techada' : ''}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    await clubApi.deleteCourt(court.id);
                    load();
                    show('Cancha desactivada.');
                  }}
                  className="shrink-0 text-brand-950/30 hover:text-rose-600"
                  aria-label="Desactivar cancha"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-[15px] font-bold text-brand-950">Horarios y precios</h2>
        <p className="mb-3 text-[13px] text-brand-950/50 font-light">
          La hora pico no es un modo aparte: es otra franja del mismo día con precio distinto. Una franja
          sin cancha aplica a todas; una con cancha manda sobre la general.
        </p>

        <NewScheduleForm courts={courts ?? []} onSaved={() => { load(); show('Horario creado.'); }} />

        <div className="mt-4 rounded-2xl border border-brand-950/10 divide-y divide-brand-950/[0.06] bg-white overflow-hidden">
          {schedules.length === 0 && (
            <p className="p-5 text-[13px] text-brand-950/40 font-light">Sin horarios configurados.</p>
          )}
          {schedules.map((s) => {
            const court = courts?.find((c) => c.id === s.courtId);
            return (
              <div key={s.id} className="flex items-center gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-brand-950">
                    {WEEKDAY_LABELS[s.weekday]} · {s.startTime}–{s.endTime}
                  </p>
                  <p className="text-[12px] text-brand-950/45 font-light">
                    Turnos de {s.slotMinutes} min · {court ? court.name : 'Todas las canchas'}
                  </p>
                </div>
                {s.isPeak && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    PICO
                  </span>
                )}
                <p className="shrink-0 text-[14px] font-bold text-brand-950">{money(s.priceBase)}</p>
                <button
                  onClick={async () => {
                    await clubApi.deleteSchedule(s.id);
                    load();
                    show('Horario eliminado.');
                  }}
                  className="shrink-0 text-brand-950/30 hover:text-rose-600"
                  aria-label="Eliminar horario"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <Toast message={toastMessage} />
    </div>
  );
}

function NewCourtForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState('');
  const [sport, setSport] = useState<ClubSport>('PADEL');
  const [indoor, setIndoor] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await clubApi.createCourt({ name: name.trim(), sport, indoor });
      setName('');
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-2xl border border-brand-950/[0.06] bg-white p-4 shadow-sm">
      <div className="min-w-[180px] flex-1">
        <label className="mb-1 block text-[13px] font-medium text-brand-950/60">Nombre</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Cancha 1"
          className="w-full rounded-xl border border-brand-950/10 px-3 py-2 text-[14px] outline-none focus:border-brand-400"
        />
      </div>
      <div>
        <label className="mb-1 block text-[13px] font-medium text-brand-950/60">Deporte</label>
        <select
          value={sport}
          onChange={(e) => setSport(e.target.value as ClubSport)}
          className="rounded-xl border border-brand-950/10 px-3 py-2 text-[14px] outline-none focus:border-brand-400"
        >
          {Object.entries(SPORT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 pb-2 text-[13px] font-medium text-brand-950/60">
        <input type="checkbox" checked={indoor} onChange={(e) => setIndoor(e.target.checked)} />
        Techada
      </label>
      <TextureButton type="submit" disabled={saving || !name.trim()} className="!w-auto">
        <Plus className="h-4 w-4" />
        Agregar
      </TextureButton>
    </form>
  );
}

function NewScheduleForm({ courts, onSaved }: { courts: ClubCourt[]; onSaved: () => void }) {
  const [courtId, setCourtId] = useState('');
  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('23:00');
  const [slotMinutes, setSlotMinutes] = useState(90);
  const [priceBase, setPriceBase] = useState('20');
  const [isPeak, setIsPeak] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await clubApi.createSchedule({
        courtId: courtId || null,
        weekday,
        startTime,
        endTime,
        slotMinutes,
        priceBase: Number(priceBase),
        isPeak,
      });
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo crear el horario.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-brand-950/[0.06] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[13px] font-medium text-brand-950/60">Día</label>
          <select
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
            className="rounded-xl border border-brand-950/10 px-3 py-2 text-[14px] outline-none focus:border-brand-400"
          >
            {WEEKDAY_LABELS.map((label, i) => (
              <option key={i} value={i}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-medium text-brand-950/60">Cancha</label>
          <select
            value={courtId}
            onChange={(e) => setCourtId(e.target.value)}
            className="rounded-xl border border-brand-950/10 px-3 py-2 text-[14px] outline-none focus:border-brand-400"
          >
            <option value="">Todas</option>
            {courts.filter((c) => c.active).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-medium text-brand-950/60">Desde</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="rounded-xl border border-brand-950/10 px-3 py-2 text-[14px] outline-none focus:border-brand-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-medium text-brand-950/60">Hasta</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="rounded-xl border border-brand-950/10 px-3 py-2 text-[14px] outline-none focus:border-brand-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-medium text-brand-950/60">Turno</label>
          <select
            value={slotMinutes}
            onChange={(e) => setSlotMinutes(Number(e.target.value))}
            className="rounded-xl border border-brand-950/10 px-3 py-2 text-[14px] outline-none focus:border-brand-400"
          >
            <option value={60}>60 min</option>
            <option value={90}>90 min</option>
            <option value={120}>120 min</option>
          </select>
        </div>
        <div className="w-24">
          <label className="mb-1 block text-[13px] font-medium text-brand-950/60">Precio</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={priceBase}
            onChange={(e) => setPriceBase(e.target.value)}
            required
            className="w-full rounded-xl border border-brand-950/10 px-3 py-2 text-[14px] outline-none focus:border-brand-400"
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-[13px] font-medium text-brand-950/60">
          <input type="checkbox" checked={isPeak} onChange={(e) => setIsPeak(e.target.checked)} />
          Hora pico
        </label>
        <TextureButton type="submit" disabled={saving} className="!w-auto">
          <Plus className="h-4 w-4" />
          Agregar
        </TextureButton>
      </div>
      {error && <p className="mt-2 text-[13px] font-medium text-rose-600">{error}</p>}
    </form>
  );
}
