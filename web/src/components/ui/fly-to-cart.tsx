import { useCallback, useState } from 'react';
import type { RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';

interface FlyItem {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  photoUrl?: string | null;
}

let nextId = 0;

/** Anima un clon del producto volando desde el botón "Agregar" hasta el ícono del carrito. */
export function useFlyToCart(targetRef: RefObject<HTMLElement | null>) {
  const [items, setItems] = useState<FlyItem[]>([]);

  const trigger = useCallback(
    (originRect: DOMRect, photoUrl?: string | null) => {
      const targetRect = targetRef.current?.getBoundingClientRect();
      if (!targetRect) return;
      const originX = originRect.left + originRect.width / 2;
      const originY = originRect.top + originRect.height / 2;
      const targetX = targetRect.left + targetRect.width / 2;
      const targetY = targetRect.top + targetRect.height / 2;
      const id = nextId++;
      setItems((prev) => [...prev, { id, x: originX, y: originY, dx: targetX - originX, dy: targetY - originY, photoUrl }]);
    },
    [targetRef],
  );

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const layer = (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      <AnimatePresence>
        {items.map((item) => (
          <motion.div
            key={item.id}
            initial={{ x: item.x, y: item.y, scale: 1, opacity: 1 }}
            animate={{ x: item.x + item.dx, y: item.y + item.dy, scale: 0.2, opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
            onAnimationComplete={() => remove(item.id)}
            className="absolute left-0 top-0 h-10 w-10 -ml-5 -mt-5 rounded-full overflow-hidden shadow-lg ring-2 ring-white"
          >
            {item.photoUrl ? (
              <img src={item.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-brand-500 flex items-center justify-center text-white text-base">🍽️</div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );

  return { trigger, layer };
}
