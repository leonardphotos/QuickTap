import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Home, LogOut, MessageCircle, Search, Store, Ticket, TrendingUp, Wallet, X } from 'lucide-react';
import { api } from '@/api/client';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { WALLET_NAME, WALLET_WORDMARK_URL } from './walletBrand';
import { clearWalletToken, getWalletToken } from './walletSession';
import { AbonarDialog } from './AbonarDialog';
import { WalletIntro } from './WalletIntro';
import WalletEntradasPage from './WalletEntradasPage';

/**
 * Panel del cliente en QuickTap Wallet.
 *
 * Tema oscuro a propósito, y solo acá: es un portal de consulta financiera para el comprador,
 * no una pantalla de trabajo del negocio. El resto de QuickTap sigue en claro.
 *
 * Estructura de billetera: arriba, en oscuro, lo único que el cliente viene a preguntar —cuánto
 * debe—; abajo, en una hoja clara, las tiendas a las que les debe, como el historial de
 * movimientos de una app de banco. El menú flotante separa eso de sus Entradas de eventos.
 */

interface Cuota {
  id: string;
  number: number;
  amount: number;
  dueDate: string;
  saldo: number;
  lateFeeCharged: number;
  estado: 'PAGADA' | 'VENCIDA' | 'POR_VENCER' | 'PENDIENTE';
  diasParaVencer: number;
}

interface Compra {
  id: string;
  negocio: string;
  /** WhatsApp del negocio, para escribirle por esta compra. null si no lo tiene cargado. */
  whatsappNegocio: string | null;
  /** Cuándo se abrió la cuenta. */
  fecha: string;
  /** Lo último que se llevó. En una cuenta fiada que fue creciendo no es igual a `fecha`. */
  ultimaCompra: string;
  /** Solo las compras a crédito dejan saldo; las de contado ya se pagaron en el mostrador. */
  esCredito: boolean;
  /** Cada línea con su fecha, para desglosar una cuenta que junta compras de varios días. */
  lineas: { texto: string; fecha: string }[];
  detalle: string[];
  total: number;
  abonado: number;
  saldo: number;
  mora: number;
  progreso: number;
  cuotas: Cuota[];
  proximaCuota: Cuota | null;
}

interface Resumen {
  cliente: { nombre: string };
  /** Tasa del día. null si la fuente estaba caída: entonces se muestra solo en dólares. */
  rateBs: number | null;
  resumen: { totalComprado: number; totalAbonado: number; totalPendiente: number; comprasActivas: number };
  compras: Compra[];
}

