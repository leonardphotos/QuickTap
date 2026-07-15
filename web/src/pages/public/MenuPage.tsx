import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { BellRing, Receipt, Search, Share2, ShoppingCart } from 'lucide-react';
import { api } from '../../api/client';
import type { CartLine, PublicMenu, Product, Restaurant, ServiceRequestType } from '../../types';
import { hexToRgba, publicPriceLabel } from '../../utils/format';
import ProductGridCard from './ProductGridCard';
import ProductDetailSheet from './ProductDetailSheet';
import CartDrawer from './CartDrawer';
import { Toast } from '@/components/ui/toast';
import { FacebookIcon, InstagramIcon, TikTokIcon, WhatsAppIcon, XIcon } from '@/components/ui/social-icons';
import {
  MinimalCard,
  MinimalCardTitle,
  MinimalCardDescription,
  MinimalCardFooter,
} from '@/components/ui/minimal-card';
import { TextureButton } from '@/components/ui/texture-button';

/** Página pública: se accede desde el QR (con ?mesa=token) o desde el link general (delivery/pickup). */
export default function MenuPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const qrToken = searchParams.get('mesa');

  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [readyMessage, setReadyMessage] = useState<string | null>(null);
  const [callingWaiter, setCallingWaiter] = useState(false);
  const [requestingBill, setRequestingBill] = useState(false);
  const [showSocial, setShowSocial] = useState(false);

  useEffect(() => {
    api
      .get(`/public/menu/${slug}`)
      .then((res) => setMenu(res.data.data))
      .catch((err) => {
        if (err.response?.data?.details?.code === 'ACCOUNT_LOCKED') {
          setError('Este menú no está disponible en este momento.');
        } else {
          setError('No pudimos cargar el menú. Verifica el enlace.');
        }
      });
  }, [slug]);

  // Los colores de marca del restaurante se aplican como variables CSS en el
  // <html> (no en un div local): las hojas de producto/carrito se renderizan
  // en un portal fuera del árbol de esta página, así que necesitan heredarlas
  // desde un ancestro común de verdad para no mostrar siempre el azul por defecto.
  const theme = menu?.restaurant.theme;
  useEffect(() => {
    const root = document.documentElement;
    const vars: [string, string | undefined][] = [
      ['--color-brand-950', theme?.text],
      ['--color-brand-500', theme?.primary],
      ['--color-brand-400', theme?.accent],
      ['--qt-button-text', theme?.buttonText],
    ];
    for (const [key, value] of vars) {
      if (value) root.style.setProperty(key, value);
    }
    return () => {
      for (const [key] of vars) root.style.removeProperty(key);
    };
  }, [theme?.text, theme?.primary, theme?.accent, theme?.buttonText]);

  // Aviso en tiempo real cuando cocina marca el pedido como listo, o el mesero
  // atiende un llamado / solicitud de cuenta hecho desde este mismo menú.
  useEffect(() => {
    if (!qrToken) return;
    const socket = io('/', { auth: { qrToken } });
    socket.on('order:ready', () => {
      setReadyMessage('Tu pedido está listo, pronto llegará a tu mesa.');
      setTimeout(() => setReadyMessage(null), 6000);
    });
    socket.on('table:service-ack', (payload: { type: ServiceRequestType }) => {
      setCallingWaiter(false);
      setRequestingBill(false);
      setReadyMessage(payload.type === 'WAITER_CALL' ? 'Mesero en vía.' : 'Cuenta en vía.');
      setTimeout(() => setReadyMessage(null), 6000);
    });
    return () => {
      socket.disconnect();
    };
  }, [qrToken]);

  async function callWaiter() {
    if (!qrToken || callingWaiter) return;
    setCallingWaiter(true);
    try {
      await api.post(`/public/table-session/${qrToken}/call-waiter`);
      setReadyMessage('Llamado enviado, un mesero se acercará pronto.');
      setTimeout(() => setReadyMessage(null), 6000);
    } catch {
      setCallingWaiter(false);
    }
  }

  async function requestBill() {
    if (!qrToken || requestingBill) return;
    setRequestingBill(true);
    try {
      await api.post(`/public/table-session/${qrToken}/request-bill`);
      setReadyMessage('Solicitud enviada, te traerán la cuenta pronto.');
      setTimeout(() => setReadyMessage(null), 6000);
    } catch {
      setRequestingBill(false);
    }
  }

  function addToCart(line: CartLine) {
    setCart((prev) => {
      const matchIndex = prev.findIndex(
        (l) =>
          l.product.id === line.product.id &&
          l.note === line.note &&
          JSON.stringify(l.modifiers) === JSON.stringify(line.modifiers),
      );
      if (matchIndex === -1) return [...prev, line];
      const next = [...prev];
      next[matchIndex] = { ...next[matchIndex], quantity: next[matchIndex].quantity + line.quantity };
      return next;
    });
  }

  function removeFromCart(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  const subtotalBase = useMemo(
    () => cart.reduce((acc, l) => acc + Number(l.product.price) * l.quantity, 0),
    [cart],
  );

  const allProducts = useMemo(() => menu?.categories.flatMap((c) => c.products) ?? [], [menu]);
  const searchTerm = search.trim().toLowerCase();

  // Categorías a mostrar: si hay búsqueda, un solo grupo de resultados;
  // si no, las categorías reales filtradas por la pestaña activa y/o "solo destacados".
  const visibleGroups = useMemo(() => {
    if (!menu) return [];
    if (searchTerm) {
      const matches = allProducts.filter((p) => p.name.toLowerCase().includes(searchTerm));
      return [{ id: 'search-results', name: `Resultados para "${search.trim()}"`, products: matches }];
    }
    const base = categoryFilter ? menu.categories.filter((c) => c.id === categoryFilter) : menu.categories;
    return base.filter((c) => c.products.length > 0);
  }, [menu, allProducts, searchTerm, search, categoryFilter]);

  if (error) {
    return <div className="p-10 text-center text-red-600">{error}</div>;
  }

  if (!menu) {
    return <div className="p-10 text-center text-brand-950/50 font-light">Cargando menú…</div>;
  }

  const { restaurant, highlights, categories } = menu;

  // Modo Cartelera: solo la imagen a pantalla completa, sin banner ni botones.
  // La imagen puede ser mucho más alta que la pantalla (ej. 2000x7000px), así
  // que se muestra a ancho completo y se deja hacer scroll vertical para verla entera.
  if (restaurant.fullscreenImageEnabled && restaurant.fullscreenImageUrl) {
    return (
      <div className="fixed inset-0 overflow-y-auto bg-black">
        <img src={restaurant.fullscreenImageUrl} alt={restaurant.name} className="block w-full h-auto" />
      </div>
    );
  }

  const hasHighlights =
    !searchTerm &&
    !categoryFilter &&
    (highlights.stars.length > 0 || highlights.promos.length > 0 || highlights.houseSpecials.length > 0);

  const hasSocialLinks = Boolean(
    theme?.socialLinks &&
      (theme.socialLinks.instagram || theme.socialLinks.facebook || theme.socialLinks.tiktok || theme.socialLinks.x),
  );

  const cartCount = cart.reduce((acc, l) => acc + l.quantity, 0);

  return (
    <div className="relative min-h-screen bg-white pb-32 overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 overflow-hidden">
        {theme?.coverImageUrl ? (
          <>
            <img src={theme.coverImageUrl} alt="" className="h-full w-full object-cover" />
            <div
              className="absolute inset-0"
              style={{ backgroundImage: `linear-gradient(to bottom, ${hexToRgba(theme?.bannerColor || '#0597F2', 0.35)}, #ffffff)` }}
            />
          </>
        ) : (
          <div
            className="h-full w-full"
            style={{ backgroundImage: `linear-gradient(to bottom, ${theme?.bannerColor || '#0597F2'}, #ffffff)` }}
          />
        )}
      </div>

      <div className="relative px-4 pt-8 pb-3 flex flex-col items-center text-center gap-0.5">
        <img
          src={restaurant.logoUrl || '/logo/perfil.jpg'}
          alt=""
          className="w-20 h-20 rounded-full object-cover shrink-0 ring-4 ring-white/40 shadow-lg"
        />
        <h1 className="text-base font-semibold text-white drop-shadow-sm leading-tight mt-2">{restaurant.name}</h1>
        {restaurant.description && (
          <p className="text-xs text-white/80 font-light max-w-xs">{restaurant.description}</p>
        )}
        {qrToken && (
          <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full font-medium mt-1">
            Pedido en mesa
          </span>
        )}
      </div>

      <main className="relative max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Buscador */}
        <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2.5 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1)]">
          <Search className="h-4 w-4 text-brand-950/40 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar en el menú"
            className="flex-1 min-w-0 text-sm bg-transparent outline-none placeholder:text-brand-950/40"
          />
        </div>

        {/* Categorías (filtran la grilla, no solo hacen scroll) */}
        {categories.length > 1 && !searchTerm && (
          <nav className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] -mx-1 px-1">
            <button
              onClick={() => setCategoryFilter(null)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                categoryFilter === null ? 'bg-brand-500 text-white shadow-[0_10px_24px_-8px_rgba(5,108,242,0.5)]' : 'bg-white text-brand-950/60 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.12)] hover:text-brand-950'
              }`}
            >
              Todas
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  categoryFilter === cat.id ? 'bg-brand-500 text-white shadow-[0_10px_24px_-8px_rgba(5,108,242,0.5)]' : 'bg-white text-brand-950/60 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.12)] hover:text-brand-950'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </nav>
        )}

        {hasHighlights && (
          <section className="space-y-5">
            {highlights.stars.length > 0 && (
              <HighlightRow
                title="Productos Estrella"
                products={highlights.stars}
                restaurant={restaurant}
                onAdd={addToCart}
                onOpen={setSelectedProduct}
                orderingEnabled={restaurant.orderingEnabled}
              />
            )}
            {highlights.promos.length > 0 && (
              <HighlightRow
                title="Promociones"
                products={highlights.promos}
                restaurant={restaurant}
                onAdd={addToCart}
                onOpen={setSelectedProduct}
                orderingEnabled={restaurant.orderingEnabled}
              />
            )}
            {highlights.houseSpecials.length > 0 && (
              <HighlightRow
                title="Recomendación de la Casa"
                products={highlights.houseSpecials}
                restaurant={restaurant}
                onAdd={addToCart}
                onOpen={setSelectedProduct}
                orderingEnabled={restaurant.orderingEnabled}
              />
            )}
          </section>
        )}

        {visibleGroups.length === 0 && (
          <p className="text-sm text-brand-950/40 font-light text-center py-10">
            No encontramos productos{searchTerm ? ` para "${search.trim()}"` : ''}.
          </p>
        )}

        {visibleGroups.map((cat) => (
          <section key={cat.id} className="scroll-mt-32">
            <h2 className="text-base font-semibold text-brand-950 mb-3">{cat.name}</h2>
            <div className="grid grid-cols-2 gap-3">
              {cat.products.map((p) => (
                <ProductGridCard key={p.id} product={p} restaurant={restaurant} onOpen={setSelectedProduct} />
              ))}
            </div>
          </section>
        ))}
      </main>

      <ProductDetailSheet
        product={selectedProduct}
        restaurant={restaurant}
        allProducts={allProducts}
        onClose={() => setSelectedProduct(null)}
        onAdd={addToCart}
        onSelectProduct={setSelectedProduct}
        orderingEnabled={restaurant.orderingEnabled}
      />

      {cartOpen && (
        <CartDrawer
          restaurant={restaurant}
          cart={cart}
          subtotalBase={subtotalBase}
          qrToken={qrToken}
          onRemove={removeFromCart}
          onClose={() => setCartOpen(false)}
          onClearAndClose={() => {
            setCart([]);
            setCartOpen(false);
          }}
        />
      )}

      {/* Barra de navegación inferior: acciones de mesa (si aplica), WhatsApp, redes y carrito.
          Se oculta mientras hay una hoja abierta (carrito o detalle) para no tapar sus botones. */}
      {!cartOpen && !selectedProduct && (
      <nav
        className="fixed bottom-0 inset-x-0 z-20 flex justify-center"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="relative w-full max-w-md mx-3 mb-3">
          {showSocial && hasSocialLinks && (
            <div className="absolute bottom-full mb-3 right-2 bg-white rounded-2xl shadow-lg p-3 flex items-center gap-3">
              {theme?.socialLinks?.instagram && (
                <a
                  href={theme.socialLinks.instagram}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Instagram"
                  className="text-brand-950/70 hover:text-brand-500 transition-colors"
                >
                  <InstagramIcon className="h-5 w-5" />
                </a>
              )}
              {theme?.socialLinks?.facebook && (
                <a
                  href={theme.socialLinks.facebook}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Facebook"
                  className="text-brand-950/70 hover:text-brand-500 transition-colors"
                >
                  <FacebookIcon className="h-5 w-5" />
                </a>
              )}
              {theme?.socialLinks?.tiktok && (
                <a
                  href={theme.socialLinks.tiktok}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="TikTok"
                  className="text-brand-950/70 hover:text-brand-500 transition-colors"
                >
                  <TikTokIcon className="h-5 w-5" />
                </a>
              )}
              {theme?.socialLinks?.x && (
                <a
                  href={theme.socialLinks.x}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="X"
                  className="text-brand-950/70 hover:text-brand-500 transition-colors"
                >
                  <XIcon className="h-5 w-5" />
                </a>
              )}
            </div>
          )}

          <div
            className="flex items-center justify-around gap-1 px-3 py-2.5 rounded-[28px] shadow-lg shadow-black/15"
            style={{ backgroundColor: 'var(--color-brand-500)' }}
          >
            {qrToken && (
              <>
                <NavIcon icon={BellRing} label="Mesero" onClick={callWaiter} disabled={callingWaiter} />
                <NavIcon icon={Receipt} label="Cuenta" onClick={requestBill} disabled={requestingBill} />
              </>
            )}
            {restaurant.whatsappPhone && (
              <NavIcon
                icon={WhatsAppIcon}
                label="WhatsApp"
                onClick={() => window.open(`https://wa.me/${restaurant.whatsappPhone}`, '_blank')}
              />
            )}
            {hasSocialLinks && (
              <NavIcon icon={Share2} label="Redes" onClick={() => setShowSocial((v) => !v)} />
            )}

            <button
              onClick={() => setCartOpen(true)}
              aria-label="Ver carrito"
              className="relative flex items-center justify-center h-12 w-12 rounded-full bg-white text-brand-500 shadow-[0_8px_20px_-6px_rgba(0,0,0,0.35)]"
            >
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-brand-950 text-white text-[11px] font-bold flex items-center justify-center shadow">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </nav>
      )}

      <Toast message={readyMessage} />
    </div>
  );
}

