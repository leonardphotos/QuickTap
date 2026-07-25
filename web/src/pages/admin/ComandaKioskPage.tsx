import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ShoppingCart, Store, UtensilsCrossed } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import { ProductOptionsDialog } from '@/components/admin/ProductOptionsDialog';
import { CURRENCY_SYMBOLS, cartLineUnitPrice, formatModifierLabel, modifierSelectionKey, publicPriceLabel } from '@/utils/format';
import type { CartLine, FloorPlan, PaymentMethod, Product } from '@/types';

type Channel = 'DINE_IN' | 'PICKUP';

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  MOBILE_PAYMENT: 'Pago Móvil',
  ZELLE: 'Zelle',
  CASH: 'Efectivo Bs',
  CASH_USD: 'Efectivo $',
  CARD: 'Punto de Venta',
  BINANCE: 'Binance',
  PAYPAL: 'PayPal',
  TRANSFER: 'Transferencia',
};

const DEFAULT_PAYMENT_OPTIONS: PaymentMethod[] = ['MOBILE_PAYMENT', 'ZELLE', 'CASH', 'CASH_USD', 'CARD'];

type Step = 'mode' | 'table' | 'menu' | 'cart' | 'payment' | 'confirmation';

/** Precio en Bs (principal) y $ (secundario) — mismo patrón de dos líneas que ya usa
 * CartDrawer.tsx en el checkout público. */
function PriceTag({
  amountBase,
  restaurant,
  className,
}: {
  amountBase: number;
  restaurant: Parameters<typeof publicPriceLabel>[1];
  className?: string;
}) {
  const price = publicPriceLabel(amountBase, restaurant);
  return (
    <span className={className}>
      {price.primary}
      {price.secondary && <span className="text-brand-950/40 font-normal"> · {price.secondary}</span>}
    </span>
  );
}

/** Kiosco de autoservicio (tablet, rol Comanda): el cliente pide sin mesero, estilo
 * tótem KFC. Reutiliza ProductOptionsDialog (mismo picker de variantes/modificadores
 * que ya usa CreateOrderDialog) y POST /orders/manual — "Comer Aquí" abre una mesa
 * (DINE_IN + tableId elegido), "Para Llevar" es Pickup. El pedido queda esperando que
 * caja confirme el pago (estado NEEDS_PAYMENT, gateado en el backend por el rol
 * Comanda) antes de llegar a cocina. */
