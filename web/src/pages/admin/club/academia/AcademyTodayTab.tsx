import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Cell,
  ClubBadge,
  ClubEyebrow,
  ClubMetric,
  ClubPanel,
  ClubRow,
  ClubTable,
  PlainCell,
  SubCell,
  type BadgeTone,
  type ClubColumn,
} from '../ClubTable';
import { academyApi, SESSION_STATUS_LABELS, type AcademyDashboard, type ClassSession } from './academyApi';
import type { DetailTarget } from './AcademyDetails';

interface RosterEntry {
  studentId: string;
  name: string;
  phone: string;
  level: string | null;
  billingMode: string;
  attendance: { status: string } | null;
}

/** Color del estado de la clase. Mismo criterio en toda la Academia. */
const SESSION_TONES: Record<ClassSession['status'], BadgeTone> = {
  SCHEDULED: 'neutral',
  NEEDS_COURT: 'amber',
  PENDING_PAYMENT: 'amber',
  CONFIRMED: 'brand',
  DONE: 'emerald',
  CANCELLED: 'red',
  RELEASED: 'sky',
};

const COLS: ClubColumn[] = [
  { key: 'hora', label: 'Hora', width: '88px' },
  { key: 'clase', label: 'Clase', width: 'minmax(0,1.6fr)' },
  { key: 'profesor', label: 'Profesor', width: 'minmax(0,1fr)' },
  { key: 'cancha', label: 'Cancha', width: '140px' },
  { key: 'cupo', label: 'Cupo', width: '92px' },
  { key: 'estado', label: 'Estado', width: '136px' },
  { key: 'accion', label: '', width: '128px', align: 'right' },
];

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Las clases de hoy y el atajo a pasar lista, que es lo que más se usa. */
export default function AcademyTodayTab({
  restaurant,
  onOpen,
}: {
  restaurant: Pick<AuthRestaurant, 'currencySymbol'>;
  onOpen: (t: DetailTarget) => void;
}) {
  const [data, setData] = useState<AcademyDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rosterFor, setRosterFor] = useState<ClassSession | null>(null);
  const symbol = restaurant.currencySymbol ?? '$';

  const load = useCallback(() => {
    academyApi
      .dashboard()
      .then(setData)
      .catch(() => setError('No pudimos cargar la academia.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading) return <p className="text-sm font-light text-brand-950/40">Cargando academia…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return null;

  const owes = data.pendingCharges.count > 0;
  const pending = data.todaySessions.filter((s) => s.status !== 'DONE' && s.status !== 'CANCELLED').length;

  return (
    <div className="flex flex-col gap-4">
      <ClubEyebrow>Resumen</ClubEyebrow>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <ClubMetric
          value={data.activeStudents}
          label="Alumnos activos"
          hint={`${data.activeGroups} grupo(s) en marcha`}
          onClick={() => onOpen({ kind: 'activeStudents' })}
        />
        <ClubMetric
          value={formatBase(data.pendingCharges.amountBase, symbol)}
          label="Por cobrar"
          hint={`${data.pendingCharges.count} mensualidad(es)`}
          tone={owes ? 'amber' : 'default'}
          onClick={() => onOpen({ kind: 'pendingCharges' })}
        />
        <ClubMetric
          value={data.todaySessions.length}
          label="Clases hoy"
          hint={pending === 0 ? 'Todo cerrado' : `${pending} sin dar`}
        />
        <ClubMetric
          value={data.activeGroups}
          label="Grupos activos"
          hint={data.needsCourt > 0 ? `${data.needsCourt} clase(s) sin cancha` : 'Sin conflictos'}
          tone={data.needsCourt > 0 ? 'amber' : 'brand'}
        />
      </div>

      {data.needsCourt > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 lg:p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            {data.needsCourt} clase(s) sin cancha
          </p>
          <p className="mt-1.5 text-[13px] font-light leading-relaxed text-amber-900/80">
            Esas fechas chocaban con una reserva ya hecha. Reubícalas desde Grupos para que ocupen pista.
          </p>
        </div>
      )}

      <ClubEyebrow>Clases de hoy</ClubEyebrow>
      <ClubPanel>
        <ClubTable columns={COLS} rows={data.todaySessions.length} empty="Hoy no hay clases programadas.">
          {data.todaySessions.map((s) => (
            <ClubRow
              key={s.id}
              label={`Ver ${s.group?.name ?? 'la clase'}`}
              onClick={() => onOpen({ kind: 'session', id: s.id })}
              cells={[
                <Cell key="h" className="tabular-nums">
                  {hhmm(s.startsAt)}
                </Cell>,
                <>
                  <Cell>{s.group?.name ?? 'Clase suelta'}</Cell>
                  <SubCell>
                    hasta {hhmm(s.endsAt)}
                  </SubCell>
                </>,
                <PlainCell key="p">{s.coach.displayName}</PlainCell>,
                <PlainCell key="c">{s.court?.name ?? 'Sin asignar'}</PlainCell>,
                <PlainCell key="q" className="tabular-nums">
                  {s.occupiedSeats}/{s.capacityMax}
                </PlainCell>,
                <ClubBadge key="e" tone={SESSION_TONES[s.status]}>
                  {SESSION_STATUS_LABELS[s.status]}
                </ClubBadge>,
                <TextureButton
                  key="a"
                  variant="minimal"
                  size="default"
                  className="!w-auto"
                  onClick={() => setRosterFor(s)}
                >
                  Pasar lista
                </TextureButton>,
              ]}
            />
          ))}
        </ClubTable>
      </ClubPanel>

      {rosterFor && (
        <RosterDialog
          session={rosterFor}
          onClose={() => setRosterFor(null)}
          onSaved={() => {
            setRosterFor(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/**
 * Pasar lista. Un tap por alumno y un solo guardado: el envío es EN LOTE porque
 * en una cancha con mala señal ocho llamadas sueltas dejan la lista a medias y
 * el profesor no sabe cuáles pasaron.
 */
function RosterDialog({
  session,
  onClose,
  onSaved,
}: {
  session: ClassSession;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    academyApi
      .roster(session.id)
      .then((r: { roster: RosterEntry[] }) => {
        setRoster(r.roster);
        setMarks(Object.fromEntries(r.roster.map((e) => [e.studentId, e.attendance?.status ?? 'PRESENT'])));
      })
      .catch(() => setError('No pudimos cargar la lista.'))
      .finally(() => setLoading(false));
  }, [session.id]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await academyApi.markAttendance(
        session.id,
        roster.map((e) => ({ studentId: e.studentId, status: marks[e.studentId] ?? 'PRESENT' })),
      );
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'No se pudo guardar la lista.');
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{session.group?.name ?? 'Clase'}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm font-light text-brand-950/40">Cargando lista…</p>
        ) : roster.length === 0 ? (
          <p className="py-6 text-center text-sm font-light text-brand-950/40">No hay alumnos en esta clase.</p>
        ) : (
          <div className="space-y-2">
            {roster.map((e) => (
              <div key={e.studentId} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-brand-950">{e.name}</span>
                <div className="flex shrink-0 gap-1">
                  {(
                    [
                      ['PRESENT', <Check key="p" className="h-4 w-4" />, 'bg-emerald-500'],
                      ['ABSENT', <X key="a" className="h-4 w-4" />, 'bg-red-500'],
                    ] as const
                  ).map(([status, icon, color]) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setMarks((m) => ({ ...m, [e.studentId]: status }))}
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                        marks[e.studentId] === status ? `${color} text-white` : 'bg-brand-950/[0.05] text-brand-950/40'
                      }`}
                      aria-label={status}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p className="pt-1 text-xs font-light text-brand-950/40">
              Cada asistencia descuenta una ficha del lote del alumno (o imputa su parte de la mensualidad) y calcula el
              honorario del profesor.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <TextureButton
          variant="brand"
          size="default"
          disabled={saving || loading || roster.length === 0}
          className="disabled:opacity-50"
          onClick={save}
        >
          {saving ? 'Guardando…' : 'Guardar lista'}
        </TextureButton>
      </DialogContent>
    </Dialog>
  );
}
