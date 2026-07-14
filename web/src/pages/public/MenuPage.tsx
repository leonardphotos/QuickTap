import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { BellRing, Receipt } from 'lucide-react';
import { api } from '../../api/client';
import type { CartLine, PublicMenu, Product, Restaurant, ServiceRequestType } from '../../types';
import { hexToRgba, publicPriceLabel } from '../../utils/format';
import ProductGridCard from './ProductGridCard';
import ProductDetailSheet from './ProductDetailSheet';
import CartDrawer from './CartDrawer';
import { TextureButton } from '@/components/ui/texture-button';
import { Toast } from '@/components/ui/toast';
import { FacebookIcon, InstagramIcon, TikTokIcon, XIcon } from '@/components/ui/social-icons';
import {
  MinimalCard,
  MinimalCardTitle,
  MinimalCardDescription,
  MinimalCardFooter,
} from '@/components/ui/minimal-card';

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
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [readyMessage, setReadyMessage] = useState<string | null>(null);
  const [callingWaiter, setCallingWaiter] = useState(false);
  const [requestingBill, setRequestingBill] = useState(false);
  const categoryRefs = useRef<Record<string, HTMLElement | null>>({});

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

  function scrollToCategory(id: string) {
    setActiveCategory(id);
    categoryRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const subtotalBase = useMemo(
    () => cart.reduce((acc, l) => acc + Number(l.product.price) * l.quantity, 0),
    [cart],
  );

  const allProducts = useMemo(() => menu?.categories.flatMap((c) => c.products) ?? [], [menu]);

  if (error) {
    return <div className="p-10 text-center text-red-600">{error}</div>;
  }

  if (!menu) {
    return <div className="p-10 text-center text-brand-950/50 font-light">Cargando menú…</div>;
  }

  const { restaurant, highlights, categories } = menu;

  // Modo Cartelera: solo la imagen a pantalla completa, sin banner ni botones.
  if (restaurant.fullscreenImageEnabled && restaurant.fullscreenImageUrl) {
    return (
      <div className="fixed inset-0 bg-black">
        <img src={restaurant.fullscreenImageUrl} alt={restaurant.name} className="h-full w-full object-cover" />
      </div>
    );
  }

  const hasHighlights =
    highlights.stars.length > 0 || highlights.promos.length > 0 || highlights.houseSpecials.length > 0;

  const theme = restaurant.theme;
  const themeVars: Record<string, string> = {};
  if (theme?.text) themeVars['--color-brand-950'] = theme.text;
  if (theme?.primary) themeVars['--color-brand-500'] = theme.primary;
  if (theme?.accent) themeVars['--color-brand-400'] = theme.accent;
  if (theme?.buttonText) themeVars['--qt-button-text'] = theme.buttonText;
  const hasSocialLinks = Boolean(
    theme?.socialLinks &&
      (theme.socialLinks.instagram || theme.socialLinks.facebook || theme.socialLinks.tiktok || theme.socialLinks.x),
  );

  return (
    <div
      className="min-h-screen bg-[#F3EFE6] pb-28"
      style={{ ...(theme?.background ? { backgroundColor: theme.background } : {}), ...themeVars } as CSSProperties}
    >
      <header
        className="sticky top-3 z-10 mx-3 sm:mx-auto sm:max-w-2xl rounded-[28px] shadow-lg shadow-black/10 backdrop-blur-md overflow-hidden"
        style={{ backgroundColor: hexToRgba(theme?.bannerColor || '#001B43', 0.85) }}
      >
        <div className="max-w-3xl mx-auto px-4 pt-3 pb-1.5 flex flex-col items-center text-center gap-0.5">
          <img
            src={restaurant.logoUrl || '/logo/icono.png'}
            alt=""
            className="w-11 h-11 rounded-full object-cover shrink-0 ring-2 ring-white/15"
          />
          <h1 className="text-sm font-semibold text-white leading-tight">{restaurant.name}</h1>
          {restaurant.description && (
            <p className="text-[11px] text-white/50 font-light max-w-xs line-clamp-1">{restaurant.description}</p>
          )}
          {(hasSocialLinks || qrToken) && (
            <div className="flex items-center justify-center flex-wrap gap-1.5 mt-1">
              {hasSocialLinks && (
                <div className="flex items-center gap-2 mr-0.5">
                  {theme?.socialLinks?.instagram && (
                    <a
                      href={theme.socialLinks.instagram}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Instagram"
                      className="text-white/60 hover:text-white transition-colors"
                    >
                      <InstagramIcon className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {theme?.socialLinks?.facebook && (
                    <a
                      href={theme.socialLinks.facebook}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Facebook"
                      className="text-white/60 hover:text-white transition-colors"
                    >
                      <FacebookIcon className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {theme?.socialLinks?.tiktok && (
                    <a
                      href={theme.socialLinks.tiktok}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="TikTok"
                      className="text-white/60 hover:text-white transition-colors"
                    >
                      <TikTokIcon className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {theme?.socialLinks?.x && (
                    <a
                      href={theme.socialLinks.x}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="X"
                      className="text-white/60 hover:text-white transition-colors"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              )}
              {qrToken && (
                <>
                  <span className="text-[10px] bg-white/15 text-white px-2 py-0.5 rounded-full font-medium">
                    Pedido en mesa
                  </span>
                  <button
                    onClick={callWaiter}
                    disabled={callingWaiter}
                    className="flex items-center gap-1 text-[10.5px] font-medium text-white bg-white/10 hover:bg-white/20 rounded-full px-2.5 py-1 transition-colors disabled:opacity-50"
                  >
                    <BellRing className="h-3 w-3" /> Llamar al mesonero
                  </button>
                  <button
                    onClick={requestBill}
                    disabled={requestingBill}
                    className="flex items-center gap-1 text-[10.5px] font-medium text-white bg-white/10 hover:bg-white/20 rounded-full px-2.5 py-1 transition-colors disabled:opacity-50"
                  >
                    <Receipt className="h-3 w-3" /> Pedir la cuenta
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {categories.length > 1 && (
          <nav className="flex gap-1.5 overflow-x-auto px-4 pt-1.5 pb-2.5 [scrollbar-width:none]">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => scrollToCategory(cat.id)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeCategory === cat.id || (!activeCategory && cat.id === categories[0].id)
                    ? 'bg-white text-brand-950'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">
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

        {categories.map((cat) => (
          <section
            key={cat.id}
            ref={(el) => {
              categoryRefs.current[cat.id] = el;
            }}
            className="scroll-mt-32"
          >
            <h2 className="text-base font-semibold text-brand-950 mb-3">{cat.name}</h2>
            <div className="grid grid-cols-2 gap-3">
              {cat.products.map((p) => (
                <ProductGridCard key={p.id} product={p} restaurant={restaurant} onOpen={setSelectedProduct} />
              ))}
            </div>
          </section>
        ))}
      </main>

      {cart.length > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-brand-950 text-[color:var(--qt-button-text,white)] rounded-full px-6 py-3 shadow-lg font-medium flex items-center gap-2"
        >
          Ver carrito ({cart.length}) — {publicPriceLabel(subtotalBase, restaurant).primary}
        </button>
      )}

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

      <Toast message={readyMessage} />
    </div>
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
          <img src={product.photoUrl} alt={product.name} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="h-24 w-24 mx-auto mb-3 rounded-full bg-gradient-to-br from-brand-400/20 to-brand-500/10 flex items-center justify-center text-3xl">
          🍽️
        </div>
      )}
      <MinimalCardTitle className="text-sm mt-1">{product.name}</MinimalCardTitle>
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
