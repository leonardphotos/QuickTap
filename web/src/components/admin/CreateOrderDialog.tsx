import { useEffect, useMemo, useState } from 'react';
import { Bike, ClipboardList, Store, UtensilsCrossed } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';
import type { Product, TableItem } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';

interface ExistingOrderOption {
  id: string;
  orderNumber: number;
  channel: 'DINE_IN' | 'DELIVERY' | 'PICKUP';
  customerName: string | null;
  table: { number: string } | null;
}

interface Props {
  existingOrders: ExistingOrderOption[];
  onClose: () => void;
  onCreated: () => void;
  onSelectExisting: (orderId: string) => void;
}

type Channel = 'DINE_IN' | 'DELIVERY' | 'PICKUP';

const CHANNEL_OPTIONS: { value: Channel; label: string; icon: typeof UtensilsCrossed }[] = [
  { value: 'DINE_IN', label: 'Mesa', icon: UtensilsCrossed },
  { value: 'DELIVERY', label: 'Delivery', icon: Bike },
  { value: 'PICKUP', label: 'Pick-up', icon: Store },
];

const CHANNEL_LABELS: Record<Channel, string> = { DINE_IN: 'Mesa', DELIVERY: 'Delivery', PICKUP: 'Pickup' };

/** "Crear pedido" desde el Dashboard: pedido nuevo (Mesa/Delivery/Pick-up) o sumar productos a uno ya activo. */
export function CreateOrderDialog({ existingOrders, onClose, onCreated, onSelectExisting }: Props) {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [channel, setChannel] = useState<Channel>('DINE_IN');

  const [products, setProducts] = useState<Product[]>([]);
  const [tables, setTables] = useState<TableItem[]>([]);
  const [tableId, setTableId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerIdNumber, setCustomerIdNumber] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/products').then((res) => setProducts(res.data.data));
    api.get('/tables').then((res) => setTables(res.data.data));
  }, []);

  const groups = useMemo(() => {
    const byCategory = new Map<string, Product[]>();
    for (const p of products) {
      const key = p.category?.name ?? 'Sin categoría';
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(p);
    }
    return [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'));
  }, [products]);

  const lines = useMemo(
    () => products.map((p) => ({ product: p, quantity: quantities[p.id] ?? 0 })).filter((l) => l.quantity > 0),
    [products, quantities],
  );
  const totalBase = lines.reduce((acc, l) => acc + Number(l.product.price) * l.quantity, 0);

  function setQty(productId: string, quantity: number) {
    setQuantities((q) => ({ ...q, [productId]: Math.max(0, quantity) }));
  }

  async function submit() {
    if (lines.length === 0) {
      setError('Agrega al menos un producto.');
      return;
    }
    if (channel === 'DINE_IN' && !tableId) {
      setError('Selecciona una mesa.');
      return;
    }
    if (channel !== 'DINE_IN' && !customerName.trim()) {
      setError('Escribe el nombre del cliente.');
      return;
    }
    if (channel === 'DELIVERY' && !customerAddress.trim()) {
      setError('Escribe la dirección de entrega.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api.post('/orders/manual', {
        channel,
        tableId: channel === 'DINE_IN' ? tableId : undefined,
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        customerName: customerName.trim() || undefined,
        customerIdNumber: customerIdNumber.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        customerNote: customerNote.trim() || undefined,
      });
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo crear el pedido.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear pedido</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-1.5 rounded-full bg-brand-950/[0.06] p-1">
            <button
              onClick={() => setMode('new')}
              className={`flex items-center justify-center gap-1.5 rounded-full py-1.5 text-sm font-medium transition-colors ${
                mode === 'new' ? 'bg-white shadow-sm text-brand-950' : 'text-brand-950/50'
              }`}
            >
              Pedido nuevo
            </button>
            <button
              onClick={() => setMode('existing')}
              className={`flex items-center justify-center gap-1.5 rounded-full py-1.5 text-sm font-medium transition-colors ${
                mode === 'existing' ? 'bg-white shadow-sm text-brand-950' : 'text-brand-950/50'
              }`}
            >
              Añadir a uno existente
            </button>
          </div>

          {mode === 'existing' ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {existingOrders.length === 0 && (
                <p className="text-sm text-brand-950/40 font-light text-center py-4">No hay pedidos activos.</p>
              )}
              {existingOrders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => onSelectExisting(o.id)}
                  className="w-full flex items-center gap-3 rounded-xl border border-brand-950/10 px-3 py-2.5 text-left hover:border-brand-400/50 hover:bg-brand-950/[0.02] transition-colors"
                >
                  <ClipboardList className="h-4 w-4 text-brand-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-brand-950">
                      #{o.orderNumber}
                      {o.customerName && <span className="font-normal text-brand-950/60"> · {o.customerName}</span>}
                    </p>
                    <p className="text-xs text-brand-950/40">
                      {CHANNEL_LABELS[o.channel]}
                      {o.table && ` ${o.table.number}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-1.5">
                {CHANNEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setChannel(opt.value)}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl border py-2.5 text-xs font-medium transition-colors ${
                      channel === opt.value
                        ? 'border-brand-500 bg-brand-500/5 text-brand-500'
                        : 'border-brand-950/10 text-brand-950/60 hover:border-brand-950/20'
                    }`}
                  >
                    <opt.icon className="h-4 w-4" /> {opt.label}
                  </button>
                ))}
              </div>

              {channel === 'DINE_IN' ? (
                <div className="space-y-2">
                  <select
                    value={tableId}
                    onChange={(e) => setTableId(e.target.value)}
                    className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                  >
                    <option value="">Selecciona una mesa…</option>
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.zone ? `${t.zone.name} · ` : ''}Mesa {t.number}
                      </option>
                    ))}
                  </select>
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Nombre (si la mesa no tiene cuenta abierta)"
                    className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                  />
                  <input
                    value={customerIdNumber}
                    onChange={(e) => setCustomerIdNumber(e.target.value)}
                    placeholder="Cédula (si la mesa no tiene cuenta abierta)"
                    className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Nombre del cliente *"
                    className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                  />
                  <input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Teléfono"
                    className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                  />
                  {channel === 'DELIVERY' && (
                    <input
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      placeholder="Dirección de entrega *"
                      className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                    />
                  )}
                  <input
                    value={customerNote}
                    onChange={(e) => setCustomerNote(e.target.value)}
                    placeholder="Nota (opcional)"
                    className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                  />
                </div>
              )}

              <div className="space-y-4 max-h-56 overflow-y-auto pt-1 border-t border-brand-950/10">
                {groups.map(([category, categoryProducts]) => (
                  <div key={category}>
                    <p className="text-xs font-semibold text-brand-500 uppercase tracking-wide mb-1.5 sticky top-0 bg-white py-0.5">
                      {category}
                    </p>
                    <ul className="space-y-2">
                      {categoryProducts.map((p) => {
                        const qty = quantities[p.id] ?? 0;
                        return (
                          <li key={p.id} className="flex items-center justify-between gap-2 border-b border-brand-950/10 pb-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-brand-950 truncate">{p.name}</p>
                              <p className="text-xs text-brand-950/50">{formatBase(p.price, symbol)}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => setQty(p.id, qty - 1)}
                                disabled={qty === 0}
                                className="w-7 h-7 rounded-full border border-brand-950/20 font-bold text-brand-950 disabled:opacity-30"
                              >
                                −
                              </button>
                              <span className="w-5 text-center text-sm font-medium">{qty}</span>
                              <button
                                onClick={() => setQty(p.id, qty + 1)}
                                className="w-7 h-7 rounded-full border border-brand-950/20 font-bold text-brand-950"
                              >
                                +
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
                {products.length === 0 && (
                  <p className="text-sm text-brand-950/40 font-light text-center py-4">No hay productos disponibles.</p>
                )}
              </div>

              <div className="flex items-center justify-between text-sm font-semibold pt-1">
                <span>Total</span>
                <span>{formatBase(totalBase, symbol)}</span>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <TextureButton variant="brand" size="default" disabled={sending} onClick={submit} className="disabled:opacity-50">
                {sending ? 'Enviando…' : 'Crear pedido'}
              </TextureButton>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
