import { useState } from 'react';
import { Check, ChevronDown, Copy, Minus, Plus, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import { publicPriceLabel } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { ShopSheet } from './ShopSheet';
import { cartSubtotal, formatQty, stepFor, type CartLine, type StorefrontShop } from './shopStorefront';

const PAYMENT_LABELS: Record<string, string> = {
  MOBILE_PAYMENT: 'Pago Móvil',
  ZELLE: 'Zelle',
  CASH: 'Efectivo Bs',
  CASH_USD: 'Efectivo $',
  CARD: 'Punto de Venta',
  BINANCE: 'Binance',
  PAYPAL: 'PayPal',
  TRANSFER: 'Transferencia',
};

const PAYMENT_FIELD_LABELS: Record<string, string> = {
  banco: 'Banco',
  telefono: 'Teléfono',
  cedula: 'Cédula/RIF',
  titular: 'Titular',
  correo: 'Correo',
  id: 'ID',
  cuenta: 'Cuenta',
  rif: 'RIF',
};

interface Props {
  shop: StorefrontShop;
  cart: CartLine[];
  onClose: () => void;
  onChangeCart: (cart: CartLine[]) => void;
  /**
   * El comprador eligió financiar (entradas de eventos). Viaja al pedido; el precio y las
   * cuotas los recalcula el servidor contra el evento, esto solo dice QUÉ eligió.
   */
  financiado?: boolean;
}

/**
 * Carrito + checkout de la tienda virtual.
 *
 * El pedido NO se cobra acá: entra al panel del local como pendiente y el cobro se cierra por
 * WhatsApp — o lo cierra el chatbot solo, mandándole los datos de pago al cliente. Por eso el
 * método de pago que se elige es informativo, no una pasarela.
 */
export function ShopCartDrawer({ shop, cart, onClose, onChangeCart, financiado }: Props) {
  const [step, setStep] = useState<'cart' | 'checkout'>('cart');
  const [mode, setMode] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ orderNumber: number; total: number } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const subtotal = cartSubtotal(cart);
  const deliveryFee = mode === 'DELIVERY' ? shop.deliveryFee : 0;
  const total = subtotal + deliveryFee;
  const canOrder = shop.isOpen && shop.orderingEnabled;
  // Entradas a un evento: nada que retirar ni despachar, así que no tiene sentido preguntar
  // cómo se recibe — se queda en PICKUP (sin dirección, sin cargo de envío) sin mostrar la
  // elección.
  const allTickets = cart.length > 0 && cart.every((l) => l.product.isEvent);
  // La cédula se pide solo cuando la compra va a existir en el QuickTap Wallet — una entrada
  // de evento o una compra financiada. Es, junto al teléfono, la clave con la que el
  // comprador entra a ver su entrada y sus cuotas; sin ella el boleto se emite y no lo
  // alcanza nadie. En una tienda que vende de contado no se pide: sería un campo de más.
  const pideCedula = cart.some((l) => l.product.isEvent) || !!financiado;

  const enabledMethods = Object.entries(shop.paymentMethodsConfig ?? {})
    .filter(([, cfg]) => cfg?.enabled)
    .map(([key]) => key)
    .filter((key) => PAYMENT_LABELS[key]);
  const methodConfig = paymentMethod ? shop.paymentMethodsConfig?.[paymentMethod] : null;

  function setQty(index: number, qty: number) {
    const next = [...cart];
    if (qty <= 0) next.splice(index, 1);
    else next[index] = { ...next[index], qty };
    onChangeCart(next);
    if (next.length === 0) onClose();
  }

  async function copy(value: string, field: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(field);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Sin portapapeles (http o permiso negado) el cliente puede copiar a mano: no vale la
      // pena interrumpirlo con un error por algo que no le impide pagar.
    }
  }

  async function submit() {
    setFormError(null);
    if (!name.trim()) return setFormError('Escribe tu nombre.');
    if (phone.trim().length < 7) return setFormError('Escribe un teléfono válido.');
    if (pideCedula && idNumber.replace(/\D/g, '').length < 5) {
      return setFormError('Escribe tu cédula: es tu clave para entrar al Wallet.');
    }
    if (mode === 'DELIVERY' && !address.trim()) return setFormError('Escribe la dirección de entrega.');

    setSubmitting(true);
    try {
      const res = await api.post(`/public/shop/${shop.slug}/checkout`, {
        mode,
        ...(financiado ? { financed: true } : {}),
        items: cart.map((l) => ({
          productId: l.product.id,
          v1: l.variant.v1,
          v2: l.variant.v2,
          qty: l.qty,
        })),
        customer: {
          name: name.trim(),
          phone: phone.trim(),
          ...(pideCedula ? { idNumber: idNumber.trim() } : {}),
          ...(mode === 'DELIVERY' ? { address: address.trim() } : {}),
          ...(paymentMethod ? { paymentMethod } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      const order = res.data.data;
      setPlaced({ orderNumber: order.orderNumber, total: order.total });
      onChangeCart([]);
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? 'No pudimos enviar tu pedido. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  // --- Pedido enviado ---
  if (placed) {
    const totalLabel = publicPriceLabel(placed.total, shop);
    const waLink = shop.whatsappPhone
      ? `https://wa.me/${shop.whatsappPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
          `Hola, acabo de hacer el pedido #${placed.orderNumber} en ${shop.name}.`,
        )}`
      : null;
    return (
      <ShopSheet onClose={onClose}>
        <div className="py-2 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-7 w-7 text-emerald-600" />
          </div>
          <h2 className="text-lg font-semibold text-brand-950">¡Pedido enviado!</h2>
          <p className="mt-1 text-sm font-light text-brand-950/60">
            Es el pedido <span className="font-semibold text-brand-950">#{placed.orderNumber}</span> por {totalLabel.primary}
            {totalLabel.secondary ? ` (${totalLabel.secondary})` : ''}.
          </p>
          <p className="mt-3 text-sm font-light text-brand-950/60">
            {shop.whatsappBotConnected
              ? 'En un momento te escribimos por WhatsApp con los datos para pagar.'
              : 'La tienda se comunicará contigo por WhatsApp para coordinar el pago y la entrega.'}
          </p>

          <div className="mt-5 space-y-2">
            {waLink && (
              <a href={waLink} target="_blank" rel="noreferrer" className="block">
                <TextureButton variant="brand" size="default">
                  Escribirle a la tienda
                </TextureButton>
              </a>
            )}
            <button onClick={onClose} className="w-full py-2 text-sm font-medium text-brand-950/50">
              Seguir viendo
            </button>
          </div>
        </div>
      </ShopSheet>
    );
  }

  // --- Carrito ---
  if (step === 'cart') {
    return (
      <ShopSheet onClose={onClose}>
        <h2 className="mb-4 text-lg font-semibold text-brand-950">Tu pedido</h2>

        <ul className="space-y-3">
          {cart.map((line, index) => {
            const lineTotal = publicPriceLabel(line.product.price * line.qty, shop);
            const label = [line.variant.v1, line.variant.v2].filter(Boolean).join(' · ');
            const inc = stepFor(line.variant);
            return (
              <li key={`${line.product.id}|${line.variant.v1}|${line.variant.v2}`} className="flex gap-3">
                {line.product.photoUrl ? (
                  <img src={line.product.photoUrl} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-950/[0.06] text-xl">
                    {line.product.isService ? '✂️' : '🛍️'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-brand-950">{line.product.name}</p>
                  {label && <p className="text-xs font-light text-brand-950/50">{label}</p>}
                  <div className="mt-1.5 flex items-center gap-2">
                    <button
                      onClick={() => setQty(index, Number((line.qty - inc).toFixed(3)))}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-950/[0.06] text-brand-950/70"
                      aria-label="Quitar uno"
                    >
                      {line.qty <= inc ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                    </button>
                    <span className="min-w-14 text-center text-xs font-semibold text-brand-950">
                      {formatQty(line.qty, line.variant)}
                    </span>
                    <button
                      onClick={() => setQty(index, Number((line.qty + inc).toFixed(3)))}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-950/[0.06] text-brand-950/70"
                      aria-label="Agregar uno"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-semibold text-brand-950">{lineTotal.primary}</p>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 space-y-1 border-t border-brand-950/10 pt-4 text-sm">
          <Row label="Subtotal" value={publicPriceLabel(subtotal, shop).primary} />
          <div className="flex items-baseline justify-between pt-1">
            <span className="font-semibold text-brand-950">Total</span>
            <div className="text-right">
              <span className="block font-bold text-brand-950">{publicPriceLabel(total, shop).primary}</span>
              {publicPriceLabel(total, shop).secondary && (
                <span className="block text-xs font-light text-brand-950/50">
                  {publicPriceLabel(total, shop).secondary}
                </span>
              )}
            </div>
          </div>
          {shop.deliveryFee > 0 && (
            <p className="pt-1 text-xs font-light text-brand-950/40">
              El envío ({publicPriceLabel(shop.deliveryFee, shop).primary}) se suma si eliges delivery.
            </p>
          )}
        </div>

        <div className="mt-5">
          <TextureButton
            variant="brand"
            size="default"
            disabled={!canOrder}
            className="disabled:opacity-50"
            onClick={() => setStep('checkout')}
          >
            {canOrder ? 'Continuar' : 'La tienda no recibe pedidos ahora'}
          </TextureButton>
        </div>
      </ShopSheet>
    );
  }

  // --- Datos del cliente ---
  return (
    <ShopSheet onClose={onClose}>
      <h2 className="mb-4 text-lg font-semibold text-brand-950">{allTickets ? 'Tus datos' : '¿Cómo lo recibes?'}</h2>

      {!allTickets && (
        <div className="grid grid-cols-2 gap-2">
          <ModeTile active={mode === 'PICKUP'} onClick={() => setMode('PICKUP')} emoji="🏬" label="Retiro en tienda" />
          <ModeTile active={mode === 'DELIVERY'} onClick={() => setMode('DELIVERY')} emoji="🛵" label="Delivery" />
        </div>
      )}

      <div className="mt-4 space-y-3">
        <Field label="Tu nombre *">
          <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} placeholder="Nombre y apellido" />
        </Field>
        <Field label="Teléfono (WhatsApp) *">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={INPUT}
            placeholder="04141234567"
          />
        </Field>
        {pideCedula && (
          <Field label="Cédula *">
            <input
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              className={INPUT}
              placeholder="12345678"
              inputMode="numeric"
            />
            <p className="mt-1 text-[11px] leading-tight text-brand-950/50">
              Con tu cédula y tu teléfono entras a tu QuickTap Wallet a ver la entrada.
            </p>
          </Field>
        )}
        {mode === 'DELIVERY' && (
          <Field label="Dirección de entrega *">
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              className={INPUT}
              placeholder="Calle, edificio, piso, punto de referencia…"
            />
          </Field>
        )}

        {enabledMethods.length > 0 && (
          <Field label="¿Cómo prefieres pagar?">
            <div className="relative">
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className={`${INPUT} appearance-none pr-8`}
              >
                <option value="">Lo coordino con la tienda</option>
                {enabledMethods.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_LABELS[m]}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-950/40" />
            </div>
          </Field>
        )}

        {methodConfig && (
          <div className="rounded-2xl border border-brand-950/10 bg-brand-950/[0.02] px-4 py-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-950/50">
              Datos para pagar
            </p>
            {Object.keys(PAYMENT_FIELD_LABELS).map((field) => {
              const value = methodConfig[field];
              if (!value || typeof value !== 'string') return null;
              return (
                <div key={field} className="flex items-center justify-between gap-2 py-0.5 text-sm">
                  <span className="min-w-0 truncate text-brand-950">
                    <span className="text-brand-950/40">{PAYMENT_FIELD_LABELS[field]}:</span> {value}
                  </span>
                  <button
                    onClick={() => copy(value, field)}
                    aria-label={`Copiar ${PAYMENT_FIELD_LABELS[field]}`}
                    className="shrink-0 text-brand-950/40 hover:text-brand-950"
                  >
                    {copied === field ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <Field label="Nota (opcional)">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className={INPUT}
            placeholder="Algo que la tienda deba saber"
          />
        </Field>
      </div>

      <div className="mt-4 space-y-1 border-t border-brand-950/10 pt-3 text-sm">
        <Row label="Subtotal" value={publicPriceLabel(subtotal, shop).primary} />
        {deliveryFee > 0 && <Row label="Envío" value={publicPriceLabel(deliveryFee, shop).primary} />}
        <div className="flex items-baseline justify-between pt-1">
          <span className="font-semibold text-brand-950">Total</span>
          <div className="text-right">
            <span className="block font-bold text-brand-950">{publicPriceLabel(total, shop).primary}</span>
            {publicPriceLabel(total, shop).secondary && (
              <span className="block text-xs font-light text-brand-950/50">{publicPriceLabel(total, shop).secondary}</span>
            )}
          </div>
        </div>
      </div>

      {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}

      <div className="mt-4 space-y-2">
        <TextureButton
          variant="brand"
          size="default"
          disabled={submitting || !canOrder}
          className="disabled:opacity-50"
          onClick={submit}
        >
          {submitting ? 'Enviando…' : 'Enviar pedido'}
        </TextureButton>
        <button onClick={() => setStep('cart')} className="w-full py-2 text-sm font-medium text-brand-950/50">
          Volver al carrito
        </button>
      </div>
    </ShopSheet>
  );
}

const INPUT =
  'w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm text-brand-950 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-brand-950/70">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="font-light text-brand-950/60">{label}</span>
      <span className="text-brand-950">{value}</span>
    </div>
  );
}

function ModeTile({ active, onClick, emoji, label }: { active: boolean; onClick: () => void; emoji: string; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border py-4 text-center transition-colors ${
        active ? 'border-brand-500 bg-brand-500/[0.06]' : 'border-brand-950/15 bg-white hover:border-brand-500'
      }`}
    >
      <span className="block text-2xl">{emoji}</span>
      <span className="mt-1 block text-xs font-medium text-brand-950">{label}</span>
    </button>
  );
}
