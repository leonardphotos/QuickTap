import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';
import { formatBase, formatBs } from '@/utils/format';
import { USD_FIRST_METHODS } from '@/utils/payments';
import type { PaymentMethod } from '@/types';

interface Props {
  method: PaymentMethod;
  methodLabel: string;
  qrImageUrl?: string | null;
  amountBase: number;
  /** Título junto al monto grande. Por defecto "Monto a cobrar"; en un abono todavía sin
   *  monto escrito se usa "Saldo pendiente", que es lo que el cliente necesita ver. */
  amountLabel?: string;
  symbol: string;
  rateBs?: string | number | null;
  /** Encabezado del recuadro de detalle, ej. "Detalle del pedido (3 ítems)". */
  detailTitle: string;
  /** Renglones del detalle, ej. ["1x Pollo Crocante", "1x Brownie con Helado"]. */
  detailLines: string[];
  /** Datos de cobro del método (correo de Zelle, cuenta, etc.) para los que no llevan QR. */
  details?: ReactNode;
  onNext: () => void;
  onBack: () => void;
}

/**
 * Pantalla que se le muestra AL CLIENTE después de elegir el método de pago: a
 * pantalla completa, con el QR grande de un lado y el detalle + monto del otro,
 * para que pague o abone desde su teléfono sin tener que leer el diálogo de caja.
 *
 * Deliberadamente no tiene los campos de referencia ni la subida del comprobante:
 * eso es trabajo del cajero y aparece al tocar "Siguiente". Aquí el cliente solo
 * ve qué está pagando y cuánto.
 */
export function PaymentClientScreen({
  method,
  methodLabel,
  qrImageUrl,
  amountBase,
  amountLabel = 'Monto a cobrar',
  symbol,
  rateBs,
  detailTitle,
  detailLines,
  details,
  onNext,
  onBack,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  /**
   * Ningún clic de esta pantalla puede llegar al `document`. Radix escucha ahí para cerrar
   * los diálogos al tocar "afuera", y esta pantalla vive fuera de todos ellos: sin esto, un
   * toque en "Listo" cerraba el cobro Y el "Editar pedido" que lo contiene, mandando al
   * cajero de vuelta a la lista con todo perdido.
   *
   * Se corta en `body`, no en el contenedor propio: React registra los listeners de este
   * portal justo ahí, así que cortar antes dejaría los botones muertos. En `body` React ya
   * despachó su onClick (se registró primero, durante el commit) y solo se impide el último
   * salto hasta `document`, que es donde escucha Radix. Nativo a propósito — el
   * stopPropagation de React actúa sobre el evento sintético y el nativo seguiría subiendo.
   */
  useEffect(() => {
    const stop = (e: Event) => {
      const target = e.target as Node | null;
      if (target && rootRef.current?.contains(target)) e.stopPropagation();
    };
    const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'touchstart', 'focusin'];
    events.forEach((type) => document.body.addEventListener(type, stop));
    return () => events.forEach((type) => document.body.removeEventListener(type, stop));
  }, []);

  // Escape cierra ESTA pantalla y devuelve al cobro. Se captura antes de que llegue al
  // diálogo de Pagar, que si no se cerraría también y perdería el cobro en curso.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      // stopImmediatePropagation, no solo stopPropagation: Radix escucha el Escape en el
      // mismo document, así que hay que cortar también los otros listeners de ese nodo.
      e.stopImmediatePropagation();
      onBack();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onBack]);

  const usdFirst = USD_FIRST_METHODS.includes(method);
  const baseLabel = formatBase(amountBase, symbol);
  const bsLabel = rateBs ? formatBs(amountBase, rateBs) : null;

  // Va en un portal al <body> y por encima de z-[1100] (el de Dialog, ver ui/dialog.tsx):
  // el cobro se abre desde el diálogo de "Editar pedido", que si no queda tapando esta
  // pantalla. `pointerEvents: auto` es necesario porque Radix apaga los clics del body
  // mientras hay un diálogo abierto, y esto vive fuera de su contenido.
  return createPortal(
    <div ref={rootRef} className="fixed inset-0 z-[1200] flex flex-col bg-white" style={{ pointerEvents: 'auto' }}>
      <div className="flex shrink-0 items-center gap-3 px-5 py-4 sm:px-8">
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-950/[0.06] hover:bg-brand-950/10 focus:outline-none"
        >
          <ArrowLeft className="h-5 w-5 text-brand-950/70" />
        </button>
        <p className="text-lg font-bold tracking-tight text-brand-950">{methodLabel}</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-5 pb-4 sm:flex-row sm:items-center sm:gap-10 sm:px-10">
        {qrImageUrl && (
          <img
            src={qrImageUrl}
            alt={`QR de ${methodLabel}`}
            className="aspect-square w-full max-w-[300px] shrink-0 rounded-3xl border border-brand-950/10 object-contain sm:max-w-none sm:w-[min(42vw,440px)]"
          />
        )}

        <div className="w-full max-w-lg space-y-5">
          {detailLines.length > 0 && (
            <div className="rounded-2xl border border-brand-950/12 px-5 py-4">
              <p className="text-[13px] font-bold uppercase tracking-wide text-brand-950">{detailTitle}</p>
              <ul className="mt-2 space-y-1">
                {detailLines.map((line, i) => (
                  <li key={i} className="flex gap-2 text-[17px] font-light text-brand-950 sm:text-[19px]">
                    <span className="text-brand-950/40">•</span>
                    <span className="min-w-0">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {details ?? (!qrImageUrl && <MissingDetailsNotice methodLabel={methodLabel} />)}

          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-[22px] font-bold leading-tight tracking-tight text-brand-950 sm:text-[26px]">
              {amountLabel}
            </p>
            <div className="text-right">
              <div className="text-[44px] font-extrabold leading-none tracking-tight text-emerald-600 sm:text-[64px]">
                {usdFirst ? baseLabel : bsLabel ?? baseLabel}
              </div>
              {(usdFirst ? bsLabel : rateBs && baseLabel) && (
                <p className="mt-1 text-[20px] font-light text-brand-950/70 sm:text-[26px]">
                  {usdFirst ? bsLabel : baseLabel}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 justify-center border-t border-brand-950/10 px-5 py-4 sm:px-10">
        <button
          type="button"
          onClick={onNext}
          className="w-full max-w-lg rounded-full bg-emerald-600 px-6 py-3.5 text-[15px] font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
        >
          Listo
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * El método elegido no tiene cuenta ni QR cargados en Ajustes → Métodos de pago. La pantalla
 * se muestra igual (el monto a cobrar es lo que el cliente necesita ver), con un aviso para
 * que el negocio sepa por qué no salen los datos y dónde cargarlos.
 */
function MissingDetailsNotice({ methodLabel }: { methodLabel: string }) {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4">
      <p className="text-[15px] font-bold text-amber-900">Sin datos de {methodLabel}</p>
      <p className="mt-0.5 text-[13px] font-light text-amber-900/80">
        Carga el teléfono, la cédula/RIF, el banco o el QR en Ajustes → Métodos de pago y aparecerán acá cada vez que cobres.
      </p>
    </div>
  );
}
