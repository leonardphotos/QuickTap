import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { card } from '../clubStyle';
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

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onOpen({ kind: 'activeStudents' })}
          className={`${card} p-4 text-left transition-colors hover:border-brand-400`}
        >
          <p className="text-[22px] font-bold leading-tight text-brand-950">{data.activeStudents}</p>
          <p className="text-[13px] font-semibold text-brand-950/70">Alumnos activos</p>
          <p className="text-[11px] font-light text-brand-950/40">{data.activeGroups} grupos</p>
        </button>
        <button
          type="button"
          onClick={() => onOpen({ kind: 'pendingCharges' })}
          className={`${card} p-4 text-left transition-colors hover:border-amber-300`}
        >
          <p className="text-[22px] font-bold leading-tight text-brand-950">
            {formatBase(data.pendingCharges.amountBase, symbol)}
          </p>
          <p className="text-[13px] font-semibold text-brand-950/70">Por cobrar</p>
          <p className="text-[11px] font-light text-brand-950/40">{data.pendingCharges.count} mensualidad(es)</p>
        </button>
      </div>

      {data.needsCourt > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            {data.needsCourt} clase(s) sin cancha
          </p>
          <p className="mt-1 text-sm font-light text-amber-900/80">
            Esas fechas chocaban con una reserva ya hecha. Reubícalas desde Grupos para que ocupen pista.
          </p>
        </div>
      )}

      <div className={`${card} p-5`}>
        <p className="text-sm font-bold text-brand-950">Clases de hoy</p>
        {data.todaySessions.length === 0 ? (
          <p className="py-6 text-center text-sm font-light text-brand-950/40">Hoy no hay clases programadas.</p>
        ) : (
          <ul className="mt-3 divide-y divide-brand-950/[0.06]">
            {data.todaySessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <button
                  type="button"
                  onClick={() => onOpen({ kind: 'session', id: s.id })}
                  className="-mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1 text-left transition-colors hover:bg-brand-950/[0.03]"
                >
                <span className="w-14 shrink-0 text-sm font-bold text-brand-950">{hhmm(s.startsAt)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-brand-950">
                    {s.group?.name ?? 'Clase suelta'}
                  </span>
                  <span className="block text-xs font-light text-brand-950/50">
                    {s.coach.displayName}
                    {s.court && ` · ${s.court.name}`} · {SESSION_STATUS_LABELS[s.status]}
                  </span>
                </span>
                </button>
                <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setRosterFor(s)}>
                  Pasar lista
                </TextureButton>
              </li>
            ))}
          </ul>
        )}
      </div>

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
