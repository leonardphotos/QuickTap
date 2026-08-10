import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SUGGESTED_EXTRAS, type ClubExtra } from './clubPublic';

type Selected = ClubExtra & { quantity: number };

interface Props {
  selected: Selected[];
  onChange: (next: Selected[]) => void;
  onContinue: () => void;
}

/**
 * "¿Quieres algo al llegar?" — antes de pedir los datos.
 *
 * No muestra precios ni suma al total a propósito: todavía no está vinculado al
 * catálogo real del club, así que cualquier precio aquí sería inventado. Por eso
 * se presenta como un encargo que se paga en el club, y viaja con la reserva
 * como nota para recepción. Al vincularlo con la tienda pasará a cobrarse.
 */
export default function ClubExtrasStep({ selected, onChange, onContinue }: Props) {
  const qtyOf = (id: string) => selected.find((s) => s.id === id)?.quantity ?? 0;

  function setQty(extra: ClubExtra, quantity: number) {
    if (quantity <= 0) {
      onChange(selected.filter((s) => s.id !== extra.id));
      return;
    }
    const exists = selected.some((s) => s.id === extra.id);
    onChange(
      exists
        ? selected.map((s) => (s.id === extra.id ? { ...s, quantity } : s))
        : [...selected, { ...extra, quantity }],
    );
  }

  const total = selected.reduce((acc, s) => acc + s.quantity, 0);

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="text-[26px] font-bold tracking-tight">¿Quieres algo al llegar?</h1>
      <p className="mt-1 text-[13px] font-light text-club-text/65">
        Lo dejamos listo en recepción. Se paga en el club, no ahora.
      </p>

      <div className="mt-5 space-y-2.5">
        {SUGGESTED_EXTRAS.map((extra) => {
          const qty = qtyOf(extra.id);
          const active = qty > 0;
          return (
            <div
              key={extra.id}
              className={cn(
                'flex items-center gap-3 rounded-2xl border p-3.5 backdrop-blur-xl transition-colors',
                active ? 'border-white/50 bg-white/25' : 'border-white/20 bg-white/12',
              )}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 text-xl">
                {extra.emoji}
              </span>
              <span className="flex-1 text-[15px] font-semibold">{extra.name}</span>

              {qty === 0 ? (
                <button
                  onClick={() => setQty(extra, 1)}
                  className="shrink-0 rounded-full bg-white/20 px-4 py-2 text-[13px] font-bold transition-colors hover:bg-white/30"
                >
                  Añadir
                </button>
              ) : (
                <div className="flex shrink-0 items-center gap-1 rounded-full bg-white p-1 text-brand-950">
                  <button
                    onClick={() => setQty(extra, qty - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-brand-950/[0.06]"
                    aria-label={`Quitar ${extra.name}`}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-5 text-center text-[14px] font-bold">{qty}</span>
                  <button
                    onClick={() => setQty(extra, qty + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-brand-950/[0.06]"
                    aria-label={`Agregar ${extra.name}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-auto pt-6">
        <button
          onClick={onContinue}
          className="w-full rounded-full bg-white px-6 py-4 text-[15px] font-bold text-brand-950 shadow-xl transition-transform active:scale-[0.99]"
        >
          {total > 0 ? `Continuar con ${total} ${total === 1 ? 'extra' : 'extras'}` : 'Continuar sin extras'}
        </button>
      </div>
    </div>
  );
}
