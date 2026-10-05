import type { Product, Restaurant } from '../../types';
import { Utensils } from 'lucide-react';
import { productDisplayPriceBase, publicPriceLabel } from '../../utils/format';

interface Props {
  product: Product;
  restaurant: Restaurant;
  onOpen: (product: Product) => void;
}

export default function ProductGridCard({ product, restaurant, onOpen }: Props) {
  const displayPrice = productDisplayPriceBase(product);
  const price = publicPriceLabel(displayPrice.amountBase, restaurant);
  const originalPrice = product.onTimePromo && product.originalPrice ? publicPriceLabel(product.originalPrice, restaurant) : null;

  return (
    <button
      onClick={() => onOpen(product)}
      type="button"
      className="group flex min-w-0 flex-col rounded-[26px] border border-black/[0.045] bg-white/90 p-2.5 text-left shadow-[0_8px_30px_-22px_rgba(0,0,0,.4)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_42px_-24px_rgba(0,0,0,.45)] active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transform-none motion-reduce:transition-none"
    >
      <div className="relative mb-2.5">
        {product.photoUrl ? (
          <img
            src={product.photoUrl}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="aspect-[4/5] w-full rounded-[20px] object-cover"
          />
        ) : (
          <div className="aspect-[4/5] w-full rounded-2xl bg-gradient-to-br from-brand-400/20 to-brand-500/10 flex items-center justify-center text-4xl">
            <Utensils className="h-10 w-10 text-brand-950/25" strokeWidth={1.4} />
          </div>
        )}
        <span className="absolute -bottom-2 right-2 flex items-center gap-1.5 bg-brand-500 text-[color:var(--qt-button-text,white)] text-xs font-semibold px-2.5 py-1 rounded-full shadow">
          {originalPrice && <span className="opacity-60 line-through font-normal">{originalPrice.primary}</span>}
          {displayPrice.isFromVariant && <span className="opacity-75 font-normal">Desde</span>}
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

      <p className="mt-1 line-clamp-2 px-0.5 font-semibold tracking-[-0.01em] text-brand-950 text-base">{product.name}</p>
      {product.description && (
        <p className="text-brand-950/50 font-light line-clamp-1 mt-0.5 text-xs">{product.description}</p>
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
