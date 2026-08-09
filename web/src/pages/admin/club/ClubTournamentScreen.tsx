import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Flag, Plus, Timer, Trophy, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  clubTournamentApi,
  FORMAT_HINTS,
  FORMAT_LABELS,
  type Tournament,
  type TournamentFormat,
  type TournamentMatch,
  type TournamentScoring,
} from './clubTournamentApi';

interface Props {
  /** Canchas del club, para elegir en cuáles se juega. */
  courtNames: string[];
  onExit: () => void;
}

/**
 * Torneo social (Americano / Mexicano) corrido desde la tablet.
 *
 * Tres cosas y nada más, que es lo que se necesita con gente esperando en la
 * pista: los cruces de la ronda, dónde juega cada uno, y la tabla en vivo. Los
 * cruces los arma el servidor (ver club-tournament.pairing.ts) — acá solo se
 * cargan los resultados.
 */
export default function ClubTournamentScreen({ courtNames, onExit }: Props) {
  const [tournament, setTournament] = useState<Tournament | null | undefined>(undefined);
  const [tab, setTab] = useState<'ronda' | 'tabla'>('ronda');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    clubTournamentApi
      .active()
      .then(setTournament)
      .catch(() => setTournament(null));
  }, []);

  useEffect(load, [load]);

  async function act<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  }

  if (tournament === undefined) {
    return <Shell onExit={onExit} title="Torneo"><p className="font-light text-brand-950/40">Cargando…</p></Shell>;
  }

  if (tournament === null) {
    return (
      <Shell onExit={onExit} title="Torneo">
        <NewTournamentForm
          courtNames={courtNames}
          busy={busy}
          error={error}
          onCreate={(body) => act(async () => setTournament(await clubTournamentApi.create(body)))}
        />
      </Shell>
    );
  }

  const nameOf = (id: string) => tournament.players.find((p) => p.id === id)?.name ?? '—';

  return (
    <Shell onExit={onExit} title={tournament.name}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-brand-950 px-3.5 py-1.5 text-[13px] font-bold text-white">
          Ronda {tournament.currentRound}
        </span>
        <span className="text-[13px] font-light text-brand-950/55">
          {FORMAT_LABELS[tournament.format]} ·{' '}
          {tournament.scoring === 'POINTS'
            ? `a ${tournament.pointsPerMatch} puntos`
            : `${tournament.minutesPerRound} min por ronda`}
        </span>

        <div className="ml-auto flex gap-1 rounded-full bg-brand-950/[0.05] p-1">
          <Tab active={tab === 'ronda'} onClick={() => setTab('ronda')} label="Ronda" />
          <Tab active={tab === 'tabla'} onClick={() => setTab('tabla')} label="Tabla" />
        </div>
      </div>

      {error && <p className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

      {tab === 'ronda' ? (
        <>
          {tournament.scoring === 'TIME' && <RoundTimer minutes={tournament.minutesPerRound} round={tournament.currentRound} />}

          <div className="grid gap-3 md:grid-cols-2">
            {tournament.currentMatches.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                nameOf={nameOf}
                scoring={tournament.scoring}
                pointsPerMatch={tournament.pointsPerMatch}
                busy={busy}
                onSave={(a, b) => act(async () => setTournament(await clubTournamentApi.recordScore(m.id, a, b)))}
              />
            ))}
          </div>

          {tournament.resting.length > 0 && (
            <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-900">
              Descansan esta ronda: {tournament.resting.map((p) => p.name).join(', ')}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={() => act(async () => setTournament(await clubTournamentApi.nextRound(tournament.id)))}
              disabled={busy || !tournament.roundComplete}
              className="flex items-center gap-2 rounded-2xl bg-brand-950 px-6 py-3.5 text-base font-bold text-white transition-colors disabled:bg-brand-950/20"
            >
              <Plus className="h-5 w-5" /> Siguiente ronda
            </button>
            <button
              onClick={() => act(async () => setTournament(await clubTournamentApi.finish(tournament.id)))}
              disabled={busy}
              className="flex items-center gap-2 rounded-2xl border border-brand-950/15 px-5 py-3.5 text-base font-semibold text-brand-950/70 disabled:opacity-40"
            >
              <Flag className="h-5 w-5" /> Terminar torneo
            </button>
          </div>
          {!tournament.roundComplete && (
            <p className="mt-2 text-[13px] font-light text-brand-950/45">
              Carga el resultado de todos los partidos para pasar a la siguiente ronda.
            </p>
          )}
        </>
      ) : (
        <StandingsTable tournament={tournament} />
      )}
    </Shell>
  );
}