const money = (n: number) => `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** El monto en bolívares, que es como el cliente paga. Vacío si no hay tasa del día. */
const bs = (n: number, rateBs: number | null) =>
  rateBs ? `Bs ${(n * rateBs).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';

const fechaCorta = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Fecha y hora en que se hizo la compra. */
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-VE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

/** Enlace a WhatsApp del negocio con el motivo ya escrito. Es un `wa.me`: abre el WhatsApp del
 *  propio cliente con el mensaje redactado, no envía nada por su cuenta. */
function whatsappDelNegocio(c: Compra): string | null {
  const tel = (c.whatsappNegocio ?? '').replace(/\D/g, '');
  if (!tel) return null;
  const texto = `Hola ${c.negocio}, te escribo por mi compra del ${fechaHora(c.ultimaCompra)}`
    + (c.detalle.length ? ` (${c.detalle.join(', ')})` : '')
    + (c.saldo > 0 ? `. Me queda un saldo de ${money(c.saldo)}.` : '.');
  return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
}

/** Aviso de la cuota que se acerca o ya venció. Es la alerta previa a la mora, del lado del cliente. */
function AvisoCuota({ cuota, mora }: { cuota: Cuota; mora: number }) {
  const vencida = cuota.estado === 'VENCIDA';
  return (
    <div
      className="mt-3 rounded-xl px-3 py-2 text-[11px] leading-snug"
      style={{
        background: vencida ? 'rgba(239,68,68,0.10)' : 'rgba(255,193,7,0.10)',
        color: vencida ? '#b91c1c' : '#a16207',
      }}
    >
      {vencida ? (
        <>
          Cuota #{cuota.number} vencida el {fechaCorta(cuota.dueDate)}
          {mora > 0 && ` · mora aplicada ${money(mora)}`}
        </>
      ) : (
        <>
          Cuota #{cuota.number} vence {cuota.diasParaVencer === 0 ? 'hoy' : `en ${cuota.diasParaVencer} día${cuota.diasParaVencer === 1 ? '' : 's'}`} ·{' '}
          {money(cuota.saldo)}
        </>
      )}
    </div>
  );
}

/** Las iniciales del negocio, que hacen de logo en la lista (ningún local sube uno propio acá). */
function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Color estable por nombre: la misma tienda siempre sale del mismo color, sin guardarlo. */
const COLORES = ['#009aff', '#7c3aed', '#059669', '#d97706', '#db2777', '#0891b2'];
function colorDe(nombre: string): string {
  let h = 0;
  for (let i = 0; i < nombre.length; i += 1) h = (h * 31 + nombre.charCodeAt(i)) % 997;
  return COLORES[h % COLORES.length];
}

/** Un local con tienda virtual, para el carrusel de descubrimiento. */
interface TiendaQuickTap {
  nombre: string;
  slug: string;
  logoUrl: string | null;
  rubro: string | null;
}

type Seccion = 'inicio' | 'tiendas' | 'entradas';

/**
 * Cuenta desde 0 hasta el saldo al entrar.
 *
 * Solo al montar y en medio segundo: es la cifra que el cliente vino a ver, así que no puede
 * hacerse esperar. Se salta entero si el sistema pide menos movimiento — ahí el número aparece
 * directo, que es lo que esa preferencia busca.
 */
function useConteo(valor: number, activo: boolean): number {
  const [n, setN] = useState(activo ? 0 : valor);
  useEffect(() => {
    if (!activo) {
      setN(valor);
      return;
    }
    const DURACION = 520;
    let raf = 0;
    const inicio = performance.now();
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / DURACION);
      // Mismo ease-out que el resto de la interfaz: arranca rápido y frena al final.
      const eased = 1 - Math.pow(1 - t, 3);
      setN(valor * eased);
      if (t < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor, activo]);
  return n;
}

export default function WalletDashboardPage() {
  useDocumentMeta(`${WALLET_NAME} — Mis compras`);
  const navigate = useNavigate();
  const [data, setData] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [abonando, setAbonando] = useState<Compra | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [seccion, setSeccion] = useState<Seccion>('inicio');
  const reducirMovimiento = useReducedMotion();
  // Directorio de locales con tienda virtual. Se pide una sola vez, sin bloquear el resto: si
  // falla, el carrusel simplemente no aparece.
  const [tiendasQuickTap, setTiendasQuickTap] = useState<TiendaQuickTap[]>([]);
  useEffect(() => {
    api
      .get('/public/wallet/stores')
      .then((r) => setTiendasQuickTap(r.data.data))
      .catch(() => undefined);
  }, []);
  // Telón de entrada: se muestra mientras cargan los datos y se levanta al terminar.
  const [intro, setIntro] = useState(true);
  const [introSaliendo, setIntroSaliendo] = useState(false);
  const montadoEn = useRef(Date.now());

  useEffect(() => {
    if (!getWalletToken()) {
      navigate('/wallet', { replace: true });
      return;
    }
    api
      .get('/public/wallet/me', { headers: { Authorization: `Bearer ${getWalletToken()}` } })
      .then((res) => setData(res.data.data))
      .catch((err) => {
        if (err.response?.status === 401) {
          clearWalletToken();
          navigate('/wallet', { replace: true });
          return;
        }
        setError('No pudimos cargar tus compras.');
      });
  }, [navigate]);

  /**
   * Mínimo que el logo se queda en pantalla. Sin esto, en una conexión rápida la
   * respuesta llega en ~150 ms y el telón sería un parpadeo, peor que no tenerlo.
   */
  const INTRO_MINIMO_MS = 2400;
  const INTRO_SALIDA_MS = 650; // debe coincidir con .wallet-intro--saliendo en index.css

  useEffect(() => {
    if (!data || introSaliendo) return;
    const restante = Math.max(0, INTRO_MINIMO_MS - (Date.now() - montadoEn.current));
    const t = setTimeout(() => setIntroSaliendo(true), restante);
    return () => clearTimeout(t);
  }, [data, introSaliendo]);

  useEffect(() => {
    if (!introSaliendo) return;
    const t = setTimeout(() => setIntro(false), INTRO_SALIDA_MS);
    return () => clearTimeout(t);
  }, [introSaliendo]);

  function recargar() {
    api
      .get('/public/wallet/me', { headers: { Authorization: `Bearer ${getWalletToken()}` } })
      .then((res) => setData(res.data.data))
      .catch(() => undefined);
  }

  function salir() {
    clearWalletToken();
    navigate('/wallet', { replace: true });
  }

  // Si falla la carga no se deja el telón puesto: el cliente tiene que ver el aviso.
  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#04070d] px-6 text-center text-white/70">
        {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-dvh bg-[#04070d]">
        <WalletIntro saliendo={false} />
      </div>
    );
  }

  const { resumen, compras } = data;

  // Las tiendas a las que les debe, que es lo que va en la lista de abajo. Se agrupa por
  // negocio: un mismo local puede tener varias compras (las fiadas ya se fusionan en una
  // cuenta, pero las de contado quedan sueltas) y el cliente piensa por tienda, no por ticket.
  const porTienda = new Map<string, { negocio: string; saldo: number; total: number; compras: Compra[] }>();
  for (const c of compras) {
    const actual = porTienda.get(c.negocio) ?? { negocio: c.negocio, saldo: 0, total: 0, compras: [] };
    actual.saldo += c.saldo;
    actual.total += c.total;
    actual.compras.push(c);
    porTienda.set(c.negocio, actual);
  }
  const tiendas = [...porTienda.values()].sort((a, b) => b.saldo - a.saldo);
  const q = busca.trim().toLowerCase();
  const tiendasVisibles = q
    ? tiendas.filter(
        (t) =>
          t.negocio.toLowerCase().includes(q) ||
          t.compras.some((c) => c.detalle.some((d) => d.toLowerCase().includes(q))),
      )
    : tiendas;

  return (
    <>
      {/* El telón sigue encima hasta que termina de levantarse; el panel ya está debajo.
          Va FUERA de .wallet-panel a propósito: ese contenedor se anima con un `transform`, y un
          transform en un ancestro hace que `position: fixed` se resuelva contra ese ancestro y
          no contra la ventana. */}
      {intro && <WalletIntro saliendo={introSaliendo} />}

      <div className="wallet-panel flex min-h-dvh flex-col bg-[#04070d] text-white">
        {/* ---------- Cabecera ---------- */}
        <div className="shrink-0 px-5 pb-5 pt-6">
          <div className="flex items-center justify-between">
            <img src={WALLET_WORDMARK_URL} alt={WALLET_NAME} className="h-6 w-auto" />
            <div className="flex items-center gap-2">
              {seccion === 'tiendas' && (
                <button
                  onClick={() => setBuscando((s) => !s)}
                  aria-label="Buscar"
                  className="wallet-tap flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08]"
                >
                  {buscando ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                </button>
              )}
              <button
                onClick={salir}
                aria-label="Salir"
                className="wallet-tap flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08]"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>

          {seccion === 'inicio' && (
            <>
              <p className="mt-7 text-[13px] font-light text-white/45">Total que debes</p>
              {/* Los centavos en chico: la cifra grande se lee de un golpe y el centavo no
                  compite con ella, igual que en las apps de banco. */}
              <SaldoAnimado monto={resumen.totalPendiente} animar={!reducirMovimiento && !intro} />
              {bs(resumen.totalPendiente, data.rateBs) && (
                <p className="mt-1 text-[13px] font-light tabular-nums text-white/45">
                  {bs(resumen.totalPendiente, data.rateBs)}
                </p>
              )}

              <div className="mt-4 flex items-center gap-2">
                <span className="rounded-full bg-white/[0.08] px-3.5 py-1.5 text-[12px] font-light text-white/70">
                  {resumen.comprasActivas === 0
                    ? 'Estás al día'
                    : `${resumen.comprasActivas} cuenta${resumen.comprasActivas === 1 ? '' : 's'} por pagar`}
                </span>
              </div>
            </>
          )}

          {/* El buscador se despliega en vez de empujar el contenido de golpe. */}
          <AnimatePresence initial={false}>
            {buscando && seccion === 'tiendas' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ height: { duration: 0.22, ease: [0.23, 1, 0.32, 1] }, opacity: { duration: 0.15 } }}
                className="overflow-hidden"
              >
                <input
                  autoFocus
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por tienda o producto…"
                  className="mt-4 w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-white/35 focus:border-[#3d9bff]"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ---------- Contenido ---------- */}
        {seccion === 'inicio' && (
          // Inicio queda en oscuro y sin la hoja: solo el saldo y el resumen. Las tiendas
          // viven en su propia sección, que sube desde abajo.
          <motion.div
            key="inicio"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
            className="flex-1 space-y-3 px-5 pb-28"
          >
            <div className="rounded-2xl bg-[#141a22] px-4 py-3">
              <div className="flex items-center justify-between py-1.5">
                <span className="flex items-center gap-2 text-sm font-light text-white/70">
                  <Wallet className="h-4 w-4 text-white/40" /> Total comprado
                </span>
                <span className="text-right text-sm font-semibold tabular-nums">
                  {bs(resumen.totalComprado, data.rateBs) || money(resumen.totalComprado)}
                  {data.rateBs && (
                    <span className="block text-[11px] font-light text-white/40">{money(resumen.totalComprado)}</span>
                  )}
                </span>
              </div>
              <div className="h-px bg-white/[0.06]" />
              <div className="flex items-center justify-between py-1.5">
                <span className="flex items-center gap-2 text-sm font-light text-white/70">
                  <TrendingUp className="h-4 w-4 text-emerald-400/70" /> Total abonado
                </span>
                <span className="text-right text-sm font-semibold tabular-nums text-emerald-400">
                  {bs(resumen.totalAbonado, data.rateBs) || money(resumen.totalAbonado)}
                  {data.rateBs && (
                    <span className="block text-[11px] font-light text-white/40">{money(resumen.totalAbonado)}</span>
                  )}
                </span>
              </div>
            </div>

            <CarruselTiendas tiendas={tiendasQuickTap} />

            {/* Atajo a las tiendas: en Inicio la deuda es un número, y esto es lo que lleva a
                ver de quién es. Hace lo mismo que el botón del menú. */}
            <button
              type="button"
              onClick={() => setSeccion('tiendas')}
              className="wallet-tap flex w-full items-center gap-3 rounded-2xl bg-[#141a22] px-4 py-3.5 text-left"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.07]">
                <Store className="h-4 w-4 text-white/60" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Tiendas</span>
                <span className="block text-[11.5px] font-light text-white/45">
                  {tiendas.length === 0
                    ? 'Todavía sin compras'
                    : `${tiendas.length} ${tiendas.length === 1 ? 'tienda' : 'tiendas'} · ver a quién le debes`}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-white/25" />
            </button>
          </motion.div>
        )}

        {seccion === 'entradas' && (
          // Entradas está a la derecha en el menú: entra desde ese lado, para que el
          // movimiento coincida con dónde se tocó.
          <motion.div
            key="entradas"
            initial={reducirMovimiento ? { opacity: 0 } : { opacity: 0, transform: 'translateX(24px)' }}
            animate={{ opacity: 1, transform: 'translateX(0px)' }}
            transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
            className="flex-1 pb-28"
          >
            <WalletEntradasPage />
          </motion.div>
        )}

        {seccion === 'tiendas' && (
          // La hoja SUBE desde abajo, como el cajón de una app: el gesto explica de dónde
          // salió y a dónde vuelve al cerrarla. La curva es la de iOS para cajones —más
          // decidida al arrancar que el ease-out normal— y el alto queda debajo del saldo,
          // que sigue a la vista.
          <motion.div
            key="tiendas"
            initial={reducirMovimiento ? { opacity: 0 } : { transform: 'translateY(100%)' }}
            animate={{ opacity: 1, transform: 'translateY(0%)' }}
            transition={{ duration: 0.42, ease: [0.32, 0.72, 0, 1] }}
            className="flex-1 rounded-t-[26px] bg-white px-5 pb-28 pt-4 text-brand-950 shadow-[0_-16px_40px_-12px_rgba(0,0,0,0.6)]"
          >
            {/* Tirador: la señal universal de "esto es una hoja que se puede bajar". */}
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-brand-950/15" />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-bold">Tiendas</h2>
              <span className="text-[12px] font-light text-brand-950/45">
                {tiendas.length} {tiendas.length === 1 ? 'tienda' : 'tiendas'}
              </span>
            </div>

            {tiendasVisibles.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-brand-950/15 py-10 text-center text-sm font-light text-brand-950/40">
                {q ? 'Nada coincide con tu búsqueda.' : 'Todavía no tienes compras registradas.'}
              </p>
            ) : (
              <ul className="space-y-1">
                {tiendasVisibles.map((t, i) => {
                  const abiertaAqui = abierta === t.negocio;
                  return (
                    // --i escalona la entrada: la lista aparece en cascada, no de golpe.
                    <li key={t.negocio} className="wallet-fila" style={{ '--i': i } as React.CSSProperties}>
                      <button
                        type="button"
                        onClick={() => setAbierta(abiertaAqui ? null : t.negocio)}
                        className="wallet-tap flex w-full items-center gap-3 rounded-2xl px-1.5 py-3 text-left hover:bg-brand-950/[0.03]"
                      >
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                          style={{ background: colorDe(t.negocio) }}
                        >
                          {iniciales(t.negocio)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px] font-semibold">{t.negocio}</span>
                          <span className="block text-[11.5px] font-light text-brand-950/45">
                            {t.compras.length} compra{t.compras.length === 1 ? '' : 's'}
                            {t.saldo <= 0 && ' · al día'}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span
                            className={`block text-[14.5px] font-bold tabular-nums ${
                              t.saldo > 0 ? 'text-brand-950' : 'text-emerald-600'
                            }`}
                          >
                            {t.saldo > 0 ? `-${money(t.saldo)}` : 'Pagado'}
                          </span>
                        </span>
                        <ChevronRight
                          className={`h-4 w-4 shrink-0 text-brand-950/25 transition-transform ${abiertaAqui ? 'rotate-90' : ''}`}
                        />
                      </button>

                      {/* Desplegar la tienda anima el alto en vez de aparecer de golpe: sin
                          esto la lista salta y el dedo pierde la fila que acaba de tocar.
                          AnimatePresence es lo que permite animar también el cierre. */}
                      <AnimatePresence initial={false}>
                        {abiertaAqui && (
                          <motion.div
                            key="detalle"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{
                              height: { duration: 0.26, ease: [0.23, 1, 0.32, 1] },
                              // La opacidad entra más lenta y sale antes que el alto: si no, el
                              // contenido se ve comprimido mientras la caja todavía se cierra.
                              opacity: { duration: 0.18 },
                            }}
                            className="overflow-hidden"
                          >
                            <div className="mb-2 space-y-2 pl-[3.25rem] pr-1.5 pt-1">
                              {t.compras.map((c) => (
                                <DetalleCompra key={c.id} compra={c} rateBs={data.rateBs} onAbonar={() => setAbonando(c)} />
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        )}

        {/* ---------- Menú flotante ---------- */}
        <nav className="fixed inset-x-0 bottom-5 z-30 flex justify-center px-5">
          <div className="flex items-center gap-1 rounded-full bg-[#12181f] p-1.5 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.8)] ring-1 ring-white/[0.08]">
            <BotonMenu icono={Home} label="Inicio" activo={seccion === 'inicio'} onClick={() => setSeccion('inicio')} />
            <BotonMenu icono={Store} label="Tiendas" activo={seccion === 'tiendas'} onClick={() => setSeccion('tiendas')} />
            <BotonMenu icono={Ticket} label="Entradas" activo={seccion === 'entradas'} onClick={() => setSeccion('entradas')} />
          </div>
        </nav>
      </div>

      {aviso && (
        <div className="wallet-toast fixed inset-x-4 bottom-24 z-50 rounded-2xl bg-emerald-500 px-4 py-3 text-center text-[13px] font-medium text-white shadow-lg">
          {aviso}
        </div>
      )}

      {abonando && (
        <AbonarDialog
          compraId={abonando.id}
          negocio={abonando.negocio}
          saldo={abonando.saldo}
          rateBs={data.rateBs}
          cuotas={abonando.cuotas}
          onClose={() => setAbonando(null)}
          onListo={() => {
            setAbonando(null);
            setAviso('Abono reportado. El negocio lo verificará en breve.');
            window.setTimeout(() => setAviso(null), 5000);
            recargar();
          }}
        />
      )}
    </>
  );
}

/** La cifra grande del saldo, contando al entrar. Los centavos van en chico: la cifra se lee
 *  de un golpe y el centavo no compite con ella, igual que en las apps de banco. */
function SaldoAnimado({ monto, animar }: { monto: number; animar: boolean }) {
  const n = useConteo(monto, animar);
  return (
    <p className="mt-1.5 flex items-baseline gap-1 font-bold tabular-nums">
      {/* tracking cerrado: a este tamaño el espaciado por defecto separa demasiado los dígitos
          y la cifra deja de leerse como un solo número. */}
      <span className="text-[64px] leading-[0.95] tracking-[-0.03em]">
        ${Math.floor(n).toLocaleString('es-VE')}
      </span>
      <span className="text-[28px] leading-none text-white/40">.{(n % 1).toFixed(2).slice(2)}</span>
    </p>
  );
}

function BotonMenu({
  icono: Icono,
  label,
  activo,
  onClick,
}: {
  icono: typeof Home;
  label: string;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={activo}
      className="wallet-tap relative flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[12.5px] font-semibold"
    >
      {/* La pastilla blanca se DESLIZA de una sección a la otra en vez de apagarse acá y
          encenderse allá: con layoutId, Motion interpola la misma caja entre los dos botones,
          que es lo que hace leer el menú como una sola pieza y no como dos luces. */}
      {activo && (
        <motion.span
          layoutId="wallet-menu-activo"
          className="absolute inset-0 rounded-full bg-white"
          transition={{ type: 'spring', duration: 0.4, bounce: 0.15 }}
        />
      )}
      <span className={`relative z-10 flex items-center gap-1.5 transition-colors duration-200 ${activo ? 'text-[#04070d]' : 'text-white/55'}`}>
        <Icono className="h-4 w-4" />
        {label}
      </span>
    </button>
  );
}

/**
 * Carrusel de locales con tienda virtual en QuickTap.
 *
 * Va debajo de las tiendas a las que el cliente le debe: primero lo suyo, después a dónde más
 * puede comprar. Se desplaza a lo ancho porque son fichas cuadradas y una lista vertical las
 * volvería una pared de logos.
 */
function CarruselTiendas({ tiendas }: { tiendas: TiendaQuickTap[] }) {
  if (tiendas.length === 0) return null;
  return (
    <section className="pt-1">
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="text-[15px] font-bold text-white">Tiendas en QuickTap</h2>
        <span className="text-[12px] font-light text-white/40">{tiendas.length}</span>
      </div>
      {/* Los márgenes negativos dejan que las fichas lleguen al borde de la pantalla al
          desplazarse, en vez de cortarse contra el padding de la hoja. snap para que no
          queden fichas a medio ver. */}
      <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tiendas.map((t, i) => (
          <a
            key={t.slug}
            href={`/tienda/${t.slug}`}
            target="_blank"
            rel="noreferrer"
            className="wallet-fila wallet-tap w-[5.5rem] shrink-0 snap-start"
            style={{ '--i': i } as React.CSSProperties}
          >
            <IconoTienda tienda={t} />
            <p className="mt-1.5 truncate text-center text-[11px] font-medium text-white/65">{t.nombre}</p>
          </a>
        ))}
      </div>
    </section>
  );
}

/** Emoji del rubro, para que la ficha diga de qué es la tienda de un vistazo. */
const EMOJI_RUBRO: Record<string, string> = {
  agencia_publicidad: '📢', cafeteria: '☕', carniceria: '🥩', estetica: '✨', decoracion: '🖼️',
  electrodomesticos: '🔌', ferreteria: '🔧', fruteria: '🍎', informatica: '💻', joyeria: '💍',
  libreria: '📚', marroquineria: '👜', mueblerias: '🛋️', optica: '👓', panaderia: '🥐',
  perfumeria: '💄', belleza: '💇', supermercado: '🛒', deportivos: '🏀', petshop: '🐾',
  ropa: '👕', telefonia: '📱', vivero: '🌿', zapateria: '👟', tickera: '🎟️',
};

/**
 * La ficha cuadrada de una tienda: su logo si lo tiene y, si no, un cuadro de color con el
 * emoji del rubro y sus iniciales. Casi ningún local sube logo, así que sin esto el carrusel
 * sería una fila de cuadros grises iguales.
 */
function IconoTienda({ tienda }: { tienda: TiendaQuickTap }) {
  const emoji = tienda.rubro ? EMOJI_RUBRO[tienda.rubro] : undefined;
  if (tienda.logoUrl) {
    return (
      <div className="aspect-square w-full overflow-hidden rounded-2xl bg-white/[0.06] ring-1 ring-white/[0.08]">
        <img src={tienda.logoUrl} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div
      className="flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-2xl text-white"
      style={{ background: `linear-gradient(145deg, ${colorDe(tienda.nombre)}, ${colorDe(tienda.nombre)}cc)` }}
    >
      {emoji ? <span className="text-[22px] leading-none">{emoji}</span> : null}
      <span className="text-[11px] font-bold leading-none">{iniciales(tienda.nombre)}</span>
    </div>
  );
}

/** El detalle de una compra dentro de su tienda: qué se llevó, cuánto falta y cómo pagarlo. */
function DetalleCompra({
  compra,
  rateBs,
  onAbonar,
}: {
  compra: Compra;
  rateBs: number | null;
  onAbonar: () => void;
}) {
  const wa = whatsappDelNegocio(compra);
  return (
    <div className="rounded-2xl bg-brand-950/[0.035] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-light tabular-nums text-brand-950/40">{fechaHora(compra.ultimaCompra)}</p>
          <p className="mt-0.5 truncate text-[12.5px] font-light text-brand-950/70">{compra.detalle.join(', ')}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[13.5px] font-bold tabular-nums">{money(compra.total)}</p>
          {compra.saldo > 0 ? (
            <p className="text-[11px] font-medium text-amber-600">Faltan {money(compra.saldo)}</p>
          ) : (
            <p className="text-[11px] font-medium text-emerald-600">Pagada</p>
          )}
        </div>
      </div>

      {bs(compra.saldo, rateBs) && compra.saldo > 0 && (
        <p className="mt-1 text-[11px] font-light tabular-nums text-brand-950/40">
          {bs(compra.saldo, rateBs)}
        </p>
      )}

      {compra.proximaCuota && <AvisoCuota cuota={compra.proximaCuota} mora={compra.mora} />}

      {compra.cuotas.length > 0 && (
        <div className="mt-2.5 space-y-1 border-t border-brand-950/[0.07] pt-2.5">
          {compra.cuotas.map((q) => (
            <div key={q.id} className="flex items-center justify-between text-[11px]">
              <span className="font-light text-brand-950/50">
                Cuota #{q.number} · {fechaCorta(q.dueDate)}
              </span>
              <span
                className="font-semibold tabular-nums"
                style={{
                  color:
                    q.estado === 'PAGADA'
                      ? '#059669'
                      : q.estado === 'VENCIDA'
                        ? '#dc2626'
                        : q.estado === 'POR_VENCER'
                          ? '#d97706'
                          : 'rgba(0,27,67,0.6)',
                }}
              >
                {q.estado === 'PAGADA' ? 'Pagada' : money(q.saldo)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        {compra.saldo > 0 && (
          <button
            onClick={onAbonar}
            className="wallet-tap flex-1 rounded-full py-2 text-[12.5px] font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #009aff 0%, #056CF2 100%)' }}
          >
            Pagar
          </button>
        )}
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className={`wallet-tap flex items-center justify-center gap-1.5 rounded-full border border-brand-950/12 py-2 text-[12.5px] font-semibold text-brand-950/70 hover:bg-brand-950/[0.04] ${
              compra.saldo > 0 ? 'px-3.5' : 'flex-1'
            }`}
          >
            <MessageCircle className="h-4 w-4" />
            {compra.saldo > 0 ? '' : 'Escribirle al negocio'}
          </a>
        )}
      </div>
    </div>
  );
}
