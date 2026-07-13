import { useEffect, useMemo, useRef, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import type { CartLine, Product, Restaurant } from '../../types';
import { publicPriceLabel } from '../../utils/format';
import { TextureButton } from '@/components/ui/texture-button';
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
}

function pickSuggestions(all: Product[], excludeId: string, count: number): Product[] {
  const pool = all.filter((p) => p.id !== excludeId);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export default function ProductDetailSheet({ product, restaurant, allProducts, onClose, onAdd, onSelectProduct }: Props) {
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
          <FamilyDrawerAnimatedWrapper>
            <FamilyDrawerClose />

            <div className="pt-4 max-h-[75vh] overflow-y-auto">
              <div className="flex justify-center mb-4">
                {product.photoUrl ? (
                  <img src={product.photoUrl} alt={product.name} className="h-40 w-40 rounded-full object-cover shadow-md" />
                ) : (
                  <div className="h-40 w-40 rounded-full bg-gradient-to-br from-brand-400/20 to-brand-500/10 flex items-center justify-center text-5xl">
                    🍽️
                  </div>
                )}
              </div>

              <h2 className="text-xl font-semibold text-center text-brand-950">{product.name}</h2>

              {(product.isStar || product.isPromo || product.isHouseSpecial) && (
                <div className="flex gap-1.5 justify-center mt-2">
                  {product.isStar && <Badge color="amber">Estrella</Badge>}
                  {product.isPromo && <Badge color="rose">Promo</Badge>}
                  {product.isHouseSpecial && <Badge color="indigo">Recomendado</Badge>}
                </div>
              )}

              {product.description && (
                <p className="text-sm text-brand-950/60 text-center font-light mt-3">{product.description}</p>
              )}

              <p className="text-center font-semibold text-brand-950 text-lg mt-3">
                {price.primary}
                {price.secondary && <span className="text-sm text-brand-950/40 font-normal"> · {price.secondary}</span>}
              </p>

              <div className="flex items-center justify-center gap-4 mt-4">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-9 h-9 rounded-full border border-brand-950/20 font-bold text-brand-950"
                >
                  −
                </button>
                <span className="w-6 text-center font-medium">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-9 h-9 rounded-full border border-brand-950/20 font-bold text-brand-950"
                >
                  +
                </button>
              </div>

              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nota de cocina (ej: sin cebolla)"
                className="w-full mt-4 text-sm border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />

              <TextureButton
                variant="brand"
                size="default"
                onClick={confirmAdd}
                disabled={justAdded}
                className="mt-4 flex items-center justify-center gap-1.5 disabled:opacity-80"
              >
                {justAdded ? (
                  <>
                    <ShoppingCart className="h-4 w-4" /> Añadido
                  </>
                ) : (
                  'Añadir al carrito'
                )}
              </TextureButton>

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
        <img src={product.photoUrl} alt={product.name} className="h-16 w-16 rounded-full object-cover mx-auto mb-1" />
      ) : (
        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-brand-400/20 to-brand-500/10 flex items-center justify-center text-xl mx-auto mb-1">
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
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${map[color]}`}>{children}</span>;
}
