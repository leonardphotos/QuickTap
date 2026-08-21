import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Search, TrendingUp, Wallet } from 'lucide-react';
import { api } from '@/api/client';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { PASS_LOGO_URL, PASS_NAME } from './passBrand';
import { clearPassToken, getPassToken } from './passSession';
import { AbonarDialog } from './AbonarDialog';

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
  fecha: string;
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
  resumen: { totalComprado: number; totalAbonado: number; totalPendiente: number; comprasActivas: number };
  compras: Compra[];
}

const money = (n: number) => `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fechaCorta = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });

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

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#0b0f14] px-6 text-center text-white/70">
        {error}
      </div>
    );
  }
  if (!data) {
    return <div className="flex min-h-dvh items-center justify-center bg-[#0b0f14] text-sm text-white/40">Cargando…</div>;
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
    <div className="min-h-dvh bg-[#0b0f14] pb-16 text-white">
      {/* Cabecera con el degradado de marca, como el hero del mockup. */}
      <div
        className="rounded-b-[28px] px-5 pb-8 pt-6"
        style={{ background: 'linear-gradient(135deg, #009aff 0%, #056CF2 55%, #001b43 100%)' }}
      >
        <div className="flex items-center justify-between">
          <img src={PASS_LOGO_URL} alt={PASS_NAME} className="h-7 w-auto brightness-0 invert" />
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
          <p className="mt-1 text-3xl font-bold tabular-nums">{money(resumen.totalPendiente)}</p>
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
            <span className="text-sm font-semibold tabular-nums">{money(resumen.totalComprado)}</span>
          </div>
          <div className="h-px bg-white/[0.06]" />
          <div className="flex items-center justify-between py-1.5">
            <span className="flex items-center gap-2 text-sm font-light text-white/70">
              <TrendingUp className="h-4 w-4 text-emerald-400/70" /> Total abonado
            </span>
            <span className="text-sm font-semibold tabular-nums text-emerald-400">{money(resumen.totalAbonado)}</span>
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
                  <p className="truncate text-sm font-semibold">{c.negocio}</p>
                  <p className="mt-0.5 truncate text-[11px] font-light text-white/45">{c.detalle.join(', ')}</p>
                </div>
                {c.cuotas.length > 0 && (
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
                  <p className="font-semibold tabular-nums">{money(c.total)}</p>
                </div>
                <div>
                  <p className="font-light text-white/40">Abonado</p>
                  <p className="font-semibold tabular-nums text-emerald-400">{money(c.abonado)}</p>
                </div>
                <div>
                  <p className="font-light text-white/40">Te falta</p>
                  <p className="font-semibold tabular-nums">{money(c.saldo)}</p>
                </div>
              </div>

              {c.proximaCuota && <AvisoCuota cuota={c.proximaCuota} mora={c.mora} />}

              {c.saldo > 0 && (
                <button
                  onClick={() => setAbonando(c)}
                  className="mt-3 w-full rounded-full py-2.5 text-[13px] font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg, #009aff 0%, #056CF2 100%)' }}
                >
                  Abonar o pagar completo
                </button>
              )}

              {abierto && (
                <div className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3">
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
                        {q.estado === 'PAGADA' ? 'Pagada' : money(q.saldo)}
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
  );
}
