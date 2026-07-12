import { useState } from 'react';
import { api } from '../../api/client';
import type { CartLine, PaymentMethod, Restaurant } from '../../types';
import { formatBs, formatUsd } from '../../utils/format';

interface Props {
  restaurant: Restaurant;
  cart: CartLine[];
  subtotal: number;
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

export default function CartDrawer({ restaurant, cart, subtotal, qrToken, onRemove, onClose, onClearAndClose }: Props) {
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
          <p className="font-semibold text-gray-900">¡Pedido enviado a cocina!</p>
          <p className="text-sm text-gray-500">Ya lo están preparando.</p>
          <button onClick={onClearAndClose} className="mt-4 bg-gray-900 text-white rounded-lg px-4 py-2 text-sm">
            Listo
          </button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-900">Tu pedido</h3>
        <button onClick={onClose} className="text-gray-400 text-xl leading-none">
          ×
        </button>
      </div>

      {cart.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">Tu carrito está vacío.</p>
      ) : (
        <ul className="space-y-2 max-h-48 overflow-y-auto">
          {cart.map((l, i) => (
            <li key={i} className="flex items-start justify-between text-sm border-b pb-2">
              <div>
                <p className="font-medium text-gray-900">
                  {l.quantity}x {l.product.name}
                </p>
                {l.note && <p className="text-xs text-gray-500">📝 {l.note}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span>{formatUsd(Number(l.product.price) * l.quantity)}</span>
                <button onClick={() => onRemove(i)} className="text-red-500 text-xs">
                  Quitar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-between text-sm font-semibold mt-3">
        <span>Subtotal</span>
        <span>{formatUsd(subtotal)}</span>
      </div>
      <div className="flex justify-between text-xs text-gray-500 mb-3">
        <span>Total en Bs</span>
        <span>{formatBs(subtotal, restaurant.exchangeRate)}</span>
      </div>

      {cart.length > 0 && (
        <>
          {qrToken ? (
            <button
              disabled={sending}
              onClick={submitDineIn}
              className="w-full bg-emerald-600 text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
            >
              {sending ? 'Enviando…' : 'Enviar pedido a cocina'}
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2 text-sm">
                <button
                  onClick={() => setMode('DELIVERY')}
                  className={`flex-1 rounded-lg py-1.5 border ${mode === 'DELIVERY' ? 'bg-gray-900 text-white' : 'bg-white'}`}
                >
                  🛵 Delivery
                </button>
                <button
                  onClick={() => setMode('PICKUP')}
                  className={`flex-1 rounded-lg py-1.5 border ${mode === 'PICKUP' ? 'bg-gray-900 text-white' : 'bg-white'}`}
                >
                  🏬 Pickup
                </button>
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre"
                className="w-full text-sm border rounded-lg px-2 py-1.5"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Teléfono (opcional)"
                className="w-full text-sm border rounded-lg px-2 py-1.5"
              />
              {mode === 'DELIVERY' && (
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Dirección de entrega"
                  className="w-full text-sm border rounded-lg px-2 py-1.5"
                />
              )}
              <select
                value={payment}
                onChange={(e) => setPayment(e.target.value as PaymentMethod)}
                className="w-full text-sm border rounded-lg px-2 py-1.5"
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
                className="w-full text-sm border rounded-lg px-2 py-1.5"
              />
              <button
                disabled={sending}
                onClick={submitDelivery}
                className="w-full bg-emerald-600 text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
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
    <div className="fixed inset-0 bg-black/40 z-20 flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
