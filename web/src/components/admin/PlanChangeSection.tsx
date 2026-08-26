import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Crown, Paperclip } from 'lucide-react';
import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';

/**
 * "Mi plan" en Ajustes — compartida por los tres verticales (restaurante, local, cancha).
 *
 * Muestra el plan actual (precio, vencimiento, beneficios) y los planes superiores del mismo
 * vertical. La mejora paga SOLO la diferencia prorrateada por los días restantes del período
 * ya pagado — el monto que se ve acá es informativo: el servidor lo recalcula al crear la
 * solicitud, y nada se activa hasta que el equipo QuickTap verifique el pago (misma bandeja
 * que las renovaciones, ver plan-request.service.createUpgrade).
 */

interface Superior {
  plan: string;
  nombre: string;
  subtitulo: string;
  beneficios: string[];
  mensualUsd: number;
  pagoHoyUsd: number | null;
}

interface Inferior {
  plan: string;
  nombre: string;
  subtitulo: string;
  beneficios: string[];
  mensualUsd: number;
}

interface MiPlan {
  plan: string | null;
  billingCycle: string;
  periodEnd: string;
  activo: boolean;
  diasRestantes: number;
  mensualUsd: number | null;
  nombre: string | null;
  subtitulo: string;
  beneficios: string[];
  superiores: Superior[];
  inferiores: Inferior[];
  bajaPendiente: { plan: string; nombre: string } | null;
}

interface DatosPago {
  pagoMovil?: { banco?: string; telefono?: string; cedula?: string; titular?: string };
  binance?: { id?: string; correo?: string };
  bankTransfer?: { banco?: string; cuenta?: string; titular?: string; rif?: string };
}

const METODOS = [
  { id: 'PAGO_MOVIL', label: 'Pago Móvil' },
  { id: 'BINANCE', label: 'Binance' },
  { id: 'BANK_TRANSFER', label: 'Transferencia' },
] as const;

const CICLOS: Record<string, string> = {
  MONTHLY: 'mensual',
  QUARTERLY: 'trimestral',
  SEMIANNUAL: 'semestral',
  ANNUAL: 'anual',
};

