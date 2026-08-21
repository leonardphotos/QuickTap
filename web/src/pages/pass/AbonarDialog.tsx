import { useEffect, useMemo, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { api } from '@/api/client';
import { getPassToken } from './passSession';

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
  const [monto, setMonto] = useState(saldo);
  const [cuotaId, setCuotaId] = useState<string | null>(null);
  const [comprobante, setComprobante] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const auth = useMemo(() => ({ Authorization: `Bearer ${getPassToken()}` }), []);
  const porPagar = cuotas.filter((c) => c.saldo > 0);

  useEffect(() => {
    api
      .get(`/public/pass/sales/${compraId}/methods`, { headers: auth })
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
      const res = await api.post('/public/pass/proof', fd, { headers: auth });
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
        `/public/pass/sales/${compraId}/payments`,
        { amount: monto, method: metodo, installmentId: cuotaId ?? undefined, proofImageUrl: comprobante ?? undefined },
        { headers: auth },
      );
      onListo();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No pudimos registrar tu abono.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[24px] bg-[#141a22] p-5 text-white sm:rounded-[24px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Abonar</h2>
            <p className="text-[11px] font-light text-white/45">{negocio}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-full bg-white/10 p-1.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Cuánto */}
        <div className="mt-5 rounded-2xl bg-[#0e141b] p-4">
          <p className="text-[11px] font-light text-white/45">Vas a abonar</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{bs(monto, rateBs) || money(monto)}</p>
          {rateBs && <p className="text-sm font-light tabular-nums text-white/50">{money(monto)}</p>}
          <input
            type="range"
            min={1}
            max={Math.max(1, Math.round(saldo))}
            step={1}
            value={Math.round(monto)}
            onChange={(e) => setMonto(Number(e.target.value))}
            className="mt-3 w-full accent-[#009aff]"
          />
          <div className="flex items-center justify-between text-[10px] font-light text-white/40">
            <span>{money(1)}</span>
            <button onClick={() => setMonto(saldo)} className="text-[11px] font-semibold text-[#4db5ff]">
              Pagar completo
            </button>
            <span>{money(saldo)}</span>
          </div>
        </div>

        {/* Contra qué cuota */}
        {porPagar.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-[11px] font-light text-white/45">¿A qué cuota lo aplicamos?</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setCuotaId(null)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-medium ${cuotaId === null ? 'bg-[#009aff] text-white' : 'bg-white/10 text-white/70'}`}
              >
                Al saldo general
              </button>
              {porPagar.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCuotaId(c.id)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-medium ${cuotaId === c.id ? 'bg-[#009aff] text-white' : 'bg-white/10 text-white/70'}`}
                >
                  Cuota #{c.number}
                </button>
              ))}
            </div>
          </div>
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
