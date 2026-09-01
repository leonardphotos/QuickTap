import { Delete } from 'lucide-react';

/** Campos que el teclado puede llenar. El diálogo de cobro decide cuál está activo. */
export type PosKeypadField =
  | 'amount'
  | 'tip'
  | 'discount'
  | 'service'
  | 'reference'
  | 'received'
  /** Referencia del pago móvil con el que se devuelve el vuelto. */
  | 'changeReference';

interface Props {
  /** Etiqueta de qué se está escribiendo ahora ("Monto a abonar", "Propina"…). */
  activeLabel: string;
  /** Valor actual del campo activo, para mostrarlo grande arriba del teclado. */
  value: string;
  /** Sufijo de moneda del campo activo (Bs / $), si aplica. */
  suffix?: string | null;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  /** Botón grande de confirmar (registra el cobro). */
  onEnter: () => void;
  enterLabel: string;
  enterDisabled?: boolean;
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3'];

/**
 * Teclado numérico del modo POS (tablet en horizontal): en un mostrador se cobra con la
 * tablet plana y sin teclado físico, y el teclado del sistema tapa media pantalla. Esto
 * escribe directo en el campo activo del cobro — el cajero nunca pierde de vista el total.
 */
export function PosNumericKeypad({
  activeLabel,
  value,
  suffix,
  onDigit,
  onBackspace,
  onClear,
  onEnter,
  enterLabel,
  enterDisabled,
}: Props) {
  const key =
    'rounded-xl bg-white border border-brand-950/10 text-3xl font-semibold text-brand-950 ' +
    'active:bg-brand-950/[0.06] transition-colors focus:outline-none flex items-center justify-center';

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="rounded-2xl bg-brand-950/[0.05] px-5 py-4 shrink-0">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-950/45">{activeLabel}</p>
        <p className="mt-1 text-5xl font-bold text-brand-950 tabular-nums truncate leading-none">
          {value || '0'}
          {suffix && <span className="text-2xl font-semibold text-brand-950/40"> {suffix}</span>}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 flex-1">
        {KEYS.map((k) => (
          <button key={k} type="button" className={key} onClick={() => onDigit(k)}>
            {k}
          </button>
        ))}
        <button type="button" className={key} onClick={() => onDigit('.')}>
          .
        </button>
        <button type="button" className={key} onClick={() => onDigit('0')}>
          0
        </button>
        <button type="button" className={key} onClick={() => onDigit('00')}>
          00
        </button>
        <button
          type="button"
          className={`${key} !text-2xl !font-bold text-amber-600`}
          onClick={onClear}
        >
          C
        </button>
        <button type="button" className={key} onClick={onBackspace} aria-label="Borrar último dígito">
          <Delete className="h-5 w-5 text-brand-950/60" />
        </button>
        <button
          type="button"
          disabled={enterDisabled}
          onClick={onEnter}
          className="rounded-xl bg-brand-500 text-white text-lg font-bold active:bg-brand-600 disabled:opacity-40 transition-colors focus:outline-none px-2"
        >
          {enterLabel}
        </button>
      </div>
    </div>
  );
}