function Shell({ title, onExit, children }: { title: string; onExit: () => void; children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-[#fafafa]">
      <header className="flex shrink-0 items-center gap-3 border-b border-brand-950/[0.07] bg-white px-6 py-4">
        <button
          onClick={onExit}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-950/[0.05] transition-colors hover:bg-brand-950/[0.08]"
          aria-label="Volver"
        >
          <ArrowLeft className="h-5 w-5 text-brand-950" />
        </button>
        <Trophy className="h-5 w-5 text-brand-500" />
        <p className="truncate text-xl font-bold text-brand-950">{title}</p>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}

function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors',
        active ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50',
      )}
    >
      {label}
    </button>
  );
}

/** Cronómetro de la ronda. Vive en el cliente a propósito: se arranca cuando la
 * gente entra a la pista, no cuando el servidor generó los cruces. */
function RoundTimer({ minutes, round }: { minutes: number; round: number }) {
  const [left, setLeft] = useState(minutes * 60);
  const [running, setRunning] = useState(false);

  // Cada ronda nueva reinicia el reloj.
  useEffect(() => {
    setLeft(minutes * 60);
    setRunning(false);
  }, [round, minutes]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [running]);

  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const over = left === 0;

  return (
    <div
      className={cn(
        'mb-4 flex items-center gap-4 rounded-2xl px-5 py-4',
        over ? 'bg-red-600 text-white' : 'bg-brand-950 text-white',
      )}
    >
      <Timer className="h-6 w-6 shrink-0" />
      <p className="text-4xl font-bold tabular-nums tracking-tight">
        {mm}:{ss}
      </p>
      <p className="text-sm font-light text-white/70">{over ? '¡Se acabó la ronda!' : 'de esta ronda'}</p>
      <div className="ml-auto flex gap-2">
        <button
          onClick={() => setRunning((v) => !v)}
          className="rounded-full bg-white/20 px-5 py-2 text-sm font-semibold transition-colors hover:bg-white/30"
        >
          {running ? 'Pausar' : 'Empezar'}
        </button>
        <button
          onClick={() => {
            setLeft(minutes * 60);
            setRunning(false);
          }}
          className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/20"
        >
          Reiniciar
        </button>
      </div>
    </div>
  );
}

