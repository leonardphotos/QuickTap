import { parseWalletAmount, previewWalletAdvance } from './wallet-payment-amount';
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Upload, X } from 'lucide-react';
import { api } from '@/api/client';
import { getWalletToken } from './walletSession';

/**
 * Reportar un abono desde el portal del cliente.
 *
 * Permite cubrir cuotas completas o escribir un monto para adelantar cuotas.
 * El dinero se aplica en orden después de que el negocio verifica el abono.
 *
 * El comprobante es opcional en el formulario pero se pide con insistencia: sin él, el local no
 * tiene con qué verificar y el abono se queda esperando.
 */

interface Cuota {
  id: string;
  number: number;
  saldo: number;
  estado: string;
}

interface Props {
  compraId: string;
  negocio: string;
  saldo: number;
  cuotas: Cuota[];
  rateBs: number | null;
  onClose: () => void;
  onListo: () => void;
}

const ETIQUETAS: Record<string, string> = {
  pagoMovil: 'Pago Móvil',
  zelle: 'Zelle',
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  binance: 'Binance',
  punto: 'Punto de Venta',
  paypal: 'PayPal',
};

const CAMPOS: Record<string, string> = {
  banco: 'Banco',
  telefono: 'Teléfono',
  cedula: 'Cédula/RIF',
  titular: 'Titular',
  correo: 'Correo',
  cuenta: 'Cuenta',
  rif: 'RIF',
  id: 'ID',
};

