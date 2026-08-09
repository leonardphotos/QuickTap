import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, ChevronRight, Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import ClubBookingSuccess from './ClubBookingSuccess';
import ClubExtrasStep from './ClubExtrasStep';
import ClubDetailsStep from './ClubDetailsStep';
import {
  clubGradient,
  clubPublicApi,
  dateParts,
  hhmmOf,
  humanDate,
  humanMinutes,
  shiftDate,
  todayCaracas,
  type ClubExtra,
  type LiveCourt,
  type PublicAvailability,
  type PublicClub,
  type PublicSlot,
} from './clubPublic';

type Screen = 'home' | 'live' | 'calendar' | 'extras' | 'details' | 'done';

/** Turno elegido, sea desde "Jugar hoy" o desde el calendario. */
interface Pick {
  courtId: string;
  courtName: string;
  date: string;
  slot: PublicSlot;
}

const DAYS_AHEAD = 14;

export default function ClubPublicPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();

  const [club, setClub] = useState<PublicClub | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [screen, setScreen] = useState<Screen>('home');

  const [live, setLive] = useState<LiveCourt[] | null>(null);
  const [openCourtId, setOpenCourtId] = useState<string | null>(null);

  const [date, setDate] = useState(todayCaracas());
  const [grid, setGrid] = useState<PublicAvailability[] | null>(null);

  const [picked, setPicked] = useState<Pick | null>(null);
  const [extras, setExtras] = useState<(ClubExtra & { quantity: number })[]>([]);
  // Llega al reservar y solo se usa al terminar la animación de confirmación.
  const [accessToken, setAccessToken] = useState('');

  useEffect(() => {
    clubPublicApi
      .club(slug)
      .then((d) => setClub(d.club))
      .catch(() => setNotFound(true));
  }, [slug]);

  const loadLive = useCallback(() => {
    clubPublicApi.live(slug).then((d) => setLive(d.courts)).catch(() => setLive([]));
  }, [slug]);

  // El estado en vivo envejece rápido: se refresca solo mientras esa pantalla
  // está abierta, no en toda la sesión.
  useEffect(() => {
    if (screen !== 'live') return;
    loadLive();
    const t = setInterval(loadLive, 30_000);
    return () => clearInterval(t);
  }, [screen, loadLive]);

  const loadGrid = useCallback(() => {
    setGrid(null);
    clubPublicApi.availability(slug, date).then(setGrid).catch(() => setGrid([]));
  }, [slug, date]);

  useEffect(() => {
    if (screen === 'live' || screen === 'calendar') loadGrid();
  }, [screen, loadGrid]);

  const days = useMemo(
    () => Array.from({ length: DAYS_AHEAD }, (_, i) => shiftDate(todayCaracas(), i)),
    [],
  );

  if (notFound) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0d1b2a] px-6">
        <p className="text-center font-light text-white/60">Este club no existe o no está disponible.</p>
      </div>
    );
  }

  const bg = clubGradient(club?.theme ?? null);
  const symbol = club?.currencySymbol ?? '$';

  function choose(courtId: string, courtName: string, d: string, slot: PublicSlot) {
    setPicked({ courtId, courtName, date: d, slot });
    setScreen('extras');
  }

  function back() {
    if (screen === 'details') setScreen('extras');
    else if (screen === 'extras') setScreen(picked?.date === todayCaracas() && openCourtId ? 'live' : 'calendar');
    else setScreen('home');
  }

  return (
    <div className="min-h-screen text-white" style={bg}>
      <div className="mx-auto flex min-h-screen max-w-lg flex-col px-5 pb-10 pt-[calc(1rem+env(safe-area-inset-top))]">
        {screen !== 'home' && screen !== 'done' && (
          <button
            onClick={back}
            className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur-md transition-colors hover:bg-white/25"
            aria-label="Volver"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}

        {screen === 'home' && <Home club={club} onLive={() => setScreen('live')} onBook={() => setScreen('calendar')} />}

        {screen === 'live' && (
          <LiveScreen
            live={live}
            grid={grid}
            openCourtId={openCourtId}
            symbol={symbol}
            onToggle={(id) => setOpenCourtId((prev) => (prev === id ? null : id))}
            onPick={(courtId, courtName, slot) => choose(courtId, courtName, todayCaracas(), slot)}
            onGoCalendar={() => setScreen('calendar')}
          />
        )}

        {screen === 'calendar' && (
          <CalendarScreen
            days={days}
            date={date}
            grid={grid}
            symbol={symbol}
            onDate={setDate}
            onPick={(courtId, courtName, slot) => choose(courtId, courtName, date, slot)}
          />
        )}

        {screen === 'extras' && picked && (
          <ClubExtrasStep
            selected={extras}
            onChange={setExtras}
            onContinue={() => setScreen('details')}
          />
        )}

        {screen === 'details' && picked && (
          <ClubDetailsStep
            slug={slug}
            picked={picked}
            extras={extras}
            symbol={symbol}
            onBooked={() => setScreen('done')}
            onTaken={() => {
              // Alguien ganó la carrera por ese turno: hay que volver a elegir,
              // con la parrilla ya recargada.
              setPicked(null);
              setScreen('calendar');
              loadGrid();
            }}
            onToken={setAccessToken}
          />
        )}

        {screen === 'done' && picked && (
          <ClubBookingSuccess
            courtName={picked.courtName}
            dateLabel={humanDate(picked.date)}
            timeLabel={`${picked.slot.startTime} a ${picked.slot.endTime}`}
            onDone={() => navigate(`/acceso/${accessToken}`)}
          />
        )}
      </div>
    </div>
  );
}

