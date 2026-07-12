import { useState } from 'react';
import type { CartLine, Product, Restaurant } from '../../types';
import { publicPriceLabel } from '../../utils/format';

export default function ProductCard({
  product,
  restaurant,
  onAdd,
}: {
  product: Product;
  restaurant: Restaurant;
  onAdd: (line: CartLine) => void;
}) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const price = publicPriceLabel(product.price, restaurant);

  function confirmAdd() {
    onAdd({ product, quantity, modifiers: [], note: note.trim() || undefined });
    setOpen(false);
    setQuantity(1);
    setNote('');
  }

  return (
    <div className="bg-white rounded-xl border p-3 flex gap-3">
      {product.photoUrl && (
        <img src={product.photoUrl} alt={product.name} className="w-20 h-20 rounded-lg object-cover shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-gray-900">{product.name}</p>
          <div className="text-right shrink-0">
            <p className="font-semibold text-gray-900">{price.primary}</p>
            {price.secondary && <p className="text-xs text-gray-400">{price.secondary}</p>}
          </div>
        </div>
        {product.description && <p className="text-sm text-gray-500 mt-0.5">{product.description}</p>}
        <div className="flex gap-1 mt-1">
          {product.isStar && <Badge color="amber">Estrella</Badge>}
          {product.isPromo && <Badge color="rose">Promo</Badge>}
          {product.isHouseSpecial && <Badge color="indigo">Recomendado</Badge>}
        </div>

        {!open ? (
          <button
            onClick={() => setOpen(true)}
            className="mt-2 text-sm font-medium text-white bg-gray-900 rounded-lg px-3 py-1.5"
          >
            Agregar
          </button>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-7 h-7 rounded-full border font-bold"
              >
                −
              </button>
              <span className="w-6 text-center">{quantity}</span>
              <button onClick={() => setQuantity((q) => q + 1)} className="w-7 h-7 rounded-full border font-bold">
                +
              </button>
            </div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nota de cocina (ej: sin cebolla)"
              className="w-full text-sm border rounded-lg px-2 py-1"
            />
            <div className="flex gap-2">
              <button onClick={confirmAdd} className="text-sm font-medium text-white bg-gray-900 rounded-lg px-3 py-1.5">
                Añadir al carrito
              </button>
              <button onClick={() => setOpen(false)} className="text-sm text-gray-500">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Badge({ children, color }: { children: string; color: 'amber' | 'rose' | 'indigo' }) {
  const map = {
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
    indigo: 'bg-indigo-100 text-indigo-700',
  };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${map[color]}`}>{children}</span>;
}
