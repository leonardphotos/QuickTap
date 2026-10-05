import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePresencia } from '@/hooks/usePresencia';
import { PackageOpen, Search, ShoppingCart } from 'lucide-react';
import { api } from '@/api/client';
import { publicPriceLabel } from '@/utils/format';
import { ShopCartDrawer } from './ShopCartDrawer';
import { ShopProductSheet } from './ShopProductSheet';
import { TickeraStorefront } from './tickera/TickeraStorefront';
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
  const [cartHydrated, setCartHydrated] = useState(false);
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

  // El carrito sobrevive una recarga, pero se reconstruye contra el catálogo recién cargado:
  // así nunca conserva precios viejos, variantes eliminadas ni cantidades mayores al stock.
  useEffect(() => {
    if (!data || !slug) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`quicktap-shop-cart:${slug}`) ?? '[]') as {
        productId: string;
        variantId: string;
        qty: number;
      }[];
      const products = data.categories.flatMap((category) => category.products);
      const restored = saved.flatMap((line) => {
        const product = products.find((candidate) => candidate.id === line.productId);
        const variant = product?.variants.find((candidate) => candidate.id === line.variantId);
        if (!product || !variant?.available || !Number.isFinite(line.qty) || line.qty <= 0) return [];
        const qty = Math.min(line.qty, variant.stockRemaining ?? line.qty);
        return qty > 0 ? [{ product, variant, qty }] : [];
      });
      setCart(restored);
    } catch {
      localStorage.removeItem(`quicktap-shop-cart:${slug}`);
    } finally {
      setCartHydrated(true);
    }
  }, [data, slug]);

  useEffect(() => {
    if (!cartHydrated || !slug) return;
    localStorage.setItem(
      `quicktap-shop-cart:${slug}`,
      JSON.stringify(cart.map((line) => ({ productId: line.product.id, variantId: line.variant.id, qty: line.qty }))),
    );
  }, [cart, cartHydrated, slug]);

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
      const index = prev.findIndex((l) => sameLine(l, { productId: product.id, variantId: variant.id }));
      const cappedQty = Math.min(qty, variant.stockRemaining ?? qty);
      if (index === -1) return [...prev, { product, variant, qty: cappedQty }];
      const next = [...prev];
      next[index] = {
        ...next[index],
        qty: Math.min(next[index].qty + qty, variant.stockRemaining ?? next[index].qty + qty),
      };
      return next;
    });
    setOpenProduct(null);
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <p className="text-brand-950/60 font-light text-base">{error}</p>
      </div>
    );
  }
  if (!data || !shop) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-brand-950/40 font-light text-base">Cargando…</p>
      </div>
    );
  }

  // Tickera: catálogo de eventos, diseño y navegación completamente distintos al resto de
  // Locales Comerciales (ver TickeraStorefront.tsx) — se delega entero, sin el banner/grilla
  // de acá abajo.
  if (shop.shopRubro === 'tickera') {
    return <TickeraStorefront shop={shop} categories={data.categories} />;
  }

  const cartCount = cart.reduce((acc, l) => acc + (l.variant.soldByWeight ? 1 : l.qty), 0);
  const subtotalLabel = publicPriceLabel(cartSubtotal(cart), shop);
  const bannerColor = theme?.bannerColor || '#0597F2';
  const menuBackground = theme?.backgroundColor || '#F5F5F7';

  return (
    <div className="relative min-h-screen pb-32 overflow-hidden" style={{ backgroundColor: menuBackground }}>
      {/* Banner: foto de portada del local o degradado con su color de marca. */}
      <div className="absolute inset-x-0 top-0 h-80 pointer-events-none">
        {theme?.coverImageUrl ? (
          <>
            <img src={theme.coverImageUrl} alt="" className="h-full w-full object-cover" />
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(to bottom, ${hexToRgba(bannerColor, 0.28)}, ${menuBackground})` }}
            />
          </>
        ) : (
          <div
            className="h-full w-full"
            style={
              theme?.bannerStyle === 'solid'
                ? { backgroundColor: bannerColor }
                : { background: `linear-gradient(to bottom, ${bannerColor}, ${menuBackground})` }
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
        <div className="mt-3 max-w-md rounded-[22px] border border-white/35 bg-white/68 px-5 py-2.5 shadow-[0_12px_36px_-18px_rgba(0,0,0,.35)] backdrop-blur-xl">
          <p className="font-semibold tracking-[-0.015em] text-brand-950 text-base">{shop.name}</p>
          {shop.description && (
            <p className="mt-0.5 leading-relaxed text-brand-950/60 text-xs">{shop.description}</p>
          )}
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl space-y-7 px-4 py-6 sm:px-6 lg:px-8">
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

        <div className="sticky top-3 z-10 space-y-3 rounded-[28px] border border-white/70 bg-white/72 p-2.5 shadow-[0_12px_40px_-24px_rgba(0,0,0,.35)] backdrop-blur-2xl">
          <div className="flex items-center gap-2 rounded-full bg-brand-950/[0.045] px-4 py-2.5 ring-1 ring-inset ring-brand-950/[0.045] focus-within:ring-brand-500/35">
            <Search className="h-4 w-4 shrink-0 text-brand-950/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar productos, marcas…"
              className="min-w-0 flex-1 bg-transparent text-brand-950 placeholder:text-brand-950/40 focus:outline-none text-base"
            />
          </div>
          {data.categories.length > 1 && (
            <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <CategoryChip active={activeCategory === null} onClick={() => setActiveCategory(null)}>Todo</CategoryChip>
              {data.categories.map((c) => (
                <CategoryChip key={c.name} active={activeCategory === c.name} onClick={() => setActiveCategory(c.name)}>
                  {c.name}
                </CategoryChip>
              ))}
            </div>
          )}
        </div>

        {visibleCategories.length === 0 ? (
          <p className="text-center text-brand-950/40 font-light py-10 text-base">
            {search.trim() ? 'No encontramos nada con esa búsqueda.' : 'Esta tienda todavía no publicó productos.'}
          </p>
        ) : (
          visibleCategories.map((category) => (
            <section key={category.name}>
              <h2 className="mb-3 text-lg font-semibold tracking-[-0.02em] text-brand-950">{category.name}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
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
      className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-[transform,background-color,color,box-shadow] active:scale-[0.96] ${
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
      className="group flex flex-col rounded-[26px] border border-black/[0.045] bg-white/90 p-2.5 text-left shadow-[0_8px_30px_-22px_rgba(0,0,0,.4)] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_42px_-24px_rgba(0,0,0,.45)] active:scale-[0.985] disabled:opacity-60"
    >
      <div className="relative mb-2.5">
        {product.photoUrl ? (
          <img
            src={product.photoUrl}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="aspect-[4/5] w-full rounded-[20px] object-cover transition-transform duration-500 group-hover:scale-[1.015]"
          />
        ) : (
          <div className="flex aspect-[4/5] w-full items-center justify-center rounded-[20px] bg-gradient-to-br from-brand-400/20 to-brand-500/10">
            <PackageOpen className="h-10 w-10 text-brand-950/25" strokeWidth={1.4} />
          </div>
        )}
        <span className="absolute -bottom-2 right-2 flex items-center gap-1.5 bg-brand-500 text-[color:var(--qt-button-text,white)] text-xs font-semibold px-2.5 py-1 rounded-full shadow">
          {original && <span className="opacity-60 line-through font-normal">{original.primary}</span>}
          {product.hasVariablePrice ? `Desde ${price.primary}` : price.primary}
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

      <p className="truncate px-0.5 font-semibold tracking-[-0.01em] text-brand-950 text-base">{product.name}</p>
      {/* Entrada a un evento: cuándo es y cuánto cupo queda. Es lo que decide la compra, así
          que va antes que la marca/subcategoría. */}
      {product.isEvent ? (
        <p className="mt-0.5 font-light text-brand-950/60 text-xs">
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
          <p className="text-brand-950/50 font-light line-clamp-1 mt-0.5 text-xs">
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