const money = (n: number) => `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** En bolívares, que es la cifra que el cliente va a transferir. */
const bs = (n: number, rateBs: number | null) =>
  rateBs ? `Bs ${(n * rateBs).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';

export function AbonarDialog({ compraId, negocio, saldo, cuotas, rateBs, onClose, onListo }: Props) {
  const [metodos, setMetodos] = useState<Record<string, Record<string, string>> | null>(null);
  const [metodo, setMetodo] = useState<string | null>(null);
  // Cuántas cuotas cubre este pago, contadas desde la más vieja pendiente. Sin plan de cuotas
  // no se usa: ahí se salda la cuenta completa.
  const [cantidad, setCantidad] = useState(1);
  const [montoLibre, setMontoLibre] = useState(false);
  const [montoEscrito, setMontoEscrito] = useState('');
  const [comprobante, setComprobante] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const auth = useMemo(() => ({ Authorization: `Bearer ${getWalletToken()}` }), []);
  const porPagar = cuotas.filter((c) => c.saldo > 0).sort((a, b) => a.number - b.number);

  // El monto sale de las cuotas elegidas; sin plan de cuotas, del saldo completo. Se topa al
  // saldo real para que el redondeo de las cuotas nunca reporte más de lo que se debe (el
  // servidor rechaza un abono mayor al saldo).
  const montoPorCuotas =
    porPagar.length > 0
      ? Math.min(saldo, Math.round(porPagar.slice(0, cantidad).reduce((a, c) => a + c.saldo, 0) * 100) / 100)
      : saldo;
  const montoPersonalizado = parseWalletAmount(montoEscrito);
  const monto = montoLibre ? montoPersonalizado ?? 0 : montoPorCuotas;
  const montoValido = Number.isFinite(monto) && monto > 0 && Math.round(monto * 100) <= Math.round(saldo * 100);
  const reparto = previewWalletAdvance(porPagar, montoValido ? monto : 0);


  useEffect(() => {
    api
      .get(`/public/wallet/sales/${compraId}/methods`, { headers: auth })
      .then((res) => {
        const cfg = res.data.data ?? {};
        // Solo los métodos que el negocio realmente cargó — mostrar uno vacío sería mandar al
        // cliente a transferir a ninguna parte.
        const utiles = Object.fromEntries(
          Object.entries(cfg).filter(([, v]) => v && typeof v === 'object' && Object.keys(v as object).length > 0),
        ) as Record<string, Record<string, string>>;
        setMetodos(utiles);
        setMetodo(Object.keys(utiles)[0] ?? null);
      })
      .catch(() => setMetodos({}));
  }, [compraId, auth]);

  async function subir(file: File) {
    setSubiendo(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const res = await api.post('/public/wallet/proof', fd, { headers: auth });
      setComprobante(res.data.data.url);
    } catch {
      setError('No pudimos subir el comprobante. Intenta con otra foto.');
    } finally {
      setSubiendo(false);
    }
  }

  async function enviar() {
    if (enviando || subiendo) return;
    if (!montoValido) return setError('Escribe un monto mayor que cero y que no supere tu saldo pendiente.');
    if (!metodo) return setError('Elige cómo pagaste.');
    setEnviando(true);
    setError(null);
    try {
      await api.post(
        `/public/wallet/sales/${compraId}/payments`,
        {
          amount: monto,
          method: metodo,
          // La cuota más vieja de las elegidas, solo como referencia de contra qué se reportó:
          // al aprobarlo, el negocio reparte el monto entre las cuotas pendientes en orden
          // (ver walletInboxService.aprobar), así que cubre todas las que alcance.
          installmentId: porPagar[0]?.id,
          proofImageUrl: comprobante ?? undefined,
        },
        { headers: auth },
      );
      onListo();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No pudimos registrar tu abono.');
    } finally {
      setEnviando(false);
    }
  }

  // Centrada, no pegada abajo: como panel inferior, en el navegador del celular la barra
  // flotante de direcciones le tapaba el final y el botón de reportar quedaba fuera de
  // alcance. El padding del contenedor la mantiene despegada de los bordes.
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      {/* Modal: escala desde el centro porque no está anclado a ningún disparador, y arranca
          en 0.96 y no en 0 — nada en el mundo real aparece de la nada. */}
      <motion.div
        initial={{ opacity: 0, transform: 'scale(0.96) translateY(8px)' }}
        animate={{ opacity: 1, transform: 'scale(1) translateY(0px)' }}
        transition={{ duration: 0.26, ease: [0.23, 1, 0.32, 1] }}
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-[24px] bg-[#141a22] p-5 text-white"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Abonar</h2>
            <p className="font-light text-white/45 text-xs">{negocio}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="wallet-tap rounded-full bg-white/10 p-1.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1" role="group" aria-label="Cómo elegir el monto">
          <button type="button" disabled={enviando} onClick={() => { setMontoLibre(false); setError(null); }} aria-pressed={!montoLibre} className={`rounded-lg px-2 py-2.5 text-xs font-medium ${!montoLibre ? 'bg-[#009aff] text-white' : 'text-white/60'}`}>{porPagar.length ? 'Por cuotas' : 'Pagar completo'}</button>
          <button type="button" disabled={enviando} onClick={() => { setMontoLibre(true); setError(null); }} aria-pressed={montoLibre} className={`rounded-lg px-2 py-2.5 text-xs font-medium ${montoLibre ? 'bg-[#009aff] text-white' : 'text-white/60'}`}>Monto personalizado</button>
        </div>
        {montoLibre && <div className="mt-4 space-y-2">
          <label htmlFor="wallet-custom-amount" className="text-white/70 text-sm font-medium">¿Cuánto quieres abonar? ($)</label>
          <input id="wallet-custom-amount" inputMode="decimal" autoComplete="off" disabled={enviando} value={montoEscrito} onChange={e => { setMontoEscrito(e.target.value); setError(null); }} placeholder="Ej. 25,00" aria-describedby="wallet-amount-help" className="w-full rounded-xl border border-white/15 bg-[#0e141b] px-4 py-3 tabular-nums text-white outline-none focus:border-[#009aff] text-base" />
          <div id="wallet-amount-help" className="flex items-center justify-between gap-2 text-xs text-white/45"><span>Saldo pendiente: {money(saldo)}</span><button type="button" disabled={enviando} onClick={()=>setMontoEscrito(saldo.toFixed(2))} className="text-[#4db5ff]">Pagar todo</button></div>
          {montoEscrito && !montoValido && <p role="alert" className="text-red-300 text-xs">Ingresa entre $0,01 y {money(saldo)}, con hasta dos decimales.</p>}
        </div>}
        <div className="mt-5 rounded-2xl bg-[#0e141b] p-4">
          <p className="font-light text-white/45 text-xs">Vas a pagar</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{bs(monto, rateBs) || money(monto)}</p>
          {rateBs && <p className="font-light tabular-nums text-white/50 text-base">{money(monto)}</p>}
          {porPagar.length > 0 && !montoLibre && (
            <p className="mt-1 font-light text-white/40 text-xs">
              {cantidad} de {porPagar.length} cuota{porPagar.length === 1 ? '' : 's'} pendiente
              {porPagar.length === 1 ? '' : 's'}
            </p>
          )}
        </div>

        {!montoLibre && (porPagar.length > 0 ? (
          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between">
              <p className="font-light text-white/45 text-xs">¿Cuántas cuotas vas a pagar?</p>
              <button
                onClick={() => setCantidad(cantidad === porPagar.length ? 1 : porPagar.length)}
                className="text-[11px] font-semibold text-[#4db5ff]"
              >
                {cantidad === porPagar.length ? 'Solo una' : 'Todas'}
              </button>
            </div>
            <div className="space-y-1.5">
              {porPagar.map((c, i) => {
                const elegida = i < cantidad;
                return (
                  <button
                    key={c.id}
                    onClick={() => setCantidad(i + 1)}
                    className={`wallet-tap flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                      elegida ? 'bg-[#009aff]/15 ring-1 ring-[#009aff]/50' : 'bg-white/[0.05] hover:bg-white/10'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold transition-all duration-200 ${
                          elegida ? 'scale-100 bg-[#009aff] text-white' : 'scale-90 border border-white/25 text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                      <span className="truncate text-[12px] font-medium text-white/85">
                        Cuota #{c.number}
                        {c.estado === 'VENCIDA' && <span className="ml-1.5 text-[10px] text-red-300">vencida</span>}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12px] font-semibold tabular-nums text-white/70">
                      {money(c.saldo)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          // Cuenta fiada sin plan de cuotas: no hay nada que elegir, se salda completa.
          <p className="mt-3 rounded-xl bg-white/[0.05] px-3 py-2.5 font-light leading-snug text-white/50 text-xs">
            Esta cuenta no tiene cuotas: se paga completa, {money(saldo)}.
          </p>
        ))}

        {montoLibre && reparto.length > 0 && <div className="mt-3 rounded-xl bg-white/5 p-3 text-xs space-y-2">
          <p className="font-medium text-white/85 text-base">Así se aplicará tu abono</p>
          {reparto.map(c => <div key={c.id} className="flex justify-between gap-3"><span className="text-white/65">Cuota #{c.number}</span><span className="text-right tabular-nums">{money(c.applied)} <span className="text-white/45">· {c.remaining ? `restarían ${money(c.remaining)}` : 'quedaría pagada'}</span></span></div>)}
          <p className="pt-1 text-white/45 leading-relaxed text-base">Primero se cubren las cuotas pendientes en orden y luego se adelantan las siguientes. Se aplica cuando el negocio verifica el pago.</p>
        </div>}
        {/* Cómo pagó, con los datos del negocio */}
        <div className="mt-4">
          <p className="mb-1.5 font-light text-white/45 text-xs">¿Cómo pagaste?</p>
          {metodos === null && <p className="text-white/30 text-xs">Cargando métodos…</p>}
          {metodos !== null && Object.keys(metodos).length === 0 && (
            <p className="rounded-xl bg-white/[0.06] px-3 py-2 font-light text-white/50 text-xs">
              Este negocio todavía no cargó sus datos de pago. Escríbele para coordinar.
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(metodos ?? {}).map((k) => (
              <button
                key={k}
                onClick={() => setMetodo(k)}
                className={`wallet-tap rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${metodo === k ? 'bg-[#009aff] text-white' : 'bg-white/10 text-white/70'}`}
              >
                {ETIQUETAS[k] ?? k}
              </button>
            ))}
          </div>
          {metodo && metodos?.[metodo] && (
            <div className="mt-2 space-y-0.5 rounded-xl bg-white/[0.06] px-3 py-2">
              {Object.entries(metodos[metodo]).map(([campo, valor]) => (
                <div key={campo} className="flex justify-between gap-3 text-[11px]">
                  <span className="font-light text-white/45">{CAMPOS[campo] ?? campo}</span>
                  <span className="font-medium">{String(valor)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Comprobante */}
        <div className="mt-4">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 px-3 py-3 text-white/60 text-sm font-medium">
            <Upload className="h-4 w-4" />
            {subiendo ? 'Subiendo…' : comprobante ? 'Comprobante cargado ✓' : 'Subir comprobante de pago'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])}
            />
          </label>
          {!comprobante && (
            <p className="mt-1 text-center font-light text-white/35 text-xs">
              Sin comprobante el negocio no puede verificar tu abono.
            </p>
          )}
        </div>

        {error && <p className="mt-3 text-center text-red-300 text-xs">{error}</p>}

        <button
          onClick={enviar}
          disabled={enviando || subiendo || !metodo || !montoValido}
          className="wallet-tap mt-4 w-full rounded-full py-3 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #009aff 0%, #056CF2 100%)' }}
        >
          {enviando ? 'Enviando…' : 'Reportar abono'}
        </button>
        <p className="mt-2 text-center font-light text-white/35 text-xs">
          El negocio lo verifica y se suma a tu cuenta.
        </p>
      </motion.div>
    </motion.div>
  );
}
