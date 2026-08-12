import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Pause, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Cell,
  ClubBadge,
  ClubEyebrow,
  ClubPanel,
  ClubRow,
  ClubTable,
  PlainCell,
  SubCell,
  type ClubColumn,
} from '../ClubTable';
import { academyApi, LEVELS, WEEKDAYS, WEEKDAY_SHORT, type ClassGroup, type Coach, type Program } from './academyApi';
import { levelRangeLabel } from '@/utils/padelLevel';
import type { DetailTarget } from './AcademyDetails';

/** Botón de acción de una fila. En horizontal es solo el icono, para no comerle
 *  ancho a los datos; en vertical, donde sobra sitio, lleva el texto al lado —un
 *  icono suelto de "pausa" no dice a qué. */
function IconAction({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium text-brand-950/45 transition-colors lg:w-8 lg:justify-center lg:px-0 ${
        danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-brand-950/[0.06] hover:text-brand-950'
      }`}
    >
      {children}
      <span className="lg:hidden">{label}</span>
    </button>
  );
}

const GROUP_STATUS: Record<ClassGroup['status'], { label: string; tone: 'neutral' | 'brand' | 'amber' }> = {
  DRAFT: { label: 'Borrador', tone: 'neutral' },
  ACTIVE: { label: 'Activo', tone: 'brand' },
  PAUSED: { label: 'Pausado', tone: 'amber' },
  ENDED: { label: 'Terminado', tone: 'neutral' },
};

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
  onOpen,
}: {
  restaurant: Pick<AuthRestaurant, 'currencySymbol'>;
  isAdmin: boolean;
  onOpen: (t: DetailTarget) => void;
}) {
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
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
      academyApi.listPrograms(),
    ])
      .then(([g, c, co, ct, pr]) => {
        setGroups(g);
        setConflicts(c as Conflict[]);
        setCoaches(co);
        setCourts(ct);
        setPrograms(pr.filter((x) => x.active));
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

  // La columna de acciones solo existe para quien puede usarla: a recepción le
  // sobraría una columna vacía ocupando ancho de lectura.
  const cols: ClubColumn[] = [
    { key: 'grupo', label: 'Grupo', width: 'minmax(0,1.3fr)' },
    // 186px es lo que mide "Principiante a Intermedio", el rango más largo.
    { key: 'nivel', label: 'Nivel', width: '186px' },
    { key: 'profesor', label: 'Profesor', width: 'minmax(0,1fr)' },
    { key: 'horarios', label: 'Horarios', width: 'minmax(0,1.2fr)' },
    { key: 'inscritos', label: 'Inscritos', width: '96px' },
    { key: 'precio', label: 'Mensualidad', width: '116px', align: 'right' },
    ...(isAdmin ? ([{ key: 'acciones', label: '', width: '130px', align: 'right' }] as ClubColumn[]) : []),
  ];

  return (
    <div className="flex flex-col gap-3.5">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      {conflicts.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 lg:p-4">
          <p className="flex items-center gap-1.5 text-[13px] font-bold text-amber-900">
            <AlertTriangle className="h-3.5 w-3.5" />
            {conflicts.length} clase(s) sin cancha
          </p>
          <p className="mt-1 text-[12px] font-light leading-relaxed text-amber-900/80">
            Esas fechas ya tenían una reserva encima. Cámbialas de cancha u hora, o cancélalas.
          </p>
          <ul className="mt-2.5 grid gap-1 sm:grid-cols-2">
            {conflicts.slice(0, 8).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onOpen({ kind: 'session', id: c.id })}
                  className="w-full truncate rounded-lg px-2 py-1 text-left text-[12px] text-amber-900 transition-colors hover:bg-amber-100"
                >
                  {new Date(c.startsAt).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })} ·{' '}
                  {c.group?.name ?? 'Clase suelta'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ClubEyebrow>Grupos de la academia</ClubEyebrow>
      <ClubPanel
        title="Grupos"
        description="Cada grupo ocupa cancha real: lo que se agenda acá desaparece del alquiler libre."
        action={
          isAdmin && (
            <TextureButton variant="brand" size="sm" className="!w-auto" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-3 w-3" />
              Nuevo grupo
            </TextureButton>
          )
        }
      >
        <ClubTable columns={cols} rows={groups.length} empty="Todavía no hay grupos de academia.">
          {groups.map((g) => (
            <ClubRow
              key={g.id}
              label={`Ver ${g.name}`}
              muted={g.status === 'ENDED'}
              onClick={() => onOpen({ kind: 'group', id: g.id })}
              cells={[
                <>
                  <Cell>
                    <span className="flex items-center gap-2">
                      {g.program && (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: g.program.color ?? '#94a3b8' }}
                          title={g.program.name}
                        />
                      )}
                      <span className="truncate">{g.name}</span>
                    </span>
                  </Cell>
                  <SubCell>{g.program?.name ?? 'Sin programa'}</SubCell>
                </>,
                <>
                  <PlainCell>{levelRangeLabel(g.levelMin, g.levelMax)}</PlainCell>
                  <SubCell className="tabular-nums">
                    {Number(g.levelMin).toFixed(1)}–{Number(g.levelMax).toFixed(1)}
                  </SubCell>
                </>,
                <>
                  <PlainCell>{g.coach.displayName}</PlainCell>
                  <SubCell>
                    <ClubBadge tone={GROUP_STATUS[g.status].tone}>{GROUP_STATUS[g.status].label}</ClubBadge>
                  </SubCell>
                </>,
                <>
                  <PlainCell>{g.slots.map((s) => `${WEEKDAY_SHORT[s.weekday]} ${s.startTime}`).join(' · ') || '—'}</PlainCell>
                  <SubCell>{g._count.sessions} clases agendadas</SubCell>
                </>,
                <PlainCell key="i" className="tabular-nums">
                  {g._count.enrollments}/{g.capacityMax}
                </PlainCell>,
                <Cell key="p" className="tabular-nums">
                  {g.priceMonthlyBase ? formatBase(g.priceMonthlyBase, symbol) : '—'}
                </Cell>,
                ...(isAdmin
                  ? [
                      // Solo iconos: tres botones con texto le comían a la fila el
                      // ancho que necesitan los horarios, que es lo que se lee.
                      <span key="a" className="flex flex-wrap items-center gap-1 lg:flex-nowrap lg:justify-end">
                        <IconAction label="Agendar más semanas" onClick={() => extend(g.id)}>
                          <RefreshCw className="h-3.5 w-3.5" />
                        </IconAction>
                        <IconAction
                          label={g.status === 'ACTIVE' ? 'Pausar grupo' : 'Reactivar grupo'}
                          onClick={async () => {
                            await academyApi.updateGroup(g.id, { status: g.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' });
                            load();
                          }}
                        >
                          {g.status === 'ACTIVE' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        </IconAction>
                        <IconAction
                          label="Terminar grupo"
                          danger
                          onClick={async () => {
                            await academyApi.updateGroup(g.id, { status: 'ENDED' });
                            load();
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconAction>
                      </span>,
                    ]
                  : []),
              ]}
            />
          ))}
        </ClubTable>
      </ClubPanel>

      {creating && (
        <GroupDialog
          coaches={coaches}
          courts={courts}
          programs={programs}
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
  programs,
  symbol,
  onClose,
  onSaved,
}: {
  coaches: Coach[];
  courts: Court[];
  programs: Program[];
  symbol: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const [coachId, setCoachId] = useState(coaches[0]?.id ?? '');
  const [programId, setProgramId] = useState('');
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
        programId: programId || null,
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

          <Field label="Programa">
            <select value={programId} onChange={(e) => setProgramId(e.target.value)} className={INPUT}>
              <option value="">Sin programa</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
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
