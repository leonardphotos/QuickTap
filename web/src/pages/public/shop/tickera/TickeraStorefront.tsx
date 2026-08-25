import { useMemo, useState } from 'react';

import { Calendar, MapPin, MessageCircle, Store, Ticket, User, Users } from 'lucide-react';
import { publicPriceLabel } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { ShopProductSheet } from '../ShopProductSheet';
import { EventoDetalle } from './EventoDetalle';
import { ShopCartDrawer } from '../ShopCartDrawer';
import {
  cartSubtotal,
  sameLine,
  type CartLine,
  type StorefrontProduct,
  type StorefrontShop,
  type StorefrontVariant,
} from '../shopStorefront';

type Tab = 'eventos' | 'tienda' | 'perfil';

/** El resplandor por defecto de TextureButton (variant="brand") es azul fijo — no sigue el
 * rojo de esta tickera — y su tamaño está pensado para un botón de ancho completo. Acá se
 * reemplaza por uno del mismo color que el botón (var(--color-brand-500), el que sea que el
 * local haya elegido) y más ajustado a estos botones angostos. */
const BRAND_GLOW = 'shadow-[0_4px_10px_-6px_color-mix(in_srgb,var(--color-brand-500)_60%,transparent)]';

const MONTHS_SHORT = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

function parseEventDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function dateChip(dateStr: string | null | undefined): { day: string; month: string } | null {
  const date = parseEventDate(dateStr);
  if (!date) return null;
  return { day: String(date.getDate()).padStart(2, '0'), month: MONTHS_SHORT[date.getMonth()] };
}

