import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../api/client';
import type { CartLine, PaymentMethod, Restaurant } from '../../types';
import { publicPriceLabel } from '../../utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import {
  FamilyDrawerRoot,
  FamilyDrawerPortal,
  FamilyDrawerOverlay,
  FamilyDrawerContent,
  FamilyDrawerAnimatedWrapper,
  FamilyDrawerClose,
} from '@/components/ui/family-drawer';

interface Props {
  restaurant: Restaurant;
  cart: CartLine[];
  subtotalBase: number;
  qrToken: string | null;
  onRemove: (index: number) => void;
  onClose: () => void;
  onClearAndClose: () => void;
}

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'MOBILE_PAYMENT', label: 'Pago Móvil' },
  { value: 'ZELLE', label: 'Zelle' },
  { value: 'CASH', label: 'Efectivo' },
  { value: 'CARD', label: 'Tarjeta' },
];

export default function CartDrawer({ restaurant, cart, subtotalBase, qrToken, onRemove, onClose, onClearAndClose }: Props) {
  const [step, setStep] = useState<'summary' | 'checkout'>('summary');
  const [mode, setMode] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
  const [dineInName, setDineInName] = useState('');
  const [dineInIdNumber, setDineInIdNumber] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('MOBILE_PAYMENT');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dineInSent, setDineInSent] = useState(false);

  // Mientras la mesa tenga una cuenta abierta, no volvemos a pedir nombre/cédula.
  const [sessionOpen, setSessionOpen] = useState<boolean | null>(null);
  const [sessionCustomerName, setSessionCustomerName] = useState<string | null>(null);

  useEffect(() => {
    if (!qrToken) return;
    api
      .get(`/public/table-session/${qrToken}`)
      .then((res) => {
        setSessionOpen(res.data.data.isOpen);
        setSessionCustomerName(res.data.data.customerName);
      })
      .catch(() => setSessionOpen(false));
  }, [qrToken]);

  const serviceChargeBase = restaurant.serviceChargeEnabled ? subtotalBase * 0.1 : 0;
  const ivaBase = restaurant.ivaEnabled ? subtotalBase * 0.16 : 0;
  const totalBase = subtotalBase + serviceChargeBase + ivaBase;
  const hasCharges = restaurant.serviceChargeEnabled || restaurant.ivaEnabled;

  const items = cart.map((l) => ({
    productId: l.product.id,
    quantity: l.quantity,
    modifiers: l.modifiers,
    note: l.note,
  }));

  async function submitDineIn() {
    if (!sessionOpen) {
      if (!dineInName.trim()) {
        setError('Escribe tu nombre.');
        return;
      }
      if (!dineInIdNumber.trim()) {
        setError('Escribe tu cédula.');
        return;
      }
    }
    setSending(true);
    setError(null);
    try {
      await api.post('/public/checkout/dine-in', {
        qrToken,
        items,
        ...(sessionOpen
          ? {}
          : { customerName: dineInName.trim(), customerIdNumber: dineInIdNumber.trim() }),
      });
      setDineInSent(true);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo enviar el pedido a cocina.');
    } finally {
      setSending(false);
    }
  }

  async function submitDelivery() {
    if (!name.trim()) {
      setError('Escribe tu nombre.');
      return;
    }
    if (mode === 'DELIVERY' && !address.trim()) {
      setError('Escribe la dirección de entrega.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const { data } = await api.post(`/public/checkout/delivery/${restaurant.slug}`, {
        mode,
        items,
        customer: { name, phone, address, paymentMethod: payment, note },
      });
      window.location.href = data.data.whatsappUrl;
      onClearAndClose();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo generar el pedido.');
    } finally {
      setSending(false);
    }
  }

  return (
    <FamilyDrawerRoot open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <FamilyDrawerPortal>
        <FamilyDrawerOverlay onClick={onClose} />
        <FamilyDrawerContent>
          <FamilyDrawerAnimatedWrapper>
            <FamilyDrawerClose />

            {dineInSent ? (
              <div className="text-center py-8 space-y-2">
                <p className="text-4xl">✅</p>
                <p className="font-semibold text-brand-950">¡Pedido enviado a cocina!</p>
                <p className="text-sm text-brand-950/60 font-light">Ya lo están preparando.</p>
                <TextureButton variant="brand" size="default" onClick={onClearAndClose} className="mt-4 !w-auto px-2 mx-auto">
                  Listo
                </TextureButton>
              </div>
            ) : (
              <div className="pt-6">
                <h3 className="font-semibold text-brand-950 mb-3">Tu pedido</h3>

                {cart.length === 0 ? (
                  <p className="text-sm text-brand-950/50 py-6 text-center font-light">Tu carrito está vacío.</p>
                ) : (
                  <ul className="space-y-2 max-h-48 overflow-y-auto">
                    {cart.map((l, i) => {
                      const linePrice = publicPriceLabel(Number(l.product.price) * l.quantity, restaurant);
                      return (
                        <li key={i} className="flex items-start justify-between text-sm border-b border-brand-950/10 pb-2">
                          <div>
                            <p className="font-medium text-brand-950">
                              {l.quantity}x {l.product.name}
                            </p>
                            {l.note && <p className="text-xs text-brand-950/50">📝 {l.note}</p>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span>{linePrice.primary}</span>
                            {step === 'summary' && (
                              <button onClick={() => onRemove(i)} className="text-red-500 text-xs">
                                Quitar
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {hasCharges && (
                  <div className="text-xs text-brand-950/60 space-y-1 mt-3 pt-2 border-t border-brand-950/10">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>{publicPriceLabel(subtotalBase, restaurant).primary}</span>
                    </div>
                    {restaurant.serviceChargeEnabled && (
                      <div className="flex justify-between">
                        <span>Servicio (10%)</span>
                        <span>{publicPriceLabel(serviceChargeBase, restaurant).primary}</span>
                      </div>
                    )}
                    {restaurant.ivaEnabled && (
                      <div className="flex justify-between">
                        <span>IVA (16%)</span>
                        <span>{publicPriceLabel(ivaBase, restaurant).primary}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-between text-sm font-semibold mt-3">
                  <span>Total a pagar</span>
                  <span>{publicPriceLabel(totalBase, restaurant).primary}</span>
                </div>
                {publicPriceLabel(totalBase, restaurant).secondary && (
                  <div className="flex justify-between text-xs text-brand-950/50 mb-3">
                    <span>Equivalente</span>
                    <span>{publicPriceLabel(totalBase, restaurant).secondary}</span>
                  </div>
                )}

                {cart.length > 0 && (
                  <>
                    {step === 'summary' ? (
                      <TextureButton
                        variant="brand"
                        size="default"
                        onClick={() => setStep('checkout')}
                        disabled={qrToken !== null && sessionOpen === null}
                        className="mt-2 disabled:opacity-50"
                      >
                        {qrToken ? 'Ordenar' : 'Pagar'}
                      </TextureButton>
                    ) : (
                      <div className="space-y-2 mt-2">
                        <button
                          onClick={() => setStep('summary')}
                          className="flex items-center gap-1 text-xs text-brand-950/50 hover:text-brand-950 mb-1"
                        >
                          <ArrowLeft className="h-3 w-3" /> Volver al resumen
                        </button>

                        {qrToken ? (
                          <>
                            {sessionOpen ? (
                              <p className="text-sm text-brand-950/60 font-light">
                                Se añadirá a la cuenta de <span className="font-medium text-brand-950">{sessionCustomerName}</span>.
                              </p>
                            ) : (
                              <>
                                <p className="text-sm font-semibold text-brand-950">Datos para facturación</p>
                                <input
                                  value={dineInName}
                                  onChange={(e) => setDineInName(e.target.value)}
                                  placeholder="Nombre"
                                  className="w-full text-sm border border-brand-950/15 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                                />
                                <input
                                  value={dineInIdNumber}
                                  onChange={(e) => setDineInIdNumber(e.target.value)}
                                  placeholder="Cédula"
                                  className="w-full text-sm border border-brand-950/15 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                                />
                              </>
                            )}
                            <TextureButton
                              variant="brand"
                              size="default"
                              disabled={sending}
                              onClick={submitDineIn}
                              className="disabled:opacity-50"
                            >
                              {sending ? 'Enviando…' : 'Enviar pedido a cocina'}
                            </TextureButton>
                          </>
                        ) : (
                          <>
                            <div className="flex gap-2 text-sm">
                              <button
                                onClick={() => setMode('DELIVERY')}
                                className={`flex-1 rounded-lg py-1.5 border border-brand-950/15 ${mode === 'DELIVERY' ? 'bg-brand-950 text-white border-brand-950' : 'bg-white'}`}
                              >
                                🛵 Delivery
                              </button>
                              <button
                                onClick={() => setMode('PICKUP')}
                                className={`flex-1 rounded-lg py-1.5 border border-brand-950/15 ${mode === 'PICKUP' ? 'bg-brand-950 text-white border-brand-950' : 'bg-white'}`}
                              >
                                🏬 Pickup
                              </button>
                            </div>
                            <input
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              placeholder="Tu nombre"
                              className="w-full text-sm border border-brand-950/15 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                            />
                            <input
                              value={phone}
                              onChange={(e) => setPhone(e.target.value)}
                              placeholder="Teléfono (opcional)"
                              className="w-full text-sm border border-brand-950/15 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                            />
                            {mode === 'DELIVERY' && (
                              <input
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                placeholder="Dirección de entrega"
                                className="w-full text-sm border border-brand-950/15 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                              />
                            )}
                            <select
                              value={payment}
                              onChange={(e) => setPayment(e.target.value as PaymentMethod)}
                              className="w-full text-sm border border-brand-950/15 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                            >
                              {PAYMENT_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                            <input
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              placeholder="Nota general (opcional)"
                              className="w-full text-sm border border-brand-950/15 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                            />
                            <TextureButton
                              variant="brand"
                              size="default"
                              disabled={sending}
                              onClick={submitDelivery}
                              className="disabled:opacity-50"
                            >
                              {sending ? 'Generando…' : '📲 Enviar pedido por WhatsApp'}
                            </TextureButton>
                          </>
                        )}
                        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </FamilyDrawerAnimatedWrapper>
        </FamilyDrawerContent>
      </FamilyDrawerPortal>
    </FamilyDrawerRoot>
  );
}