function Home({ club, onLive, onBook }: { club: PublicClub | null; onLive: () => void; onBook: () => void }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
        {club?.logoUrl ? (
          <img
            src={club.logoUrl}
            alt={club.name}
            className="h-28 w-28 rounded-3xl object-cover shadow-2xl ring-1 ring-white/30"
          />
        ) : (
          <div className="flex h-28 w-28 items-center justify-center rounded-3xl bg-white/15 text-5xl shadow-2xl ring-1 ring-white/30 backdrop-blur-md">
            🎾
          </div>
        )}
        <h1 className="mt-7 text-[34px] font-bold leading-tight tracking-tight">{club?.name ?? '…'}</h1>
        <p className="mt-2 max-w-xs text-[15px] font-light text-white/70">
          Mira qué canchas están libres ahora o reserva tu hora.
        </p>
      </div>

      <div className="space-y-3 pb-4">
        <button
          onClick={onLive}
          className="flex w-full items-center gap-4 rounded-3xl border border-white/25 bg-white/15 p-5 text-left backdrop-blur-xl transition-colors hover:bg-white/25"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20">
            <Zap className="h-6 w-6" />
          </span>
          <span className="flex-1">
            <span className="block text-[17px] font-bold">Jugar hoy</span>
            <span className="block text-[13px] font-light text-white/65">Canchas libres y en juego ahora</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-white/60" />
        </button>

        <button
          onClick={onBook}
          className="flex w-full items-center gap-4 rounded-3xl bg-white p-5 text-left text-brand-950 shadow-xl transition-transform active:scale-[0.99]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-950/[0.06]">
            <CalendarDays className="h-6 w-6" />
          </span>
          <span className="flex-1">
            <span className="block text-[17px] font-bold">Reservar</span>
            <span className="block text-[13px] font-light text-brand-950/55">Elige el día y la hora</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-brand-950/40" />
        </button>
      </div>
    </div>
  );
}

