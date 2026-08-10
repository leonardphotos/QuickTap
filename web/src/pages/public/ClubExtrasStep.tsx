import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ClubExtra } from './clubPublic';

type Selected = ClubExtra & { quantity: number };

interface Props {
  products: ClubExtra[];
  selected: Selected[];
  onChange: (next: Selected[]) => void;
  onContinue: () => void;
  symbol: string;
}

/**
 * "¿Quieres algo al llegar?" — antes de pedir los datos. Muestra el mismo
 * catálogo real que la tablet de la cancha (tienda del club + menú del
 * restaurante vinculado), con precio. El padre (ClubPublicPage) no llega a
 * montar esta pantalla si el catálogo está vacío.
 */
export default function ClubExtrasStep({ products, selected, onChange, onContinue, symbol }: Props) {
  const qtyOf = (id: string) => selected.find((s) => s.id === id)?.quantity ?? 0;

  function setQty(product: ClubExtra, quantity: number) {
    const capped = product.stock != null ? Math.min(quantity, product.stock) : quantity;
    if (capped <= 0) {
      onChange(selected.filter((s) => s.id !== product.id));
      return;
    }
    const exists = selected.some((s) => s.id === product.id);
    onChange(
      exists
        ? selected.map((s) => (s.id === product.id ? { ...s, quantity: capped } : s))
        : [...selected, { ...product, quantity: capped }],
    );
  }

  const total = selected.reduce((acc, s) => acc + s.quantity, 0);
  const totalPrice = selected.reduce((acc, s) => acc + Number(s.priceBase) * s.quantity, 0);

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="text-[26px] font-bold tracking-tight">¿Quieres algo al llegar?</h1>
      <p className="mt-1 text-[13px] font-light text-club-text/65">
        Lo dejamos listo en recepción. Se paga en el club, no ahora.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {products.map((product) => {
          const qty = qtyOf(product.id);
          const active = qty > 0;
          const soldOut = product.stock != null && product.stock <= 0;
          return (
            <div
              key={product.id}
              className={cn(
                'flex flex-col overflow-hidden rounded-2xl border backdrop-blur-xl transition-colors',
                active ? 'border-white/50 bg-white/25' : 'border-white/20 bg-white/12',
              )}
            >
              {product.photoUrl ? (
                <img src={product.photoUrl} alt="" className="h-20 w-full object-cover" />
              ) : (
                <div className="flex h-20 w-full items-center justify-center bg-white/10 text-2xl">🎾</div>
              )}
              <div className="flex flex-1 flex-col p-2.5">
                <p className="line-clamp-2 text-[13px] font-semibold leading-tight">{product.name}</p>
                <p className="mt-auto pt-1.5 text-[14px] font-bold">
                  {symbol}
                  {product.priceBase}
                </p>

                {qty === 0 ? (
                  <button
                    onClick={() => setQty(product, 1)}
                    disabled={soldOut}
                    className="mt-2 rounded-full bg-white/20 py-2 text-[12px] font-bold transition-colors hover:bg-white/30 disabled:opacity-40"
                  >
                    {soldOut ? 'Agotado' : 'Añadir'}
                  </button>
                ) : (
                  <div className="mt-2 flex items-center justify-between rounded-full bg-white p-1 text-brand-950">
                    <button
                      onClick={() => setQty(product, qty - 1)}
                      className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-brand-950/[0.06]"
                      aria-label={`Quitar ${product.name}`}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="text-[13px] font-bold">{qty}</span>
                    <button
                      onClick={() => setQty(product, qty + 1)}
                      disabled={product.stock != null && qty >= product.stock}
                      className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-brand-950/[0.06] disabled:opacity-30"
                      aria-label={`Agregar ${product.name}`}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-auto pt-6">
        {total > 0 && (
          <p className="mb-2 text-center text-[13px] font-light text-club-text/65">
            Total estimado: {symbol}
            {totalPrice.toFixed(2)}
          </p>
        )}
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
