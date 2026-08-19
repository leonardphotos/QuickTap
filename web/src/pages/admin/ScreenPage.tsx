import { useEffect, useMemo, useState } from 'react';
import { LogOut, RefreshCw } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Product, PublicMenu } from '../../types';
import { productDisplayPriceBase, publicPriceLabel } from '../../utils/format';
import { TextureButton } from '@/components/ui/texture-button';

// El menú público ya excluye productos agotados/no disponibles server-side (stockControlEnabled +
// stockQuantity, ver menu.service.ts) — con volver a pedirlo cada tanto alcanza para que un producto
// que se agota (o vuelve a haber) desaparezca/reaparezca solo, sin tocar nada más en esta pantalla.
const MENU_REFRESH_MS = 45000;

// Grilla según cuántos productos entran por pantalla (Ajustes -> Pantalla, screenItemsPerPage).
const GRID_CLASS: Record<number, string> = {
  2: 'grid-cols-2 grid-rows-1',
  4: 'grid-cols-2 grid-rows-2',
  6: 'grid-cols-3 grid-rows-2',
};

/**
 * Pantalla (rol SCREEN): monitor/TV fijo de cara al público, afuera o en la vitrina del local —
 * carrusel del menú (foto 1x1 a pantalla completa con degradado, nombre/descripción/precio
 * encima, 4 productos por pantalla) para que quien pasa por fuera vea todo lo que ofrece el
 * restaurante sin necesitar el QR. Reemplaza la vista anterior de Cocina/Mesas (esa información
 * ya la tiene el staff en Comandas/Órdenes de Mesa) — este monitor ahora es 100% de cara al
 * cliente, sin datos operativos.
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

  // Ajustes -> Pantalla (PantallaSection.tsx): qué mostrar, cuánto dura cada pantalla y cuántos
  // productos entran por pantalla. Todos con default por si el restaurante nunca los tocó.
  const displayMode = restaurant?.screenDisplayMode ?? 'ALL';
  const screenCategoryIds = restaurant?.screenCategoryIds ?? [];
  const screenProductIds = restaurant?.screenProductIds ?? [];
  const itemsPerPage = restaurant?.screenItemsPerPage ?? 4;
  const pageIntervalMs = (restaurant?.screenPageIntervalSec ?? 6) * 1000;

  const items = useMemo(() => {
    if (!menu) return [];
    // Un producto puede aparecer en más de una categoría destacada — pero acá se muestra el
    // catálogo completo una sola vez, en el mismo orden en que ya viene organizado por categoría.
    const seen = new Set<string>();
    const flat: Product[] = [];
    for (const cat of menu.categories) {
      if (displayMode === 'CATEGORIES' && !screenCategoryIds.includes(cat.id)) continue;
      for (const p of cat.products) {
        if (seen.has(p.id)) continue;
        if (displayMode === 'PRODUCTS' && !screenProductIds.includes(p.id)) continue;
        seen.add(p.id);
        flat.push(p);
      }
    }
    return flat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, displayMode, JSON.stringify(screenCategoryIds), JSON.stringify(screenProductIds)]);

  const pageCount = Math.max(1, Math.ceil(items.length / itemsPerPage));

  useEffect(() => {
    if (pageCount <= 1) return;
    const rotateInterval = setInterval(() => setPage((p) => (p + 1) % pageCount), pageIntervalMs);
    return () => clearInterval(rotateInterval);
  }, [pageCount, pageIntervalMs]);

  // Si el catálogo cambió de tamaño (producto agotado/reaparecido) y la página actual ya no
  // existe, vuelve a la primera en vez de quedar mostrando una lista vacía.
  useEffect(() => {
    if (page >= pageCount) setPage(0);
  }, [page, pageCount]);

  const currentItems = items.slice(page * itemsPerPage, page * itemsPerPage + itemsPerPage);

  return (
    <div className="h-screen w-screen overflow-hidden bg-black text-white relative">
      {/* Marca: chico, arriba a la izquierda, siempre encima de las fotos. */}
      <div className="fixed top-3 left-3 z-20 flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-full pl-1.5 pr-3 py-1.5">
        {menu?.restaurant.logoUrl ? (
          <img src={menu.restaurant.logoUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
        ) : (
          <div className="h-6 w-6 rounded-full bg-white/20" />
        )}
        <span className="text-xs font-semibold tracking-wide">{menu?.restaurant.name ?? 'Menú'}</span>
      </div>

      <div className="fixed top-3 right-3 z-20 flex items-center gap-2 opacity-30 hover:opacity-100 transition-opacity">
        <TextureButton variant="icon" size="icon" aria-label="Refrescar" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" />
        </TextureButton>
        <TextureButton variant="icon" size="icon" aria-label="Cerrar sesión" onClick={logout}>
          <LogOut className="h-4 w-4" />
        </TextureButton>
      </div>

      {items.length === 0 ? (
        <div className="h-full w-full flex items-center justify-center">
          <p className="text-white/40 font-light text-2xl">El menú todavía no tiene productos disponibles.</p>
        </div>
      ) : (
        // Animación por CSS puro (keyframe `menu-slide-in` en index.css), no una librería JS:
        // el `key={page}` fuerza un nodo DOM nuevo en cada rotación, así que el navegador
        // dispara la animación de mount solo con eso, sin depender de que ningún estado de
        // React "arranque" la transición — el contenido queda visible pase lo que pase.
        <div key={page} className={`h-full w-full grid gap-1 animate-menu-slide-in ${GRID_CLASS[itemsPerPage] ?? GRID_CLASS[4]}`}>
          {currentItems.map((p) => {
            const displayPrice = productDisplayPriceBase(p);
            const price = menu ? publicPriceLabel(displayPrice.amountBase, menu.restaurant) : null;
            return (
              <div key={p.id} className="relative overflow-hidden bg-brand-950">
                {p.photoUrl ? (
                  <img src={p.photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-7xl bg-white/5">🍽️</div>
                )}
                {/* Degradado de abajo hacia arriba para que el texto siempre sea legible,
                    sin importar qué tan clara sea la foto de fondo. */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/25 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-2xl font-bold leading-tight line-clamp-2">{p.name}</p>
                    {p.description && <p className="text-sm text-white/70 font-light line-clamp-1 mt-1">{p.description}</p>}
                  </div>
                  {price && (
                    <div className="text-right shrink-0">
                      {displayPrice.isFromVariant && <p className="text-xs text-white/50 -mb-0.5">Desde</p>}
                      <p className="text-3xl font-extrabold whitespace-nowrap">{price.secondary}</p>
                      <p className="text-sm text-white/60 whitespace-nowrap">{price.primary}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pageCount > 1 && (
        <div className="fixed inset-x-0 bottom-3 z-20 flex items-center justify-center gap-2">
          {Array.from({ length: pageCount }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all shadow ${i === page ? 'w-6 bg-white' : 'w-1.5 bg-white/40'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
