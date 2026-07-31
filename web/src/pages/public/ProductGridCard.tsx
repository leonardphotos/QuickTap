import type { Product, Restaurant } from '../../types';
import { publicPriceLabel } from '../../utils/format';

interface Props {
  product: Product;
  restaurant: Restaurant;
  onOpen: (product: Product) => void;
}

export default function ProductGridCard({ product, restaurant, onOpen }: Props) {
  const price = publicPriceLabel(product.price, restaurant);
  const originalPrice = product.onTimePromo && product.originalPrice ? publicPriceLabel(product.originalPrice, restaurant) : null;

  return (
    <button
      onClick={() => onOpen(product)}
      className="text-left rounded-3xl bg-white p-2.5 flex flex-col shadow-[0_2px_14px_-4px_rgba(0,0,0,0.1)] hover:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.16)] transition-shadow duration-300"
    >
      <div className="relative mb-2.5">
        {product.photoUrl ? (
          <img
            src={product.photoUrl}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="aspect-[4/5] w-full rounded-2xl object-cover"
          />
        ) : (
          <div className="aspect-[4/5] w-full rounded-2xl bg-gradient-to-br from-brand-400/20 to-brand-500/10 flex items-center justify-center text-4xl">
            🍽️
          </div>
        )}
        <span className="absolute -bottom-2 right-2 flex items-center gap-1.5 bg-brand-500 text-[color:var(--qt-button-text,white)] text-xs font-semibold px-2.5 py-1 rounded-full shadow">
          {originalPrice && <span className="opacity-60 line-through font-normal">{originalPrice.primary}</span>}
          {price.primary}
        </span>
        {(product.isStar || product.isPromo || product.isHouseSpecial || product.onTimePromo) && (
          <div className="absolute top-1.5 left-1.5 flex flex-col gap-1 items-start">
            {product.isStar && <Badge color="amber">Estrella</Badge>}
            {product.isPromo && <Badge color="rose">Promo</Badge>}
            {product.isHouseSpecial && <Badge color="indigo">Recomendado</Badge>}
            {product.onTimePromo && <Badge color="emerald">⏰ Oferta</Badge>}
          </div>
        )}
      </div>

      <p className="font-semibold text-sm text-brand-950 truncate">{product.name}</p>
      {product.description && (
        <p className="text-xs text-brand-950/50 font-light line-clamp-1 mt-0.5">{product.description}</p>
      )}
    </button>
  );
}

function Badge({ children, color }: { children: string; color: 'amber' | 'rose' | 'indigo' | 'emerald' }) {
  const map = {
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
    indigo: 'bg-indigo-100 text-indigo-700',
    emerald: 'bg-emerald-100 text-emerald-700',
  };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shadow-sm ${map[color]}`}>{children}</span>;
}
