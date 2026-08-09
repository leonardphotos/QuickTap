import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/hooks/useToast';
import { clubApi, COURT_TYPE_LABELS, WEEKDAY_LABELS, type ClubCourt, type ClubCourtType, type ClubSchedule } from './clubApi';

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
            <CourtCard
              key={court.id}
              court={court}
              onSaved={() => { load(); show('Cancha actualizada.'); }}
              onRemoved={() => { load(); show('Cancha desactivada.'); }}
            />
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

/** Tarjeta de una cancha, editable en el sitio: renombrar y cambiar el tipo son
 * las dos cosas que de verdad cambian con el tiempo (se le pone techo a una
 * cancha, se renumeran). Sin `window.confirm`: en la tablet/PWA no siempre
 * aparece, así que la baja se confirma dentro de la misma tarjeta. */
function CourtCard({ court, onSaved, onRemoved }: { court: ClubCourt; onSaved: () => void; onRemoved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(court.name);
  const [courtType, setCourtType] = useState<ClubCourtType>(court.courtType);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await clubApi.updateCourt(court.id, { name: name.trim(), courtType });
      setEditing(false);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-brand-950/[0.06] bg-white p-4 shadow-sm">
      {editing ? (
        <div className="space-y-2.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-brand-950/10 px-3 py-2 text-[14px] outline-none focus:border-brand-400"
          />
          <CourtTypePicker value={courtType} onChange={setCourtType} />
          <div className="flex gap-2">
            <TextureButton onClick={save} disabled={busy || !name.trim()} className="!w-auto">
              Guardar
            </TextureButton>
            <TextureButton variant="minimal" onClick={() => setEditing(false)} className="!w-auto">
              Cancelar
            </TextureButton>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-bold text-brand-950">{court.name}</p>
            <p className="text-[12px] font-light text-brand-950/45">{COURT_TYPE_LABELS[court.courtType]}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg p-1.5 text-brand-950/30 hover:text-brand-950"
              aria-label={`Editar ${court.name}`}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => setConfirming(true)}
              className="rounded-lg p-1.5 text-brand-950/30 hover:text-rose-600"
              aria-label={`Desactivar ${court.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {confirming && (
        <div className="mt-3 rounded-xl bg-rose-50 p-3">
          <p className="text-[13px] font-medium text-rose-900">
            ¿Desactivar esta cancha? Deja de aceptar reservas; sus reservas viejas se conservan.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={async () => {
                setBusy(true);
                try {
                  await clubApi.deleteCourt(court.id);
                  onRemoved();
                } finally {
                  setBusy(false);
                  setConfirming(false);
                }
              }}
              disabled={busy}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              Sí, desactivar
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-brand-950/60"
            >
              No
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const COURT_TYPE_HINTS: Record<ClubCourtType, string> = {
  LIBRE: 'Al aire libre',
  TECHADA: 'Con techo, laterales abiertos',
  INDOOR: 'Cerrada por completo',
};

/** Tres opciones excluyentes: un grupo de botones se lee mucho mejor que un
 * select en una tablet, que es donde se configura esto casi siempre. */
function CourtTypePicker({ value, onChange }: { value: ClubCourtType; onChange: (v: ClubCourtType) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(COURT_TYPE_LABELS) as ClubCourtType[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          title={COURT_TYPE_HINTS[t]}
          className={
            value === t
              ? 'rounded-xl bg-brand-950 px-3.5 py-2 text-[13px] font-semibold text-white'
              : 'rounded-xl bg-brand-950/[0.05] px-3.5 py-2 text-[13px] font-medium text-brand-950/60 hover:bg-brand-950/[0.08]'
          }
        >
          {COURT_TYPE_LABELS[t]}
        </button>
      ))}
    </div>
  );
}

/** Sin selector de deporte: este vertical es exclusivo de canchas de pádel, así
 * que el sport queda fijo en 'PADEL' — nada que elegir ni que pueda quedar mal
 * configurado. */
function NewCourtForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState('');
  const [courtType, setCourtType] = useState<ClubCourtType>('LIBRE');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await clubApi.createCourt({ name: name.trim(), sport: 'PADEL', courtType });
      setName('');
      setCourtType('LIBRE');
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo crear la cancha.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-brand-950/[0.06] bg-white p-4 shadow-sm">
      <p className="mb-3 text-[15px] font-bold text-brand-950">Agregar cancha de pádel</p>
      <div className="flex flex-wrap items-end gap-3">
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
          <label className="mb-1 block text-[13px] font-medium text-brand-950/60">Tipo</label>
          <CourtTypePicker value={courtType} onChange={setCourtType} />
        </div>
        <TextureButton type="submit" disabled={saving || !name.trim()} className="!w-auto">
          <Plus className="h-4 w-4" />
          Agregar
        </TextureButton>
      </div>
      {error && <p className="mt-2 text-[13px] font-medium text-rose-600">{error}</p>}
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
