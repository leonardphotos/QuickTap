import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePresencia } from '@/hooks/usePresencia';
import { Search, ShoppingCart } from 'lucide-react';
import { api } from '@/api/client';
import { publicPriceLabel } from '@/utils/format';
import { ShopCartDrawer } from './ShopCartDrawer';
import { ShopProductSheet } from './ShopProductSheet';
import {
  cartSubtotal,
  sameLine,
  type CartLine,
  type Storefront,
  type StorefrontProduct,
  type StorefrontVariant,
} from './shopStorefront';

/**
 * Catálogo público de la tienda virtual de un Local Comercial (/tienda/:slug).
 *
 * Misma línea gráfica que el menú de restaurantes (banner + logo, buscador, chips de
 * categoría, grilla de 2 columnas, barra inferior con el carrito) para que un local no
 * parezca de otro producto. Lo que cambia es el modelo: acá se elige VARIANTE (talla/color)
 * en vez de modificadores, y no existe el modo mesa.
 */
export default function ShopStorefrontPage() {
  const { slug } = useParams<{ slug: string }>();
  usePresencia(slug);
  const [data, setData] = useState<Storefront | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [openProduct, setOpenProduct] = useState<StorefrontProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    api
      .get(`/public/shop/${slug}`)
      .then((res) => setData(res.data.data))
      .catch((err) => {
        if (err.response?.data?.details?.code === 'ACCOUNT_LOCKED') {
          setError('Esta tienda no está disponible en este momento.');
        } else {
          setError('No pudimos cargar la tienda. Verifica el enlace.');
        }
      });
  }, [slug]);

  // Los colores del local se aplican como variables CSS en el <html>, no en un div local: las
  // hojas de producto y carrito viven en un portal fuera de este árbol y si no heredarían
  // siempre el azul por defecto de QuickTap (mismo criterio que MenuPage).
  const theme = data?.shop.theme;
  useEffect(() => {
    const root = document.documentElement;
    const vars: [string, string | undefined][] = [
      ['--color-brand-950', theme?.text],
      ['--color-brand-500', theme?.primary],
      ['--color-brand-400', theme?.accent],
      ['--qt-button-text', theme?.buttonText],
    ];
    for (const [key, value] of vars) if (value) root.style.setProperty(key, value);
    return () => {
      for (const [key] of vars) root.style.removeProperty(key);
    };
  }, [theme?.text, theme?.primary, theme?.accent, theme?.buttonText]);

  const shop = data?.shop;

  const visibleCategories = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    return data.categories
      .filter((c) => !activeCategory || c.name === activeCategory)
      .map((c) => ({
        ...c,
        products: c.products.filter(
          (p) =>
            !term ||
            p.name.toLowerCase().includes(term) ||
            (p.brand ?? '').toLowerCase().includes(term) ||
            p.subcategory.toLowerCase().includes(term),
        ),
      }))
      .filter((c) => c.products.length > 0);
  }, [data, search, activeCategory]);

  function addToCart(product: StorefrontProduct, variant: StorefrontVariant, qty: number) {
    setCart((prev) => {
      const index = prev.findIndex((l) => sameLine(l, { productId: product.id, v1: variant.v1, v2: variant.v2 }));
      if (index === -1) return [...prev, { product, variant, qty }];
      const next = [...prev];
      next[index] = { ...next[index], qty: next[index].qty + qty };
      return next;
    });
    setOpenProduct(null);
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <p className="text-brand-950/60 font-light">{error}</p>
      </div>
    );
  }
  if (!data || !shop) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-brand-950/40 font-light">Cargando…</p>
      </div>
    );
  }

  const cartCount = cart.reduce((acc, l) => acc + (l.variant.soldByWeight ? 1 : l.qty), 0);
  const subtotalLabel = publicPriceLabel(cartSubtotal(cart), shop);
  const bannerColor = theme?.bannerColor || '#0597F2';

  return (
    <div className="relative min-h-screen bg-white pb-32 overflow-hidden">
      {/* Banner: foto de portada del local o degradado con su color de marca. */}
      <div className="absolute inset-x-0 top-0 h-80 pointer-events-none">
        {theme?.coverImageUrl ? (
          <>
            <img src={theme.coverImageUrl} alt="" className="h-full w-full object-cover" />
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(to bottom, ${hexToRgba(bannerColor, 0.35)}, #ffffff)` }}
            />
          </>
        ) : (
          <div
            className="h-full w-full"
            style={
              theme?.bannerStyle === 'solid'
                ? { backgroundColor: bannerColor }
                : { background: `linear-gradient(to bottom, ${bannerColor}, #ffffff)` }
            }
          />
        )}
      </div>

      <header className="relative flex flex-col items-center pt-8 pb-2 px-4 text-center">
        <img
          src={shop.logoUrl || '/logo/perfil.jpg'}
          alt={shop.name}
          className="w-20 h-20 rounded-full object-cover ring-4 ring-white/40 shadow-lg"
        />
        <p className="mt-2 text-base font-semibold text-white drop-shadow-sm">{shop.name}</p>
        {shop.description && (
          <p className="text-xs font-light max-w-xs" style={{ color: theme?.bioColor ?? 'rgba(255,255,255,0.8)' }}>
            {shop.description}
          </p>
        )}
      </header>

      <main className="relative max-w-3xl mx-auto px-4 py-6 space-y-6">
        {!shop.isOpen && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl px-4 py-3 text-sm">
            {shop.closedReason || 'La tienda está cerrada en este momento.'} Puedes ver el catálogo, pero los pedidos se
            reciben cuando vuelva a abrir.
          </div>
        )}
        {shop.isOpen && !shop.orderingEnabled && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl px-4 py-3 text-sm">
            Esta tienda no está recibiendo pedidos por internet en este momento.
          </div>
        )}

        <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2.5 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1)]">
          <Search className="h-4 w-4 shrink-0 text-brand-950/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar en la tienda…"
            className="flex-1 min-w-0 bg-transparent text-sm text-brand-950 placeholder:text-brand-950/40 focus:outline-none"
          />
        </div>

        {data.categories.length > 1 && (
          <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <CategoryChip active={activeCategory === null} onClick={() => setActiveCategory(null)}>
              Todo
            </CategoryChip>
            {data.categories.map((c) => (
              <CategoryChip key={c.name} active={activeCategory === c.name} onClick={() => setActiveCategory(c.name)}>
                {c.name}
              </CategoryChip>
            ))}
          </div>
        )}

        {visibleCategories.length === 0 ? (
          <p className="text-center text-sm text-brand-950/40 font-light py-10">
            {search.trim() ? 'No encontramos nada con esa búsqueda.' : 'Esta tienda todavía no publicó productos.'}
          </p>
        ) : (
          visibleCategories.map((category) => (
            <section key={category.name}>
              <h2 className="text-base font-semibold text-brand-950 mb-3">{category.name}</h2>
              <div className="grid grid-cols-2 gap-3">
                {category.products.map((product) => (
                  <ShopProductCard
                    key={product.id}
                    product={product}
                    shop={shop}
                    onOpen={() => setOpenProduct(product)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      {openProduct && (
        <ShopProductSheet
          product={openProduct}
          shop={shop}
          onClose={() => setOpenProduct(null)}
          onAdd={addToCart}
        />
      )}

      {cartOpen && (
        <ShopCartDrawer
          shop={shop}
          cart={cart}
          onClose={() => setCartOpen(false)}
          onChangeCart={setCart}
        />
      )}

      {/* Barra inferior: solo aparece cuando hay algo en el carrito, para no tapar el catálogo. */}
      {cart.length > 0 && !openProduct && !cartOpen && (
        <div
          className="fixed bottom-0 inset-x-0 z-20 px-4 pb-4"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => setCartOpen(true)}
            className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 rounded-[28px] px-5 py-3.5 shadow-lg shadow-black/15 active:scale-[0.98] transition-transform"
            style={{ backgroundColor: 'var(--color-brand-500)' }}
          >
            <span className="flex items-center gap-2 text-[color:var(--qt-button-text,white)]">
              <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/25">
                <ShoppingCart className="h-4 w-4" />
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-950 px-1 text-[10px] font-bold text-white">
                  {cartCount}
                </span>
              </span>
              <span className="text-sm font-semibold">Ver pedido</span>
            </span>
            <span className="text-right text-[color:var(--qt-button-text,white)]">
              <span className="block text-sm font-bold leading-tight">{subtotalLabel.primary}</span>
              {subtotalLabel.secondary && (
                <span className="block text-[11px] font-light opacity-80">{subtotalLabel.secondary}</span>
              )}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

function CategoryChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-shadow ${
        active
          ? 'bg-brand-500 text-[color:var(--qt-button-text,white)] shadow-[0_10px_24px_-8px_rgba(5,108,242,0.5)]'
          : 'bg-white text-brand-950/60 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.12)]'
      }`}
    >
      {children}
    </button>
  );
}

function ShopProductCard({
  product,
  shop,
  onOpen,
}: {
  product: StorefrontProduct;
  shop: Storefront['shop'];
  onOpen: () => void;
}) {
  const price = publicPriceLabel(product.price, shop);
  const original = product.originalPrice ? publicPriceLabel(product.originalPrice, shop) : null;

  return (
    <button
      onClick={onOpen}
      disabled={!product.available}
      className="text-left rounded-3xl bg-white p-2.5 flex flex-col shadow-[0_2px_14px_-4px_rgba(0,0,0,0.1)] hover:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.16)] transition-shadow duration-300 disabled:opacity-60"
    >
      <div className="relative mb-2.5">
        {product.photoUrl ? (
          <img
            src={product.photoUrl}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="aspect-[4/5] w-full rounded-2xl object-cover"
          />
        ) : (
          <div className="aspect-[4/5] w-full rounded-2xl bg-gradient-to-br from-brand-400/20 to-brand-500/10 flex items-center justify-center text-4xl">
            {product.isService ? '✂️' : '🛍️'}
          </div>
        )}
        <span className="absolute -bottom-2 right-2 flex items-center gap-1.5 bg-brand-500 text-[color:var(--qt-button-text,white)] text-xs font-semibold px-2.5 py-1 rounded-full shadow">
          {original && <span className="opacity-60 line-through font-normal">{original.primary}</span>}
          {price.primary}
        </span>
        {!product.available && (
          <span className="absolute top-1.5 left-1.5 rounded-full bg-brand-950/70 px-2 py-0.5 text-[10px] font-semibold text-white">
            Agotado
          </span>
        )}
        {product.available && original && (
          <span className="absolute top-1.5 left-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 shadow-sm">
            Promo
          </span>
        )}
      </div>

      <p className="font-semibold text-sm text-brand-950 truncate">{product.name}</p>
      {/* Entrada a un evento: cuándo es y cuánto cupo queda. Es lo que decide la compra, así
          que va antes que la marca/subcategoría. */}
      {product.isEvent ? (
        <p className="mt-0.5 text-xs font-light text-brand-950/60">
          {product.eventDate?.split('-').reverse().join('/')}
          {product.eventTime && ` · ${product.eventTime}`}
          {product.seatsLeft != null && product.seatsLeft > 0 && (
            <span className={product.seatsLeft <= 10 ? 'ml-1 font-semibold text-amber-600' : 'ml-1'}>
              · {product.seatsLeft} {product.seatsLeft === 1 ? 'puesto' : 'puestos'}
            </span>
          )}
        </p>
      ) : (
        (product.brand || product.subcategory) && (
          <p className="text-xs text-brand-950/50 font-light line-clamp-1 mt-0.5">
            {product.brand || product.subcategory}
          </p>
        )
      )}
    </button>
  );
}

/** Mismo helper que usa el menú público para el degradado del banner. */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return `rgba(5,151,242,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}
