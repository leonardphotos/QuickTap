import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock } from 'lucide-react';
import type { CartLine, Product, Restaurant } from '../../types';
import { publicPriceLabel } from '../../utils/format';
import {
  FamilyDrawerRoot,
  FamilyDrawerPortal,
  FamilyDrawerOverlay,
  FamilyDrawerContent,
  FamilyDrawerAnimatedWrapper,
  FamilyDrawerClose,
} from '@/components/ui/family-drawer';

interface Props {
  product: Product | null;
  restaurant: Restaurant;
  allProducts: Product[];
  onClose: () => void;
  onAdd: (line: CartLine) => void;
  onSelectProduct: (product: Product) => void;
  orderingEnabled: boolean;
}

function pickSuggestions(all: Product[], excludeId: string, count: number): Product[] {
  const pool = all.filter((p) => p.id !== excludeId);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export default function ProductDetailSheet({
  product,
  restaurant,
  allProducts,
  onClose,
  onAdd,
  onSelectProduct,
  orderingEnabled,
}: Props) {
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [justAdded, setJustAdded] = useState(false);
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuantity(1);
    setNote('');
    setJustAdded(false);
  }, [product?.id]);

  useEffect(() => {
    return () => {
      if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    };
  }, []);

  const suggestions = useMemo(() => {
    if (!product) return [];
    return pickSuggestions(allProducts, product.id, 3);
  }, [product?.id, allProducts]);

  if (!product) return null;

  const price = publicPriceLabel(product.price, restaurant);
  const lineTotal = publicPriceLabel(Number(product.price) * quantity, restaurant);

  function confirmAdd() {
    if (!product) return;
    onAdd({ product, quantity, modifiers: [], note: note.trim() || undefined });
    setQuantity(1);
    setNote('');
    setJustAdded(true);
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    addedTimerRef.current = setTimeout(() => setJustAdded(false), 1500);
  }

  return (
    <FamilyDrawerRoot open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <FamilyDrawerPortal>
        <FamilyDrawerOverlay onClick={onClose} />
        <FamilyDrawerContent>
          <FamilyDrawerAnimatedWrapper className="!px-0 !pt-0">
            <FamilyDrawerClose className="!bg-white/90 shadow-md !text-brand-950" />

            <div className="max-h-[75vh] overflow-y-auto">
              {product.photoUrl ? (
                <img src={product.photoUrl} alt={product.name} className="h-52 w-full object-cover" />
              ) : (
                <div className="h-52 w-full bg-gradient-to-br from-brand-400/20 to-brand-500/10 flex items-center justify-center text-6xl">
                  🍽️
                </div>
              )}

              <div className="px-6 pt-4 pb-6">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-semibold text-brand-950">{product.name}</h2>
                  {(product.isStar || product.isPromo || product.isHouseSpecial) && (
                    <div className="flex gap-1 shrink-0 pt-1">
                      {product.isStar && <Badge color="amber">Estrella</Badge>}
                      {product.isPromo && <Badge color="rose">Promo</Badge>}
                      {product.isHouseSpecial && <Badge color="indigo">Recomendado</Badge>}
                    </div>
                  )}
                </div>

                {product.description && (
                  <p className="text-sm text-brand-950/60 font-light mt-2 leading-relaxed">{product.description}</p>
                )}

                {product.prepTimeMinutes != null && (
                  <p className="text-xs text-brand-950/50 font-light mt-1.5 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> ~{product.prepTimeMinutes} min
                  </p>
                )}

                {orderingEnabled && (
                  <>
                    <div className="flex items-center justify-between mt-5">
                      <span className="text-sm font-medium text-brand-950/70">Cantidad</span>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                          className="w-8 h-8 rounded-full bg-brand-500 text-[color:var(--qt-button-text,white)] font-bold shadow-[0_8px_16px_-6px_rgba(5,108,242,0.5)] flex items-center justify-center disabled:opacity-40"
                          disabled={quantity <= 1}
                        >
                          −
                        </button>
                        <span className="w-5 text-center font-semibold text-brand-950">{quantity}</span>
                        <button
                          onClick={() => setQuantity((q) => q + 1)}
                          className="w-8 h-8 rounded-full bg-brand-500 text-[color:var(--qt-button-text,white)] font-bold shadow-[0_8px_16px_-6px_rgba(5,108,242,0.5)] flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Nota de cocina (ej: sin cebolla)"
                      className="w-full mt-4 text-sm border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                    />

                    <div className="flex items-center gap-3 mt-5">
                      <div className="bg-brand-500 text-[color:var(--qt-button-text,white)] rounded-full px-4 py-3 text-sm font-semibold whitespace-nowrap">
                        {lineTotal.primary}
                      </div>
                      <button
                        onClick={confirmAdd}
                        disabled={justAdded}
                        className="flex-1 rounded-full bg-brand-500 text-white text-sm font-semibold tracking-wide py-3 flex items-center justify-center gap-1.5 shadow-[0_16px_32px_-8px_rgba(5,108,242,0.45)] transition-opacity disabled:opacity-80"
                      >
                        {justAdded ? (
                          <>
                            <Check className="h-4 w-4" /> AÑADIDO
                          </>
                        ) : (
                          'AÑADIR AL CARRITO'
                        )}
                      </button>
                    </div>
                    {price.secondary && (
                      <p className="text-xs text-brand-950/40 text-center mt-2">Equivalente: {price.secondary}</p>
                    )}
                  </>
                )}

                {suggestions.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-brand-950/10">
                    <p className="text-sm font-semibold text-brand-950 mb-3">También te puede interesar</p>
                    <div className="grid grid-cols-3 gap-2">
                      {suggestions.map((s) => (
                        <SuggestionCard key={s.id} product={s} restaurant={restaurant} onClick={() => onSelectProduct(s)} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </FamilyDrawerAnimatedWrapper>
        </FamilyDrawerContent>
      </FamilyDrawerPortal>
    </FamilyDrawerRoot>
  );
}

function SuggestionCard({ product, restaurant, onClick }: { product: Product; restaurant: Restaurant; onClick: () => void }) {
  const price = publicPriceLabel(product.price, restaurant);
  return (
    <button onClick={onClick} className="text-center">
      {product.photoUrl ? (
        <img
          src={product.photoUrl}
          alt={product.name}
          loading="lazy"
          decoding="async"
          className="h-16 w-full rounded-xl object-cover mb-1"
        />
      ) : (
        <div className="h-16 w-full rounded-xl bg-gradient-to-br from-brand-400/20 to-brand-500/10 flex items-center justify-center text-xl mb-1">
          🍽️
        </div>
      )}
      <p className="text-xs font-medium text-brand-950 truncate">{product.name}</p>
      <p className="text-[11px] text-brand-950/50">{price.primary}</p>
    </button>
  );
}

function Badge({ children, color }: { children: string; color: 'amber' | 'rose' | 'indigo' }) {
  const map = {
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
    indigo: 'bg-indigo-100 text-indigo-700',
  };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${map[color]}`}>{children}</span>;
}