export function PlanChangeSection({ onGoToBilling }: { onGoToBilling?: () => void }) {
  const [datos, setDatos] = useState<MiPlan | null>(null);
  const [pago, setPago] = useState<DatosPago>({});
  const [abierto, setAbierto] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<(typeof METODOS)[number]['id']>('PAGO_MOVIL');
  const [referencia, setReferencia] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [bajando, setBajando] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function recargar() {
    api.get('/plan-requests/my-plan').then((r) => setDatos(r.data.data)).catch(() => undefined);
  }

  useEffect(() => {
    api.get('/plan-requests/my-plan').then((r) => setDatos(r.data.data)).catch(() => undefined);
    api.get('/public/payment-methods').then((r) => setPago(r.data.data ?? {})).catch(() => undefined);
  }, []);

  if (!datos) return null;

  /**
   * Baja de plan: sin cobro y sin devolución — el plan actual (ya pagado) sigue hasta su
   * vencimiento y la próxima renovación se cobra con el plan menor. Confirmación explícita
   * porque es la parte fácil de malentender.
   */
  async function bajarA(plan: string, nombre: string, mensual: number) {
    if (
      !window.confirm(
        `¿Bajar a ${nombre}?\n\nNo hay devolución: tu plan actual sigue activo hasta su vencimiento. Desde la próxima renovación pagas $${mensual.toFixed(2)}/mes y tu cuenta pasa a ${nombre}.`,
      )
    ) {
      return;
    }
    setBajando(plan);
    try {
      await api.post('/plan-requests/downgrade', { plan });
      recargar();
    } catch (e: any) {
      window.alert(e.response?.data?.error ?? 'No se pudo programar el cambio.');
    } finally {
      setBajando(null);
    }
  }

  async function cancelarBaja() {
    await api.delete('/plan-requests/downgrade').catch(() => undefined);
    recargar();
  }

  async function pedirMejora(plan: string) {
    setError(null);
    if (referencia.trim().length < 2) return setError('Escribe el número de referencia del pago.');
    setEnviando(true);
    try {
      const form = new FormData();
      form.append('plan', plan);
      form.append('paymentMethod', metodo);
      form.append('paymentReference', referencia.trim());
      if (proof) form.append('photo', proof);
      await api.post('/plan-requests/upgrade', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setListo(true);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo enviar la solicitud.');
    } finally {
      setEnviando(false);
    }
  }

  const vence = new Date(datos.periodEnd).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <section className="rounded-2xl border border-brand-950/[0.08] bg-white p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10">
          <Crown className="h-4.5 w-4.5 text-amber-600" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-brand-950">Mi plan</h2>
          <p className="text-[11.5px] font-light text-brand-950/50">Lo que tienes hoy, y a qué puedes subir.</p>
        </div>
      </div>

      {/* ---------- Plan actual ---------- */}
      <div className="mt-4 rounded-xl border border-brand-950/10 bg-brand-950/[0.02] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-[15px] font-bold text-brand-950">{datos.nombre ?? 'Sin plan activo'}</p>
            {datos.subtitulo && <p className="text-[12px] font-light text-brand-950/50">{datos.subtitulo}</p>}
          </div>
          {datos.mensualUsd != null && (
            <p className="text-right">
              <span className="text-[17px] font-bold tabular-nums text-brand-950">${datos.mensualUsd.toFixed(2)}</span>
              <span className="text-[11.5px] font-light text-brand-950/50">/mes · plan {CICLOS[datos.billingCycle] ?? ''}</span>
            </p>
          )}
        </div>
        <p className="mt-1 text-[11.5px] font-light text-brand-950/50">
          {datos.activo ? `Activo · vence el ${vence} (${datos.diasRestantes} días)` : 'Sin período activo'}
        </p>
        {datos.beneficios.length > 0 && (
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {datos.beneficios.map((b) => (
              <li key={b} className="flex items-start gap-1.5 text-[12px] font-light text-brand-950/70">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> {b}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------- Mejoras ---------- */}
      {datos.superiores.length > 0 && (
        <div className="mt-4 space-y-2.5">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-950/45">Sube de plan</p>
          {datos.superiores.map((sPlan) => {
            const abiertoAqui = abierto === sPlan.plan;
            return (
              <div key={sPlan.plan} className="rounded-xl border border-brand-950/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[14px] font-bold text-brand-950">{sPlan.nombre}</p>
                    <p className="text-[11.5px] font-light text-brand-950/50">{sPlan.subtitulo}</p>
                  </div>
                  <p className="text-right">
                    <span className="text-[15px] font-bold tabular-nums text-brand-950">${sPlan.mensualUsd.toFixed(2)}</span>
                    <span className="text-[11px] font-light text-brand-950/50">/mes</span>
                  </p>
                </div>

                {!abiertoAqui && (
                  <div className="mt-3">
                    {sPlan.pagoHoyUsd != null ? (
                      <TextureButton
                        variant="brand"
                        size="default"
                        className="!w-auto px-5"
                        onClick={() => {
                          setAbierto(sPlan.plan);
                          setListo(false);
                          setError(null);
                        }}
                      >
                        Cambiar a este plan — paga solo ${sPlan.pagoHoyUsd.toFixed(2)}
                      </TextureButton>
                    ) : (
                      // Sin suscripción activa no hay nada que prorratear: la mejora con
                      // descuento es para quien YA pagó un período — el resto renueva normal.
                      <button
                        type="button"
                        onClick={onGoToBilling}
                        className="inline-flex items-center gap-1.5 rounded-full border border-brand-950/15 px-4 py-2 text-[12.5px] font-semibold text-brand-950/70 hover:bg-brand-950/[0.04]"
                      >
                        Contratar desde Facturación <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {abiertoAqui && (
                  <div className="mt-3 border-t border-brand-950/[0.06] pt-3">
                    {/* Todo lo que gana con el plan nuevo, ANTES de pagar. */}
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {sPlan.beneficios.map((b) => (
                        <li key={b} className="flex items-start gap-1.5 text-[12px] font-light text-brand-950/70">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> {b}
                        </li>
                      ))}
                    </ul>

                    {listo ? (
                      <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-[13px] font-medium text-emerald-700">
                        Solicitud enviada. En cuanto verifiquemos tu pago, tu cuenta pasa a {sPlan.nombre} — sin mover tu
                        fecha de vencimiento.
                      </p>
                    ) : (
                      <>
                        <div className="mt-4 rounded-xl bg-brand-500/[0.06] px-4 py-3">
                          <p className="text-[13px] font-semibold text-brand-950">
                            Hoy pagas ${sPlan.pagoHoyUsd?.toFixed(2)}
                            <span className="font-light text-brand-950/55">
                              {' '}— la diferencia entre los dos planes. Tu fecha de vencimiento no cambia, y la próxima
                              renovación ya va con la tarifa del plan nuevo.
                            </span>
                          </p>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {METODOS.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setMetodo(m.id)}
                              className={`rounded-full border px-4 py-1.5 text-[12.5px] font-semibold transition-colors ${
                                metodo === m.id
                                  ? 'border-brand-500 bg-brand-500/10 text-brand-950'
                                  : 'border-brand-950/15 text-brand-950/60 hover:border-brand-950/30'
                              }`}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>

                        {/* A dónde pagar, según el método elegido. */}
                        <div className="mt-2 rounded-xl border border-brand-950/[0.08] bg-brand-950/[0.02] px-4 py-2.5 text-[12px] text-brand-950/70">
                          {metodo === 'PAGO_MOVIL' &&
                            (pago.pagoMovil?.telefono
                              ? `${pago.pagoMovil.banco ?? ''} · ${pago.pagoMovil.telefono} · ${pago.pagoMovil.cedula ?? ''} · ${pago.pagoMovil.titular ?? ''}`
                              : 'Pídenos los datos de Pago Móvil por WhatsApp si no los tienes.')}
                          {metodo === 'BINANCE' &&
                            (pago.binance?.id || pago.binance?.correo
                              ? `Binance ID: ${pago.binance?.id ?? '—'} · ${pago.binance?.correo ?? ''}`
                              : 'Pídenos los datos de Binance por WhatsApp si no los tienes.')}
                          {metodo === 'BANK_TRANSFER' &&
                            (pago.bankTransfer?.cuenta
                              ? `${pago.bankTransfer.banco ?? ''} · ${pago.bankTransfer.cuenta} · ${pago.bankTransfer.titular ?? ''} · ${pago.bankTransfer.rif ?? ''}`
                              : 'Pídenos los datos de transferencia por WhatsApp si no los tienes.')}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <input
                            value={referencia}
                            onChange={(e) => setReferencia(e.target.value)}
                            placeholder="Número de referencia del pago"
                            className="w-full max-w-xs rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
                          />
                          <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => setProof(e.target.files?.[0] ?? null)} />
                          <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className={`inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-[12.5px] font-medium ${
                              proof ? 'border-emerald-500/50 text-emerald-700' : 'border-brand-950/20 text-brand-950/60'
                            }`}
                          >
                            <Paperclip className="h-3.5 w-3.5" /> {proof ? 'Comprobante adjunto' : 'Adjuntar comprobante'}
                          </button>
                        </div>

                        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

                        <div className="mt-3 flex items-center gap-3">
                          <TextureButton
                            variant="brand"
                            size="default"
                            disabled={enviando}
                            className="!w-auto px-6 disabled:opacity-50"
                            onClick={() => pedirMejora(sPlan.plan)}
                          >
                            {enviando ? 'Enviando…' : `Confirmar cambio — $${sPlan.pagoHoyUsd?.toFixed(2)}`}
                          </TextureButton>
                          <button onClick={() => setAbierto(null)} className="text-[12.5px] font-medium text-brand-950/50">
                            Cancelar
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- Baja programada ---------- */}
      {datos.bajaPendiente && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[13px] text-amber-800">
            <span className="font-semibold">Baja programada a {datos.bajaPendiente.nombre}.</span> Tu plan actual sigue
            hasta el {vence}; desde la próxima renovación pagas la tarifa del plan nuevo.
          </p>
          <button onClick={cancelarBaja} className="text-[12.5px] font-semibold text-amber-800 underline underline-offset-2">
            Cancelar la baja
          </button>
        </div>
      )}

      {/* ---------- Bajar de plan ---------- */}
      {!datos.bajaPendiente && datos.inferiores.length > 0 && (
        <div className="mt-4 space-y-2.5">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-950/45">Baja de plan</p>
          {datos.inferiores.map((inf) => (
            <div key={inf.plan} className="rounded-xl border border-brand-950/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[14px] font-bold text-brand-950">{inf.nombre}</p>
                  <p className="text-[11.5px] font-light text-brand-950/50">{inf.subtitulo}</p>
                </div>
                <p className="text-right">
                  <span className="text-[15px] font-bold tabular-nums text-brand-950">${inf.mensualUsd.toFixed(2)}</span>
                  <span className="text-[11px] font-light text-brand-950/50">/mes</span>
                </p>
              </div>
              <p className="mt-2 text-[11.5px] font-light text-brand-950/55">
                Sin devolución: tu plan actual sigue hasta el vencimiento y la próxima renovación se cobra con esta tarifa.
              </p>
              <button
                type="button"
                disabled={bajando === inf.plan}
                onClick={() => bajarA(inf.plan, inf.nombre, inf.mensualUsd)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-brand-950/15 px-4 py-2 text-[12.5px] font-semibold text-brand-950/70 hover:bg-brand-950/[0.04] disabled:opacity-50"
              >
                {bajando === inf.plan ? 'Programando…' : 'Bajar a este plan'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
