import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { PanInfo } from 'motion/react';
import type { CartLine, Product, Restaurant } from '../../types';
import { publicPriceLabel } from '../../utils/format';

interface Props {
  products: Product[];
  initialIndex: number;
  restaurant: Restaurant;
  orderingEnabled: boolean;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
  /** Si el producto necesita elegir variante/modificador obligatorio, no se puede añadir directo desde la galería. */
  onNeedsPicker: (product: Product) => void;
}

/** Igual que en MenuPage: si hay que elegir variante u opción obligatoria, no se puede "añadir" de un toque. */
function needsPicker(product: Product): boolean {
  return product.pricingMode === 'VARIANTS' || (product.modifierCategories ?? []).some((c) => c.isRequired);
}

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 600;
const PAGE_DISTANCE = 80;

/**
 * Galería de fotos a pantalla completa, estilo Instagram/Fotos de Apple: fondo negro,
 * la foto flota con sombra, sin botones — se navega deslizando a los lados (cambia de
 * producto) o hacia abajo (cierra). Solo incluye productos con foto, en el mismo orden
 * en que aparecen en el menú.
 */
export default function PhotoGallery({
  products,
  initialIndex,
  restaurant,
  orderingEnabled,
  onClose,
  onAdd,
  onNeedsPicker,
}: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [closing, setClosing] = useState(false);
  const product = products[index];

  if (!product) return null;

  const price = publicPriceLabel(product.price, restaurant);

  function handleAdd() {
    if (needsPicker(product)) {
      onNeedsPicker(product);
      return;
    }
    onAdd({ product, quantity: 1, selectedModifiers: [] });
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
            className="flex flex-col items-center px-6"
            drag
            dragElastic={0.65}
            dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
            onDragEnd={handleDragEnd}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96, y: 40 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          >
            <div
              className="rounded-[28px] overflow-hidden shadow-[0_50px_100px_-20px_rgba(0,0,0,0.9)] aspect-[4/5] w-[min(82vw,380px)] bg-neutral-900 shrink-0"
              style={{ touchAction: 'none' }}
            >
              <img
                src={product.photoUrl ?? undefined}
                alt={product.name}
                draggable={false}
                className="h-full w-full object-cover pointer-events-none select-none"
              />
            </div>

            <div className="mt-5 text-center max-w-sm">
              <h2 className="text-white text-lg font-semibold [text-shadow:0_2px_12px_rgba(0,0,0,0.6)]">{product.name}</h2>
              {product.description && (
                <p className="text-white/70 text-sm mt-1.5 leading-relaxed line-clamp-3 [text-shadow:0_2px_10px_rgba(0,0,0,0.6)]">
                  {product.description}
                </p>
              )}
              {orderingEnabled && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAdd();
                  }}
                  className="mt-4 text-white text-base font-medium underline decoration-white/30 underline-offset-4 hover:decoration-white active:scale-95 transition-transform [text-shadow:0_2px_10px_rgba(0,0,0,0.6)]"
                >
                  {price.primary} · Añadir al carrito
                </button>
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