function formatTime12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatEventDateLong(dateStr: string | null | undefined, timeStr?: string | null): string | null {
  const date = parseEventDate(dateStr);
  if (!date) return null;
  const weekday = date.toLocaleDateString('es-VE', { weekday: 'long' });
  const month = date.toLocaleDateString('es-VE', { month: 'long' });
  const long = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${date.getDate()} de ${month}`;
  return timeStr ? `${long} · ${formatTime12h(timeStr)}` : long;
}

/**
 * Vitrina pública del rubro Tickera (venta de entradas a eventos): un diseño deliberadamente
 * distinto a cualquier otra tienda de QuickTap — oscuro, editorial, tarjetas de evento a sangre
 * completa que se expanden al tocarlas — en vez del catálogo claro de grilla que usan el resto
 * de los rubros (ver ShopStorefrontPage.tsx, que delega acá cuando `shop.shopRubro === 'tickera'`).
 *
 * El carrito y el checkout son EXACTAMENTE los mismos que el resto de Locales Comerciales
 * (ShopProductSheet/ShopCartDrawer, mismo endpoint /public/shop/:slug/checkout): una entrada es
 * un ShopProduct como cualquier otro, lo único distinto acá es cómo se navega el catálogo.
 */
export function TickeraStorefront({
  shop,
  categories,
}: {
  shop: StorefrontShop;
  categories: { name: string; products: StorefrontProduct[] }[];
}) {
  const [tab, setTab] = useState<Tab>('eventos');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [openProduct, setOpenProduct] = useState<StorefrontProduct | null>(null);
  const [infoEvento, setInfoEvento] = useState<StorefrontProduct | null>(null);
  // Elección de pago del detalle del evento; viaja con el pedido al confirmar el carrito.
  const [financiar, setFinanciar] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const allProducts = useMemo(() => categories.flatMap((c) => c.products), [categories]);
  const events = useMemo(
    () => allProducts.filter((p) => p.isEvent).sort((a, b) => (a.eventDate ?? '').localeCompare(b.eventDate ?? '')),
    [allProducts],
  );

  const cartCount = cart.reduce((acc, l) => acc + l.qty, 0);
  const subtotalLabel = publicPriceLabel(cartSubtotal(cart), shop);

  function addToCart(product: StorefrontProduct, variant: StorefrontVariant, qty: number) {
    setCart((prev) => {
      const index = prev.findIndex((l) => sameLine(l, { productId: product.id, v1: variant.v1, v2: variant.v2 }));
      if (index === -1) return [...prev, { product, variant, qty }];
      const next = [...prev];
      next[index] = { ...next[index], qty: next[index].qty + qty };
      return next;
    });
    setOpenProduct(null);
    setCartOpen(true);
  }

  function openWhatsapp() {
    if (!shop.whatsappPhone) return;
    const msg = encodeURIComponent(`Hola, quiero información sobre los eventos de ${shop.name} 🎟️`);
    window.open(`https://wa.me/${shop.whatsappPhone.replace(/\D/g, '')}?text=${msg}`, '_blank', 'noopener');
  }

  return (
    <div
      className="relative min-h-screen pb-40 text-white"
      style={{ background: 'radial-gradient(circle at 50% -10%, #2a0d0d 0%, #0a0505 45%, #050505 100%)' }}
    >
      <header className="flex items-center justify-between px-5 pb-3 pt-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <img
            src={shop.logoUrl || '/logo/perfil.jpg'}
            alt={shop.name}
            className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white/15"
          />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-bold leading-tight text-white">{shop.name}</p>
            <p className="text-[11px] font-medium text-white/40">
              {events.length} evento{events.length === 1 ? '' : 's'} activo{events.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/70">🎟️ Tickera</span>
      </header>

      {(!shop.isOpen || !shop.orderingEnabled) && (
        <div className="mx-4 mb-2 rounded-2xl bg-amber-500/10 px-4 py-2.5 text-[12px] font-medium text-amber-300 ring-1 ring-amber-500/20">
          {!shop.isOpen
            ? shop.closedReason || 'Cerrado en este momento — puedes ver los eventos, pero no comprar.'
            : 'No se están recibiendo pedidos por internet en este momento.'}
        </div>
      )}

      <main className="px-4 pt-2">
        {tab === 'eventos' && (
          <div className="flex flex-col gap-5">
            {events.length === 0 ? (
              <EmptyState icon={Ticket} text="Todavía no hay eventos publicados. Vuelve pronto." />
            ) : (
              events.map((event) => (
                <EventCard key={event.id} product={event} shop={shop} onInfo={() => setInfoEvento(event)} />
              ))
            )}
          </div>
        )}

        {tab === 'tienda' && (
          <div className="flex flex-col gap-6">
            {allProducts.length === 0 ? (
              <EmptyState icon={Store} text="Esta tienda todavía no publicó nada." />
            ) : (
              categories.map((category) => (
                <section key={category.name}>
                  <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-white/40">{category.name}</h2>
                  <div className="grid grid-cols-2 gap-3">
                    {category.products.map((product) => (
                      <TickeraProductCard key={product.id} product={product} shop={shop} onOpen={() => setOpenProduct(product)} />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        )}

        {tab === 'perfil' && (
          <div className="flex flex-col items-center px-2 pb-4 pt-3 text-center">
            <div className="relative">
              <img
                src={shop.logoUrl || '/logo/perfil.jpg'}
                alt={shop.name}
                className="h-24 w-24 rounded-full object-cover ring-4 ring-white/10"
              />
              <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--color-brand-500)] text-base shadow-lg">
                🎟️
              </span>
            </div>
            <h2 className="mt-4 text-lg font-black text-white">{shop.name}</h2>
            {shop.description && (
              <p className="mt-1.5 max-w-xs text-[13px] font-medium leading-relaxed text-white/50">{shop.description}</p>
            )}

            <div className="mt-5 grid w-full max-w-xs grid-cols-2 gap-2.5">
              <StatTile label="Eventos activos" value={String(events.length)} />
              <StatTile label="Catálogo total" value={String(allProducts.length)} />
            </div>

            {shop.whatsappPhone && (
              <div className="mt-6 w-full max-w-xs">
                <TextureButton variant="brand" size="default" className={BRAND_GLOW} onClick={openWhatsapp}>
                  <span className="flex items-center justify-center gap-2">
                    <MessageCircle className="h-4 w-4" /> Escribir por WhatsApp
                  </span>
                </TextureButton>
              </div>
            )}
          </div>
        )}
      </main>

      {cart.length > 0 && !openProduct && !cartOpen && (
        <div className="fixed inset-x-0 z-20 px-4" style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}>
          <button
            onClick={() => setCartOpen(true)}
            className="mx-auto flex w-full max-w-md items-center justify-between gap-3 rounded-[24px] px-5 py-3.5 shadow-xl shadow-black/50 active:scale-[0.98] transition-transform"
            style={{ backgroundColor: 'var(--color-brand-500)' }}
          >
            <span className="flex items-center gap-2 text-[color:var(--qt-button-text,white)]">
              <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <Ticket className="h-4 w-4" />
                <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-black px-1 text-[10px] font-bold text-white">
                  {cartCount}
                </span>
              </span>
              <span className="text-sm font-bold">Ver mi pedido</span>
            </span>
            <span className="text-[color:var(--qt-button-text,white)]">
              <span className="block text-sm font-black">{subtotalLabel.primary}</span>
            </span>
          </button>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 px-4" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
        <div className="mx-auto flex max-w-md items-center justify-between gap-1 rounded-[28px] border border-white/10 bg-black/70 p-2 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <NavButton icon={Ticket} label="Eventos" active={tab === 'eventos'} onClick={() => setTab('eventos')} />
          <NavButton icon={Store} label="Tienda" active={tab === 'tienda'} onClick={() => setTab('tienda')} />
          <NavButton icon={MessageCircle} label="WhatsApp" active={false} onClick={openWhatsapp} disabled={!shop.whatsappPhone} />
          <NavButton icon={User} label="Perfil" active={tab === 'perfil'} onClick={() => setTab('perfil')} />
        </div>
      </nav>

      {openProduct && <ShopProductSheet product={openProduct} shop={shop} onClose={() => setOpenProduct(null)} onAdd={addToCart} />}

      {/* Detalle del evento a pantalla completa: info, cláusulas, precio y forma de pago. Al
          terminar deja la entrada en el carrito y abre el checkout, que es el camino normal de
          la tienda — el cobro lo cierra el local al confirmar el pedido. */}
      {infoEvento && (
        <EventoDetalle
          evento={infoEvento}
          shop={shop}
          onCerrar={() => setInfoEvento(null)}
          onComprar={(financiado) => {
            const variante = infoEvento.variants.find((v) => v.available) ?? infoEvento.variants[0];
            if (variante) addToCart(infoEvento, variante, 1);
            setFinanciar(financiado);
            setInfoEvento(null);
            setCartOpen(true);
          }}
        />
      )}
      {cartOpen && (
        <ShopCartDrawer shop={shop} cart={cart} financiado={financiar} onClose={() => setCartOpen(false)} onChangeCart={setCart} />
      )}
    </div>
  );
}

function NavButton({
  icon: Icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon: typeof Ticket;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-1 flex-col items-center gap-0.5 rounded-3xl py-2 transition-colors disabled:opacity-30 ${
        active ? 'text-white' : 'text-white/45 hover:text-white/75'
      }`}
      style={active ? { backgroundColor: 'var(--color-brand-500)' } : undefined}
    >
      <Icon className="h-[18px] w-[18px]" />
      <span className="text-[10px] font-semibold">{label}</span>
    </button>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof Ticket; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
        <Icon className="h-6 w-6 text-white/30" />
      </div>
      <p className="max-w-[220px] text-sm font-medium text-white/40">{text}</p>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/5 px-3 py-3 ring-1 ring-white/5">
      <p className="text-lg font-black text-white">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">{label}</p>
    </div>
  );
}

function Detail({ icon: Icon, text }: { icon: typeof MapPin; text: string }) {
  return (
    <p className="flex items-center gap-2 text-[13px] font-medium text-white/70">
      <Icon className="h-4 w-4 shrink-0 text-white/40" /> {text}
    </p>
  );
}

/**
 * Tarjeta de evento a sangre completa: la foto con el nombre/recinto superpuestos y, debajo,
 * SIEMPRE la fecha, el cupo, el precio y el botón — nada colapsado. La versión anterior
 * escondía todo eso hasta tocar la foto, y nadie sabía que había que tocarla: la tarjeta
 * parecía un afiche sin precio ni forma de comprar.
 */
function EventCard({
  product,
  shop,
  onInfo,
}: {
  product: StorefrontProduct;
  shop: StorefrontShop;
  onInfo: () => void;
}) {
  const price = publicPriceLabel(product.price, shop);
  const original = product.originalPrice ? publicPriceLabel(product.originalPrice, shop) : null;
  const chip = dateChip(product.eventDate);
  const longDate = formatEventDateLong(product.eventDate, product.eventTime);
  const soldOut = !product.available;
  const lowSeats = !soldOut && product.seatsLeft != null && product.seatsLeft > 0 && product.seatsLeft <= 15;

  return (
    <div className="overflow-hidden rounded-[28px] bg-white/[0.03] shadow-[0_24px_50px_-14px_rgba(0,0,0,0.7)] ring-1 ring-white/15">
      {/* La foto también abre el detalle: es lo primero que la gente toca. */}
      <button type="button" onClick={onInfo} className="relative block w-full">
        <div className="relative aspect-[3/4] w-full">
          {product.photoUrl ? (
            <img src={product.photoUrl} alt={product.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[color:var(--color-brand-500)]/25 to-black text-6xl">
              🎟️
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/5 to-black/25" />

          {chip && (
            <div className="absolute right-3.5 top-3.5 flex w-12 flex-col items-center rounded-2xl bg-white/95 py-1.5 shadow-lg">
              <span className="text-[10px] font-bold tracking-wide text-red-600">{chip.month}</span>
              <span className="text-lg font-black leading-none text-neutral-900">{chip.day}</span>
            </div>
          )}

          {soldOut && (
            <span className="absolute left-3.5 top-3.5 rounded-full bg-black/75 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white/90 ring-1 ring-white/20">
              Agotado
            </span>
          )}
          {lowSeats && (
            <span className="absolute left-3.5 top-3.5 rounded-full bg-amber-500/95 px-3 py-1 text-[11px] font-bold text-black">
              ¡Últimos puestos!
            </span>
          )}

          <div className="absolute inset-x-0 bottom-0 p-4 text-left">
            {product.category && (
              <span className="mb-2 inline-block rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/90 backdrop-blur-sm">
                {product.category}
              </span>
            )}
            <h3 className="text-xl font-black leading-tight text-white drop-shadow-sm">{product.name}</h3>
            {product.location && (
              <p className="mt-1 flex items-center gap-1 text-[13px] font-medium text-white/70">
                <MapPin className="h-3.5 w-3.5 shrink-0" /> {product.location}
              </p>
            )}
          </div>
        </div>
      </button>

      <div>
        <div className="space-y-2.5 px-4 pb-4 pt-4">
              {longDate && <Detail icon={Calendar} text={longDate} />}
              {product.seatsLeft != null && (
                <Detail
                  icon={Users}
                  text={soldOut ? 'Sin puestos disponibles' : `${product.seatsLeft} puesto${product.seatsLeft === 1 ? '' : 's'} disponible${product.seatsLeft === 1 ? '' : 's'}`}
                />
              )}

              <div className="mt-1 flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-4 py-3">
                <div>
                  {original && <p className="text-xs font-medium text-white/40 line-through">{original.primary}</p>}
                  <p className="text-2xl font-black text-white">{price.primary}</p>
                  {price.secondary && <p className="text-[11px] font-medium text-white/40">{price.secondary}</p>}
                </div>
                {/* Única puerta de entrada a la compra. Antes había un "Comprar" al lado que
                    metía la entrada al carrito de una: quien lo usaba se saltaba las cláusulas
                    y la elección de financiamiento, y terminaba pagando el precio completo
                    aunque quisiera financiar. Comprar sin haber leído de qué se trata tampoco
                    tiene sentido en un evento. */}
                <TextureButton
                  variant="brand"
                  size="default"
                  disabled={soldOut}
                  className={`!w-auto px-6 disabled:opacity-40 ${BRAND_GLOW}`}
                  onClick={onInfo}
                >
                  {soldOut ? 'Agotado' : 'Más información'}
                </TextureButton>
              </div>
        </div>
      </div>
    </div>
  );
}

/** Versión compacta (grilla 2 columnas) para la pestaña Tienda — el mismo catálogo, para quien
 * prefiere hojear rápido en vez de la tarjeta grande de Eventos. Estilo oscuro para no romper
 * la identidad del resto de la tickera. */
function TickeraProductCard({ product, shop, onOpen }: { product: StorefrontProduct; shop: StorefrontShop; onOpen: () => void }) {
  const price = publicPriceLabel(product.price, shop);
  const soldOut = !product.available;

  return (
    <button
      onClick={onOpen}
      disabled={soldOut}
      className="flex flex-col overflow-hidden rounded-2xl bg-white/[0.04] text-left ring-1 ring-white/5 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
    >
      <div className="relative aspect-[4/5] w-full">
        {product.photoUrl ? (
          <img src={product.photoUrl} alt={product.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[color:var(--color-brand-500)]/20 to-black text-3xl">
            🎟️
          </div>
        )}
        <span
          className="absolute bottom-2 right-2 rounded-full px-2.5 py-1 text-[11px] font-bold text-[color:var(--qt-button-text,white)] shadow"
          style={{ backgroundColor: 'var(--color-brand-500)' }}
        >
          {price.primary}
        </span>
        {soldOut && (
          <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-semibold text-white">Agotado</span>
        )}
      </div>
      <div className="px-2.5 py-2">
        <p className="truncate text-[13px] font-semibold text-white">{product.name}</p>
        {product.isEvent && product.eventDate ? (
          <p className="mt-0.5 truncate text-[11px] font-medium text-white/40">
            {product.eventDate.split('-').reverse().join('/')}
            {product.eventTime && ` · ${product.eventTime}`}
          </p>
        ) : (
          (product.brand || product.subcategory) && (
            <p className="mt-0.5 truncate text-[11px] font-medium text-white/40">{product.brand || product.subcategory}</p>
          )
        )}
      </div>
    </button>
  );
}
