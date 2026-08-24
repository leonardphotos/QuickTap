import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, MessageCircle, Search, TrendingUp, Wallet } from 'lucide-react';
import { api } from '@/api/client';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { PASS_NAME, PASS_WORDMARK_URL } from './passBrand';
import { clearPassToken, getPassToken } from './passSession';
import { AbonarDialog } from './AbonarDialog';
import { PassIntro } from './PassIntro';

/**
 * Panel del cliente en QuickTap Pass.
 *
 * Tema oscuro a propósito, y solo acá: es un portal de consulta financiera para el comprador,
 * no una pantalla de trabajo del negocio. El resto de QuickTap sigue en claro.
 *
 * Cada compra se presenta como una meta con su barra de progreso — es la forma más directa de
 * responder lo único que el cliente viene a preguntar: cuánto llevo y cuánto me falta.
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

/** Fecha y hora en que se hizo la compra. `Order.time` viene como instante ISO completo, así
 *  que se formatea directo (a diferencia de las cuotas, que son solo fecha). */
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
        background: vencida ? 'rgba(239,68,68,0.12)' : 'rgba(255,193,7,0.12)',
        color: vencida ? '#fca5a5' : '#fcd34d',
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

export default function PassDashboardPage() {
  useDocumentMeta(`${PASS_NAME} — Mis compras`);
  const navigate = useNavigate();
  const [data, setData] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [abonando, setAbonando] = useState<Compra | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Telón de entrada: se muestra mientras cargan los datos y se levanta al terminar.
  const [intro, setIntro] = useState(true);
  const [introSaliendo, setIntroSaliendo] = useState(false);
  const montadoEn = useRef(Date.now());

  useEffect(() => {
    if (!getPassToken()) {
      navigate('/pass', { replace: true });
      return;
    }
    api
      .get('/public/pass/me', { headers: { Authorization: `Bearer ${getPassToken()}` } })
      .then((res) => setData(res.data.data))
      .catch((err) => {
        if (err.response?.status === 401) {
          clearPassToken();
          navigate('/pass', { replace: true });
          return;
        }
        setError('No pudimos cargar tus compras.');
      });
  }, [navigate]);

  /**
   * Mínimo que el logo se queda en pantalla. Sin esto, en una conexión rápida la
   * respuesta llega en ~150 ms y el telón sería un parpadeo blanco, peor que no tenerlo.
   * Da tiempo a que el logo termine de entrar (~880 ms) y se quede un rato a la vista.
   */
  const INTRO_MINIMO_MS = 2400;
  const INTRO_SALIDA_MS = 650; // debe coincidir con .pass-intro--saliendo en index.css

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
      .get('/public/pass/me', { headers: { Authorization: `Bearer ${getPassToken()}` } })
      .then((res) => setData(res.data.data))
      .catch(() => undefined);
  }

  function salir() {
    clearPassToken();
    navigate('/pass', { replace: true });
  }

  // Si falla la carga no se deja el telón puesto: el cliente tiene que ver el aviso.
  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#0b0f14] px-6 text-center text-white/70">
        {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-dvh bg-[#04070d]">
        <PassIntro saliendo={false} />
      </div>
    );
  }

  const { resumen, compras } = data;
  const visibles = busca.trim()
    ? compras.filter(
        (c) =>
          c.negocio.toLowerCase().includes(busca.trim().toLowerCase()) ||
          c.detalle.some((d) => d.toLowerCase().includes(busca.trim().toLowerCase())),
      )
    : compras;

  return (
    <>
      {/* El telón sigue encima hasta que termina de levantarse; el panel ya está debajo.
          Va FUERA de .pass-panel a propósito: ese contenedor se anima con un `transform`, y un
          transform en un ancestro hace que `position: fixed` se resuelva contra ese ancestro y
          no contra la ventana. Como .pass-panel mide todo el alto del contenido, el telón se
          centraba respecto a esa altura completa y el logo aparecía muy abajo. */}
      {intro && <PassIntro saliendo={introSaliendo} />}
    <div className="pass-panel min-h-dvh bg-[#0b0f14] pb-16 text-white">
      {/* Cabecera con el degradado de marca, como el hero del mockup. */}
      <div
        className="rounded-b-[28px] px-5 pb-8 pt-6"
        style={{ background: 'linear-gradient(180deg, #04070d 0%, #062247 42%, #0b5fd0 78%, #009aff 100%)' }}
      >
        <div className="flex items-center justify-between">
          {/* La marca de Pass ya viene en blanco: no se invierte como el logo de QuickTap. */}
          <img src={PASS_WORDMARK_URL} alt={PASS_NAME} className="h-8 w-auto" />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBuscando((s) => !s)}
              aria-label="Buscar"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              onClick={salir}
              aria-label="Salir"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        <p className="mt-6 text-sm font-light text-white/70">Hola</p>
        <h1 className="text-2xl font-bold leading-tight">{data.cliente.nombre}</h1>

        {buscando && (
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por negocio o producto…"
            className="mt-4 w-full rounded-xl border border-white/25 bg-white/15 px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none backdrop-blur-sm"
          />
        )}

        {/* Tarjeta principal: lo que debe, que es la cifra que viene a ver. */}
        <div className="mt-5 rounded-[20px] bg-[#0e141b]/90 p-4 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.8)] backdrop-blur-sm">
          <p className="text-xs font-light text-white/50">Saldo pendiente</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{bs(resumen.totalPendiente, data.rateBs) || money(resumen.totalPendiente)}</p>
          {data.rateBs && <p className="text-sm font-light tabular-nums text-white/55">{money(resumen.totalPendiente)}</p>}
          <p className="mt-1 text-[11px] font-light text-white/40">
            {resumen.comprasActivas === 0
              ? 'No tienes compras pendientes'
              : `${resumen.comprasActivas} compra${resumen.comprasActivas === 1 ? '' : 's'} por pagar`}
          </p>
        </div>
      </div>

      <div className="space-y-3 px-5 pt-5">
        {/* Comprado y abonado, como las filas de ingresos/gastos del mockup. */}
        <div className="rounded-2xl bg-[#141a22] px-4 py-3">
          <div className="flex items-center justify-between py-1.5">
            <span className="flex items-center gap-2 text-sm font-light text-white/70">
              <Wallet className="h-4 w-4 text-white/40" /> Total comprado
            </span>
            <span className="text-right text-sm font-semibold tabular-nums">
              {bs(resumen.totalComprado, data.rateBs) || money(resumen.totalComprado)}
              {data.rateBs && <span className="block text-[11px] font-light text-white/40">{money(resumen.totalComprado)}</span>}
            </span>
          </div>
          <div className="h-px bg-white/[0.06]" />
          <div className="flex items-center justify-between py-1.5">
            <span className="flex items-center gap-2 text-sm font-light text-white/70">
              <TrendingUp className="h-4 w-4 text-emerald-400/70" /> Total abonado
            </span>
            <span className="text-right text-sm font-semibold tabular-nums text-emerald-400">
              {bs(resumen.totalAbonado, data.rateBs) || money(resumen.totalAbonado)}
              {data.rateBs && <span className="block text-[11px] font-light text-white/40">{money(resumen.totalAbonado)}</span>}
            </span>
          </div>
        </div>

        <h2 className="pt-3 text-lg font-semibold">Mis compras</h2>

        {visibles.length === 0 && (
          <p className="rounded-2xl bg-[#141a22] px-4 py-6 text-center text-sm font-light text-white/40">
            {busca.trim() ? 'Nada coincide con tu búsqueda.' : 'Todavía no tienes compras registradas.'}
          </p>
        )}

        {visibles.map((c) => {
          const abierto = abierta === c.id;
          return (
            <div key={c.id} className="rounded-2xl bg-[#141a22] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{c.negocio}</p>
                    {c.saldo <= 0 && (
                      <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-emerald-300">
                        Pagada
                      </span>
                    )}
                  </div>
                  {/* Cuándo se hizo la compra: es lo primero que el cliente busca para
                      reconocerla, sobre todo si tiene varias del mismo negocio. */}
                  <p className="mt-0.5 text-[10.5px] font-light tabular-nums text-white/35">{fechaHora(c.ultimaCompra)}</p>
                  <p className="mt-0.5 truncate text-[11px] font-light text-white/45">{c.detalle.join(', ')}</p>
                </div>
                {(c.cuotas.length > 0 || c.lineas.length > 0) && (
                  <button
                    onClick={() => setAbierta(abierto ? null : c.id)}
                    className="shrink-0 text-[11px] font-medium text-[#4db5ff]"
                  >
                    {abierto ? 'Ocultar' : 'Más detalles'}
                  </button>
                )}
              </div>

              {/* Barra de progreso con las marcas 0 / actual / 100, como las metas del mockup. */}
              <div className="mt-3">
                <div className="flex items-baseline justify-between text-[10px] font-light text-white/40">
                  <span>0%</span>
                  <span className="text-[11px] font-semibold text-white/80">{c.progreso}%</span>
                  <span>100%</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{
                      width: `${c.progreso}%`,
                      background: 'linear-gradient(90deg, #009aff 0%, #4db5ff 100%)',
                    }}
                  />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <p className="font-light text-white/40">Total</p>
                  <p className="font-semibold tabular-nums">{bs(c.total, data.rateBs) || money(c.total)}</p>
                  {data.rateBs && <p className="font-light tabular-nums text-white/35">{money(c.total)}</p>}
                </div>
                <div>
                  <p className="font-light text-white/40">Abonado</p>
                  <p className="font-semibold tabular-nums text-emerald-400">{bs(c.abonado, data.rateBs) || money(c.abonado)}</p>
                  {data.rateBs && <p className="font-light tabular-nums text-white/35">{money(c.abonado)}</p>}
                </div>
                <div>
                  <p className="font-light text-white/40">Te falta</p>
                  <p className="font-semibold tabular-nums">{bs(c.saldo, data.rateBs) || money(c.saldo)}</p>
                  {data.rateBs && <p className="font-light tabular-nums text-white/35">{money(c.saldo)}</p>}
                </div>
              </div>

              {c.proximaCuota && <AvisoCuota cuota={c.proximaCuota} mora={c.mora} />}

              {/* Abonar solo si queda saldo; escribirle al negocio, siempre que tenga WhatsApp
                  cargado — también sirve para reclamar una compra que el cliente no reconoce. */}
              <div className="mt-3 flex gap-2">
                {c.saldo > 0 && (
                  <button
                    onClick={() => setAbonando(c)}
                    className="flex-1 rounded-full py-2.5 text-[13px] font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg, #009aff 0%, #056CF2 100%)' }}
                  >
                    Pagar
                  </button>
                )}
                {whatsappDelNegocio(c) && (
                  <a
                    href={whatsappDelNegocio(c)!}
                    target="_blank"
                    rel="noreferrer"
                    className={`flex items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] py-2.5 text-[13px] font-semibold text-white/80 transition-colors hover:bg-white/10 ${
                      c.saldo > 0 ? 'px-4' : 'flex-1'
                    }`}
                  >
                    <MessageCircle className="h-4 w-4" />
                    {c.saldo > 0 ? '' : 'Escribirle al negocio'}
                  </a>
                )}
              </div>

              {abierto && (
                <div className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3">
                  {/* Qué se llevó y cuándo: una cuenta fiada junta las compras de varios días,
                      así que cada línea va con su fecha. */}
                  {c.lineas.length > 0 && (
                    <div className="mb-3 space-y-1">
                      {c.lineas.map((l, i) => (
                        <div key={i} className="flex items-baseline justify-between gap-3 text-[11px]">
                          <span className="min-w-0 truncate font-light text-white/60">{l.texto}</span>
                          <span className="shrink-0 tabular-nums text-white/35">{fechaHora(l.fecha)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {c.cuotas.map((q) => (
                    <div key={q.id} className="flex items-center justify-between text-[11px]">
                      <span className="font-light text-white/50">
                        Cuota #{q.number} · {fechaCorta(q.dueDate)}
                      </span>
                      <span
                        className="font-semibold tabular-nums"
                        style={{
                          color:
                            q.estado === 'PAGADA'
                              ? '#34d399'
                              : q.estado === 'VENCIDA'
                                ? '#fca5a5'
                                : q.estado === 'POR_VENCER'
                                  ? '#fcd34d'
                                  : 'rgba(255,255,255,0.75)',
                        }}
                      >
                        {q.estado === 'PAGADA' ? 'Pagada' : bs(q.saldo, data.rateBs) || money(q.saldo)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {aviso && (
        <div className="fixed inset-x-4 bottom-6 z-50 rounded-2xl bg-emerald-500 px-4 py-3 text-center text-[13px] font-medium text-white shadow-lg">
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
    </div>
    </>
  );
}
