import { useMemo, useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';
import type { Product } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';

interface Props {
  tableId: string;
  tableNumber: string;
  hasOpenSession: boolean;
  products: Product[];
  onClose: () => void;
  onCreated: () => void;
}

export function ManualOrderDialog({ tableId, tableNumber, hasOpenSession, products, onClose, onCreated }: Props) {
  const { restaurant } = useAuth();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState('');
  const [customerIdNumber, setCustomerIdNumber] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';

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
    () =>
      products
        .map((p) => ({ product: p, quantity: quantities[p.id] ?? 0 }))
        .filter((l) => l.quantity > 0),
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
    if (!hasOpenSession) {
      if (!customerName.trim() || !customerIdNumber.trim()) {
        setError('Escribe el nombre y la cédula del cliente para abrir la cuenta.');
        return;
      }
    }
    setSending(true);
    setError(null);
    try {
      await api.post('/orders/manual', {
        tableId,
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        ...(hasOpenSession ? {} : { customerName: customerName.trim(), customerIdNumber: customerIdNumber.trim() }),
      });
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo enviar el pedido a cocina.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generar orden · Mesa {tableNumber}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!hasOpenSession && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-brand-950">Datos para abrir la cuenta</p>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nombre"
                className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
              <input
                value={customerIdNumber}
                onChange={(e) => setCustomerIdNumber(e.target.value)}
                placeholder="Cédula"
                className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
            </div>
          )}

          <div className="space-y-4 max-h-72 overflow-y-auto">
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
            {sending ? 'Enviando…' : 'Enviar pedido a cocina'}
          </TextureButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
