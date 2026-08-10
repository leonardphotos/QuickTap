import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock, Minus, Plus, QrCode, RotateCcw, ShoppingBag, Trophy, Wallet, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useBarcodeCamera } from '@/hooks/useBarcodeCamera';
import { formatBase } from '@/utils/format';
import { clubGradient, courtTypeLabel } from '@/pages/public/clubPublic';
import { cn } from '@/lib/utils';
import { clubTabletApi, type TabletCatalogItem, type TabletCourt, type TabletSession } from './clubTabletApi';
import { clubApi } from './clubApi';
import ClubTournamentScreen from './ClubTournamentScreen';

/** La pantalla solo tiene sentido acostada: es una tablet fija en la pared de la cancha. */
const LANDSCAPE_QUERY = '(orientation: landscape)';

type Screen = 'idle' | 'scanning' | 'menu' | 'closing' | 'torneo';

function useIsLandscape(): boolean {
  const [ok, setOk] = useState(() => window.matchMedia(LANDSCAPE_QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia(LANDSCAPE_QUERY);
    const onChange = () => setOk(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return ok;
}

function itemKey(i: { source: string; id: string }): string {
  return `${i.source}:${i.id}`;
}

/**
 * Reloj de pared de la portada. Usa la hora del propio dispositivo, no la de
 * Caracas: la tablet está colgada en la cancha y tiene que coincidir con el
 * reloj que el jugador ve al levantar la vista.
 *
 * Solo re-renderiza cuando cambia el minuto — se compara el texto ya formateado
 * en vez de guardar el Date, para no repintar la pantalla 60 veces por minuto.
 */
function readClock(): { time: string; date: string } {
  const now = new Date();
  return {
    time: now.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false }),
    date: now.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' }),
  };
}

function useClock(): { time: string; date: string } {
  const [clock, setClock] = useState(readClock);
  useEffect(() => {
    const t = setInterval(() => {
      const next = readClock();
      setClock((prev) => (prev.time === next.time && prev.date === next.date ? prev : next));
    }, 1000);
    return () => clearInterval(t);
  }, []);
  return clock;
}

/**
 * Kiosco de la tablet de una cancha (rol CANCHA). Ciclo completo:
 *
 *   Acceder → escanear el QR de la reserva → "Bienvenido, <jugador>" + menú →
 *   pedir (se suma a su cuenta) → se acaba el tiempo → monto a cancelar y
 *   "pasa por caja" → Ok → vuelve a Acceder.
 *
 * No cobra nada: lo pedido se le suma a la reserva y lo cobra recepción en la
 * Caja de Canchas. La tablet nunca cierra sesión sola — la cuenta del kiosco se
 * queda abierta y lo que cambia de jugador es el QR escaneado.
 */
export default function ClubTabletPage() {
  const { restaurant, logout } = useAuth();
  const landscape = useIsLandscape();
  const clock = useClock();

  const [screen, setScreen] = useState<Screen>('idle');
  const [session, setSession] = useState<TabletSession | null>(null);
  const [catalog, setCatalog] = useState<TabletCatalogItem[] | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [category, setCategory] = useState<string>('todo');
  // Canchas del club: el torneo necesita saber en cuáles se puede jugar.
  const [courtNames, setCourtNames] = useState<string[]>([]);
  // La cancha de esta tablet: es el nombre grande de la portada.
  const [court, setCourt] = useState<TabletCourt | null>(null);
  // Nombres/cancha con los que se abre el torneo: llegan de la reserva cuando el
  // jugador ya confirmó el Americano al reservar. Vacío = torneo en blanco.
  const [tournamentPrefill, setTournamentPrefill] = useState<{ players: string[]; court?: string } | null>(null);
  // A dónde volver al salir del torneo: si se abrió desde el menú de una sesión
  // activa, hay que volver ahí y no perder al jugador que está en la cancha.
  const [torneoReturnScreen, setTorneoReturnScreen] = useState<Screen>('idle');

  useEffect(() => {
    clubApi
      .listCourts()
      .then((cs) => setCourtNames(cs.filter((c) => c.active).map((c) => c.name)))
      .catch(() => setCourtNames([]));
    clubTabletApi
      .court()
      .then(setCourt)
      .catch(() => setCourt(null));
  }, []);

  const money = useCallback(
    (v: string | number) => formatBase(Number(v), restaurant?.currencySymbol ?? '$'),
    [restaurant?.currencySymbol],
  );

  const reset = useCallback(() => {
    setSession(null);
    setCart({});
    setError(null);
    setJustSent(false);
    setCategory('todo');
    setScreen('idle');
  }, []);

  // Refresca la sesión: el saldo cambia con cada pedido y el tiempo corre solo.
  const refreshSession = useCallback(async (token: string) => {
    try {
      const s = await clubTabletApi.session(token);
      setSession(s);
      return s;
    } catch {
      // Un fallo puntual de red no debe echar al jugador de la pantalla.
      return null;
    }
  }, []);

  function openTournament(prefill?: { players: string[]; court?: string }) {
    setTournamentPrefill(prefill ?? null);
    setTorneoReturnScreen(screen);
    setScreen('torneo');
  }

  async function openSession(rawToken: string) {
    const token = rawToken.trim().replace(/^.*\/acceso\//, '');
    if (!token) return;
    setError(null);
    try {
      const [s, c] = await Promise.all([clubTabletApi.session(token), clubTabletApi.catalog()]);
      setSession(s);
      setCatalog(c.items);
      setScreen(s.booking.finished ? 'closing' : 'menu');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No pudimos leer tu código. Intenta de nuevo.');
      setScreen('idle');
    }
  }

  // Reloj de la sesión: cuando se acaba el tiempo, la pantalla pasa sola al
  // cierre de cuenta — es justo lo que tiene que ver el jugador al terminar.
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = session?.booking.accessToken ?? null;

  useEffect(() => {
    if (screen !== 'menu') return;
    const t = setInterval(async () => {
      const token = tokenRef.current;
      if (!token) return;
      const s = await refreshSession(token);
      if (s?.booking.finished) setScreen('closing');
    }, 20_000);
    return () => clearInterval(t);
  }, [screen, refreshSession]);

  const categories = useMemo(() => {
    if (!catalog) return [];
    return Array.from(new Set(catalog.map((i) => i.category)));
  }, [catalog]);

  const visible = useMemo(() => {
    if (!catalog) return [];
    return category === 'todo' ? catalog : catalog.filter((i) => i.category === category);
  }, [catalog, category]);

  const cartLines = useMemo(() => {
    if (!catalog) return [];
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([key, qty]) => {
        const item = catalog.find((i) => itemKey(i) === key);
        return item ? { item, qty } : null;
      })
      .filter((l): l is { item: TabletCatalogItem; qty: number } => !!l);
  }, [cart, catalog]);

  const cartTotal = cartLines.reduce((acc, l) => acc + Number(l.item.priceBase) * l.qty, 0);

  function add(item: TabletCatalogItem, delta: number) {
    setJustSent(false);
    setCart((c) => {
      const key = itemKey(item);
      const next = Math.max(0, (c[key] ?? 0) + delta);
      // La tienda del club sí tiene stock real; el menú del restaurante no.
      const capped = item.stock != null ? Math.min(next, item.stock) : next;
      return { ...c, [key]: capped };
    });
  }

  async function send() {
    if (!session || cartLines.length === 0) return;
    setSending(true);
    setError(null);
    try {
      await clubTabletApi.createOrder(
        session.booking.accessToken,
        cartLines.map((l) => ({ source: l.item.source, productId: l.item.id, quantity: l.qty })),
      );
      setCart({});
      setJustSent(true);
      await refreshSession(session.booking.accessToken);
      // También el stock de la tienda cambió con este pedido.
      clubTabletApi
        .catalog()
        .then((c) => setCatalog(c.items))
        .catch(() => {});
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo enviar el pedido.');
    } finally {
      setSending(false);
    }
  }

  const brand = clubGradient((restaurant?.theme ?? null) as never);

  if (!landscape) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 p-8 text-center" style={brand}>
        <RotateCcw className="h-14 w-14 text-white/80" />
        <p className="text-2xl font-bold text-white">Gira la tablet</p>
        <p className="max-w-xs text-white/70">Esta pantalla funciona en horizontal.</p>
      </div>
    );
  }

  // ------------------------------------------------------------------- Torneo
  if (screen === 'torneo') {
    return (
      <ClubTournamentScreen
        courtNames={courtNames}
        initialPlayers={tournamentPrefill?.players}
        initialCourtName={tournamentPrefill?.court}
        onExit={() => setScreen(torneoReturnScreen)}
      />
    );
  }

  // ------------------------------------------------------------------ Acceder
  if (screen === 'idle' || screen === 'scanning') {
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden px-10 py-8" style={brand}>
        {/* Halos y la cancha dibujada de fondo: dan profundidad sin robarle
            protagonismo al nombre, que es lo único que se lee de lejos. */}
        <div aria-hidden className="pointer-events-none absolute -left-40 -top-48 h-[30rem] w-[30rem] rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-52 -right-32 h-[34rem] w-[34rem] rounded-full bg-black/20 blur-3xl" />
        <CourtWatermark />

        <header className="relative z-10 flex items-start justify-between gap-6">
          <div className="flex min-w-0 items-center gap-3">
            {restaurant?.logoUrl ? (
              <img
                src={restaurant.logoUrl}
                alt=""
                className="h-12 w-12 shrink-0 rounded-xl object-cover shadow-lg ring-1 ring-white/25"
              />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 text-sm font-bold text-white ring-1 ring-white/25">
                {restaurant?.name?.slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-xl font-bold tracking-tight text-white">{restaurant?.name}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">Club deportivo</p>
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-5xl font-bold leading-none tracking-tight tabular-nums text-white">{clock.time}</p>
            {/* first-letter y no capitalize: en español va "domingo, 9 de agosto", no "9 De Agosto". */}
            <p className="mt-1.5 text-[13px] font-light text-white/55 first-letter:uppercase">{clock.date}</p>
          </div>
        </header>

        <main className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">
          {court && courtTypeLabel(court.courtType) && (
            <span className="mb-5 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/75 backdrop-blur-md">
              {courtTypeLabel(court.courtType)}
            </span>
          )}

          {/* El nombre de la cancha es el héroe de la pantalla. Si quien entró no
              es una tablet de cancha (dueño probando), cae al nombre del club. */}
          <h1 className="text-[clamp(3.5rem,12vw,8rem)] font-bold leading-[0.92] tracking-tighter text-white drop-shadow-[0_4px_30px_rgba(0,0,0,0.35)]">
            {court?.name ?? restaurant?.name}
          </h1>

          <div className="mt-7 h-px w-28 bg-gradient-to-r from-transparent via-white/50 to-transparent" />

          <p className="mt-7 text-2xl font-semibold tracking-tight text-white">¿Listos para jugar?</p>
          <p className="mt-1.5 text-base font-light text-white/60">
            Escanea el QR de tu reserva para comenzar a jugar
          </p>

          <button
            onClick={() => {
              setError(null);
              setScreen('scanning');
            }}
            className="mt-9 flex items-center gap-3 rounded-full bg-white px-14 py-5 text-xl font-bold text-brand-950 shadow-2xl transition-transform active:scale-95"
          >
            <QrCode className="h-6 w-6" />
            Acceder
          </button>

          {error && (
            <p className="mt-6 max-w-md rounded-2xl bg-black/30 px-5 py-3 text-white backdrop-blur-md">{error}</p>
          )}
        </main>

        {/* Discreto a propósito: es para el personal que monta la tablet, no para el jugador. */}
        <button onClick={logout} className="absolute bottom-4 right-5 z-10 text-xs text-white/30">
          Salir
        </button>

        {screen === 'scanning' && (
          <FullscreenScanner
            onClose={() => setScreen('idle')}
            onDecoded={(value) => {
              setScreen('idle');
              openSession(value);
            }}
          />
        )}
      </div>
    );
  }

  // -------------------------------------------------- Se acabó: pasa por caja
  if (screen === 'closing' && session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-7 p-10 text-center" style={brand}>
        <Wallet className="h-14 w-14 text-white/80" />
        <div>
          <p className="text-3xl font-bold text-white">Se acabó el tiempo, {session.booking.playerName.split(' ')[0]}</p>
          <p className="mt-2 text-lg font-light text-white/75">Gracias por jugar en {session.booking.courtName}.</p>
        </div>

        <div className="w-full max-w-md rounded-3xl bg-white/95 p-6 shadow-xl">
          <Row label="Cancha" value={money(session.money.courtBase)} />
          <Row label="Consumo" value={money(session.money.consumoBase)} />
          {Number(session.money.paidBase) > 0 && (
            <Row label="Ya pagado" value={`− ${money(session.money.paidBase)}`} />
          )}
          <div className="mt-3 flex items-baseline justify-between border-t border-brand-950/10 pt-3">
            <span className="text-lg font-bold text-brand-950">Total a cancelar</span>
            <span className="text-3xl font-bold text-brand-950">{money(session.money.balanceBase)}</span>
          </div>
        </div>

        <p className="text-lg font-medium text-white">Pasa por caja para cerrar tu cuenta.</p>

        <button
          onClick={reset}
          className="rounded-full bg-white px-16 py-5 text-2xl font-bold text-brand-950 shadow-xl transition-transform active:scale-95"
        >
          Ok
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------------- Menú
  if (!session) return null;

  return (
    <div className="flex h-screen flex-col bg-[#fafafa]">
      <header className="shrink-0 px-6 py-4 text-white" style={brand}>
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-2xl font-bold">Bienvenido, {session.booking.playerName}</p>
            <p className="text-sm font-light text-white/75">
              {session.booking.courtName} · {session.booking.playerCount} jugadores
            </p>
          </div>
          <div className="shrink-0 rounded-2xl bg-white/15 px-4 py-2 text-center">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/70">
              <Clock className="h-3.5 w-3.5" /> te queda
            </p>
            <p className="text-xl font-bold">{session.booking.remainingMinutes} min</p>
          </div>
          <div className="shrink-0 rounded-2xl bg-white/15 px-4 py-2 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">tu cuenta</p>
            <p className="text-xl font-bold">{money(session.money.dueBase)}</p>
          </div>
          {session.booking.tournamentPlayerNames && session.booking.tournamentPlayerNames.length > 0 && (
            <button
              onClick={() =>
                openTournament({ players: session.booking.tournamentPlayerNames!, court: session.booking.courtName })
              }
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-white/25"
            >
              <Trophy className="h-4 w-4" /> Torneo
            </button>
          )}
          <button
            onClick={reset}
            className="shrink-0 rounded-full bg-white/15 p-2.5 transition-colors hover:bg-white/25"
            aria-label="Terminar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex flex-wrap gap-2">
            <Chip active={category === 'todo'} onClick={() => setCategory('todo')} label="Todo" />
            {categories.map((c) => (
              <Chip key={c} active={category === c} onClick={() => setCategory(c)} label={c} />
            ))}
          </div>

          {catalog === null && <p className="font-light text-brand-950/40">Cargando…</p>}
          {catalog?.length === 0 && (
            <p className="font-light text-brand-950/45">Todavía no hay productos disponibles para pedir.</p>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {visible.map((item) => {
              const qty = cart[itemKey(item)] ?? 0;
              const soldOut = item.stock != null && item.stock <= 0;
              return (
                <div
                  key={itemKey(item)}
                  className={cn(
                    'flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors',
                    qty > 0 ? 'border-brand-500' : 'border-brand-950/[0.07]',
                  )}
                >
                  {item.photoUrl && (
                    <img src={item.photoUrl} alt="" className="h-24 w-full object-cover" />
                  )}
                  <div className="flex flex-1 flex-col p-3">
                    <p className="line-clamp-2 text-sm font-semibold leading-tight text-brand-950">{item.name}</p>
                    <p className="mt-0.5 text-[11px] font-light text-brand-950/40">
                      {item.source === 'RESTAURANT' ? 'Cocina' : 'Tienda'}
                    </p>
                    <p className="mt-auto pt-2 text-base font-bold text-brand-950">{money(item.priceBase)}</p>

                    {qty === 0 ? (
                      <button
                        onClick={() => add(item, 1)}
                        disabled={soldOut}
                        className="mt-2 rounded-xl bg-brand-950 py-2.5 text-sm font-semibold text-white transition-colors disabled:bg-brand-950/20"
                      >
                        {soldOut ? 'Agotado' : 'Agregar'}
                      </button>
                    ) : (
                      <div className="mt-2 flex items-center justify-between rounded-xl bg-brand-950/[0.05] px-2 py-1.5">
                        <button onClick={() => add(item, -1)} className="rounded-lg p-1.5" aria-label="Quitar uno">
                          <Minus className="h-4 w-4 text-brand-950" />
                        </button>
                        <span className="text-base font-bold text-brand-950">{qty}</span>
                        <button onClick={() => add(item, 1)} className="rounded-lg p-1.5" aria-label="Agregar uno">
                          <Plus className="h-4 w-4 text-brand-950" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </main>

        <aside className="flex w-[300px] shrink-0 flex-col border-l border-brand-950/[0.07] bg-white">
          <p className="flex items-center gap-2 border-b border-brand-950/[0.07] px-5 py-4 text-sm font-bold text-brand-950">
            <ShoppingBag className="h-4 w-4" /> Tu pedido
          </p>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            {cartLines.length === 0 && !justSent && (
              <p className="text-sm font-light text-brand-950/40">Toca un producto para agregarlo.</p>
            )}
            {justSent && cartLines.length === 0 && (
              <div className="flex items-start gap-2 rounded-2xl bg-emerald-50 px-3 py-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <p className="text-sm font-medium text-emerald-900">
                  Pedido enviado. Te lo llevamos a la cancha.
                </p>
              </div>
            )}
            <ul className="space-y-2">
              {cartLines.map(({ item, qty }) => (
                <li key={itemKey(item)} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-brand-950">
                    <span className="font-bold">{qty}×</span> {item.name}
                  </span>
                  <span className="shrink-0 font-light text-brand-950/50">
                    {money(Number(item.priceBase) * qty)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {error && <p className="px-5 pb-2 text-sm text-red-600">{error}</p>}

          <div className="border-t border-brand-950/[0.07] px-5 py-4">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-sm text-brand-950/60">Este pedido</span>
              <span className="text-xl font-bold text-brand-950">{money(cartTotal)}</span>
            </div>
            <button
              onClick={send}
              disabled={sending || cartLines.length === 0}
              className="w-full rounded-2xl bg-brand-950 py-4 text-base font-bold text-white transition-colors disabled:bg-brand-950/20"
            >
              {sending ? 'Enviando…' : 'Pedir a la cancha'}
            </button>
            <p className="mt-2 text-center text-[11px] font-light text-brand-950/40">
              Se suma a tu cuenta. Pagas todo junto en caja.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * La cancha vista desde arriba, casi transparente, como marca de agua de la
 * portada — mismo dibujo que la barra de progreso del enlace público, para que
 * las dos pantallas se sientan del mismo producto.
 */
function CourtWatermark() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 200"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]"
    >
      <g fill="none" stroke="white" strokeWidth="1.5">
        <rect x="20" y="20" width="360" height="160" />
        {/* Red al centro y líneas de servicio a los lados. */}
        <line x1="200" y1="20" x2="200" y2="180" />
        <line x1="80" y1="20" x2="80" y2="180" strokeWidth="1" />
        <line x1="320" y1="20" x2="320" y2="180" strokeWidth="1" />
        <line x1="80" y1="100" x2="320" y2="100" strokeWidth="1" />
      </g>
    </svg>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className="text-brand-950/55">{label}</span>
      <span className="font-semibold text-brand-950">{value}</span>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full px-4 py-2 text-sm font-semibold transition-colors',
        active ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.05] text-brand-950/60',
      )}
    >
      {label}
    </button>
  );
}

/**
 * Cámara a pantalla completa. No usa ScannerModal porque acá el escaneo ES la
 * pantalla, no un diálogo sobre otra cosa — y sin backdrop-filter, por el mismo
 * bug de WebKit que documenta scanner-modal.tsx.
 *
 * Trae también la entrada manual del código, igual que el check-in de recepción:
 * una tablet atornillada a la pared con la cámara rota dejaría al jugador sin
 * forma de entrar. Vive acá dentro y no en la pantalla de inicio, que tiene que
 * seguir siendo un solo botón.
 */
function FullscreenScanner({ onClose, onDecoded }: { onClose: () => void; onDecoded: (v: string) => void }) {
  const { videoRef, cameraError } = useBarcodeCamera(true, onDecoded);
  const [manual, setManual] = useState('');
  const [typing, setTyping] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black">
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted autoPlay playsInline />

      {!cameraError && !typing && (
        <div className="pointer-events-none relative flex flex-col items-center gap-6">
          <div className="h-64 w-64 rounded-3xl border-4 border-white/80" />
          <p className="text-xl font-semibold text-white drop-shadow">Acerca el QR de tu reserva</p>
        </div>
      )}

      {cameraError && !typing && (
        <div className="relative max-w-sm px-6 text-center">
          <p className="text-white">{cameraError} Revisa los permisos de cámara del navegador.</p>
        </div>
      )}

      {typing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) onDecoded(manual);
          }}
          className="relative flex w-full max-w-md flex-col gap-3 rounded-3xl bg-white/95 p-6 shadow-2xl"
        >
          <p className="text-lg font-bold text-brand-950">Escribe el código de tu reserva</p>
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Está debajo del QR"
            className="rounded-xl border border-brand-950/15 px-4 py-3 text-lg focus:border-brand-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!manual.trim()}
            className="rounded-2xl bg-brand-950 py-3.5 text-base font-bold text-white disabled:bg-brand-950/20"
          >
            Entrar
          </button>
        </form>
      )}

      <div className="absolute bottom-8 flex items-center gap-3">
        <button onClick={onClose} className="rounded-full bg-white px-10 py-4 text-lg font-bold text-brand-950 shadow-xl">
          Cancelar
        </button>
        <button
          onClick={() => setTyping((v) => !v)}
          className="rounded-full bg-white/20 px-6 py-4 text-sm font-semibold text-white"
        >
          {typing ? 'Usar la cámara' : 'Escribir el código'}
        </button>
      </div>
    </div>
  );
}
