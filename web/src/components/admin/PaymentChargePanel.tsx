import type { ReactNode } from 'react';
import { formatBase, formatBs } from '@/utils/format';
import { USD_FIRST_METHODS } from '@/utils/payments';
import type { PaymentMethod } from '@/types';

interface Props {
  method: PaymentMethod;
  /** QR configurado en Ajustes → Métodos de pago para este método, si tiene. */
  qrImageUrl?: string | null;
  amountBase: number;
  symbol: string;
  rateBs?: string | number | null;
  /** Datos de cobro del método (banco, correo, ID…) con sus botones de copiar. */
  children?: ReactNode;
}

/**
 * Cabecera de cobro de las tres pasarelas del panel: el QR a la izquierda y el monto
 * + los datos a la derecha, en horizontal. El QR es lo que el cliente apunta con el
 * teléfono, así que va grande y a un lado en vez de empujar el monto fuera de pantalla.
 * En móvil (una sola columna) vuelve a apilarse, con el QR arriba.
 *
 * Zelle y Binance cobran en dólares: el monto grande va en $ y el equivalente en Bs
 * queda debajo. Pago Móvil es al revés — se paga en Bs, así que manda el Bs.
 */
export function PaymentChargePanel({ method, qrImageUrl, amountBase, symbol, rateBs, children }: Props) {
  const usdFirst = USD_FIRST_METHODS.includes(method);
  const baseLabel = formatBase(amountBase, symbol);
  const bsLabel = rateBs ? formatBs(amountBase, rateBs) : null;

  // Sin QR ni datos que mostrar (ej. efectivo) no hay cabecera que dibujar.
  if (!qrImageUrl && !children) return null;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      {qrImageUrl && (
        <img
          src={qrImageUrl}
          alt={`QR de ${method === 'MOBILE_PAYMENT' ? 'Pago Móvil' : method === 'ZELLE' ? 'Zelle' : 'Binance'}`}
          className="mx-auto aspect-square w-full max-w-[200px] shrink-0 rounded-2xl border border-brand-950/10 object-contain sm:mx-0 sm:w-[200px]"
        />
      )}

      <div className="min-w-0 flex-1 space-y-3">
        <div className="text-center sm:text-left">
          <p className="text-xs font-semibold text-brand-950/50">Monto a cobrar</p>
          <div className="mt-1 text-3xl font-extrabold leading-none tracking-tight text-emerald-600">
            {usdFirst ? baseLabel : bsLabel ?? baseLabel}
          </div>
          {usdFirst
            ? bsLabel && <p className="mt-1.5 text-xs font-medium text-brand-950/50">{bsLabel} (tasa del día)</p>
            : rateBs && (
                <p className="mt-1.5 text-xs font-medium text-brand-950/50">
                  {baseLabel} &nbsp;x&nbsp; Bs{Number(rateBs).toFixed(2)} (tasa del día)
                </p>
              )}
        </div>

        {children}
      </div>
    </div>
  );
}
