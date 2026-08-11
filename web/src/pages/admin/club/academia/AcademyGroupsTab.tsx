import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { card } from '../clubStyle';
import { academyApi, LEVELS, WEEKDAYS, WEEKDAY_SHORT, type ClassGroup, type Coach } from './academyApi';

const INPUT =
  'w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40';

interface Conflict {
  id: string;
  startsAt: string;
  group: { id: string; name: string } | null;
  coach: { displayName: string };
}

interface Court {
  id: string;
  name: string;
}

export default function AcademyGroupsTab({
  restaurant,
  isAdmin,
}: {
  restaurant: Pick<AuthRestaurant, 'currencySymbol'>;
  isAdmin: boolean;
}) {
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const symbol = restaurant.currencySymbol ?? '$';

  const load = useCallback(() => {
    Promise.all([
      academyApi.listGroups(),
      academyApi.conflicts(),
      academyApi.listCoaches(),
      api.get<{ data: Court[] }>('/club/courts').then((r) => r.data.data),
    ])
      .then(([g, c, co, ct]) => {
        setGroups(g);
        setConflicts(c as Conflict[]);
        setCoaches(co);
        setCourts(ct);
      })
      .catch(() => setError('No pudimos cargar los grupos.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function extend(id: string) {
    setNotice(null);
    try {
      const r = (await academyApi.generate(id)) as { created: number; conflicts: unknown[] };
      setNotice(`${r.created} clase(s) agendadas${r.conflicts.length ? `, ${r.conflicts.length} sin cancha` : ''}.`);
      load();
    } catch {
      setError('No se pudieron generar las clases.');
    }
  }

  if (loading) return <p className="text-sm font-light text-brand-950/40">Cargando grupos…</p>;

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      {conflicts.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            {conflicts.length} clase(s) sin cancha
          </p>
          <p className="mt-1 text-xs font-light text-amber-900/80">
            Esas fechas ya tenían una reserva encima. Cámbialas de cancha u hora, o cancélalas.
          </p>
          <ul className="mt-2 space-y-1">
            {conflicts.slice(0, 8).map((c) => (
              <li key={c.id} className="text-sm text-amber-900">
                {new Date(c.startsAt).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })} ·{' '}
                {c.group?.name ?? 'Clase suelta'}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-brand-950">Grupos</p>
          {isAdmin && (
            <TextureButton variant="brand" size="default" className="!w-auto" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Nuevo grupo
            </TextureButton>
          )}
        </div>

        {groups.length === 0 ? (
          <p className="py-6 text-center text-sm font-light text-brand-950/40">Todavía no hay grupos de academia.</p>
        ) : (
          <ul className="mt-3 divide-y divide-brand-950/[0.06]">
            {groups.map((g) => (
              <li key={g.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-brand-950">{g.name}</p>
                    <p className="text-xs font-light text-brand-950/50">
                      Nivel {Number(g.levelMin).toFixed(1)}–{Number(g.levelMax).toFixed(1)} · {g.coach.displayName} ·{' '}
                      {g._count.enrollments}/{g.capacityMax} inscritos
                    </p>
                    <p className="mt-0.5 text-xs font-light text-brand-950/40">
                      {g.slots.map((s) => `${WEEKDAY_SHORT[s.weekday]} ${s.startTime}`).join(' · ')}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {g.priceMonthlyBase && (
                      <p className="text-sm font-bold text-brand-950">{formatBase(g.priceMonthlyBase, symbol)}/mes</p>
                    )}
                    <p className="text-[11px] font-light text-brand-950/40">{g._count.sessions} clases agendadas</p>
                  </div>
                </div>
                {isAdmin && (
                  <div className="mt-2 flex items-center gap-2">
                    <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => extend(g.id)}>
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      Agendar más semanas
                    </TextureButton>
                    <button
                      onClick={async () => {
                        await academyApi.updateGroup(g.id, { status: g.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' });
                        load();
                      }}
                      className="flex min-h-[34px] items-center gap-1 rounded-full px-3 text-xs font-medium text-brand-950/45 hover:text-brand-950"
                    >
                      {g.status === 'ACTIVE' ? 'Pausar' : 'Reactivar'}
                    </button>
                    <button
                      onClick={async () => {
                        await academyApi.updateGroup(g.id, { status: 'ENDED' });
                        load();
                      }}
                      className="flex min-h-[34px] items-center gap-1 rounded-full px-3 text-xs font-medium text-brand-950/45 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Terminar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating && (
        <GroupDialog
          coaches={coaches}
          courts={courts}
          symbol={symbol}
          onClose={() => setCreating(false)}
          onSaved={(msg) => {
            setCreating(false);
            setNotice(msg);
            load();
          }}
        />
      )}
    </div>
  );
}

function GroupDialog({
  coaches,
  courts,
  symbol,
  onClose,
  onSaved,
}: {
  coaches: Coach[];
  courts: Court[];
  symbol: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const [coachId, setCoachId] = useState(coaches[0]?.id ?? '');
  const [levelMin, setLevelMin] = useState('2');
  const [levelMax, setLevelMax] = useState('3.5');
  const [capacityMin, setCapacityMin] = useState('2');
  const [capacityMax, setCapacityMax] = useState('4');
  const [priceMonthly, setPriceMonthly] = useState('');
  const [pricePerClass, setPricePerClass] = useState('');
  const [packagePrice, setPackagePrice] = useState('');
  const [packageClasses, setPackageClasses] = useState('');
  const [slots, setSlots] = useState([{ weekday: 1, startTime: '18:00', durationMinutes: 90, courtId: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return setError('Ponle nombre al grupo.');
    if (!coachId) return setError('Elige un profesor.');
    setSaving(true);
    setError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const r = (await academyApi.createGroup({
        name: name.trim(),
        coachId,
        levelMin: Number(levelMin),
        levelMax: Number(levelMax),
        capacityMin: Number(capacityMin),
        capacityMax: Number(capacityMax),
        seasonStart: today,
        priceMonthlyBase: priceMonthly ? Number(priceMonthly) : null,
        pricePerClassBase: pricePerClass ? Number(pricePerClass) : null,
        packagePriceBase: packagePrice ? Number(packagePrice) : null,
        packageClasses: packageClasses ? Number(packageClasses) : null,
        slots: slots.map((s) => ({ ...s, courtId: s.courtId || null })),
      })) as { generation: { created: number; conflicts: unknown[] } };
      const g = r.generation;
      onSaved(
        `Grupo creado con ${g.created} clase(s) agendadas${g.conflicts.length ? `. ${g.conflicts.length} fecha(s) chocaban con reservas y quedaron sin cancha.` : '.'}`,
      );
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'No se pudo crear el grupo.');
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo grupo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Nombre *">
            <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} placeholder="Iniciación adultos" />
          </Field>
          <Field label="Profesor *">
            <select value={coachId} onChange={(e) => setCoachId(e.target.value)} className={INPUT}>
              {coaches.length === 0 && <option value="">Primero crea un profesor</option>}
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Nivel desde">
              <select value={levelMin} onChange={(e) => setLevelMin(e.target.value)} className={INPUT}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l.toFixed(1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nivel hasta">
              <select value={levelMax} onChange={(e) => setLevelMax(e.target.value)} className={INPUT}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l.toFixed(1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cupo mínimo">
              <input type="number" min="1" value={capacityMin} onChange={(e) => setCapacityMin(e.target.value)} className={INPUT} />
            </Field>
            <Field label="Cupo máximo">
              <input type="number" min="1" value={capacityMax} onChange={(e) => setCapacityMax(e.target.value)} className={INPUT} />
            </Field>
          </div>
          <p className="text-xs font-light text-brand-950/40">
            Si al acercarse la clase no se llega al cupo mínimo, se libera sola: la cancha vuelve a alquiler libre y cada
            inscrito recibe una ficha para recuperarla.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <Field label={`Mensualidad (${symbol})`}>
              <input type="number" min="0" step="0.01" value={priceMonthly} onChange={(e) => setPriceMonthly(e.target.value)} className={INPUT} placeholder="0.00" />
            </Field>
            <Field label={`Clase suelta (${symbol})`}>
              <input type="number" min="0" step="0.01" value={pricePerClass} onChange={(e) => setPricePerClass(e.target.value)} className={INPUT} placeholder="0.00" />
            </Field>
            <Field label={`Lote (${symbol})`}>
              <input type="number" min="0" step="0.01" value={packagePrice} onChange={(e) => setPackagePrice(e.target.value)} className={INPUT} placeholder="0.00" />
            </Field>
            <Field label="Clases del lote">
              <input type="number" min="1" value={packageClasses} onChange={(e) => setPackageClasses(e.target.value)} className={INPUT} placeholder="8" />
            </Field>
          </div>

          <div>
            <p className="mb-1 text-[13px] font-medium text-brand-950/70">Horarios</p>
            <div className="space-y-2">
              {slots.map((s, i) => (
                <div key={i} className="flex gap-1.5">
                  <select
                    value={s.weekday}
                    onChange={(e) => setSlots((v) => v.map((x, j) => (i === j ? { ...x, weekday: Number(e.target.value) } : x)))}
                    className={INPUT}
                  >
                    {WEEKDAYS.map((d, wi) => (
                      <option key={wi} value={wi}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={s.startTime}
                    onChange={(e) => setSlots((v) => v.map((x, j) => (i === j ? { ...x, startTime: e.target.value } : x)))}
                    className={INPUT}
                  />
                  <select
                    value={s.courtId}
                    onChange={(e) => setSlots((v) => v.map((x, j) => (i === j ? { ...x, courtId: e.target.value } : x)))}
                    className={INPUT}
                  >
                    <option value="">Cualquier cancha</option>
                    {courts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSlots((v) => [...v, { weekday: 3, startTime: '18:00', durationMinutes: 90, courtId: '' }])}
              className="mt-1.5 flex min-h-[34px] items-center gap-1 rounded-full px-3 text-xs font-medium text-brand-500 hover:text-brand-600"
            >
              <Plus className="h-3.5 w-3.5" />
              Otro día
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <TextureButton variant="brand" size="default" disabled={saving} className="disabled:opacity-50" onClick={submit}>
            {saving ? 'Creando…' : 'Crear grupo'}
          </TextureButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-brand-950/70">{label}</span>
      {children}
    </label>
  );
}
