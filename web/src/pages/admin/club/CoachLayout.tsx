import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Check, Clock, LogOut, Wallet, X } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { card } from './clubStyle';
import { WEEKDAYS } from './academia/academyApi';

const INPUT =
  'w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40';

interface Session {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  occupiedSeats: number;
  capacityMax: number;
  group: { id: string; name: string } | null;
  court: { id: string; name: string } | null;
}

interface RosterEntry {
  studentId: string;
  name: string;
  level: string | null;
  attendance: { status: string } | null;
}

interface Earnings {
  sessionsCount: number;
  totalBase: string;
  paidBase: string;
  pendingBase: string;
}

type Screen = 'agenda' | 'disponibilidad' | 'honorarios';

const TABS: { id: Screen; label: string; icon: typeof CalendarDays }[] = [
  { id: 'agenda', label: 'Mi agenda', icon: CalendarDays },
  { id: 'disponibilidad', label: 'Disponibilidad', icon: Clock },
  { id: 'honorarios', label: 'Honorarios', icon: Wallet },
];

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('es-VE', { weekday: 'long', day: '2-digit', month: 'short' });
}

/**
 * Portal del entrenador (rol COACH).
 *
 * Todo lo que ve sale de `/club/academy/me/*`, que resuelve el profesor desde SU
 * token — nunca de un id en la URL. Por eso no hay ningún selector de profesor
 * acá: no es una omisión de la interfaz, es que el backend no lo aceptaría.
 */
export default function CoachLayout() {
  const { restaurant, logout } = useAuth();
  const [screen, setScreen] = useState<Screen>('agenda');

  if (!restaurant) return null;

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <header className="sticky top-0 z-20 border-b border-brand-950/[0.06] bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-5">
          <p className="truncate font-bold text-brand-950">{restaurant.name}</p>
          <span className="shrink-0 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-500">
            Profesor
          </span>
          <button onClick={logout} className="ml-auto shrink-0 text-[13px] font-medium text-brand-950/50 hover:text-brand-950">
            <LogOut className="inline h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-5 pb-28">
        <div className="-mx-1 mb-5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max items-center gap-1 rounded-full bg-brand-950/[0.05] p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setScreen(t.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                  screen === t.id ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {screen === 'agenda' && <AgendaScreen />}
        {screen === 'disponibilidad' && <AvailabilityScreen />}
        {screen === 'honorarios' && <EarningsScreen symbol={restaurant.currencySymbol ?? '$'} />}
      </main>
    </div>
  );
}

function AgendaScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rosterFor, setRosterFor] = useState<Session | null>(null);

  const load = useCallback(() => {
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    api
      .get<{ data: Session[] }>('/club/academy/me/sessions', { params: { from, to } })
      .then((r) => setSessions(r.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No pudimos cargar tu agenda.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading) return <p className="text-sm font-light text-brand-950/40">Cargando tu agenda…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  const upcoming = sessions.filter((s) => s.status !== 'CANCELLED' && s.status !== 'RELEASED');

  return (
    <div className={`${card} p-5`}>
      <p className="text-sm font-bold text-brand-950">Próximas clases</p>
      <p className="mt-0.5 text-xs font-light text-brand-950/50">Las tuyas de los próximos 14 días.</p>

      {upcoming.length === 0 ? (
        <p className="py-6 text-center text-sm font-light text-brand-950/40">No tienes clases agendadas.</p>
      ) : (
        <ul className="mt-3 divide-y divide-brand-950/[0.06]">
          {upcoming.map((s) => (
            <li key={s.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-brand-950">{s.group?.name ?? 'Clase suelta'}</p>
                  <p className="text-xs font-light text-brand-950/50">
                    {dayLabel(s.startsAt)} · {hhmm(s.startsAt)}
                    {s.court && ` · ${s.court.name}`}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-brand-950/60">
                  {s.occupiedSeats}/{s.capacityMax}
                </span>
              </div>
              <div className="mt-2">
                <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setRosterFor(s)}>
                  Pasar lista
                </TextureButton>
              </div>
            </li>
          ))}
        </ul>
      )}

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

/** Pasar lista. En lote y en una sola petición: en una cancha con mala señal, ocho
 *  llamadas sueltas dejan la lista a medias. */
function RosterDialog({ session, onClose, onSaved }: { session: Session; onClose: () => void; onSaved: () => void }) {
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get(`/club/academy/me/sessions/${session.id}/roster`)
      .then((r) => {
        const rows: RosterEntry[] = r.data.data.roster;
        setRoster(rows);
        setMarks(Object.fromEntries(rows.map((e) => [e.studentId, e.attendance?.status ?? 'PRESENT'])));
      })
      .catch((err) => setError(err.response?.data?.error ?? 'No pudimos cargar la lista.'))
      .finally(() => setLoading(false));
  }, [session.id]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/club/academy/me/sessions/${session.id}/attendance`, {
        entries: roster.map((e) => ({ studentId: e.studentId, status: marks[e.studentId] ?? 'PRESENT' })),
      });
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'No se pudo guardar.');
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
          <p className="text-sm font-light text-brand-950/40">Cargando…</p>
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

function AvailabilityScreen() {
  const [slots, setSlots] = useState<{ weekday: number; startTime: string; endTime: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/club/academy/me/availability')
      .then((r) => setSlots(r.data.data.map((s: { weekday: number; startTime: string; endTime: string }) => s)))
      .catch((err) => setError(err.response?.data?.error ?? 'No pudimos cargar tu disponibilidad.'))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await api.put('/club/academy/me/availability', { slots });
      setSaved(true);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm font-light text-brand-950/40">Cargando…</p>;

  return (
    <div className={`${card} p-5`}>
      <p className="text-sm font-bold text-brand-950">Cuándo puedes dar clase</p>
      <p className="mt-0.5 text-xs font-light text-brand-950/50">
        No bloquea canchas: solo le dice al club a qué grupos y particulares te puede asignar.
      </p>

      <div className="mt-3 space-y-2">
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
            <input
              type="time"
              value={s.endTime}
              onChange={(e) => setSlots((v) => v.map((x, j) => (i === j ? { ...x, endTime: e.target.value } : x)))}
              className={INPUT}
            />
            <button
              type="button"
              onClick={() => setSlots((v) => v.filter((_, j) => j !== i))}
              className="shrink-0 rounded-full px-2 text-brand-950/40 hover:text-red-600"
              aria-label="Quitar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setSlots((v) => [...v, { weekday: 1, startTime: '17:00', endTime: '21:00' }])}
        className="mt-2 flex min-h-[34px] items-center rounded-full px-3 text-xs font-medium text-brand-500 hover:text-brand-600"
      >
        + Agregar franja
      </button>

      {slots.length === 0 && (
        <p className="mt-2 text-xs font-light text-brand-950/40">
          Sin franjas cargadas se asume que estás disponible siempre.
        </p>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <TextureButton variant="brand" size="default" disabled={saving} className="mt-3 disabled:opacity-50" onClick={save}>
        {saving ? 'Guardando…' : 'Guardar'}
      </TextureButton>
      {saved && <p className="mt-2 text-sm text-emerald-700">Guardado.</p>}
    </div>
  );
}

function EarningsScreen({ symbol }: { symbol: string }) {
  const [data, setData] = useState<Earnings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/club/academy/me/earnings')
      .then((r) => setData(r.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No pudimos cargar tus honorarios.'));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm font-light text-brand-950/40">Cargando…</p>;

  return (
    <div className={`${card} p-5`}>
      <p className="text-sm font-bold text-brand-950">Tus honorarios</p>
      <p className="mt-0.5 text-xs font-light text-brand-950/50">Últimos 30 días.</p>

      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-[20px] font-bold tracking-tight text-brand-950">{data.sessionsCount}</p>
          <p className="text-[12px] font-light text-brand-950/45">clases dadas</p>
        </div>
        <div>
          <p className="text-[20px] font-bold tracking-tight text-brand-950">{formatBase(data.totalBase, symbol)}</p>
          <p className="text-[12px] font-light text-brand-950/45">generado</p>
        </div>
        <div>
          <p className="text-[20px] font-bold tracking-tight text-amber-600">{formatBase(data.pendingBase, symbol)}</p>
          <p className="text-[12px] font-light text-brand-950/45">por cobrar</p>
        </div>
      </div>

      <p className="mt-3 rounded-xl bg-brand-950/[0.03] p-3 text-xs font-light text-brand-950/60">
        Esto es informativo: quien registra el pago es la administración del club.
      </p>
    </div>
  );
}