function MatchCard({
  match,
  nameOf,
  scoring,
  pointsPerMatch,
  busy,
  onSave,
}: {
  match: TournamentMatch;
  nameOf: (id: string) => string;
  scoring: TournamentScoring;
  pointsPerMatch: number;
  busy: boolean;
  onSave: (a: number, b: number) => void;
}) {
  const saved = match.scoreA != null && match.scoreB != null;
  const [a, setA] = useState(match.scoreA?.toString() ?? '');
  const [b, setB] = useState(match.scoreB?.toString() ?? '');

  useEffect(() => {
    setA(match.scoreA?.toString() ?? '');
    setB(match.scoreB?.toString() ?? '');
  }, [match.scoreA, match.scoreB]);

  // A puntos, el marcador de un equipo determina el del otro: con escribir uno alcanza.
  function setSideA(v: string) {
    setA(v);
    if (scoring === 'POINTS' && v !== '') {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0 && n <= pointsPerMatch) setB(String(pointsPerMatch - n));
    }
  }
  function setSideB(v: string) {
    setB(v);
    if (scoring === 'POINTS' && v !== '') {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0 && n <= pointsPerMatch) setA(String(pointsPerMatch - n));
    }
  }

  const valid = a !== '' && b !== '' && Number(a) >= 0 && Number(b) >= 0;

  return (
    <div
      className={cn(
        'rounded-2xl border bg-white p-4 shadow-sm',
        saved ? 'border-emerald-300' : 'border-brand-950/[0.07]',
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] font-bold uppercase tracking-wide text-brand-500">{match.courtName}</p>
        {saved && (
          <span className="flex items-center gap-1 text-[12px] font-semibold text-emerald-600">
            <Check className="h-3.5 w-3.5" /> Cargado
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-brand-950">{nameOf(match.teamA[0])}</p>
          <p className="truncate text-[15px] font-bold text-brand-950">{nameOf(match.teamA[1])}</p>
        </div>
        <input
          value={a}
          onChange={(e) => setSideA(e.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          placeholder="—"
          className="w-16 rounded-xl border border-brand-950/15 py-2.5 text-center text-2xl font-bold text-brand-950 outline-none focus:border-brand-500"
        />
        <span className="text-lg font-light text-brand-950/30">vs</span>
        <input
          value={b}
          onChange={(e) => setSideB(e.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          placeholder="—"
          className="w-16 rounded-xl border border-brand-950/15 py-2.5 text-center text-2xl font-bold text-brand-950 outline-none focus:border-brand-500"
        />
        <div className="min-w-0 flex-1 text-right">
          <p className="truncate text-[15px] font-bold text-brand-950">{nameOf(match.teamB[0])}</p>
          <p className="truncate text-[15px] font-bold text-brand-950">{nameOf(match.teamB[1])}</p>
        </div>
      </div>

      <button
        onClick={() => onSave(Number(a), Number(b))}
        disabled={busy || !valid}
        className="mt-3 w-full rounded-xl bg-brand-950 py-2.5 text-sm font-bold text-white transition-colors disabled:bg-brand-950/15"
      >
        {saved ? 'Corregir resultado' : 'Guardar resultado'}
      </button>
    </div>
  );
}

function StandingsTable({ tournament }: { tournament: Tournament }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-brand-950/[0.07] bg-white">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-brand-950/[0.07] text-[11px] font-bold uppercase tracking-wide text-brand-950/45">
            <th className="px-4 py-3">#</th>
            <th className="px-2 py-3">Jugador</th>
            <th className="px-2 py-3 text-right">PJ</th>
            <th className="px-2 py-3 text-right">Dif</th>
            <th className="px-4 py-3 text-right">Puntos</th>
          </tr>
        </thead>
        <tbody>
          {tournament.standings.map((s, i) => (
            <tr
              key={s.playerId}
              className={cn('border-b border-brand-950/[0.04] last:border-0', i < 3 && 'bg-brand-500/[0.04]')}
            >
              <td className="px-4 py-3 text-[15px] font-bold text-brand-950/50">{i + 1}</td>
              <td className="px-2 py-3 text-[15px] font-semibold text-brand-950">{s.name}</td>
              <td className="px-2 py-3 text-right text-[14px] font-light text-brand-950/55">{s.matchesPlayed}</td>
              <td className="px-2 py-3 text-right text-[14px] font-light text-brand-950/55">
                {s.diff > 0 ? `+${s.diff}` : s.diff}
              </td>
              <td className="px-4 py-3 text-right text-[19px] font-bold text-brand-950">{s.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const inputClass =
  'mt-1 w-full rounded-xl border border-brand-950/15 px-3 py-2.5 text-[15px] outline-none focus:border-brand-500';

function NewTournamentForm({
  courtNames,
  busy,
  error,
  onCreate,
}: {
  courtNames: string[];
  busy: boolean;
  error: string | null;
  onCreate: (body: {
    name: string;
    format: TournamentFormat;
    scoring: TournamentScoring;
    pointsPerMatch: number;
    minutesPerRound: number;
    players: string[];
    courtNames: string[];
  }) => void;
}) {
  const [name, setName] = useState('Americano del sábado');
  const [format, setFormat] = useState<TournamentFormat>('AMERICANO');
  const [scoring, setScoring] = useState<TournamentScoring>('POINTS');
  const [pointsPerMatch, setPointsPerMatch] = useState(24);
  const [minutesPerRound, setMinutesPerRound] = useState(15);
  const [players, setPlayers] = useState<string[]>(['', '', '', '']);
  const [courts, setCourts] = useState<string[]>(courtNames.slice(0, 1));

  const clean = useMemo(() => players.map((p) => p.trim()).filter(Boolean), [players]);
  const enough = clean.length >= 4 && clean.length >= courts.length * 4 && courts.length > 0;

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <label className="block text-sm">
          <span className="font-medium text-brand-950/70">Nombre del torneo</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-brand-950/70">Formato</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(['AMERICANO', 'MEXICANO'] as TournamentFormat[]).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={cn(
                'rounded-2xl border p-4 text-left transition-colors',
                format === f ? 'border-brand-500 bg-brand-500/[0.06]' : 'border-brand-950/[0.1] bg-white',
              )}
            >
              <p className="text-[15px] font-bold text-brand-950">{FORMAT_LABELS[f]}</p>
              <p className="mt-0.5 text-[13px] font-light text-brand-950/55">{FORMAT_HINTS[f]}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-brand-950/70">¿Cómo termina cada partido?</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setScoring('POINTS')}
            className={cn(
              'rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors',
              scoring === 'POINTS' ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.05] text-brand-950/60',
            )}
          >
            A puntos
          </button>
          <button
            onClick={() => setScoring('TIME')}
            className={cn(
              'rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors',
              scoring === 'TIME' ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.05] text-brand-950/60',
            )}
          >
            Por tiempo
          </button>
          {scoring === 'POINTS' ? (
            <label className="flex items-center gap-2 text-sm text-brand-950/70">
              se reparten
              <input
                type="number"
                min={4}
                max={100}
                value={pointsPerMatch}
                onChange={(e) => setPointsPerMatch(Number(e.target.value))}
                className="w-20 rounded-xl border border-brand-950/15 px-3 py-2 text-center outline-none focus:border-brand-500"
              />
              puntos
            </label>
          ) : (
            <label className="flex items-center gap-2 text-sm text-brand-950/70">
              cada ronda dura
              <input
                type="number"
                min={3}
                max={90}
                value={minutesPerRound}
                onChange={(e) => setMinutesPerRound(Number(e.target.value))}
                className="w-20 rounded-xl border border-brand-950/15 px-3 py-2 text-center outline-none focus:border-brand-500"
              />
              min
            </label>
          )}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-brand-950/70">Canchas donde se juega</p>
        <div className="flex flex-wrap gap-2">
          {courtNames.map((c) => {
            const on = courts.includes(c);
            return (
              <button
                key={c}
                onClick={() => setCourts((prev) => (on ? prev.filter((x) => x !== c) : [...prev, c]))}
                className={cn(
                  'rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors',
                  on ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.05] text-brand-950/60',
                )}
              >
                {c}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[13px] font-light text-brand-950/45">
          Se juegan {courts.length} {courts.length === 1 ? 'partido' : 'partidos'} por ronda: hacen falta al menos{' '}
          {courts.length * 4} jugadores.
        </p>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-sm font-medium text-brand-950/70">Jugadores ({clean.length})</p>
          <button
            onClick={() => setPlayers((p) => [...p, '', '', '', ''])}
            className="flex items-center gap-1.5 rounded-full bg-brand-950/[0.05] px-3.5 py-1.5 text-[13px] font-semibold text-brand-950"
          >
            <Plus className="h-3.5 w-3.5" /> 4 más
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {players.map((p, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                value={p}
                onChange={(e) => setPlayers((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                placeholder={`Jugador ${i + 1}`}
                className="min-w-0 flex-1 rounded-xl border border-brand-950/15 px-3 py-2.5 text-[15px] outline-none focus:border-brand-500"
              />
              {players.length > 4 && (
                <button
                  onClick={() => setPlayers((prev) => prev.filter((_, j) => j !== i))}
                  className="shrink-0 rounded-lg p-2 text-brand-950/30 hover:text-red-600"
                  aria-label={`Quitar jugador ${i + 1}`}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

      <button
        onClick={() =>
          onCreate({ name: name.trim(), format, scoring, pointsPerMatch, minutesPerRound, players: clean, courtNames: courts })
        }
        disabled={busy || !enough || !name.trim()}
        className="flex items-center gap-2 rounded-2xl bg-brand-950 px-7 py-4 text-base font-bold text-white transition-colors disabled:bg-brand-950/20"
      >
        <Trophy className="h-5 w-5" /> {busy ? 'Armando cruces…' : 'Empezar torneo'}
      </button>
      {!enough && (
        <p className="text-[13px] font-light text-brand-950/45">
          Faltan jugadores o canchas: hacen falta al menos {Math.max(4, courts.length * 4)} jugadores para{' '}
          {courts.length} {courts.length === 1 ? 'cancha' : 'canchas'}.
        </p>
      )}
    </div>
  );
}
