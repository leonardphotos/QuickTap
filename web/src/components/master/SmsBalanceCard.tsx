import { useEffect, useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import { masterApi } from '@/api/client';

interface Saldo {
  disponible: boolean;
  balanceUsd?: number;
  smsRestantes?: number;
  porOperadora?: Record<string, number>;
}

/** Bajo este número de SMS restantes el visor se pone en alerta: da tiempo de recargar antes
 * de que a un cliente no le llegue su código de ingreso al Wallet. */
const UMBRAL_ALERTA = 40;

/**
 * Saldo de enviatusms (los códigos SMS del Wallet) en el Resumen del master. Es una cuenta
 * PREPAGO: cuando llega a cero los SMS simplemente dejan de salir — este visor existe para
 * enterarse por el dashboard y no por un cliente al que no le llegó el código.
 */
export function SmsBalanceCard() {
  const [saldo, setSaldo] = useState<Saldo | null>(null);

  useEffect(() => {
    masterApi
      .get('/master/summary/sms-balance')
      .then((r) => setSaldo(r.data.data))
      .catch(() => setSaldo({ disponible: false }));
  }, []);

  const bajo = saldo?.disponible && (saldo.smsRestantes ?? 0) < UMBRAL_ALERTA;

  return (
    <div
      className={`rounded-2xl border p-5 ${
        bajo ? 'border-amber-300 bg-amber-50' : 'border-brand-950/10 bg-white'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${bajo ? 'bg-amber-500/15' : 'bg-sky-500/10'}`}>
          <MessageSquareText className={`h-4.5 w-4.5 ${bajo ? 'text-amber-600' : 'text-sky-600'}`} />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-brand-950">SMS del Wallet (enviatusms)</h3>
          <p className="text-[11.5px] font-light text-brand-950/50">
            Prepago · manda los códigos de verificación de ingreso
          </p>
        </div>
      </div>

      {saldo === null ? (
        <p className="mt-4 text-sm font-light text-brand-950/40">Consultando…</p>
      ) : !saldo.disponible ? (
        <p className="mt-4 text-sm font-light text-brand-950/50">
          No se pudo consultar el saldo (proveedor caído o API key sin configurar).
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-baseline gap-4">
            <span className="text-3xl font-bold tabular-nums text-brand-950">
              ~{saldo.smsRestantes?.toLocaleString('es-VE')}
              <span className="ml-1 text-sm font-medium text-brand-950/45">SMS</span>
            </span>
            <span className="text-sm font-medium tabular-nums text-brand-950/55">
              ${saldo.balanceUsd?.toFixed(2)} de saldo
            </span>
          </div>
          {/* El grande es el PEOR caso entre operadoras; el detalle aclara la diferencia. */}
          <p className="mt-1.5 text-[11.5px] font-light tabular-nums text-brand-950/45">
            {Object.entries(saldo.porOperadora ?? {})
              .map(([op, n]) => `${op[0].toUpperCase()}${op.slice(1)}: ${n}`)
              .join(' · ')}
          </p>
          {bajo && (
            <p className="mt-3 rounded-xl bg-amber-100 px-3 py-2 text-[12px] font-medium text-amber-800">
              Saldo bajo: recarga en enviatusms.com antes de que los códigos del Wallet dejen de llegar.
            </p>
          )}
        </>
      )}
    </div>
  );
}
