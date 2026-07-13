import type { Product, Restaurant } from '../../types';
import { publicPriceLabel } from '../../utils/format';

interface Props {
  product: Product;
  restaurant: Restaurant;
  onOpen: (product: Product) => void;
}

export default function ProductGridCard({ product, restaurant, onOpen }: Props) {
  const price = publicPriceLabel(product.price, restaurant);

  return (
    <button
      onClick={() => onOpen(product)}
      className="text-left rounded-3xl bg-white p-3 flex flex-col items-center shadow-sm hover:shadow-lg transition-shadow duration-300"
    >
      <div className="relative mb-2">
        {product.photoUrl ? (
          <img src={product.photoUrl} alt={product.name} className="h-28 w-28 rounded-full object-cover" />
        ) : (
          <div className="h-28 w-28 rounded-full bg-gradient-to-br from-brand-400/20 to-brand-500/10 flex items-center justify-center text-3xl">
            🍽️
          </div>
        )}
        <span className="absolute -bottom-1 right-0 bg-brand-950 text-[color:var(--qt-button-text,white)] text-xs font-semibold px-2 py-1 rounded-full shadow">
          {price.primary}
        </span>
      </div>

      {(product.isStar || product.isPromo || product.isHouseSpecial) && (
        <div className="flex gap-1 justify-center flex-wrap mb-1">
          {product.isStar && <Badge color="amber">Estrella</Badge>}
          {product.isPromo && <Badge color="rose">Promo</Badge>}
          {product.isHouseSpecial && <Badge color="indigo">Recomendado</Badge>}
        </div>
      )}

      <p className="font-semibold text-sm text-brand-950 text-center w-full truncate">{product.name}</p>
      {product.description && (
        <p className="text-xs text-brand-950/50 text-center font-light line-clamp-2 mt-0.5">{product.description}</p>
      )}
    </button>
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
