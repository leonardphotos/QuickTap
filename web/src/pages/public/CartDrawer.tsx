import { useState } from 'react';
import { api } from '../../api/client';
import type { CartLine, PaymentMethod, Restaurant } from '../../types';
import { publicPriceLabel } from '../../utils/format';

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
  const [mode, setMode] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('MOBILE_PAYMENT');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dineInSent, setDineInSent] = useState(false);

  const items = cart.map((l) => ({
    productId: l.product.id,
    quantity: l.quantity,
    modifiers: l.modifiers,
    note: l.note,
  }));

  async function submitDineIn() {
    setSending(true);
    setError(null);
    try {
      await api.post('/public/checkout/dine-in', { qrToken, items });
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

  if (dineInSent) {
    return (
      <Overlay onClose={onClose}>
        <div className="text-center py-8 space-y-2">
          <p className="text-4xl">✅</p>
          <p className="font-semibold text-brand-950">¡Pedido enviado a cocina!</p>
          <p className="text-sm text-brand-950/60 font-light">Ya lo están preparando.</p>
          <button onClick={onClearAndClose} className="mt-4 bg-brand-500 hover:bg-brand-800 text-white rounded-lg px-4 py-2 text-sm">
            Listo
          </button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-brand-950">Tu pedido</h3>
        <button onClick={onClose} className="text-brand-950/40 text-xl leading-none">
          ×
        </button>
      </div>

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
                  <button onClick={() => onRemove(i)} className="text-red-500 text-xs">
                    Quitar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex justify-between text-sm font-semibold mt-3">
        <span>Total a pagar</span>
        <span>{publicPriceLabel(subtotalBase, restaurant).primary}</span>
      </div>
      {publicPriceLabel(subtotalBase, restaurant).secondary && (
        <div className="flex justify-between text-xs text-brand-950/50 mb-3">
          <span>Equivalente</span>
          <span>{publicPriceLabel(subtotalBase, restaurant).secondary}</span>
        </div>
      )}

      {cart.length > 0 && (
        <>
          {qrToken ? (
            <button
              disabled={sending}
              onClick={submitDineIn}
              className="w-full bg-brand-500 hover:bg-brand-800 text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
            >
              {sending ? 'Enviando…' : 'Enviar pedido a cocina'}
            </button>
          ) : (
            <div className="space-y-2">
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
              <button
                disabled={sending}
                onClick={submitDelivery}
                className="w-full bg-brand-500 hover:bg-brand-800 text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
              >
                {sending ? 'Generando…' : '📲 Enviar pedido por WhatsApp'}
              </button>
            </div>
          )}
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </>
      )}
    </Overlay>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-brand-950/40 z-20 flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