function NavIcon({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex items-center justify-center h-11 w-11 rounded-full bg-white/25 shadow-[0_10px_20px_-8px_rgba(0,0,0,0.35)] text-[color:var(--qt-button-text,white)] hover:bg-white/35 transition-colors disabled:opacity-50"
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}

function HighlightRow({
  title,
  products,
  restaurant,
  onAdd,
  onOpen,
  orderingEnabled,
}: {
  title: string;
  products: PublicMenu['highlights']['stars'];
  restaurant: Restaurant;
  onAdd: (l: CartLine) => void;
  onOpen: (product: Product) => void;
  orderingEnabled: boolean;
}) {
  return (
    <div>
      <h2 className="text-base font-semibold text-brand-950 mb-3">{title}</h2>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 snap-x">
        {products.map((p) => (
          <HighlightCard
            key={p.id}
            product={p}
            restaurant={restaurant}
            onAdd={onAdd}
            onOpen={onOpen}
            orderingEnabled={orderingEnabled}
          />
        ))}
      </div>
    </div>
  );
}

function HighlightCard({
  product,
  restaurant,
  onAdd,
  onOpen,
  orderingEnabled,
}: {
  product: Product;
  restaurant: Restaurant;
  onAdd: (l: CartLine) => void;
  onOpen: (product: Product) => void;
  orderingEnabled: boolean;
}) {
  const price = publicPriceLabel(product.price, restaurant);

  return (
    <MinimalCard
      onClick={() => onOpen(product)}
      className="w-40 shrink-0 snap-start text-center cursor-pointer"
    >
      {product.photoUrl ? (
        <div className="h-24 w-24 mx-auto mb-3 rounded-full overflow-hidden">
          <img src={product.photoUrl} alt={product.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="h-24 w-24 mx-auto mb-3 rounded-full bg-gradient-to-br from-brand-400/20 to-brand-500/10 flex items-center justify-center text-3xl">
          🍽️
        </div>
      )}
      <MinimalCardTitle className="text-sm mt-1 line-clamp-2 min-h-[2.5rem]">{product.name}</MinimalCardTitle>
      <MinimalCardDescription className="text-xs pb-1">
        {price.primary}
        {price.secondary ? ` · ${price.secondary}` : ''}
      </MinimalCardDescription>
      {orderingEnabled && (
        <MinimalCardFooter className="p-1 pt-0 justify-center">
          <TextureButton
            variant="brand"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onAdd({ product, quantity: 1, modifiers: [] });
            }}
          >
            Agregar
          </TextureButton>
        </MinimalCardFooter>
      )}
    </MinimalCard>
  );
}