function LiveScreen({
  live,
  grid,
  openCourtId,
  symbol,
  onToggle,
  onPick,
  onGoCalendar,
}: {
  live: LiveCourt[] | null;
  grid: PublicAvailability[] | null;
  openCourtId: string | null;
  symbol: string;
  onToggle: (id: string) => void;
  onPick: (courtId: string, courtName: string, slot: PublicSlot) => void;
  onGoCalendar: () => void;
}) {
  return (
    <div className="flex-1">
      <h1 className="text-[26px] font-bold tracking-tight">Ahora en el club</h1>
      <p className="mt-1 text-[13px] font-light text-white/65">Toca una cancha para ver sus horas libres de hoy.</p>

      {live === null && <p className="mt-6 font-light text-white/50">Cargando…</p>}
      {live?.length === 0 && (
        <p className="mt-6 rounded-3xl border border-dashed border-white/25 p-6 text-center text-[13px] font-light text-white/60">
          Este club todavía no tiene canchas publicadas.
        </p>
      )}

      <div className="mt-5 space-y-3">
        {live?.map((c) => {
          const open = openCourtId === c.court.id;
          const free = grid?.find((g) => g.court.id === c.court.id)?.slots.filter((s) => s.available) ?? [];
          return (
            <div
              key={c.court.id}
              className="overflow-hidden rounded-3xl border border-white/25 bg-white/15 backdrop-blur-xl"
            >
              <button onClick={() => onToggle(c.court.id)} className="w-full p-5 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-[16px] font-bold">{c.court.name}</span>
                  {c.court.indoor && <span className="text-[11px] font-medium text-white/50">Techada</span>}
                  <span
                    className={cn(
                      'ml-auto rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide',
                      c.busy ? 'bg-white/20 text-white' : 'bg-emerald-400 text-emerald-950',
                    )}
                  >
                    {c.busy ? (c.current?.kind === 'BOOKING' ? '● En juego' : 'Cerrada') : 'Libre'}
                  </span>
                </div>

                {c.current && c.current.kind === 'BOOKING' && (
                  <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/12 px-4 py-3">
                    <Figure value={humanMinutes(c.current.playedMinutes)} label="jugados" />
                    <div className="text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-white/55">termina</p>
                      <p className="text-[13px] font-bold">{hhmmOf(c.current.endsAt)}</p>
                    </div>
                    <Figure value={humanMinutes(c.current.remainingMinutes)} label="restante" align="right" />
                  </div>
                )}

                {c.current && c.current.kind !== 'BOOKING' && (
                  <p className="mt-3 text-[13px] font-light text-white/70">
                    {c.current.note ?? 'No disponible'} · hasta {hhmmOf(c.current.endsAt)}
                  </p>
                )}

                {/* La pregunta que importa al llegar sin reserva. */}
                <p className="mt-3 flex items-center gap-1.5 text-[12px] font-light text-white/60">
                  <Clock className="h-3.5 w-3.5" />
                  {c.next
                    ? `Después: ${hhmmOf(c.next.startsAt)}${c.next.playerFirstName ? ` · ${c.next.playerFirstName}` : ''}`
                    : c.busy
                      ? 'Libre al terminar esta partida'
                      : 'Sin reservas por delante hoy'}
                </p>
              </button>

              {open && (
                <div className="border-t border-white/15 bg-white/10 p-4">
                  {free.length === 0 ? (
                    <div className="text-center">
                      <p className="text-[13px] font-light text-white/60">No quedan horas libres hoy en esta cancha.</p>
                      <button onClick={onGoCalendar} className="mt-2 text-[13px] font-bold underline">
                        Ver otros días
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {free.map((s) => (
                        <SlotButton key={s.startTime} slot={s} symbol={symbol} onClick={() => onPick(c.court.id, c.court.name, s)} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Figure({ value, label, align }: { value: string; label: string; align?: 'right' }) {
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <p className="text-[22px] font-bold leading-none tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-white/55">{label}</p>
    </div>
  );
}

function CalendarScreen({
  days,
  date,
  grid,
  symbol,
  onDate,
  onPick,
}: {
  days: string[];
  date: string;
  grid: PublicAvailability[] | null;
  symbol: string;
  onDate: (d: string) => void;
  onPick: (courtId: string, courtName: string, slot: PublicSlot) => void;
}) {
  const empty = grid?.every((g) => g.slots.every((s) => !s.available));

  return (
    <div className="flex-1">
      <h1 className="text-[26px] font-bold tracking-tight">Elige tu día</h1>

      {/* Tira de días: mismo patrón que la fila de fechas del diseño de referencia. */}
      <div className="-mx-5 mt-5 flex gap-2 overflow-x-auto px-5 pb-2">
        {days.map((d) => {
          const p = dateParts(d);
          const active = d === date;
          return (
            <button
              key={d}
              onClick={() => onDate(d)}
              className={cn(
                'flex w-[58px] shrink-0 flex-col items-center rounded-2xl py-2.5 transition-colors',
                active ? 'bg-white text-brand-950 shadow-lg' : 'bg-white/12 text-white hover:bg-white/20',
              )}
            >
              <span className={cn('text-[10px] font-semibold uppercase', active ? 'text-brand-950/50' : 'text-white/55')}>
                {p.weekday}
              </span>
              <span className="text-[19px] font-bold leading-tight">{p.day}</span>
              <span className={cn('text-[10px] font-medium', active ? 'text-brand-950/45' : 'text-white/45')}>
                {p.month}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[13px] font-light capitalize text-white/65">{humanDate(date)}</p>

      {grid === null && <p className="mt-6 font-light text-white/50">Cargando horarios…</p>}
      {empty && (
        <p className="mt-6 rounded-3xl border border-dashed border-white/25 p-6 text-center text-[13px] font-light text-white/60">
          No quedan horarios libres este día. Prueba con otro.
        </p>
      )}

      <div className="mt-5 space-y-6">
        {grid?.map(({ court, slots }) => {
          const free = slots.filter((s) => s.available);
          if (free.length === 0) return null;
          return (
            <section key={court.id}>
              <h2 className="mb-2.5 flex items-center gap-2 text-[15px] font-bold">
                {court.name}
                {court.indoor && <span className="text-[11px] font-medium text-white/45">Techada</span>}
              </h2>
              <div className="grid grid-cols-3 gap-2">
                {free.map((s) => (
                  <SlotButton key={s.startTime} slot={s} symbol={symbol} onClick={() => onPick(court.id, court.name, s)} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SlotButton({ slot, symbol, onClick }: { slot: PublicSlot; symbol: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-2xl border p-3 text-left transition-colors',
        slot.isPeak
          ? 'border-amber-300/50 bg-amber-300/15 hover:bg-amber-300/25'
          : 'border-white/25 bg-white/12 hover:bg-white/22',
      )}
    >
      <p className="text-[15px] font-bold leading-none">{slot.startTime}</p>
      <p className="mt-1 text-[10px] font-medium text-white/55">a {slot.endTime}</p>
      <p className="mt-1.5 text-[13px] font-bold">
        {symbol}
        {slot.priceBase}
      </p>
    </button>
  );
}
