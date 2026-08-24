import { useEffect, useMemo, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { api } from '@/api/client';
import { getWalletToken } from './walletSession';

/**
 * Reportar un abono desde el portal del cliente.
 *
 * El deslizador arranca en el saldo completo: lo más común es pagar todo, y quien quiera abonar
 * menos solo tiene que arrastrarlo. "Pagar completo" es un atajo al tope.
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
  const [comprobante, setComprobante] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const auth = useMemo(() => ({ Authorization: `Bearer ${getWalletToken()}` }), []);
  const porPagar = cuotas.filter((c) => c.saldo > 0);

  // El monto sale de las cuotas elegidas; sin plan de cuotas, del saldo completo. Se topa al
  // saldo real para que el redondeo de las cuotas nunca reporte más de lo que se debe (el
  // servidor rechaza un abono mayor al saldo).
  const monto =
    porPagar.length > 0
      ? Math.min(saldo, Math.round(porPagar.slice(0, cantidad).reduce((a, c) => a + c.saldo, 0) * 100) / 100)
      : saldo;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-[24px] bg-[#141a22] p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Abonar</h2>
            <p className="text-[11px] font-light text-white/45">{negocio}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-full bg-white/10 p-1.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Cuánto: se elige por cuotas, no con un monto libre. Las cuotas las fijó el negocio,
            así que el cliente decide CUÁNTAS cubre —siempre desde la más vieja— y el monto sale
            de esa suma. Tocar una cuota selecciona esa y todas las anteriores: pagar la #3
            dejando la #1 sin pagar no es algo que el negocio acepte. */}
        <div className="mt-5 rounded-2xl bg-[#0e141b] p-4">
          <p className="text-[11px] font-light text-white/45">Vas a pagar</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{bs(monto, rateBs) || money(monto)}</p>
          {rateBs && <p className="text-sm font-light tabular-nums text-white/50">{money(monto)}</p>}
          {porPagar.length > 0 && (
            <p className="mt-1 text-[11px] font-light text-white/40">
              {cantidad} de {porPagar.length} cuota{porPagar.length === 1 ? '' : 's'} pendiente
              {porPagar.length === 1 ? '' : 's'}
            </p>
          )}
        </div>

        {porPagar.length > 0 ? (
          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between">
              <p className="text-[11px] font-light text-white/45">¿Cuántas cuotas vas a pagar?</p>
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
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                      elegida ? 'bg-[#009aff]/15 ring-1 ring-[#009aff]/50' : 'bg-white/[0.05] hover:bg-white/10'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                          elegida ? 'bg-[#009aff] text-white' : 'border border-white/25 text-transparent'
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
          <p className="mt-3 rounded-xl bg-white/[0.05] px-3 py-2.5 text-[11px] font-light leading-snug text-white/50">
            Esta cuenta no tiene cuotas: se paga completa, {money(saldo)}.
          </p>
        )}

        {/* Cómo pagó, con los datos del negocio */}
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-light text-white/45">¿Cómo pagaste?</p>
          {metodos === null && <p className="text-[11px] text-white/30">Cargando métodos…</p>}
          {metodos !== null && Object.keys(metodos).length === 0 && (
            <p className="rounded-xl bg-white/[0.06] px-3 py-2 text-[11px] font-light text-white/50">
              Este negocio todavía no cargó sus datos de pago. Escríbele para coordinar.
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(metodos ?? {}).map((k) => (
              <button
                key={k}
                onClick={() => setMetodo(k)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-medium ${metodo === k ? 'bg-[#009aff] text-white' : 'bg-white/10 text-white/70'}`}
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
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 px-3 py-3 text-[12px] font-light text-white/60">
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
            <p className="mt-1 text-center text-[10px] font-light text-white/35">
              Sin comprobante el negocio no puede verificar tu abono.
            </p>
          )}
        </div>

        {error && <p className="mt-3 text-center text-[11px] text-red-300">{error}</p>}

        <button
          onClick={enviar}
          disabled={enviando || !metodo}
          className="mt-4 w-full rounded-full py-3 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #009aff 0%, #056CF2 100%)' }}
        >
          {enviando ? 'Enviando…' : 'Reportar abono'}
        </button>
        <p className="mt-2 text-center text-[10px] font-light text-white/35">
          El negocio lo verifica y se suma a tu cuenta.
        </p>
      </div>
    </div>
  );
}