export default function ComandaKioskPage() {
  const { restaurant } = useAuth();
  const [step, setStep] = useState<Step>('mode');
  const [channel, setChannel] = useState<Channel>('DINE_IN');
  const [floorPlan, setFloorPlan] = useState<FloorPlan | null>(null);
  const [tableId, setTableId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [optionsProduct, setOptionsProduct] = useState<Product | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>('MOBILE_PAYMENT');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);

  useEffect(() => {
    api.get('/products').then((res) => setProducts(res.data.data));
  }, []);

  // Colores del restaurante (los mismos que ya usa el menú público): se inyectan como
  // variables CSS en <html>, así las clases brand-500/brand-950/etc del kiosco las
  // resuelven automáticamente sin necesidad de renombrar ninguna clase.
  const theme = restaurant?.theme;
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

  const categoryNames = useMemo(() => {
    const names = new Set(products.map((p) => p.category?.name ?? 'Sin categoría'));
    return [...names].sort((a, b) => a.localeCompare(b, 'es'));
  }, [products]);

  const visibleProducts = products.filter(
    (p) => p.isAvailable && !p.stockDepleted && (!categoryFilter || (p.category?.name ?? 'Sin categoría') === categoryFilter),
  );

  const freeTables = useMemo(() => {
    if (!floorPlan) return [];
    const all = [...floorPlan.zones.flatMap((z) => z.tables), ...floorPlan.unzoned];
    return all.filter((t) => t.sessions.length === 0 && !t.reserved);
  }, [floorPlan]);

  function goToTableStep() {
    setChannel('DINE_IN');
    setStep('table');
    api.get('/tables/floor-plan').then((res) => setFloorPlan(res.data.data));
  }

  function addPickedLine(line: CartLine) {
    setLines((prev) => {
      const matchIndex = prev.findIndex(
        (l) =>
          l.product.id === line.product.id &&
          l.note === line.note &&
          l.variantId === line.variantId &&
          modifierSelectionKey(l.selectedModifiers) === modifierSelectionKey(line.selectedModifiers),
      );
      if (matchIndex === -1) return [...prev, line];
      const next = [...prev];
      next[matchIndex] = { ...next[matchIndex], quantity: next[matchIndex].quantity + line.quantity };
      return next;
    });
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  const totalBase = lines.reduce((sum, l) => sum + cartLineUnitPrice(l) * l.quantity, 0);

  const paymentConfig = restaurant?.paymentMethodsConfig;
  const hasPaymentConfig = paymentConfig && Object.values(paymentConfig).some((m) => m?.enabled);
  const paymentOptions: PaymentMethod[] = hasPaymentConfig
    ? (Object.keys(PAYMENT_LABELS) as PaymentMethod[]).filter((k) => paymentConfig?.[k]?.enabled)
    : DEFAULT_PAYMENT_OPTIONS;

  useEffect(() => {
    if (!paymentOptions.includes(payment) && paymentOptions.length > 0) setPayment(paymentOptions[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentOptions.join(',')]);

  function resetAll() {
    setStep('mode');
    setChannel('DINE_IN');
    setTableId(null);
    setFloorPlan(null);
    setCategoryFilter(null);
    setLines([]);
    setError(null);
    setOrderNumber(null);
  }

  async function submitOrder() {
    if (lines.length === 0) return;
    setSending(true);
    setError(null);
    try {
      const res = await api.post('/orders/manual', {
        channel,
        tableId: channel === 'DINE_IN' ? tableId ?? undefined : undefined,
        items: lines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
          variantId: l.variantId,
          modifierIds: l.selectedModifiers.flatMap((m) => Array(m.quantity ?? 1).fill(m.modifierId)),
          note: l.note,
        })),
        paymentMethod: payment,
      });
      setOrderNumber(res.data.data.orderNumber);
      setStep('confirmation');
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo enviar el pedido.');
    } finally {
      setSending(false);
    }
  }

  // AdminLayout ya garantiza que `restaurant` existe antes de montar este componente
  // (ver la rama `!user || !restaurant` en AdminLayout.tsx) — este guard es solo para TS,
  // y va después de todos los hooks para no violar las reglas de hooks.
  if (!restaurant) return null;

  if (step === 'confirmation') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 mb-6">
          <Check className="h-10 w-10 text-emerald-600" />
        </div>
        <p className="text-sm text-brand-950/50 font-light mb-1">Tu número de pedido</p>
        <p className="text-7xl font-bold text-brand-950 mb-6">#{orderNumber}</p>
        <p className="text-brand-950/60 font-light mb-10">Pasa a caja a cancelar con este número para que tu pedido comience a prepararse.</p>
        <TextureButton variant="brand" size="default" className="!w-auto px-10 !h-14 !text-base" onClick={resetAll}>
          Nuevo pedido
        </TextureButton>
      </div>
    );
  }

  if (step === 'mode') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center gap-8">
        <div>
          <h1 className="text-2xl font-semibold text-brand-950">{restaurant?.name}</h1>
          <p className="text-brand-950/50 font-light mt-1">¿Cómo deseas tu pedido?</p>
        </div>
        <div className="grid grid-cols-2 gap-6 w-full max-w-lg">
          <button
            onClick={goToTableStep}
            className="flex flex-col items-center gap-3 rounded-3xl border border-brand-950/10 bg-white py-12 shadow-sm hover:border-brand-500 hover:shadow-md transition-all"
          >
            <UtensilsCrossed className="h-10 w-10 text-brand-500" />
            <span className="text-lg font-semibold text-brand-950">Comer Aquí</span>
          </button>
          <button
            onClick={() => {
              setChannel('PICKUP');
              setTableId(null);
              setStep('menu');
            }}
            className="flex flex-col items-center gap-3 rounded-3xl border border-brand-950/10 bg-white py-12 shadow-sm hover:border-brand-500 hover:shadow-md transition-all"
          >
            <Store className="h-10 w-10 text-brand-500" />
            <span className="text-lg font-semibold text-brand-950">Para Llevar</span>
          </button>
        </div>
      </div>
    );
  }

  if (step === 'table') {
    return (
      <div className="min-h-screen flex flex-col px-6 py-8">
        <button onClick={() => setStep('mode')} className="flex items-center gap-1 text-sm text-brand-950/50 mb-6">
          <ArrowLeft className="h-4 w-4" /> Volver
        </button>
        <h1 className="text-2xl font-semibold text-brand-950 mb-1 text-center">Elige tu mesa</h1>
        <p className="text-brand-950/50 font-light mb-8 text-center">Toca una mesa libre para sentarte ahí</p>
        {floorPlan === null ? (
          <p className="text-brand-950/40 font-light text-center py-16">Cargando mesas…</p>
        ) : freeTables.length === 0 ? (
          <p className="text-brand-950/40 font-light text-center py-16">No hay mesas libres en este momento.</p>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-4 max-w-3xl mx-auto w-full">
            {freeTables.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTableId(t.id);
                  setStep('menu');
                }}
                className="aspect-square rounded-2xl bg-white border border-brand-950/10 shadow-sm hover:border-brand-500 hover:shadow-md transition-all flex items-center justify-center text-xl font-semibold text-brand-950"
              >
                {t.number}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (step === 'menu') {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-brand-950/[0.06] px-4 py-3">
          <div className="flex items-center justify-between gap-3 mb-3">
            <button
              onClick={() => setStep(channel === 'DINE_IN' ? 'table' : 'mode')}
              className="flex items-center gap-1 text-sm text-brand-950/50"
            >
              <ArrowLeft className="h-4 w-4" /> {channel === 'DINE_IN' ? 'Comer Aquí' : 'Para Llevar'}
            </button>
            <button
              onClick={() => setStep('cart')}
              className="relative flex items-center gap-2 rounded-full bg-brand-500 text-[color:var(--qt-button-text,white)] px-4 py-2 text-sm font-semibold"
            >
              <ShoppingCart className="h-4 w-4" />
              {lines.reduce((n, l) => n + l.quantity, 0)} · {publicPriceLabel(totalBase, restaurant).primary}
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setCategoryFilter(null)}
              className={`shrink-0 text-sm font-medium px-3.5 py-1.5 rounded-full ${
                categoryFilter === null ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.05] text-brand-950/60'
              }`}
            >
              Todo
            </button>
            {categoryNames.map((name) => (
              <button
                key={name}
                onClick={() => setCategoryFilter(name)}
                className={`shrink-0 text-sm font-medium px-3.5 py-1.5 rounded-full ${
                  categoryFilter === name ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.05] text-brand-950/60'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
          {visibleProducts.map((p) => (
            <button
              key={p.id}
              onClick={() => setOptionsProduct(p)}
              className="text-left rounded-2xl bg-white border border-brand-950/[0.06] p-2.5 shadow-sm hover:shadow-md transition-shadow"
            >
              {p.photoUrl ? (
                <img src={p.photoUrl} alt={p.name} className="aspect-square w-full rounded-xl object-cover mb-2" />
              ) : (
                <div className="aspect-square w-full rounded-xl bg-brand-950/[0.05] flex items-center justify-center text-3xl mb-2">
                  🍽️
                </div>
              )}
              <p className="text-sm font-semibold text-brand-950 truncate">{p.name}</p>
              <p className="text-sm text-brand-500 font-semibold">
                <PriceTag amountBase={Number(p.price)} restaurant={restaurant} />
              </p>
            </button>
          ))}
        </div>

        {optionsProduct && (
          <ProductOptionsDialog
            product={optionsProduct}
            currencySymbol={restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$'}
            onClose={() => setOptionsProduct(null)}
            onAdd={addPickedLine}
          />
        )}
      </div>
    );
  }

  if (step === 'cart') {
    return (
      <div className="min-h-screen flex flex-col px-4 py-4">
        <button onClick={() => setStep('menu')} className="flex items-center gap-1 text-sm text-brand-950/50 mb-4">
          <ArrowLeft className="h-4 w-4" /> Seguir pidiendo
        </button>
        <h2 className="text-lg font-semibold text-brand-950 mb-3">Tu pedido</h2>
        {lines.length === 0 ? (
          <p className="text-brand-950/50 font-light py-10 text-center">Tu carrito está vacío.</p>
        ) : (
          <ul className="flex-1 space-y-2 overflow-y-auto">
            {lines.map((l, i) => (
              <li key={i} className="flex items-start justify-between border-b border-brand-950/10 pb-2">
                <div>
                  <p className="font-medium text-brand-950">
                    {l.quantity}x {l.product.name}
                    {l.variantName && <span className="text-brand-950/50"> ({l.variantName})</span>}
                  </p>
                  {l.selectedModifiers.length > 0 && (
                    <p className="text-xs text-brand-950/50">{l.selectedModifiers.map(formatModifierLabel).join(', ')}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-medium">
                    <PriceTag amountBase={cartLineUnitPrice(l) * l.quantity} restaurant={restaurant} />
                  </span>
                  <button onClick={() => removeLine(i)} className="text-red-500 text-xs">
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-between text-lg font-semibold mt-3 pt-3 border-t border-brand-950/10">
          <span>Total</span>
          <PriceTag amountBase={totalBase} restaurant={restaurant} />
        </div>
        <TextureButton
          variant="brand"
          size="default"
          disabled={lines.length === 0}
          onClick={() => setStep('payment')}
          className="mt-4 !h-14 !text-base disabled:opacity-50"
        >
          Continuar al pago
        </TextureButton>
      </div>
    );
  }

  // step === 'payment'
  return (
    <div className="min-h-screen flex flex-col px-4 py-4">
      <button onClick={() => setStep('cart')} className="flex items-center gap-1 text-sm text-brand-950/50 mb-4">
        <ArrowLeft className="h-4 w-4" /> Volver al carrito
      </button>
      <h2 className="text-lg font-semibold text-brand-950 mb-1">¿Cómo vas a pagar?</h2>
      <p className="text-sm text-brand-950/50 font-light mb-4">
        Total: <PriceTag amountBase={totalBase} restaurant={restaurant} />
      </p>
      <div className="grid grid-cols-2 gap-3">
        {paymentOptions.map((o) => (
          <button
            key={o}
            onClick={() => setPayment(o)}
            className={`rounded-2xl border py-5 text-sm font-semibold transition-colors ${
              payment === o ? 'bg-brand-500 text-[color:var(--qt-button-text,white)] border-brand-500' : 'bg-white text-brand-950 border-brand-950/10'
            }`}
          >
            {PAYMENT_LABELS[o]}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600 mt-4">{error}</p>}
      <TextureButton
        variant="brand"
        size="default"
        disabled={sending}
        onClick={submitOrder}
        className="mt-6 !h-14 !text-base disabled:opacity-50"
      >
        {sending ? 'Enviando…' : 'Confirmar pedido'}
      </TextureButton>
    </div>
  );
}
