import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { PanInfo } from 'motion/react';
import type { CartLine, ModifierCategory, Product, Restaurant, SelectedModifier } from '../../types';
import { formatBase, publicPriceLabel } from '../../utils/format';

interface Props {
  products: Product[];
  initialIndex: number;
  restaurant: Restaurant;
  orderingEnabled: boolean;
  cart: CartLine[];
  onClose: () => void;
  onAdd: (line: CartLine) => void;
  onRemoveOne: (line: CartLine) => void;
}

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 600;
const PAGE_DISTANCE = 80;

const CHIP_SPRING = { type: 'spring' as const, bounce: 0, duration: 0.3 };

function sameModifiers(a: SelectedModifier[], b: SelectedModifier[]): boolean {
  return JSON.stringify(a.map((m) => m.modifierId).sort()) === JSON.stringify(b.map((m) => m.modifierId).sort());
}

/**
 * Galería de fotos a pantalla completa, estilo Instagram/Fotos de Apple: fondo negro,
 * la foto flota con sombra — se navega deslizando la foto a los lados (cambia de
 * producto) o hacia abajo (cierra). Si el producto tiene variantes o modificadores,
 * se eligen ahí mismo antes de poder añadir. Solo incluye productos con foto, en el
 * mismo orden en que aparecen en el menú.
 */
