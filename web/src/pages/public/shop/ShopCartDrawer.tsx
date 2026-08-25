import { useState } from 'react';
import { Check, Copy, Minus, Paperclip, Plus, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import { publicPriceLabel } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { ShopSheet } from './ShopSheet';
import { USD_FIRST_METHODS } from '@/utils/payments';
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

const FRECUENCIA: Record<string, string> = {
  SEMANAL: 'cada semana',
  QUINCENAL: 'cada 15 días',
  MENSUAL: 'cada mes',
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
  const [step, setStep] = useState<'cart' | 'metodo' | 'checkout'>('cart');
  const [mode, setMode] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [address, setAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [subiendoProof, setSubiendoProof] = useState(false);
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
  // Financiado: hoy solo se cobra la inicial. El total completo no es lo que esta persona va a
  // pagar ahora, así que enseñárselo la manda a transferir de más. Se calcula sobre el total
  // del carrito, que es exactamente lo que el servidor usa al confirmar el pedido.
  const plan = financiado ? cart.find((l) => l.product.financing)?.product.financing ?? null : null;
  const inicial = plan ? Math.round(total * (plan.downPercent / 100) * 100) / 100 : 0;
  const porCuota = plan ? Math.round(((total - inicial) / plan.installments) * 100) / 100 : 0;
  const aPagarAhora = plan ? inicial : total;

  /**
   * El monto en la moneda del método elegido. Pago Móvil y Transferencia se pagan en
   * bolívares, así que manda el Bs; Zelle, Binance, PayPal y Efectivo $ mueven dólares, así
   * que manda el $. Hacer la cuenta de cabeza en el banco es cómo se transfiere de menos.
   * Sin tasa cargada solo existe la moneda base y no hay nada que voltear.
   */
  function montoLabel(amount: number) {
    const l = publicPriceLabel(amount, shop);
    if (!l.secondary || !USD_FIRST_METHODS.includes(paymentMethod as never)) return l;
    return { primary: l.secondary, secondary: l.primary };
  }

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

  /**
   * Sube la captura y guarda la ruta que devuelve el servidor. La vista previa sale del
   * archivo local, no de la respuesta: se ve al instante y no espera a la red.
   */
  async function subirComprobante(file?: File) {
    if (!file) return;
    setFormError(null);
    setSubiendoProof(true);
    try {
      const form = new FormData();
      form.append('photo', file);
      const res = await api.post(`/public/shop/${shop.slug}/proof`, form);
      setProofUrl(res.data.data.url);
      setProofPreview(URL.createObjectURL(file));
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? 'No pudimos subir el comprobante. Intenta con otra imagen.');
    } finally {
      setSubiendoProof(false);
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
          ...(proofUrl ? { proofImageUrl: proofUrl } : {}),
        },
      });
      const order = res.data.data;
      setPlaced({ orderNumber: order.orderNumber, total: aPagarAhora });
      onChangeCart([]);
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? 'No pudimos enviar tu pedido. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  // --- Pedido enviado ---
  if (placed) {
    const totalLabel = montoLabel(placed.total);
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
            Es el pedido <span className="font-semibold text-brand-950">#{placed.orderNumber}</span>
            {plan ? ', con una inicial de ' : ' por '}
            {totalLabel.primary}
            {totalLabel.secondary ? ` (${totalLabel.secondary})` : ''}.
          </p>
          {proofUrl && (
            <p className="mt-2 text-sm font-light text-brand-950/60">Ya recibimos tu comprobante.</p>
          )}
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
            onClick={() => setStep('metodo')}
          >
            {canOrder ? 'Continuar' : 'La tienda no recibe pedidos ahora'}
          </TextureButton>
        </div>
      </ShopSheet>
    );
  }

  // --- Cómo va a pagar ---
  // Vive entre el carrito y los datos porque decide en qué moneda se le habla de acá en
  // adelante: el monto, los datos de la cuenta y el comprobante que se le pide.
  if (step === 'metodo') {
    return (
      <ShopSheet onClose={onClose}>
        <h2 className="text-lg font-semibold text-brand-950">¿Cómo vas a pagar?</h2>
        <p className="mt-1 text-[13px] font-light text-brand-950/50">
          {plan ? 'Hoy pagas solo la inicial de tu plan.' : 'Elige el método y te mostramos los datos de la cuenta.'}
        </p>

        <div className="mt-4 space-y-2">
          {enabledMethods.map((m) => {
            const activo = paymentMethod === m;
            const monto = publicPriceLabel(aPagarAhora, shop);
            const enDivisa = USD_FIRST_METHODS.includes(m as never);
            const grande = enDivisa && monto.secondary ? monto.secondary : monto.primary;
            const chico = enDivisa && monto.secondary ? monto.primary : monto.secondary;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setPaymentMethod(m)}
                className={`wallet-tap flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                  activo ? 'border-brand-500 bg-brand-500/[0.07]' : 'border-brand-950/10 hover:border-brand-950/25'
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-brand-950">{PAYMENT_LABELS[m]}</span>
                  <span className="block text-[11.5px] font-light text-brand-950/50">
                    {enDivisa ? 'Se paga en divisa' : 'Se paga en bolívares'}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold tabular-nums text-brand-950">{grande}</span>
                  {chico && <span className="block text-[11px] font-light tabular-nums text-brand-950/45">{chico}</span>}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setPaymentMethod('')}
            className={`wallet-tap w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
              paymentMethod === '' ? 'border-brand-500 bg-brand-500/[0.07]' : 'border-brand-950/10 hover:border-brand-950/25'
            }`}
          >
            <span className="block text-sm font-semibold text-brand-950">Lo coordino con la tienda</span>
            <span className="block text-[11.5px] font-light text-brand-950/50">
              Te escriben por WhatsApp para acordar el pago.
            </span>
          </button>
        </div>

        <div className="mt-5 space-y-2">
          <TextureButton variant="brand" size="default" onClick={() => setStep('checkout')}>
            Continuar
          </TextureButton>
          <button onClick={() => setStep('cart')} className="w-full py-2 text-sm font-medium text-brand-950/50">
            Volver al pedido
          </button>
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

        {methodConfig && (
          <div className="rounded-2xl border border-brand-950/10 bg-brand-950/[0.02] px-4 py-3">
            <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-brand-950/[0.07] pb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-950/50">
                {PAYMENT_LABELS[paymentMethod]} · {plan ? 'inicial' : 'a pagar'}
              </p>
              <p className="shrink-0 text-sm font-bold tabular-nums text-brand-950">{montoLabel(aPagarAhora).primary}</p>
            </div>
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

        <Field label="Comprobante de pago">
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-3 transition-colors ${
              proofUrl ? 'border-emerald-500/50 bg-emerald-50/60' : 'border-brand-950/20 hover:border-brand-500/50'
            }`}
          >
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => subirComprobante(e.target.files?.[0])} />
            {proofPreview ? (
              <img src={proofPreview} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-950/[0.06]">
                <Paperclip className="h-4 w-4 text-brand-950/50" />
              </span>
            )}
            <span className="min-w-0 text-[13px] leading-tight">
              <span className="block font-medium text-brand-950">
                {subiendoProof ? 'Subiendo…' : proofUrl ? 'Comprobante adjunto' : 'Adjuntar captura del pago'}
              </span>
              <span className="block font-light text-brand-950/50">
                {proofUrl ? 'Toca para cambiarla' : 'La tienda la revisa antes de confirmar'}
              </span>
            </span>
          </label>
        </Field>
      </div>

      {/* Todo este bloque habla en la moneda del método elegido: es la cifra que la persona va
          a copiar en su banco o en su billetera. */}
      <div className="mt-4 space-y-1 border-t border-brand-950/10 pt-3 text-sm">
        {plan ? (
          <>
            <Row label={`Precio (${plan.installments} cuotas)`} value={montoLabel(total).primary} />
            {Array.from({ length: plan.installments }, (_, i) => (
              <Row
                key={i}
                label={`Cuota ${i + 1} · ${FRECUENCIA[plan.frequency] ?? 'cada mes'}`}
                value={montoLabel(porCuota).primary}
              />
            ))}
          </>
        ) : (
          <>
            <Row label="Subtotal" value={montoLabel(subtotal).primary} />
            {deliveryFee > 0 && <Row label="Envío" value={montoLabel(deliveryFee).primary} />}
          </>
        )}
        <div className="flex items-baseline justify-between pt-1">
          <span className="font-semibold text-brand-950">{plan ? 'Inicial a pagar hoy' : 'Total'}</span>
          <div className="text-right">
            <span className="block font-bold text-brand-950">{montoLabel(aPagarAhora).primary}</span>
            {montoLabel(aPagarAhora).secondary && (
              <span className="block text-xs font-light text-brand-950/50">
                {montoLabel(aPagarAhora).secondary}
              </span>
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
        <button onClick={() => setStep('metodo')} className="w-full py-2 text-sm font-medium text-brand-950/50">
          Volver
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
