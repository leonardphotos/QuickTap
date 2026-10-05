import { useState } from 'react';
import { Minus, PackageOpen, Plus } from 'lucide-react';
import { publicPriceLabel } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { ShopSheet } from './ShopSheet';
import { shopTierPrice } from '@/utils/shop-tier-price';
import { formatQty, stepFor, type StorefrontProduct, type StorefrontShop, type StorefrontVariant } from './shopStorefront';

interface Props {
  product: StorefrontProduct;
  shop: StorefrontShop;
  onClose: () => void;
  onAdd: (product: StorefrontProduct, variant: StorefrontVariant, qty: number) => void;
}

/** Elección de variante (talla/color, presentación…) y cantidad antes de sumar al carrito. */
export function ShopProductSheet({ product, shop, onClose, onAdd }: Props) {
  // Arranca en la primera variante que realmente se pueda pedir: preseleccionar una agotada
  // obliga al cliente a descubrir por qué el botón está apagado.
  const firstAvailable = product.variants.find((v) => v.available) ?? product.variants[0];
  const [variant, setVariant] = useState<StorefrontVariant | undefined>(firstAvailable);
  const [qty, setQty] = useState(() => stepFor(firstAvailable ?? { soldByWeight: false } as StorefrontVariant));

  const step = variant ? stepFor(variant) : 1;
  const price = publicPriceLabel((variant ? shopTierPrice(variant, qty) : product.price) * qty, shop);
  const original = variant?.originalPrice ? publicPriceLabel(variant.originalPrice, shop) : null;
  const maxQty = variant?.stockRemaining ?? Number.POSITIVE_INFINITY;
  // Las variantes sin nombre (v1 y v2 vacíos) son productos sin opciones: no hay nada que elegir.
  const hasRealVariants = product.variants.some((v) => v.v1 || v.v2);

  return (
    <ShopSheet onClose={onClose}>
      {product.photoUrl ? (
        <img src={product.photoUrl} alt={product.name} className="mb-4 aspect-[4/3] w-full rounded-3xl object-cover" />
      ) : (
        <div className="mb-4 flex aspect-[4/3] w-full items-center justify-center rounded-3xl bg-gradient-to-br from-brand-400/20 to-brand-500/10">
          <PackageOpen className="h-12 w-12 text-brand-950/25" strokeWidth={1.4} />
        </div>
      )}

      <h2 className="text-lg font-semibold text-brand-950">{product.name}</h2>
      {(product.brand || product.subcategory) && (
        <p className="mt-0.5 font-light text-brand-950/50 text-base">{[product.brand, product.subcategory].filter(Boolean).join(' · ')}</p>
      )}
      {original && (
        <p className="mt-1 font-light text-brand-950/40 line-through text-base">{original.primary}</p>
      )}

      {hasRealVariants && (
        <div className="mt-5">
          <p className="mb-2 font-semibold text-brand-950 text-base">Elige una opción</p>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((v) => {
              const label = [v.v1, v.v2].filter(Boolean).join(' · ') || 'Único';
              const selected = variant?.v1 === v.v1 && variant?.v2 === v.v2;
              const optionPrice = publicPriceLabel(v.price, shop).primary;
              return (
                <button
                  key={`${v.v1}|${v.v2}`}
                  disabled={!v.available}
                  onClick={() => {
                    setVariant(v);
                    setQty(stepFor(v));
                  }}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:line-through ${
                    selected
                      ? 'bg-brand-500 text-[color:var(--qt-button-text,white)]'
                      : 'bg-brand-950/[0.06] text-brand-950/70 hover:bg-brand-950/10'
                  }`}
                >
                  {label}
                  {product.hasVariablePrice && <span className="ml-1 opacity-70">· {optionPrice}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {variant?.description && (
        <p className="mt-4 rounded-2xl bg-brand-950/[0.045] px-4 py-3 leading-relaxed text-brand-950/65 text-base">
          {variant.description}
        </p>
      )}

      <div className="mt-5 flex items-center justify-between">
        <p className="font-semibold text-brand-950 text-base">Cantidad</p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setQty((q) => Math.max(step, Number((q - step).toFixed(3))))}
            disabled={qty <= step}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-950/[0.06] text-brand-950/70 disabled:opacity-40"
            aria-label="Quitar uno"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-16 text-center text-sm font-semibold text-brand-950">
            {variant ? formatQty(qty, variant) : qty}
          </span>
          <button
            onClick={() => setQty((q) => Math.min(maxQty, Number((q + step).toFixed(3))))}
            disabled={qty + step > maxQty + 0.0001}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-950/[0.06] text-brand-950/70 disabled:opacity-40"
            aria-label="Agregar uno"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-5">
        <TextureButton
          variant="brand"
          size="default"
          disabled={!variant || !variant.available}
          className="disabled:opacity-50"
          onClick={() => variant && onAdd(product, variant, qty)}
        >
          {variant?.available ? `Agregar · ${price.primary}` : 'Sin existencia'}
        </TextureButton>
        {price.secondary && variant?.available && (
          <p className="mt-2 text-center font-light text-brand-950/50 text-xs">{price.secondary}</p>
        )}
      </div>
    </ShopSheet>
  );
}
