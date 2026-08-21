import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { api } from '@/api/client';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { PASS_LOGO_URL, PASS_NAME } from './passBrand';
import { clearPassToken, getPassToken } from './passSession';

/**
 * Panel del cliente en QuickTap Pass.
 *
 * Tema oscuro con tarjetas y barras de progreso, en los azules de QuickTap. Es un portal de
 * consulta: acá el cliente no paga ni modifica nada, solo entiende cuánto lleva y cuánto le
 * falta, así que todo el peso visual va a los números y al progreso.
 */

interface Cuota {
  id: string;
  number: number;
  amount: number;
  dueDate: string;
  saldo: number;
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

const money = (n: number) => `$${n.toFixed(2)}`;

const fechaCorta = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Aviso de la cuota que viene, que es la razón de ser del portal para el cliente. */
function AvisoCuota({ cuota }: { cuota: Cuota }) {
  if (cuota.estado === 'VENCIDA') {
    return (
      <p className="mt-3 rounded-xl bg-red-500/15 px-3 py-2 text-[11px] font-medium text-red-300">
        Cuota #{cuota.number} vencida hace {Math.abs(cuota.diasParaVencer)} día
        {Math.abs(cuota.diasParaVencer) === 1 ? '' : 's'} · {money(cuota.saldo)}
      </p>
    );
  }
  return (
    <p className="mt-3 rounded-xl bg-amber-400/15 px-3 py-2 text-[11px] font-medium text-amber-200">
      Cuota #{cuota.number} vence en {cuota.diasParaVencer} día{cuota.diasParaVencer === 1 ? '' : 's'} ·{' '}
      {money(cuota.saldo)} — evita el recargo por mora
    </p>
  );
}

export default function PassDashboardPage() {
  useDocumentMeta(`${PASS_NAME} — Mis compras`);
  const navigate = useNavigate();
  const [data, setData] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

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
        setError('No pudimos cargar tus compras. Intenta de nuevo.');
      });
  }, [navigate]);

  function salir() {
    clearPassToken();
    navigate('/pass', { replace: true });
  }

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#0a1526] px-6 text-center text-sm text-white/70">
        {error}
      </div>
    );
  }
  if (!data) {
    return <div className="min-h-dvh bg-[#0a1526]" />;
  }

  const { resumen, compras } = data;

  return (
    <div className="min-h-dvh bg-[#0a1526] pb-16 text-white">
      <div className="mx-auto w-full max-w-lg px-5 pt-8">
        <div className="flex items-center justify-between">
          <img src={PASS_LOGO_URL} alt={PASS_NAME} className="h-7 w-auto brightness-0 invert" />
          <button
            onClick={salir}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/70 transition-colors hover:bg-white/15"
            aria-label="Salir"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        <h1 className="mt-6 text-[26px] font-light leading-tight text-white/70">
          Hola
          <br />
          <span className="font-bold text-white">{data.cliente.nombre}</span>
        </h1>

        {/* Tarjeta principal: lo que debe, que es lo primero que el cliente viene a ver. */}
        <div
          className="mt-5 rounded-[22px] p-5 shadow-[0_20px_50px_-24px_rgba(5,108,242,0.8)]"
          style={{ background: 'linear-gradient(135deg, #056CF2 0%, #0597F2 55%, #38bdf8 100%)' }}
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/70">Total pendiente</p>
          <p className="mt-1 text-[34px] font-bold leading-none">{money(resumen.totalPendiente)}</p>
          <p className="mt-2 text-xs font-light text-white/75">
            {resumen.comprasActivas === 0
              ? 'No tienes compras por pagar'
              : `${resumen.comprasActivas} compra${resumen.comprasActivas === 1 ? '' : 's'} en curso`}
          </p>
        </div>

        <div className="mt-3 space-y-2 rounded-[18px] bg-white/[0.06] p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-light text-white/55">Total comprado</span>
            <span className="font-semibold">{money(resumen.totalComprado)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-light text-white/55">Total abonado</span>
            <span className="font-semibold text-sky-300">{money(resumen.totalAbonado)}</span>
          </div>
        </div>

        <h2 className="mt-8 text-lg font-semibold">Mis compras</h2>

        {compras.length === 0 ? (
          <p className="mt-3 rounded-[18px] bg-white/[0.06] px-4 py-6 text-center text-sm font-light text-white/50">
            Todavía no tienes compras registradas con este teléfono.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {compras.map((c) => (
              <div key={c.id} className="rounded-[18px] bg-white/[0.06] p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold">{c.negocio}</p>
                  <button
                    onClick={() => setAbierta(abierta === c.id ? null : c.id)}
                    className="shrink-0 text-[11px] font-medium text-sky-300"
                  >
                    {abierta === c.id ? 'Ocultar' : 'Más detalles'}
                  </button>
                </div>
                <p className="mt-0.5 truncate text-[11px] font-light text-white/45">{c.detalle.join(', ')}</p>

                <p className="mt-3 text-[10px] font-light text-white/45">Progreso</p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full transition-[width] duration-700"
                      style={{
                        width: `${c.progreso}%`,
                        background: 'linear-gradient(90deg, #056CF2 0%, #38bdf8 100%)',
                      }}
                    />
                  </div>
                  <span className="w-9 shrink-0 text-right text-[11px] font-semibold text-sky-300">{c.progreso}%</span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <p className="font-light text-white/45">Total</p>
                    <p className="font-semibold">{money(c.total)}</p>
                  </div>
                  <div>
                    <p className="font-light text-white/45">Abonado</p>
                    <p className="font-semibold">{money(c.abonado)}</p>
                  </div>
                  <div>
                    <p className="font-light text-white/45">Te falta</p>
                    <p className="font-semibold">{money(c.saldo)}</p>
                  </div>
                </div>

                {c.mora > 0 && (
                  <p className="mt-2 text-[11px] font-medium text-red-300">Incluye {money(c.mora)} de mora</p>
                )}

                {c.proximaCuota && <AvisoCuota cuota={c.proximaCuota} />}

                {abierta === c.id && c.cuotas.length > 0 && (
                  <div className="mt-4 space-y-1.5 border-t border-white/10 pt-3">
                    {c.cuotas.map((q) => (
                      <div key={q.id} className="flex items-center justify-between gap-3 text-[11px]">
                        <span className="font-light text-white/50">
                          Cuota #{q.number} · {fechaCorta(q.dueDate)}
                        </span>
                        <span
                          className={
                            q.estado === 'PAGADA'
                              ? 'font-semibold text-emerald-400'
                              : q.estado === 'VENCIDA'
                                ? 'font-semibold text-red-300'
                                : 'font-semibold text-white/80'
                          }
                        >
                          {q.estado === 'PAGADA' ? 'Pagada' : money(q.saldo)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
