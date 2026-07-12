import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { CartLine, PublicMenu, Restaurant } from '../../types';
import { publicPriceLabel } from '../../utils/format';
import ProductCard from './ProductCard';
import CartDrawer from './CartDrawer';

/** Página pública: se accede desde el QR (con ?mesa=token) o desde el link general (delivery/pickup). */
export default function MenuPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const qrToken = searchParams.get('mesa');

  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    api
      .get(`/public/menu/${slug}`)
      .then((res) => setMenu(res.data.data))
      .catch(() => setError('No pudimos cargar el menú. Verifica el enlace.'));
  }, [slug]);

  function addToCart(line: CartLine) {
    setCart((prev) => [...prev, line]);
    setCartOpen(true);
  }

  function removeFromCart(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  const subtotalBase = useMemo(
    () => cart.reduce((acc, l) => acc + Number(l.product.price) * l.quantity, 0),
    [cart],
  );

  if (error) {
    return <div className="p-10 text-center text-red-600">{error}</div>;
  }

  if (!menu) {
    return <div className="p-10 text-center text-brand-950/50 font-light">Cargando menú…</div>;
  }

  const { restaurant, highlights, categories } = menu;
  const hasHighlights =
    highlights.stars.length > 0 || highlights.promos.length > 0 || highlights.houseSpecials.length > 0;

  return (
    <div className="min-h-screen bg-brand-950/[0.03] pb-28">
      <header className="bg-white border-b border-brand-950/10 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          {restaurant.logoUrl && (
            <img src={restaurant.logoUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
          )}
          <div>
            <h1 className="text-lg font-semibold text-brand-950">{restaurant.name}</h1>
            {restaurant.description && (
              <p className="text-xs text-brand-950/50 font-light">{restaurant.description}</p>
            )}
          </div>
          {qrToken && (
            <span className="ml-auto text-xs bg-brand-400/15 text-brand-800 px-2 py-1 rounded-full font-medium">
              Pedido en mesa
            </span>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        {hasHighlights && (
          <section className="space-y-4">
            {highlights.stars.length > 0 && (
              <HighlightRow title="⭐ Productos Estrella" products={highlights.stars} restaurant={restaurant} onAdd={addToCart} />
            )}
            {highlights.promos.length > 0 && (
              <HighlightRow title="🔥 Promociones" products={highlights.promos} restaurant={restaurant} onAdd={addToCart} />
            )}
            {highlights.houseSpecials.length > 0 && (
              <HighlightRow
                title="👨‍🍳 Recomendación de la Casa"
                products={highlights.houseSpecials}
                restaurant={restaurant}
                onAdd={addToCart}
              />
            )}
          </section>
        )}

        {categories.map((cat) => (
          <section key={cat.id}>
            <h2 className="text-base font-semibold text-brand-950 mb-3">{cat.name}</h2>
            <div className="grid gap-3">
              {cat.products.map((p) => (
                <ProductCard key={p.id} product={p} restaurant={restaurant} onAdd={addToCart} />
              ))}
            </div>
          </section>
        ))}
      </main>

      {cart.length > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-brand-950 text-white rounded-full px-6 py-3 shadow-lg font-medium flex items-center gap-2"
        >
          🛒 Ver carrito ({cart.length}) — {publicPriceLabel(subtotalBase, restaurant).primary}
        </button>
      )}

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
    </div>
  );
}

function HighlightRow({
  title,
  products,
  restaurant,
  onAdd,
}: {
  title: string;
  products: PublicMenu['highlights']['stars'];
  restaurant: Restaurant;
  onAdd: (l: CartLine) => void;
}) {
  return (
    <div>
      <h2 className="text-base font-semibold text-brand-950 mb-3">{title}</h2>
      <div className="grid gap-3">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} restaurant={restaurant} onAdd={onAdd} />
        ))}
      </div>
    </div>
  );
}
