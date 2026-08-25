import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Clock, Minus, Plus, QrCode, RotateCcw, ShoppingBag, Trophy, Wallet, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useBarcodeCamera } from '@/hooks/useBarcodeCamera';
import { formatBase, formatBsAbsolute } from '@/utils/format';
import { clubGradient, courtTypeLabel } from '@/pages/public/clubPublic';
import { USD_FIRST_METHODS } from '@/utils/payments';
import { cn } from '@/lib/utils';
import {
  CLUB_STORE_ID,
  clubTabletApi,
  type TabletCatalogItem,
  type TabletCourt,
  type TabletPayMethod,
  type TabletSession,
  type MasterCourt,
  type TabletStore,
  type TabletTab,
} from './clubTabletApi';
import { clubApi } from './clubApi';
import ClubTournamentScreen from './ClubTournamentScreen';

/** La pantalla solo tiene sentido acostada: es una tablet fija en la pared de la cancha. */
const LANDSCAPE_QUERY = '(orientation: landscape)';

type Screen = 'idle' | 'scanning' | 'maestro' | 'sesion' | 'tiendas' | 'menu' | 'closing' | 'torneo';

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

function itemKey(i: { storeId: string; id: string }): string {
  return `${i.storeId}:${i.id}`;
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
 * Cuenta regresiva de la reserva, al segundo. Se calcula contra `endsAt` en vez
 * de contar hacia abajo desde los minutos que trae la sesión: así no se desfasa
 * si la tablet se queda dormida un rato, y solo depende del reloj del equipo.
 */
function useCountdown(endsAt: string | undefined): { text: string; over: boolean } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!endsAt) return { text: '--:--', over: false };

  const left = Math.floor((new Date(endsAt).getTime() - now) / 1000);
  const total = Math.max(0, left);
  const pad = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return { text: h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`, over: left <= 0 };
}

/**
 * Kiosco de la tablet de una cancha (rol CANCHA). Ciclo completo:
 *
 *   Acceder → escanear el QR de la reserva → portada de la sesión (cuánto tiempo
 *   queda, con Torneo y Tienda) → pedir (se suma a su cuenta) → se acaba el
 *   tiempo → monto a cancelar y "pasa por caja" → Ok → vuelve a Acceder.
 *
 * No cobra nada: lo pedido se le suma a la reserva y lo cobra recepción en la
 * Caja de Canchas. La tablet nunca cierra sesión sola — la cuenta del kiosco se
 * queda abierta y lo que cambia de jugador es el QR escaneado.
 */
export default function ClubTabletPage() {
  const { restaurant, logout } = useAuth();
  const landscape = useIsLandscape();
  const clock = useClock();
  // Si el club lo apagó, la tablet nunca ofrece "Pagar" — solo el detalle de
  // cada cuenta cuando se acaba el tiempo (ver ClubTabletsSection en Ajustes).
  const tabletPaymentsEnabled = restaurant?.clubTabletPaymentsEnabled ?? true;

  const [screen, setScreen] = useState<Screen>('idle');
  const [session, setSession] = useState<TabletSession | null>(null);
  const [stores, setStores] = useState<TabletStore[] | null>(null);
  // En qué tienda está comprando. El carrito es de ESA tienda: cada tienda cobra
  // lo suyo, así que un pedido nunca mezcla dos.
  const [storeId, setStoreId] = useState<string | null>(null);
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
  // Qué cuenta está pagando en la pantalla de cierre (payeeId), si alguna.
  const [payingTab, setPayingTab] = useState<string | null>(null);
  // Llave maestra en uso: se guarda para poder abrir la reserva elegida
  // saltándose el candado de cancha y el de hora.
  const [masterCode, setMasterCode] = useState<string | null>(null);
  const [masterCourts, setMasterCourts] = useState<MasterCourt[] | null>(null);

  const countdown = useCountdown(session?.booking.endsAt);

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
    setStoreId(null);
    setError(null);
    setJustSent(false);
    setCategory('todo');
    setMasterCode(null);
    setMasterCourts(null);
    setScreen('idle');
  }, []);

  /** Entrar a una tienda arranca un carrito limpio: lo que no se pidió en la
   *  anterior no se arrastra a la cuenta de otra. */
  const openStore = useCallback((id: string) => {
    setStoreId(id);
    setCart({});
    setCategory('todo');
    setJustSent(false);
    setError(null);
    setScreen('menu');
  }, []);

  // La llave viaja por ref para que el refresco periódico no se resuscriba cada
  // vez que cambia — y sin ella el refresco expulsaría una sesión abierta con
  // maestra, porque volvería a chocar con el candado de cancha.
  const masterRef = useRef<string | null>(null);
  masterRef.current = masterCode;

  // Refresca la sesión: el saldo cambia con cada pedido y el tiempo corre solo.
  const refreshSession = useCallback(async (token: string) => {
    try {
      const s = await clubTabletApi.session(token, masterRef.current ?? undefined);
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

  /** Abre una reserva. `master` va cuando se llegó por la llave maestra: deja
   *  entrar aunque la reserva sea de otra cancha o esté fuera de hora. */
  async function openBooking(token: string, master?: string) {
    const [s, st] = await Promise.all([clubTabletApi.session(token, master), clubTabletApi.catalog()]);
    setSession(s);
    setStores(st);
    setScreen(s.booking.finished ? 'closing' : 'sesion');
  }

  async function openSession(rawToken: string) {
    const token = rawToken.trim().replace(/^.*\/acceso\//, '');
    if (!token) return;
    setError(null);
    try {
      await openBooking(token);
    } catch (err: any) {
      // No era una reserva. Puede ser la llave maestra, que se escribe en la
      // misma casilla: se prueba como tal antes de dar el código por malo.
      try {
        const courts = await clubTabletApi.master(token);
        setMasterCode(token);
        setMasterCourts(courts);
        setScreen('maestro');
        return;
      } catch {
        // Tampoco. Vale el error original, que es el que le sirve al jugador.
      }
      setError(err.response?.data?.error ?? 'No pudimos leer tu código. Intenta de nuevo.');
      setScreen('idle');
    }
  }

  // Refresco del saldo mientras el jugador está en la cancha: cada pedido lo
  // cambia, y el que hizo el pedido puede no ser el que está mirando la tablet.
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = session?.booking.accessToken ?? null;

  const inSession = screen === 'sesion' || screen === 'tiendas' || screen === 'menu';

  useEffect(() => {
    if (!inSession) return;
    const t = setInterval(async () => {
      const token = tokenRef.current;
      if (!token) return;
      await refreshSession(token);
    }, 20_000);
    return () => clearInterval(t);
  }, [inSession, refreshSession]);

  // Se acabó el tiempo: la pantalla pasa sola al cierre de cuenta, que es justo
  // lo que el jugador tiene que ver al terminar. Lo dispara la cuenta regresiva
  // y no el refresco, para que caiga en el segundo exacto y no hasta 20s después.
  useEffect(() => {
    if (inSession && countdown.over) setScreen('closing');
  }, [inSession, countdown.over]);

  /** La tienda abierta y su catálogo. Todo lo del menú se deriva de acá. */
  const store = useMemo(() => stores?.find((s) => s.id === storeId) ?? null, [stores, storeId]);
  const catalog = store?.items ?? null;

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
    if (!session || !storeId || cartLines.length === 0) return;
    setSending(true);
    setError(null);
    try {
      await clubTabletApi.createOrder(
        session.booking.accessToken,
        storeId,
        cartLines.map((l) => ({ productId: l.item.id, quantity: l.qty })),
      );
      setCart({});
      setJustSent(true);
      await refreshSession(session.booking.accessToken);
      // También el stock de la tienda cambió con este pedido.
      clubTabletApi
        .catalog()
        .then(setStores)
        .catch(() => {});
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo enviar el pedido.');
    } finally {
      setSending(false);
    }
  }

  const brand = clubGradient((restaurant?.theme ?? null) as never);

  // Los mismos colores de "Marca del enlace de reservas" (Ajustes → Apariencia)
  // pintan esta tablet: toda la pantalla usa las clases bg-brand-*/text-brand-*,
  // así que sobreescribir las variables CSS en la raíz alcanza para que botones,
  // textos y acentos se vean con la marca del club en vez del azul por defecto.
  const clubTheme = restaurant?.theme as { primary?: string; accent?: string; text?: string } | null | undefined;
  useEffect(() => {
    const root = document.documentElement;
    const vars: [string, string | undefined][] = [
      ['--color-brand-950', clubTheme?.text],
      ['--color-brand-500', clubTheme?.primary],
      ['--color-brand-400', clubTheme?.accent],
    ];
    for (const [key, value] of vars) {
      if (value) root.style.setProperty(key, value);
    }
    return () => {
      for (const [key] of vars) root.style.removeProperty(key);
    };
  }, [clubTheme?.text, clubTheme?.primary, clubTheme?.accent]);

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
      <TabletPortada
        brand={brand}
        restaurant={restaurant}
        clock={clock}
        /* Discreto a propósito: es para el personal que monta la tablet, no para el jugador. */
        footer={
          <button onClick={logout} className="absolute bottom-4 right-5 z-10 text-xs text-white/30">
            Salir
          </button>
        }
      >
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

        {screen === 'scanning' && (
          <FullscreenScanner
            onClose={() => setScreen('idle')}
            onDecoded={(value) => {
              setScreen('idle');
              openSession(value);
            }}
          />
        )}
      </TabletPortada>
    );
  }

  // ------------------------------ Llave maestra: elegir qué cancha se abre
  if (screen === 'maestro' && masterCourts) {
    return (
      <TabletPortada
        brand={brand}
        restaurant={restaurant}
        clock={clock}
        footer={
          <button onClick={reset} className="absolute bottom-4 right-5 z-10 text-xs text-white/30">
            Salir
          </button>
        }
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">Llave maestra</p>
        <h1 className="mt-3 text-[clamp(1.6rem,4vw,2.6rem)] font-bold leading-none tracking-tight text-white">
          ¿Qué cancha abres?
        </h1>

        <div className="mt-9 grid w-full max-w-3xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {masterCourts.map((c) => (
            <button
              key={c.id}
              disabled={!c.booking}
              onClick={async () => {
                if (!c.booking) return;
                setError(null);
                try {
                  await openBooking(c.booking.accessToken, masterCode ?? undefined);
                } catch (err: any) {
                  setError(err.response?.data?.error ?? 'No se pudo abrir esa cancha.');
                }
              }}
              className={cn(
                'rounded-2xl border px-4 py-4 text-left transition-colors',
                c.booking
                  ? 'border-white/20 bg-white/15 backdrop-blur-xl hover:bg-white/25'
                  : 'cursor-not-allowed border-white/10 bg-white/[0.06]',
              )}
            >
              <p className="truncate text-lg font-bold text-white">{c.name}</p>
              {c.booking ? (
                <>
                  <p className="truncate text-sm font-light text-white/75">{c.booking.playerName}</p>
                  <p className="mt-0.5 text-xs font-light text-white/50">
                    hasta{' '}
                    {new Date(c.booking.endsAt).toLocaleTimeString('es-VE', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}{' '}
                    · {c.booking.playerCount} jugadores
                  </p>
                </>
              ) : (
                <p className="text-sm font-light text-white/40">Sin reserva ahora</p>
              )}
            </button>
          ))}
        </div>

        {error && <p className="mt-5 text-sm font-medium text-white/85">{error}</p>}
        <p className="mt-7 max-w-lg text-sm font-light text-white/55">
          Entras sin el QR del jugador. Úsala solo cuando haga falta.
        </p>
      </TabletPortada>
    );
  }

  // ------------------------------------------- Sesión abierta: cuánto le queda
  if (screen === 'sesion' && session) {
    return (
      <TabletPortada
        brand={brand}
        restaurant={restaurant}
        clock={clock}
        footer={
          <button onClick={reset} className="absolute bottom-4 right-5 z-10 text-xs text-white/30">
            Terminar
          </button>
        }
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
          Bienvenido, {session.booking.playerName.split(' ')[0]}
        </p>
        <h1 className="mt-3 text-[clamp(2rem,5.5vw,3.5rem)] font-bold leading-none tracking-tight text-white">
          {session.booking.courtName}
        </h1>

        {/* El reloj de la partida es lo que el jugador mira de lejos sin acercarse. */}
        <p className="mt-9 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">te queda</p>
        <p className="mt-1 text-[clamp(4rem,15vw,9.5rem)] font-bold leading-[0.9] tracking-tighter tabular-nums text-white drop-shadow-[0_4px_30px_rgba(0,0,0,0.35)]">
          {countdown.text}
        </p>

        <div className="mt-10 flex gap-6">
          <PortadaAction
            icon={<Trophy className="h-7 w-7" />}
            title="Torneo"
            onClick={() =>
              openTournament({
                players: session.booking.tournamentPlayerNames ?? [],
                court: session.booking.courtName,
              })
            }
          />
          <PortadaAction
            icon={<ShoppingBag className="h-7 w-7" />}
            title="Tienda"
            onClick={() => {
              // Con una sola tienda no tiene sentido hacer elegir: se entra directo.
              if (stores?.length === 1) openStore(stores[0].id);
              else setScreen('tiendas');
            }}
          />
        </div>

        <p className="mt-7 text-sm font-light text-white/55">
          Tu cuenta: <span className="font-bold text-white">{money(session.money.dueBase)}</span>
        </p>

        {/* Pagar sin esperar a que se acabe el tiempo: lleva a las cuentas
            abiertas, que es donde está el desglose y el QR de cada cobrador.
            Si el club apagó los cobros desde la tablet, no hay nada que pagar
            acá — el jugador solo ve el detalle cuando se acaba el tiempo. */}
        {tabletPaymentsEnabled && (
          <button
            onClick={() => setScreen('closing')}
            className="mt-3 rounded-full bg-white px-10 py-3 text-lg font-bold text-brand-950 shadow-lg transition-transform active:scale-95"
          >
            Pagar
          </button>
        )}
      </TabletPortada>
    );
  }

  // ------------------------------------------------- Elegir en qué tienda pedir
  if (screen === 'tiendas' && session) {
    return (
      <TabletPortada
        brand={brand}
        restaurant={restaurant}
        clock={clock}
        footer={
          // Flecha centrada abajo: en una tablet colgada, la esquina es lo más
          // incómodo de alcanzar, y el centro es donde la mano ya está.
          <button
            onClick={() => setScreen('sesion')}
            aria-label="Volver"
            className="absolute bottom-6 left-1/2 z-10 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-xl transition-colors hover:bg-white/25"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
        }
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">¿Dónde quieres pedir?</p>
        <h1 className="mt-3 text-[clamp(1.6rem,4vw,2.6rem)] font-bold leading-none tracking-tight text-white">
          Tiendas
        </h1>

        {stores && stores.length > 0 ? (
          <>
            <div className="mt-10 flex flex-wrap items-start justify-center gap-6">
              {stores.map((s) => (
                <PortadaAction
                  key={s.id}
                  icon={
                    s.logoUrl ? (
                      <img src={s.logoUrl} alt="" className="h-full w-full rounded-2xl object-cover" />
                    ) : (
                      <ShoppingBag className="h-7 w-7" />
                    )
                  }
                  title={s.name}
                  onClick={() => openStore(s.id)}
                />
              ))}
            </div>
            <p className="mt-7 max-w-md text-sm font-light text-white/55">
              Cada tienda te cobra lo suyo, así que se piden por separado.
            </p>
          </>
        ) : (
          <p className="mt-10 max-w-md text-lg font-light text-white/70">
            Todavía no hay nada a la venta. Avísale a recepción.
          </p>
        )}
      </TabletPortada>
    );
  }

  // --------------------------- Cuentas abiertas: una por cada quien le cobra
  //
  // Se llega de dos formas: sola, cuando se acaba el tiempo, o a propósito desde
  // el botón Pagar mientras todavía se juega. El texto y la salida cambian según
  // el caso — a mitad de partida no se puede despedir al jugador ni cerrarle la
  // sesión, que es lo que hace "Ok".
  if (screen === 'closing' && session) {
    const tabs = session.tabs ?? [];
    const over = session.booking.finished || countdown.over;
    // En la demo el "Ok" no cierra la cancha hasta que todo esté pagado y
    // verificado: el punto de la demostración es justamente ver ese cobro.
    const mustPayFirst =
      (restaurant?.isDemo ?? false) && tabletPaymentsEnabled && tabs.some((t) => Number(t.balanceBase) > 0);
    return (
      <div className="flex min-h-screen flex-col items-center gap-6 overflow-y-auto p-8 text-center" style={brand}>
        <Wallet className="mt-4 h-12 w-12 shrink-0 text-white/80" />
        <div className="shrink-0">
          <p className="text-3xl font-bold text-white">
            {over ? `Se acabó el tiempo, ${session.booking.playerName.split(' ')[0]}` : 'Tus cuentas'}
          </p>
          <p className="mt-2 text-lg font-light text-white/75">
            {over
              ? `Gracias por jugar en ${session.booking.courtName}.`
              : `Puedes pagar ahora y seguir jugando en ${session.booking.courtName}.`}
          </p>
        </div>

        {tabs.length === 0 ? (
          <div className="w-full max-w-md rounded-3xl bg-white/95 p-6 shadow-xl">
            <p className="text-lg font-bold text-brand-950">No debes nada. Todo listo.</p>
          </div>
        ) : (
          <>
            {/* Una tarjeta por cobrador: el club cobra la cancha y su tienda, y
                cada tienda vinculada cobra lo suyo con SU método de pago. Van
                separadas porque son pagos distintos, a personas distintas. Con
                una sola cuenta, la tarjeta va centrada y no pegada al borde. */}
            <div
              className={cn(
                'grid w-full shrink-0 gap-4',
                tabs.length === 1 ? 'max-w-md' : 'max-w-5xl sm:grid-cols-2 lg:grid-cols-3',
              )}
            >
              {tabs.map((t) => (
                <TabCard
                  key={t.payeeId}
                  tab={t}
                  money={money}
                  payable={tabletPaymentsEnabled}
                  onPay={() => setPayingTab(t.payeeId)}
                />
              ))}
            </div>
            <p className="shrink-0 text-base font-medium text-white/85">
              {!tabletPaymentsEnabled
                ? 'Acércate a caja para pagar — esta cancha no cobra desde la tablet.'
                : tabs.every((t) => Number(t.balanceBase) <= 0)
                  ? 'Todo pagado. ¡Gracias!'
                  : tabs.length > 1
                    ? 'Cada tienda cobra por separado: paga cada cuenta a quien corresponde.'
                    : 'Paga tu cuenta para cerrar.'}
            </p>
          </>
        )}

        {over ? (
          <button
            onClick={mustPayFirst ? undefined : reset}
            disabled={mustPayFirst}
            className="mb-4 shrink-0 rounded-full bg-white px-16 py-4 text-xl font-bold text-brand-950 shadow-xl transition-transform active:scale-95 disabled:opacity-40"
          >
            Ok
          </button>
        ) : (
          // Todavía está jugando: se vuelve a donde estaba, no se cierra su sesión.
          <button
            onClick={() => setScreen(stores && stores.length > 1 ? 'tiendas' : 'sesion')}
            aria-label="Volver"
            className="mb-4 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-brand-950 shadow-xl transition-transform active:scale-95"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
        )}

        {payingTab && tabs.find((t) => t.payeeId === payingTab) && (
          <PayFlow
            tab={tabs.find((t) => t.payeeId === payingTab)!}
            accessToken={session.booking.accessToken}
            playerCount={session.booking.playerCount}
            money={money}
            demo={restaurant?.isDemo ?? false}
            onClose={() => setPayingTab(null)}
            onReported={async () => {
              setPayingTab(null);
              // El saldo baja a "en verificación" en cuanto vuelve la sesión.
              await refreshSession(session.booking.accessToken);
            }}
          />
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------- Menú
  if (!session) return null;

  return (
    <div className="flex h-screen flex-col bg-[#fafafa]">
      <header className="shrink-0 px-6 py-4 text-white" style={brand}>
        <div className="flex items-center gap-4">
          {/* Volver va primero: en una tablet se lee de izquierda a derecha, y
              "salir de acá" es lo que se busca en esa esquina. Vuelve al selector
              de tiendas; si solo hay una, a la portada de la sesión. */}
          <button
            onClick={() => setScreen(stores && stores.length > 1 ? 'tiendas' : 'sesion')}
            className="shrink-0 rounded-full bg-white/15 p-2.5 transition-colors hover:bg-white/25"
            aria-label="Volver"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {store?.logoUrl && (
            <img src={store.logoUrl} alt="" className="h-11 w-11 shrink-0 rounded-2xl object-cover" />
          )}
          <div className="min-w-0 flex-1">
            {/* El nombre de la tienda manda: es de quien se está pidiendo y quien cobra. */}
            <p className="truncate text-2xl font-bold">{store?.name ?? 'Tienda'}</p>
            <p className="truncate text-sm font-light text-white/75">
              {session.booking.playerName} · {session.booking.courtName}
            </p>
          </div>
          <div className="shrink-0 rounded-2xl bg-white/15 px-4 py-2 text-center">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/70">
              <Clock className="h-3.5 w-3.5" /> te queda
            </p>
            <p className="text-xl font-bold tabular-nums">{countdown.text}</p>
          </div>
          <div className="shrink-0 rounded-2xl bg-white/15 px-4 py-2 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">tu cuenta</p>
            <p className="text-xl font-bold">{money(session.money.dueBase)}</p>
          </div>
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
                    {/* La categoría, no el origen: toda esta pantalla es de una
                        sola tienda y su nombre ya está arriba. */}
                    <p className="mt-0.5 text-[11px] font-light text-brand-950/40">
                      {item.category}
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
              {storeId === CLUB_STORE_ID
              ? 'Se suma a tu cuenta del club. La pagas al terminar.'
              : `Se suma a tu cuenta con ${store?.name ?? 'esta tienda'}, que cobra por separado.`}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Chrome compartido de las dos portadas de la tablet — la de inicio y la de una
 * sesión abierta: fondo con halos y la cancha dibujada, el club arriba a la
 * izquierda y el reloj de pared arriba a la derecha. Lo del centro y el pie los
 * pone cada pantalla, y así las dos se ven de la misma familia sin duplicar el
 * fondo dos veces.
 */
function TabletPortada({
  brand,
  restaurant,
  clock,
  footer,
  children,
}: {
  brand: React.CSSProperties;
  restaurant: { name: string; logoUrl?: string | null } | null | undefined;
  clock: { time: string; date: string };
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden px-10 py-8" style={brand}>
      {/* Halos y la cancha dibujada de fondo: dan profundidad sin robarle
          protagonismo a lo del centro, que es lo único que se lee de lejos. */}
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

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">{children}</main>

      {footer}
    </div>
  );
}

/** Botón grande de la portada de sesión (Torneo / Tienda). Los dos pesan igual:
 * en una tablet de pared no hay una acción "principal" entre las dos. Sin
 * borde: solo el ícono en su círculo y el nombre, nada de tarjeta alrededor. */
function PortadaAction({
  icon,
  title,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-3 py-6 transition-transform active:scale-[0.97]"
    >
      {/* overflow-hidden: el icono puede ser el logo de una tienda, y sin esto
          la foto se sale de las esquinas redondeadas. */}
      <span className="flex h-20 w-28 items-center justify-center overflow-hidden rounded-xl bg-white/15 text-white backdrop-blur-xl transition-colors hover:bg-white/25">
        {icon}
      </span>
      {/* Los nombres de tienda son libres: se dejan envolver en dos líneas en vez
          de recortarlos, que dejaba "Tienda del …" sin decir de quién es. */}
      <span className="line-clamp-2 max-w-36 text-center text-xl font-bold leading-tight text-white">{title}</span>
    </button>
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

/** Etiquetas de los datos de cobro, en el orden en que se dictan. */
const PAY_FIELD_LABELS: [keyof TabletPayMethod, string][] = [
  ['banco', 'Banco'],
  ['telefono', 'Teléfono'],
  ['cedula', 'Cédula/RIF'],
  ['rif', 'RIF'],
  ['titular', 'Titular'],
  ['correo', 'Correo'],
  ['cuenta', 'Cuenta'],
];

/** Métodos que mueven dólares: su monto se dice en $, no en Bs. La lista completa vive en
 *  utils/payments.ts — acá ya solo se envuelve en un Set para consultarla por clave suelta. */
const USD_METHODS = new Set<string>(USD_FIRST_METHODS);

const PAY_METHOD_LABELS: Record<string, string> = {
  MOBILE_PAYMENT: 'Pago Móvil',
  ZELLE: 'Zelle',
  CASH: 'Efectivo Bs',
  CASH_USD: 'Efectivo $',
  CARD: 'Punto de venta',
  BINANCE: 'Binance',
  PAYPAL: 'PayPal',
  TRANSFER: 'Transferencia',
};

/**
 * Una cuenta a pagar, con el desglose de lo que la compone y un botón para
 * pagarla. Cada cobrador tiene la suya: el jugador le paga a cada quien por su
 * lado, y mezclarlos sería mandarle la plata a quien no es.
 */
function TabCard({
  tab,
  money,
  payable,
  onPay,
}: {
  tab: TabletTab;
  money: (v: string | number) => string;
  /** Si el club apagó "Cobrar desde la tablet": se ve el detalle, sin botón de pagar. */
  payable: boolean;
  onPay: () => void;
}) {
  const paid = Number(tab.paidBase) > 0;
  const pending = Number(tab.pendingBase);
  const settled = Number(tab.balanceBase) <= 0;
  // Todo lo que falta ya está reportado: no queda nada que pagar, solo esperar.
  const fullyReported = !settled && pending >= Number(tab.balanceBase) - 0.01;

  return (
    <div className="flex flex-col rounded-3xl bg-white/95 p-5 text-left shadow-xl">
      <div className="flex items-center gap-3">
        {tab.logoUrl ? (
          <img src={tab.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-950/[0.06] text-xs font-bold text-brand-950/50">
            {tab.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold leading-tight text-brand-950">{tab.name}</p>
          <p className="truncate text-[12px] font-light text-brand-950/50">{tab.detail}</p>
        </div>
      </div>

      <div className="mt-4 border-t border-brand-950/10 pt-3">
        {paid && <Row label="Ya pagado" value={`− ${money(tab.paidBase)}`} />}
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-bold text-brand-950">A pagar</span>
          <span className="text-2xl font-bold tabular-nums text-brand-950">{money(tab.balanceBase)}</span>
        </div>
        {/* El monto en Bs va debajo del de $: es lo que de verdad se transfiere
            por Pago Móvil, y hacerlo calcular a mano invita a equivocarse. */}
        <p className="text-right text-[13px] font-semibold tabular-nums text-brand-500">
          {formatBsAbsolute(tab.balanceBs)}
        </p>
      </div>

      {/* Qué compone la cuenta: sin esto el jugador ve un número y no sabe de
          dónde salió. */}
      {tab.items.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-brand-950/[0.06] pt-3">
          {tab.items.map((i, n) => (
            <li key={`${i.name}-${n}`} className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="min-w-0 truncate font-light text-brand-950/60">
                {i.quantity > 1 && <span className="font-semibold text-brand-950/70">{i.quantity}× </span>}
                {i.name}
              </span>
              <span className="shrink-0 font-medium tabular-nums text-brand-950/70">{money(i.lineTotalBase)}</span>
            </li>
          ))}
        </ul>
      )}

      {pending > 0 && (
        <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-[12px] font-medium text-sky-800">
          {money(tab.pendingBase)} en verificación. {tab.name} tiene que confirmarlo.
        </p>
      )}

      <div className="mt-4">
        {settled ? (
          <p className="rounded-xl bg-emerald-50 py-2.5 text-center text-[13px] font-bold text-emerald-700">
            Cuenta saldada
          </p>
        ) : !payable ? null : tab.methods.length === 0 ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-light text-amber-900">
            Esta tienda no cargó sus datos de cobro. Pregúntale cómo pagarle.
          </p>
        ) : fullyReported ? (
          <p className="rounded-xl bg-brand-950/[0.04] py-2.5 text-center text-[13px] font-medium text-brand-950/50">
            Esperando confirmación
          </p>
        ) : (
          <button
            onClick={onPay}
            className="w-full rounded-full bg-brand-500 py-3 text-base font-bold text-white transition-transform active:scale-[0.97]"
          >
            Pagar
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * La pasarela de pago de una cuenta, en tres pasos: elegir método → ver los
 * datos y el QR → escribir la referencia.
 *
 * No cobra nada: al terminar, el pago queda REPORTADO y la cuenta entra en
 * verificación hasta que el cobrador lo apruebe desde su panel. QuickTap no
 * tiene pasarela real y la plata siempre la confirma una persona.
 */
function PayFlow({
  tab,
  accessToken,
  playerCount,
  money,
  demo,
  onClose,
  onReported,
}: {
  tab: TabletTab;
  accessToken: string;
  /** Cuántos vinieron a jugar: es el reparto que se propone al dividir. */
  playerCount: number;
  money: (v: string | number) => string;
  /** Club demo: el backend confirma el pago solo, y acá se muestran ~3 segundos
   *  de "verificando" para que la demostración cuente la historia completa. */
  demo: boolean;
  onClose: () => void;
  onReported: () => void;
}) {
  const [step, setStep] = useState<'method' | 'data' | 'reference' | 'verifying'>('method');
  const [method, setMethod] = useState<TabletPayMethod | null>(null);
  const [split, setSplit] = useState(false);
  const [people, setPeople] = useState(Math.min(8, Math.max(2, playerCount || 2)));
  const [reference, setReference] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxBase = Math.max(0, Number(tab.balanceBase) - Number(tab.pendingBase));
  const rate = Number(tab.balanceBs) / Math.max(0.01, Number(tab.balanceBase));

  /** Lo que le toca a quien está pagando ahora. Dividido, su parte; si no, todo
   *  lo que falta. Se puede corregir a mano en el último paso. */
  const shareBase = split ? Math.round((maxBase / people) * 100) / 100 : maxBase;
  const [amount, setAmount] = useState(String(maxBase.toFixed(2)));

  /** El monto se dice en la moneda del método: Pago Móvil y efectivo en Bs se
   *  transfieren en bolívares, y Zelle/Binance mueven dólares. Decirlo en la
   *  otra obliga al jugador a convertir de cabeza y a equivocarse. */
  const usdFirst = method ? USD_METHODS.has(method.method) : false;
  const amountLabel = (base: number) => (usdFirst ? money(base) : formatBsAbsolute(base * rate));

  async function submit() {
    const n = Number(amount);
    if (!n || n <= 0) return setError('Escribe cuánto pagaste.');
    if (n > maxBase + 0.01) return setError(`No puede superar lo que falta (${money(maxBase)}).`);
    setSending(true);
    setError(null);
    try {
      await onReportedSubmit(n);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo registrar el pago.');
      setSending(false);
    }
  }

  async function onReportedSubmit(n: number) {
    await clubTabletApi.reportPayment({
      accessToken,
      payeeId: tab.payeeId,
      amountBase: n,
      method: method!.method,
      referenceNumber: reference.trim() || null,
    });
    // En la demo el pago ya quedó confirmado en el servidor; los 3 segundos de
    // "verificando" son la escena que el cliente espera ver antes del "saldada".
    if (demo) {
      setStep('verifying');
      setTimeout(onReported, 3000);
      return;
    }
    onReported();
  }

  const fields = method ? PAY_FIELD_LABELS.filter(([f]) => method[f]) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/70 p-6 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        {/* Título centrado y la X fuera del flujo, para que el nombre quede al
            medio de verdad y no descuadrado por el ancho del botón. */}
        <div className="relative pt-1 text-center">
          <p className="truncate px-10 text-lg font-bold text-brand-950">Pagar a {tab.name}</p>
          <p className="text-[13px] font-light text-brand-950/50">
            {money(tab.balanceBase)} · {formatBsAbsolute(tab.balanceBs)}
          </p>
          {step !== 'verifying' && (
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="absolute right-0 top-0 rounded-full bg-brand-950/[0.06] p-2 text-brand-950/50 hover:text-brand-950"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {step === 'method' && (
          <div className="mt-5">
            {/* Primero cuánto va a pagar, después con qué: el reparto cambia el
                monto que se le va a mostrar en el QR. */}
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  [false, 'Pago completo'],
                  [true, 'Pago dividido'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={label}
                  onClick={() => setSplit(value)}
                  className={cn(
                    'rounded-2xl border py-3 text-[15px] font-bold transition-colors',
                    split === value
                      ? 'border-brand-500 bg-brand-500 text-white'
                      : 'border-brand-950/10 text-brand-950/60 hover:border-brand-500',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {split && (
              <div className="mt-3 rounded-2xl bg-brand-950/[0.04] px-4 py-3">
                <p className="text-[13px] font-medium text-brand-950/70">¿Entre cuántos?</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[2, 3, 4, 5, 6, 8].map((n) => (
                    <button
                      key={n}
                      onClick={() => setPeople(n)}
                      className={cn(
                        'h-10 w-10 rounded-full text-[15px] font-bold transition-colors',
                        people === n ? 'bg-brand-500 text-white' : 'bg-white text-brand-950/60 hover:text-brand-950',
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="mt-2.5 text-[13px] font-light text-brand-950/60">
                  Cada uno paga{' '}
                  <span className="font-bold text-brand-950">{money(shareBase)}</span> ·{' '}
                  <span className="font-semibold text-brand-500">{formatBsAbsolute(shareBase * rate)}</span>
                </p>
              </div>
            )}

            <p className="mt-5 text-[13px] font-medium text-brand-950/70">¿Cómo vas a pagar?</p>
            <div className="mt-2 space-y-2">
              {/* Un método puede venir varias veces (varios Zelle, varios Pago Móvil):
                  cada cuenta es su propia opción, distinguida por su nombre. */}
              {tab.methods.map((m, i) => (
                <button
                  key={`${m.method}-${i}`}
                  onClick={() => {
                    setMethod(m);
                    setAmount(shareBase.toFixed(2));
                    setStep('data');
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-brand-950/10 px-4 py-3.5 text-left transition-colors hover:border-brand-500 hover:bg-brand-500/[0.04]"
                >
                  <span className="min-w-0 text-base font-bold text-brand-950">
                    {PAY_METHOD_LABELS[m.method] ?? m.method}
                    {m.label && <span className="block truncate text-[12px] font-medium text-brand-950/50">{m.label}</span>}
                  </span>
                  {m.qrImageUrl && <QrCode className="h-4 w-4 shrink-0 text-brand-500" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'data' && method && (
          <div className="mt-5 text-center">
            <p className="text-[13px] font-medium text-brand-950/70">
              {usdFirst ? 'Paga' : 'Transfiere'} por {PAY_METHOD_LABELS[method.method] ?? method.method}
            </p>
            {/* El monto, grande y en la moneda del método: es el dato que se
                copia al banco y no puede obligar a convertir de cabeza. */}
            <p className="mt-1 text-[34px] font-bold leading-none tracking-tight tabular-nums text-brand-950">
              {amountLabel(shareBase)}
            </p>
            <p className="mt-1 text-[12px] font-light text-brand-950/45">
              {/* La otra moneda queda de referencia, chiquita. */}
              {usdFirst ? formatBsAbsolute(shareBase * rate) : money(shareBase)}
              {split && ` · tu parte de ${people}`}
            </p>

            {method.qrImageUrl && (
              <img
                src={method.qrImageUrl}
                alt={`QR de ${tab.name}`}
                className="mx-auto mt-3 h-52 w-52 rounded-2xl border border-brand-950/10 object-contain"
              />
            )}

            {fields.length > 0 && (
              <div className="mt-3 space-y-1 rounded-2xl bg-brand-950/[0.04] px-4 py-3">
                {fields.map(([f, label]) => (
                  <p key={f} className="text-sm font-light text-brand-950/70">
                    <span className="text-brand-950/40">{label}:</span>{' '}
                    <span className="font-semibold text-brand-950">{String(method[f])}</span>
                  </p>
                ))}
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setStep('method')}
                className="rounded-full bg-brand-950/[0.06] px-5 py-3 text-sm font-semibold text-brand-950/60"
              >
                Atrás
              </button>
              <button
                onClick={() => setStep('reference')}
                className="flex-1 rounded-full bg-brand-500 py-3 text-base font-bold text-white transition-transform active:scale-[0.97]"
              >
                Listo, ya transferí
              </button>
            </div>
          </div>
        )}

        {step === 'verifying' && (
          <div className="mt-8 flex flex-col items-center gap-4 pb-6 text-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-500/20 border-t-brand-500" />
            <p className="text-lg font-bold text-brand-950">Verificando tu pago…</p>
            <p className="max-w-xs text-[13px] font-light text-brand-950/50">
              Estamos confirmando la referencia. Esto toma unos segundos.
            </p>
          </div>
        )}

        {step === 'reference' && method && (
          <div className="mt-5">
            <label className="block">
              <span className="text-[13px] font-medium text-brand-950/70">Número de referencia</span>
              <input
                autoFocus
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Los últimos dígitos bastan"
                className="mt-1 w-full rounded-xl border border-brand-950/15 px-4 py-3 text-lg focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
              />
            </label>

            <label className="mt-3 block">
              <span className="text-[13px] font-medium text-brand-950/70">¿Cuánto pagaste?</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-xl border border-brand-950/15 px-4 py-3 text-lg tabular-nums focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
              />
              {/* Se escribe en la moneda base, así que se dicen las dos: si arriba
                  vio un monto en Bs, tiene que quedar claro que acá va el otro. */}
              <span className="mt-1 block text-[12px] font-light text-brand-950/45">
                {Number(amount) > 0 && `${money(amount)} ≈ ${formatBsAbsolute(Number(amount) * rate)}`}
                {split && ` · tu parte de ${people}`}
              </span>
            </label>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setStep('data')}
                className="rounded-full bg-brand-950/[0.06] px-5 py-3 text-sm font-semibold text-brand-950/60"
              >
                Atrás
              </button>
              <button
                onClick={submit}
                disabled={sending}
                className="flex-1 rounded-full bg-brand-500 py-3 text-base font-bold text-white transition-transform active:scale-[0.97] disabled:opacity-50"
              >
                {sending ? 'Enviando…' : 'Listo'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
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
 *
 * Usa la cámara frontal ('user'): la tablet está fija en la pared, así que la
 * trasera apunta a la pared y el jugador acerca su QR a la de adelante.
 */
function FullscreenScanner({ onClose, onDecoded }: { onClose: () => void; onDecoded: (v: string) => void }) {
  const { videoRef, cameraError } = useBarcodeCamera(true, onDecoded, 'user');
  const [manual, setManual] = useState('');
  const [typing, setTyping] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black">
      {/* Espejado como cualquier cámara frontal: sin esto, mover el QR a la
          derecha lo mueve a la izquierda en pantalla y apuntar se vuelve un
          rompecabezas. Solo afecta a la vista previa — zxing decodifica el
          stream original, no el elemento con el transform. */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
        muted
        autoPlay
        playsInline
      />

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
