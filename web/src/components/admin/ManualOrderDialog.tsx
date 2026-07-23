import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, cartLineUnitPrice, formatBase } from '@/utils/format';
import type { CartLine, Product } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { ProductOptionsDialog } from './ProductOptionsDialog';

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
  const [lines, setLines] = useState<CartLine[]>([]);
  const [optionsProduct, setOptionsProduct] = useState<Product | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerIdNumber, setCustomerIdNumber] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';

  const categoryNames = useMemo(() => {
    const names = new Set<string>();
    for (const p of products) names.add(p.category?.name ?? 'Sin categoría');
    return [...names].sort((a, b) => a.localeCompare(b, 'es'));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter && (p.category?.name ?? 'Sin categoría') !== categoryFilter) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, search, categoryFilter]);

  const totalBase = lines.reduce((acc, l) => acc + cartLineUnitPrice(l) * l.quantity, 0);

  /** Línea armada en ProductOptionsDialog: se fusiona con una idéntica si existe. */
  function addPickedLine(line: CartLine) {
    setLines((prev) => {
      const matchIndex = prev.findIndex(
        (l) =>
          l.product.id === line.product.id &&
          l.note === line.note &&
          l.variantId === line.variantId &&
          JSON.stringify(l.selectedModifiers.map((m) => m.modifierId).sort()) ===
            JSON.stringify(line.selectedModifiers.map((m) => m.modifierId).sort()),
      );
      if (matchIndex === -1) return [...prev, line];
      const next = [...prev];
      next[matchIndex] = { ...next[matchIndex], quantity: next[matchIndex].quantity + line.quantity };
      return next;
    });
  }

  async function submit() {
    if (lines.length === 0) {
      setError('Agrega al menos un producto.');
      return;
    }
    if (!hasOpenSession) {
      if (!customerName.trim() || !customerIdNumber.trim() || !customerPhone.trim()) {
        setError('Escribe el nombre, la cédula y el teléfono del cliente para abrir la cuenta.');
        return;
      }
    }
    setSending(true);
    setError(null);
    try {
      await api.post('/orders/manual', {
        tableId,
        items: lines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
          variantId: l.variantId,
          modifierIds: l.selectedModifiers.map((m) => m.modifierId),
          note: l.note,
        })),
        ...(hasOpenSession
          ? {}
          : {
              customerName: customerName.trim(),
              customerIdNumber: customerIdNumber.trim(),
              customerPhone: customerPhone.trim(),
            }),
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
    <>
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
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Teléfono"
                  className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                />
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-950/30" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar en el menú…"
                className="w-full text-sm border border-brand-950/15 rounded-lg pl-8 pr-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setCategoryFilter(null)}
                className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  !categoryFilter ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
                }`}
              >
                Todas
              </button>
              {categoryNames.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoryFilter(c)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    categoryFilter === c ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 max-h-[26rem] overflow-y-auto pt-1">
              {filteredProducts.map((p) => {
                const qty = lines.filter((l) => l.product.id === p.id).reduce((acc, l) => acc + l.quantity, 0);
                return (
                  <div
                    key={p.id}
                    className={`rounded-xl border p-3 space-y-2 ${qty > 0 ? 'border-brand-400/50 bg-brand-500/5' : 'border-brand-950/10'}`}
                  >
                    {p.photoUrl ? (
                      <img src={p.photoUrl} alt="" className="h-24 w-full rounded-lg object-cover" />
                    ) : (
                      <div className="h-24 w-full rounded-lg bg-brand-950/5" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-brand-950 truncate">{p.name}</p>
                      <p className="text-sm text-brand-950/50">{formatBase(p.price, symbol)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOptionsProduct(p)}
                      className="w-full flex items-center justify-center gap-1 rounded-lg border border-brand-500/40 text-brand-500 text-xs font-medium py-1.5"
                    >
                      {qty > 0 ? `${qty} agregado${qty > 1 ? 's' : ''} · Añadir más` : 'Añadir'}
                    </button>
                  </div>
                );
              })}
              {filteredProducts.length === 0 && (
                <p className="col-span-2 text-sm text-brand-950/40 font-light text-center py-4">
                  {products.length === 0 ? 'No hay productos disponibles.' : 'No hay productos que coincidan.'}
                </p>
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

      {optionsProduct && (
        <ProductOptionsDialog
          product={optionsProduct}
          currencySymbol={symbol}
          onClose={() => setOptionsProduct(null)}
          onAdd={addPickedLine}
        />
      )}
    </>
  );
}
