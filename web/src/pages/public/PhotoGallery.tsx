import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { PanInfo } from 'motion/react';
import { ChevronRight, X } from 'lucide-react';
import type { CartLine, ModifierCategory, Product, Restaurant, SelectedModifier } from '../../types';
import { formatBase, formatModifierLabel, modifierSelectionKey, publicPriceLabel } from '../../utils/format';
import { effectiveMax, effectiveMin, effectiveModifierPrice, aplicaAlTamano } from '../../utils/modifierLimits';

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
  return modifierSelectionKey(a) === modifierSelectionKey(b);
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
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  // Variantes y modificadores viven en su propio panel, no como chips apilados debajo de la
  // foto — con varias categorías esa lista empujaba la foto entera fuera de la pantalla.
  const [panel, setPanel] = useState<'variants' | 'modifiers' | null>(null);

  const product = products[index];

  useEffect(() => {
    if (!product) return;
    const firstVariant =
      product.pricingMode === 'VARIANTS' ? product.variants?.find((v) => v.isAvailable !== false) : undefined;
    setSelectedVariantId(firstVariant?.id ?? null);
    setSelectedQty({});
    setPanel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  if (!product) return null;

  const selectedVariant =
    product.pricingMode === 'VARIANTS' ? product.variants?.find((v) => v.id === selectedVariantId) : undefined;
  // Solo los grupos que se ofrecen en el tamaño elegido. Filtrar acá y no en cada uso hace que
  // todo lo de abajo (lo elegido, los obligatorios que faltan, el total) mire la misma lista:
  // un grupo que no aplica no puede exigirse ni cobrarse, y el servidor lo rechaza igual.
  const modifierCategories = (product.modifierCategories ?? []).filter((c) => aplicaAlTamano(c, selectedVariant?.id));
  const basePrice = selectedVariant ? Number(selectedVariant.priceBase) : Number(product.price);
  const chosenModifiers: SelectedModifier[] = modifierCategories.flatMap((c) =>
    c.modifiers
      .filter((m) => (selectedQty[m.id] ?? 0) > 0)
      // effectiveModifierPrice y no m.priceBase: un modificador puede costar distinto según el
      // tamaño elegido, y el servidor cobra ESE precio al crear el pedido. Con el precio base
      // acá, el cliente veía un total en la galería y le llegaba otro.
      .map((m) => ({
        modifierId: m.id,
        name: m.name,
        priceBase: String(effectiveModifierPrice(m, selectedVariant?.id)),
        quantity: selectedQty[m.id],
      })),
  );
  const modifiersTotal = chosenModifiers.reduce((acc, m) => acc + Number(m.priceBase) * m.quantity, 0);
  const unitPrice = basePrice + modifiersTotal;
  const price = publicPriceLabel(unitPrice, restaurant);

  function categoryTotal(category: ModifierCategory): number {
    return category.modifiers.reduce((acc, m) => acc + (selectedQty[m.id] ?? 0), 0);
  }

  const needsVariant = product.pricingMode === 'VARIANTS' && !selectedVariant;
  const missingRequiredCategory = modifierCategories.some((c) => categoryTotal(c) < effectiveMin(c));
  const canAdd = !needsVariant && !missingRequiredCategory;
  const hasVariants = product.pricingMode === 'VARIANTS' && !!product.variants && product.variants.length > 0;
  const totalModifiersSelected = chosenModifiers.reduce((acc, m) => acc + m.quantity, 0);
  const variantsLabel = selectedVariant ? selectedVariant.name : 'Elige una opción';
  const modifiersLabel =
    totalModifiersSelected > 0
      ? `${totalModifiersSelected} extra${totalModifiersSelected > 1 ? 's' : ''} elegido${totalModifiersSelected > 1 ? 's' : ''}`
      : missingRequiredCategory
        ? 'Elige tus opciones'
        : 'Personalizar (opcional)';

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

  /** Categorías de una sola opción: tocar la ya elegida la deselecciona (si es opcional). */
  function toggleSingle(category: ModifierCategory, modifierId: string) {
    setSelectedQty((prev) => {
      const next = { ...prev };
      const wasSelected = (prev[modifierId] ?? 0) > 0;
      for (const m of category.modifiers) delete next[m.id];
      if (wasSelected && !category.isRequired) return next;
      next[modifierId] = 1;
      return next;
    });
  }

  /** Categorías de varias opciones: cada toque suma +1, respetando el tope total de la
   * categoría y el propio del modificador — tocar de más simplemente no hace nada. */
  function tapMultiply(category: ModifierCategory, modifierId: string) {
    setSelectedQty((prev) => {
      const current = prev[modifierId] ?? 0;
      const modifierMax = category.modifiers.find((m) => m.id === modifierId)?.maxQuantity ?? Infinity;
      if (categoryTotal(category) >= effectiveMax(category) || current >= modifierMax) return prev;
      return { ...prev, [modifierId]: current + 1 };
    });
  }

  function toggleModifier(category: ModifierCategory, modifierId: string) {
    if (category.allowMultiple) tapMultiply(category, modifierId);
    else toggleSingle(category, modifierId);
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

              {/* Botones resumen: abren su lista en un panel aparte en vez de apilar chips
                  debajo de la foto, que con varias variantes/modificadores la empujaban
                  fuera de la pantalla. */}
              {orderingEnabled && hasVariants && (
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  transition={CHIP_SPRING}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPanel('variants');
                  }}
                  className="mt-3 w-full flex items-center justify-between gap-3 bg-white/10 border border-white/25 backdrop-blur-sm rounded-2xl px-4 py-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-white/50 text-[11px] font-medium tracking-wide">
                      Opciones{needsVariant && <span className="text-amber-300"> · Obligatorio</span>}
                    </span>
                    <span className="block text-white text-sm font-semibold mt-0.5 truncate">{variantsLabel}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-white/40 shrink-0" />
                </motion.button>
              )}

              {orderingEnabled && modifierCategories.length > 0 && (
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  transition={CHIP_SPRING}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPanel('modifiers');
                  }}
                  className="mt-3 w-full flex items-center justify-between gap-3 bg-white/10 border border-white/25 backdrop-blur-sm rounded-2xl px-4 py-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-white/50 text-[11px] font-medium tracking-wide">
                      Modificadores{missingRequiredCategory && <span className="text-amber-300"> · Obligatorio</span>}
                    </span>
                    <span className="block text-white text-sm font-semibold mt-0.5 truncate">{modifiersLabel}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-white/40 shrink-0" />
                </motion.button>
              )}

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

          <AnimatePresence>
            {panel && (
              <motion.div
                className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setPanel(null);
                }}
              >
                <motion.div
                  onClick={(e) => e.stopPropagation()}
                  initial={{ opacity: 0, scale: 0.94, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 8 }}
                  transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                  className="w-full max-w-sm max-h-[70vh] overflow-y-auto rounded-[24px] border border-white/10 bg-neutral-900/95 backdrop-blur-xl p-5"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-semibold text-base">
                      {panel === 'variants' ? 'Elige una opción' : 'Personaliza tu pedido'}
                    </h3>
                    <button onClick={() => setPanel(null)} className="text-white/50 hover:text-white -m-1.5 p-1.5">
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  {panel === 'variants' && product.variants && (
                    <div className="flex flex-col gap-1.5">
                      {product.variants.map((v) => {
                        const selected = selectedVariantId === v.id;
                        return (
                          <button
                            key={v.id}
                            onClick={() => {
                              setSelectedVariantId(v.id);
                              setPanel(null);
                            }}
                            className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                              selected ? 'bg-white text-neutral-900 border-white' : 'border-white/15 text-white hover:bg-white/5'
                            }`}
                          >
                            <span className="font-medium text-sm">{v.name}</span>
                            <span className={`text-sm shrink-0 ${selected ? 'text-neutral-500' : 'text-white/50'}`}>
                              {formatBase(v.priceBase, restaurant.currencySymbol)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {panel === 'modifiers' && (
                    <div className="flex flex-col gap-5">
                      {modifierCategories.map((category) => (
                        <div key={category.id}>
                          <p className="text-white/50 text-[11px] font-medium tracking-wide">
                            {category.name}
                            {category.isRequired && <span className="text-amber-300"> · Obligatorio</span>}
                          </p>
                          <div className="flex flex-col gap-1.5 mt-2">
                            {category.modifiers.map((m) => {
                              const qty = selectedQty[m.id] ?? 0;
                              const selected = qty > 0;
                              const modPrice = effectiveModifierPrice(m, selectedVariant?.id);
                              const atCap =
                                category.allowMultiple &&
                                (categoryTotal(category) >= effectiveMax(category) || qty >= (m.maxQuantity ?? Infinity));
                              return (
                                <button
                                  key={m.id}
                                  disabled={atCap && !selected}
                                  onClick={() => toggleModifier(category, m.id)}
                                  className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                                    selected ? 'bg-white text-neutral-900 border-white' : 'border-white/15 text-white hover:bg-white/5'
                                  } ${atCap && !selected ? 'opacity-40' : ''}`}
                                >
                                  <span className="font-medium text-sm">
                                    {formatModifierLabel({ name: m.name, quantity: qty || undefined })}
                                  </span>
                                  {modPrice > 0 && (
                                    <span className={`text-sm shrink-0 ${selected ? 'text-neutral-500' : 'text-white/50'}`}>
                                      +{formatBase(modPrice, restaurant.currencySymbol)}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={() => setPanel(null)}
                        className="w-full bg-white text-neutral-900 rounded-full py-2.5 font-semibold text-sm"
                      >
                        Listo
                      </button>
                    </div>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

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