export default function PhotoGallery({
  products,
  initialIndex,
  restaurant,
  orderingEnabled,
  cart,
  onClose,
  onAdd,
  onRemoveOne,
}: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [closing, setClosing] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([]);

  const product = products[index];

  useEffect(() => {
    if (!product) return;
    const firstVariant =
      product.pricingMode === 'VARIANTS' ? product.variants?.find((v) => v.isAvailable !== false) : undefined;
    setSelectedVariantId(firstVariant?.id ?? null);
    setSelectedModifierIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  if (!product) return null;

  const modifierCategories = product.modifierCategories ?? [];
  const selectedVariant =
    product.pricingMode === 'VARIANTS' ? product.variants?.find((v) => v.id === selectedVariantId) : undefined;
  const basePrice = selectedVariant ? Number(selectedVariant.priceBase) : Number(product.price);
  const chosenModifiers: SelectedModifier[] = modifierCategories.flatMap((c) =>
    c.modifiers.filter((m) => selectedModifierIds.includes(m.id)).map((m) => ({ modifierId: m.id, name: m.name, priceBase: m.priceBase })),
  );
  const modifiersTotal = chosenModifiers.reduce((acc, m) => acc + Number(m.priceBase), 0);
  const unitPrice = basePrice + modifiersTotal;
  const price = publicPriceLabel(unitPrice, restaurant);

  const needsVariant = product.pricingMode === 'VARIANTS' && !selectedVariant;
  const missingRequiredCategory = modifierCategories.some(
    (c) => c.isRequired && !c.modifiers.some((m) => selectedModifierIds.includes(m.id)),
  );
  const canAdd = !needsVariant && !missingRequiredCategory;

  const currentLine: CartLine = {
    product,
    quantity: 1,
    variantId: selectedVariant?.id,
    variantName: selectedVariant?.name,
    selectedModifiers: chosenModifiers,
  };

  const cartQuantity = canAdd
    ? cart.find(
        (l) => l.product.id === product.id && !l.note && l.variantId === currentLine.variantId && sameModifiers(l.selectedModifiers, chosenModifiers),
      )?.quantity ?? 0
    : 0;

  function toggleModifier(category: ModifierCategory, modifierId: string) {
    setSelectedModifierIds((prev) => {
      const inCategory = new Set(category.modifiers.map((m) => m.id));
      if (category.allowMultiple) {
        return prev.includes(modifierId) ? prev.filter((id) => id !== modifierId) : [...prev, modifierId];
      }
      const withoutCategory = prev.filter((id) => !inCategory.has(id));
      if (prev.includes(modifierId) && !category.isRequired) return withoutCategory;
      return [...withoutCategory, modifierId];
    });
  }

  function handleDragEnd(_: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    const { offset, velocity } = info;
    const verticalDominant = Math.abs(offset.y) > Math.abs(offset.x);

    if (verticalDominant && (offset.y > DISMISS_DISTANCE || velocity.y > DISMISS_VELOCITY)) {
      setClosing(true);
      return;
    }
    if (!verticalDominant && (offset.x < -PAGE_DISTANCE || velocity.x < -500) && index < products.length - 1) {
      setIndex((i) => i + 1);
      return;
    }
    if (!verticalDominant && (offset.x > PAGE_DISTANCE || velocity.x > 500) && index > 0) {
      setIndex((i) => i - 1);
    }
  }

  return (
    <AnimatePresence onExitComplete={onClose}>
      {!closing && (
        <motion.div
          className="fixed inset-0 z-[70] bg-black flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onClick={() => setClosing(true)}
        >
          <motion.div
            key={product.id}
            className="flex flex-col items-center px-6 w-full"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96, y: 40 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          >
            {/* El arrastre vive solo en la foto: así los chips y botones de abajo se
                pueden tocar sin competir con el gesto de deslizar/cerrar. */}
            <motion.div
              drag
              dragElastic={0.65}
              dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
              onDragEnd={handleDragEnd}
              className="rounded-[28px] overflow-hidden shadow-[0_50px_100px_-20px_rgba(0,0,0,0.9)] aspect-[4/5] w-[min(92vw,480px)] max-h-[56vh] bg-neutral-900 shrink-0"
              style={{ touchAction: 'none' }}
            >
              <img
                src={product.photoUrl ?? undefined}
                alt={product.name}
                draggable={false}
                className="h-full w-full object-cover pointer-events-none select-none"
              />
            </motion.div>

            <div className="mt-5 text-center max-w-sm w-full">
              <h2 className="text-white text-lg font-semibold [text-shadow:0_2px_12px_rgba(0,0,0,0.6)]">{product.name}</h2>
              {product.description && (
                <p className="text-white/70 text-sm mt-1.5 leading-relaxed line-clamp-3 [text-shadow:0_2px_10px_rgba(0,0,0,0.6)]">
                  {product.description}
                </p>
              )}
              <p className="text-white text-base font-semibold mt-2.5 [text-shadow:0_2px_10px_rgba(0,0,0,0.6)]">
                {price.primary}
                {price.secondary && <span className="text-white/60 font-normal"> · {price.secondary}</span>}
              </p>

              {orderingEnabled && product.pricingMode === 'VARIANTS' && product.variants && product.variants.length > 0 && (
                <div className="mt-4">
                  <p className="text-white/50 text-[11px] font-medium tracking-wide">Elige una opción</p>
                  <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                    {product.variants.map((v) => {
                      const selected = selectedVariantId === v.id;
                      return (
                        <motion.button
                          key={v.id}
                          whileTap={{ scale: 0.94 }}
                          transition={CHIP_SPRING}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedVariantId(v.id);
                          }}
                          className={`text-xs font-medium px-3.5 py-1.5 rounded-full border backdrop-blur-sm transition-colors ${
                            selected ? 'bg-white text-neutral-900 border-white' : 'bg-white/10 text-white border-white/25'
                          }`}
                        >
                          {v.name} · {formatBase(v.priceBase, restaurant.currencySymbol)}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              )}

              {orderingEnabled &&
                modifierCategories.map((category) => (
                  <div key={category.id} className="mt-4">
                    <p className="text-white/50 text-[11px] font-medium tracking-wide">
                      {category.name}
                      {category.isRequired && <span className="text-amber-300"> · Obligatorio</span>}
                    </p>
                    <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                      {category.modifiers.map((m) => {
                        const selected = selectedModifierIds.includes(m.id);
                        return (
                          <motion.button
                            key={m.id}
                            whileTap={{ scale: 0.94 }}
                            transition={CHIP_SPRING}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleModifier(category, m.id);
                            }}
                            className={`text-xs font-medium px-3.5 py-1.5 rounded-full border backdrop-blur-sm transition-colors ${
                              selected ? 'bg-white text-neutral-900 border-white' : 'bg-white/10 text-white border-white/25'
                            }`}
                          >
                            {m.name}
                            {Number(m.priceBase) > 0 && ` +${formatBase(m.priceBase, restaurant.currencySymbol)}`}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                ))}

              {orderingEnabled && (
                <motion.div layout="position" transition={CHIP_SPRING} className="mt-5 flex justify-center">
                  {cartQuantity > 0 ? (
                    <motion.div
                      layout
                      transition={CHIP_SPRING}
                      className="inline-flex items-center gap-4 bg-white rounded-full px-2 py-1.5 shadow-[0_12px_28px_-8px_rgba(0,0,0,0.7)]"
                    >
                      <motion.button
                        whileTap={{ scale: 0.85 }}
                        transition={CHIP_SPRING}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveOne(currentLine);
                        }}
                        className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-900 font-bold flex items-center justify-center"
                      >
                        −
                      </motion.button>
                      <span className="text-neutral-900 font-semibold text-base w-5 text-center">{cartQuantity}</span>
                      <motion.button
                        whileTap={{ scale: 0.85 }}
                        transition={CHIP_SPRING}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAdd(currentLine);
                        }}
                        className="w-8 h-8 rounded-full bg-neutral-900 text-white font-bold flex items-center justify-center"
                      >
                        +
                      </motion.button>
                    </motion.div>
                  ) : (
                    <motion.button
                      layout
                      transition={CHIP_SPRING}
                      whileTap={canAdd ? { scale: 0.94 } : undefined}
                      disabled={!canAdd}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (canAdd) onAdd(currentLine);
                      }}
                      className="bg-white text-neutral-900 text-sm font-semibold px-6 py-2.5 rounded-full shadow-[0_12px_28px_-8px_rgba(0,0,0,0.7)] disabled:opacity-40"
                    >
                      {canAdd ? 'Añadir al carrito' : 'Elige las opciones'}
                    </motion.button>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>

          {products.length > 1 && (
            <div className="absolute bottom-7 flex gap-1.5">
              {products.map((p, i) => (
                <span
                  key={p.id}
                  className={`h-1 rounded-full transition-all duration-300 ${i === index ? 'w-5 bg-white' : 'w-1 bg-white/30'}`}
                />
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
