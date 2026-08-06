import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { LogOut, RefreshCw } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Product, PublicMenu } from '../../types';
import { publicPriceLabel } from '../../utils/format';
import { TextureButton } from '@/components/ui/texture-button';

const ITEMS_PER_PAGE = 4;
const PAGE_INTERVAL_MS = 8000;
// El menú público ya excluye productos agotados/no disponibles server-side (stockControlEnabled +
// stockQuantity, ver menu.service.ts) — con volver a pedirlo cada tanto alcanza para que un producto
// que se agota (o vuelve a haber) desaparezca/reaparezca solo, sin tocar nada más en esta pantalla.
const MENU_REFRESH_MS = 45000;

/**
 * Pantalla (rol SCREEN): monitor/TV fijo de cara al público, afuera o en la vitrina del local —
 * carrusel del menú (solo nombre y precio, 4 productos por pantalla) para que quien pasa por
 * fuera vea todo lo que ofrece el restaurante sin necesitar el QR. Reemplaza la vista anterior de
 * Cocina/Mesas (esa información ya la tiene el staff en Comandas/Órdenes de Mesa) — este monitor
 * ahora es 100% de cara al cliente, sin datos operativos.
 */
export default function ScreenPage() {
  const { logout, restaurant } = useAuth();
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [page, setPage] = useState(0);

  function loadMenu() {
    if (!restaurant?.slug) return;
    api
      .get(`/public/menu/${restaurant.slug}`)
      .then((res) => setMenu(res.data.data))
      .catch(() => undefined);
  }

  useEffect(() => {
    loadMenu();
    const refreshInterval = setInterval(loadMenu, MENU_REFRESH_MS);
    return () => clearInterval(refreshInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.slug]);

  const items = useMemo(() => {
    if (!menu) return [];
    // Un producto puede aparecer en más de una categoría destacada — pero acá se muestra el
    // catálogo completo una sola vez, en el mismo orden en que ya viene organizado por categoría.
    const seen = new Set<string>();
    const flat: (Product & { categoryName: string })[] = [];
    for (const cat of menu.categories) {
      for (const p of cat.products) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        flat.push({ ...p, categoryName: cat.name });
      }
    }
    return flat;
  }, [menu]);

  const pageCount = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));

  useEffect(() => {
    if (pageCount <= 1) return;
    const rotateInterval = setInterval(() => setPage((p) => (p + 1) % pageCount), PAGE_INTERVAL_MS);
    return () => clearInterval(rotateInterval);
  }, [pageCount]);

  // Si el catálogo cambió de tamaño (producto agotado/reaparecido) y la página actual ya no
  // existe, vuelve a la primera en vez de quedar mostrando una lista vacía.
  useEffect(() => {
    if (page >= pageCount) setPage(0);
  }, [page, pageCount]);

  const currentItems = items.slice(page * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE + ITEMS_PER_PAGE);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#0A1428] text-white">
      <div className="fixed top-3 right-3 z-20 flex items-center gap-2 opacity-30 hover:opacity-100 transition-opacity">
        <TextureButton variant="icon" size="icon" aria-label="Refrescar" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" />
        </TextureButton>
        <TextureButton variant="icon" size="icon" aria-label="Cerrar sesión" onClick={logout}>
          <LogOut className="h-4 w-4" />
        </TextureButton>
      </div>

      <header className="flex flex-col items-center justify-center gap-2 pt-10 pb-6 shrink-0">
        {menu?.restaurant.logoUrl && (
          <img src={menu.restaurant.logoUrl} alt="" className="h-16 w-16 rounded-2xl object-cover shadow-lg" />
        )}
        <h1 className="text-4xl font-semibold tracking-tight">{menu?.restaurant.name ?? 'Menú'}</h1>
      </header>

      <div className="flex-1 flex items-center justify-center px-16 pb-10">
        {items.length === 0 ? (
          <p className="text-white/40 font-light text-2xl">El menú todavía no tiene productos disponibles.</p>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
              className="grid grid-cols-2 grid-rows-2 gap-8 w-full max-w-5xl"
            >
              {currentItems.map((p) => {
                const price = menu ? publicPriceLabel(p.price, menu.restaurant) : null;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-6 rounded-3xl bg-white/[0.06] border border-white/10 px-10 py-8"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-widest text-white/40 font-medium mb-1">{p.categoryName}</p>
                      <p className="text-3xl font-semibold truncate">{p.name}</p>
                    </div>
                    {price && (
                      <div className="text-right shrink-0">
                        <p className="text-3xl font-bold text-brand-400">{price.primary}</p>
                        {price.secondary && <p className="text-sm text-white/40">{price.secondary}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2 pb-8 shrink-0">
          {Array.from({ length: pageCount }).map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === page ? 'w-6 bg-brand-400' : 'w-1.5 bg-white/20'}`} />
          ))}
        </div>
      )}
    </div>
  );
}
