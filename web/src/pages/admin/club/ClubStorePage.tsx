import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScanBarcode } from 'lucide-react';
import { ClubScanDialog } from './ClubScanDialog';
import type { FormEvent } from 'react';
import { AlertTriangle, Minus, Package, Plus, Search } from 'lucide-react';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase, formatBs } from '@/utils/format';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import { clubStoreApi, isLow, stockOf, STORE_PAYMENT_METHODS, type StoreProduct } from './clubStoreApi';
import { card } from './clubStyle';

interface Props {
  restaurant: Pick<AuthRestaurant, 'currencySymbol' | 'exchangeRate'>;
  canSeeMoney: boolean;
}

type Line = { product: StoreProduct; qty: number };

export default function ClubStorePage({ restaurant, canSeeMoney }: Props) {
  const [products, setProducts] = useState<StoreProduct[] | null>(null);
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<Line[]>([]);
  const [checkout, setCheckout] = useState(false);
  const [newProduct, setNewProduct] = useState(false);
  const [restocking, setRestocking] = useState<StoreProduct | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const { show, toastMessage } = useToast();

  const load = useCallback(() => {
    clubStoreApi
      .state()
      .then((s) => setProducts(s.products))
      .catch(() => show('No se pudo cargar la tienda.'));
  }, [show]);

  useEffect(load, [load]);

  const money = (n: number) => formatBase(n, restaurant.currencySymbol);
  const moneyBs = (n: number) => (restaurant.exchangeRate ? formatBs(n, restaurant.exchangeRate.rateBs) : null);

  const filtered = useMemo(
    () => (products ?? []).filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())),
    [products, query],
  );
  const lowStock = (products ?? []).filter(isLow);
  const total = cart.reduce((acc, l) => acc + l.product.price * l.qty, 0);

  function addToCart(p: StoreProduct) {
    if (stockOf(p) <= 0) {
      show('Sin existencias.');
      return;
    }
    setCart((prev) => {
      const line = prev.find((l) => l.product.id === p.id);
      if (!line) return [...prev, { product: p, qty: 1 }];
      if (line.qty >= stockOf(p)) return prev;
      return prev.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
    });
  }

  function setQty(id: string, qty: number) {
    setCart((prev) => (qty <= 0 ? prev.filter((l) => l.product.id !== id) : prev.map((l) => (l.product.id === id ? { ...l, qty } : l))));
  }

  return (
    <div className="flex flex-col gap-5 pb-32">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight text-brand-950">Tienda</h1>
          <p className="mt-0.5 text-[13px] font-light text-brand-950/50">
            {products?.length ?? 0} productos · {lowStock.length} por reponer
          </p>
        </div>
        <button
          onClick={() => setNewProduct(true)}
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-brand-500 px-3.5 py-2 text-[13px] font-bold text-white shadow-sm hover:bg-brand-500/90"
        >
          <Plus className="h-4 w-4" />
          Producto
        </button>
      </div>

      {lowStock.length > 0 && (
        <div className="flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-amber-900">Stock bajo</p>
            <p className="text-[13px] font-light text-amber-800">
              {lowStock.map((p) => `${p.name} (${stockOf(p)})`).join(' · ')}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-950/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar producto o código…"
            className="w-full rounded-2xl border border-brand-950/10 bg-white py-3 pl-11 pr-4 text-[15px] text-brand-950 placeholder:text-brand-950/35 outline-none focus:border-brand-400"
          />
        </div>
        <button
          type="button"
          onClick={() => { setScanError(null); setScanning(true); }}
          aria-label="Escanear código de barras"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-brand-950/10 bg-white text-brand-950/60 hover:text-brand-950"
        >
          <ScanBarcode className="h-5 w-5" />
        </button>
      </div>
      {scanError && <p className="text-sm text-red-600">{scanError}</p>}

      {products === null && <p className="font-light text-brand-950/40">Cargando…</p>}
      {products?.length === 0 && (
        <div className={cn(card, 'p-8 text-center')}>
          <Package className="mx-auto h-8 w-8 text-brand-950/25" />
          <p className="mt-3 font-semibold text-brand-950">Tu tienda está vacía</p>
          <p className="mt-1 text-[13px] font-light text-brand-950/50">
            Agrega agua, pelotas o lo que vendas en el mostrador.
          </p>
        </div>
      )}

      <div className="grid gap-2.5 sm:grid-cols-2">
        {filtered.map((p) => {
          const stock = stockOf(p);
          const inCart = cart.find((l) => l.product.id === p.id)?.qty ?? 0;
          return (
            <div key={p.id} className={cn(card, 'flex items-center gap-3 p-3.5')}>
              <button onClick={() => addToCart(p)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-[15px] font-semibold text-brand-950">{p.name}</p>
                <p className="text-[12px] font-light text-brand-950/45">
                  {canSeeMoney ? `${money(p.price)} · ` : ''}
                  <span className={stock <= p.minStock ? 'font-semibold text-amber-600' : ''}>{stock} en stock</span>
                </p>
              </button>

              {inCart > 0 ? (
                <div className="flex shrink-0 items-center gap-1 rounded-full bg-brand-950/[0.05] p-1 text-brand-950">
                  <button
                    onClick={() => setQty(p.id, inCart - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-brand-950/[0.08]"
                    aria-label={`Quitar ${p.name}`}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-5 text-center text-[14px] font-bold">{inCart}</span>
                  <button
                    onClick={() => addToCart(p)}
                    className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-brand-950/[0.08]"
                    aria-label={`Agregar ${p.name}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setRestocking(p)}
                  className="shrink-0 rounded-full bg-brand-950/[0.05] px-3 py-1.5 text-[12px] font-semibold text-brand-950 hover:bg-brand-950/[0.08]"
                >
                  Reponer
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Barra de cobro: solo aparece cuando hay algo que cobrar. */}
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-24 z-30 px-5 lg:bottom-6">
          <button
            onClick={() => setCheckout(true)}
            className="mx-auto flex w-full max-w-lg items-center gap-3 rounded-full bg-brand-950 px-5 py-4 text-white shadow-2xl shadow-brand-950/25"
          >
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-white/20 px-2 text-[12px] font-bold">
              {cart.reduce((a, l) => a + l.qty, 0)}
            </span>
            <span className="text-[15px] font-bold">Cobrar</span>
            <span className="ml-auto text-[16px] font-bold">{money(total)}</span>
          </button>
        </div>
      )}

      {checkout && (
        <CheckoutDialog
          cart={cart}
          total={total}
          money={money}
          moneyBs={moneyBs}
          onClose={() => setCheckout(false)}
          onDone={(msg) => {
            setCheckout(false);
            setCart([]);
            load();
            show(msg);
          }}
        />
      )}

      <ClubScanDialog
        open={scanning}
        products={products ?? []}
        onClose={() => setScanning(false)}
        onFound={(p) => {
          setScanning(false);
          // Escanear busca el producto, no lo vende solo: el cajero decide la cantidad.
          setQuery(p.name);
        }}
      />

      {newProduct && (
        <NewProductDialog
          onClose={() => setNewProduct(false)}
          onSaved={() => {
            setNewProduct(false);
            load();
            show('Producto agregado.');
          }}
        />
      )}

      {restocking && (
        <RestockDialog
          product={restocking}
          onClose={() => setRestocking(null)}
          onSaved={() => {
            setRestocking(null);
            load();
            show('Stock actualizado.');
          }}
        />
      )}

      <Toast message={toastMessage} />
    </div>
  );
}

function CheckoutDialog({
  cart,
  total,
  money,
  moneyBs,
  onClose,
  onDone,
}: {
  cart: Line[];
  total: number;
  money: (n: number) => string;
  moneyBs: (n: number) => string | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [method, setMethod] = useState(STORE_PAYMENT_METHODS[0]);
  const [onTab, setOnTab] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await clubStoreApi.sell({
        items: cart.map((l) => ({
          productId: l.product.id,
          name: l.product.name,
          category: l.product.category,
          qty: l.qty,
          price: l.product.price,
          cost: l.product.cost,
          v1: l.product.variants[0]?.v1 ?? 'Unidad',
          v2: l.product.variants[0]?.v2 ?? '',
        })),
        total,
        paymentMethod: onTab ? 'Cuenta abierta' : method,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        creditTerms: onTab ? 'FULL' : null,
      });
      onDone(onTab ? 'Cargado a la cuenta del jugador.' : 'Venta registrada.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo registrar la venta.');
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cobrar</DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border border-brand-950/[0.08] bg-brand-950/[0.02] p-3">
          {cart.map((l) => (
            <div key={l.product.id} className="flex justify-between text-[13px] text-brand-950">
              <span className="truncate">
                {l.qty}× {l.product.name}
              </span>
              <span className="shrink-0 font-semibold">{money(l.product.price * l.qty)}</span>
            </div>
          ))}
          <div className="mt-2 flex justify-between border-t border-brand-950/10 pt-2">
            <span className="text-[14px] font-bold text-brand-950">Total</span>
            <span className="text-right">
              <span className="block text-[16px] font-bold text-brand-950">{money(total)}</span>
              {moneyBs(total) && <span className="block text-[11px] font-light text-brand-950/50">{moneyBs(total)}</span>}
            </span>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="flex items-center gap-2.5 rounded-xl border border-brand-950/10 p-3">
            <input type="checkbox" checked={onTab} onChange={(e) => setOnTab(e.target.checked)} />
            <span className="text-[13px] font-medium text-brand-950">
              Cargar a la cuenta del jugador
              <span className="block text-[11px] font-light text-brand-950/45">
                Queda pendiente y aparece en su cancha.
              </span>
            </span>
          </label>

          {!onTab && (
            <div>
              <label className="mb-1 block text-[13px] font-medium text-brand-950/60">Método de pago</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full rounded-xl border border-brand-950/10 px-3 py-2 text-[14px] outline-none focus:border-brand-400"
              >
                {STORE_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[13px] font-medium text-brand-950/60">
                Jugador {onTab && <span className="text-rose-600">*</span>}
              </label>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required={onTab}
                className="w-full rounded-xl border border-brand-950/10 px-3 py-2 text-[14px] outline-none focus:border-brand-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-medium text-brand-950/60">
                Teléfono {onTab && <span className="text-rose-600">*</span>}
              </label>
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                required={onTab}
                placeholder="584141234567"
                className="w-full rounded-xl border border-brand-950/10 px-3 py-2 text-[14px] outline-none focus:border-brand-400"
              />
            </div>
          </div>
          {onTab && (
            <p className="text-[11px] font-light text-brand-950/45">
              El teléfono es lo que ata la cuenta a su reserva: si no coincide con el de la cancha, no aparecerá ahí.
            </p>
          )}

          {error && <p className="text-[13px] font-medium text-rose-600">{error}</p>}

          <TextureButton type="submit" disabled={saving} className="w-full">
            {saving ? 'Guardando…' : onTab ? 'Cargar a la cuenta' : 'Cobrar'}
          </TextureButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewProductDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Bebidas');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('5');
  const [sku, setSku] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await clubStoreApi.createProduct({
        name: name.trim(),
        category: category.trim(),
        price: Number(price),
        cost: Number(cost || 0),
        minStock: Number(minStock || 0),
        stock: Number(stock || 0),
        sku: sku.trim(),
      });
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo crear el producto.');
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo producto</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Nombre" value={name} onChange={setName} placeholder="Agua mineral 600ml" required />
          <Field label="Categoría" value={category} onChange={setCategory} list="club-store-cats" />
          <Field label="Código de barras" value={sku} onChange={setSku} placeholder="Escanéalo o escríbelo" />
          <datalist id="club-store-cats">
            {['Bebidas', 'Pelotas', 'Accesorios', 'Snacks', 'Alquiler'].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio de venta" value={price} onChange={setPrice} type="number" step="0.01" required />
            <Field label="Costo" value={cost} onChange={setCost} type="number" step="0.01" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stock inicial" value={stock} onChange={setStock} type="number" />
            <Field label="Avisar cuando queden" value={minStock} onChange={setMinStock} type="number" />
          </div>
          {error && <p className="text-[13px] font-medium text-rose-600">{error}</p>}
          <TextureButton type="submit" disabled={saving} className="w-full">
            {saving ? 'Guardando…' : 'Agregar'}
          </TextureButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RestockDialog({ product, onClose, onSaved }: { product: StoreProduct; onClose: () => void; onSaved: () => void }) {
  const [counted, setCounted] = useState(String(stockOf(product)));
  const [reason, setReason] = useState('Reposición');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await clubStoreApi.adjustStock(product, Number(counted), reason);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] font-light text-brand-950/55">
          Ahora hay {stockOf(product)}. Escribe cuánto hay de verdad.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Existencias" value={counted} onChange={setCounted} type="number" required />
          <Field label="Motivo" value={reason} onChange={setReason} />
          <TextureButton type="submit" disabled={saving} className="w-full">
            {saving ? 'Guardando…' : 'Actualizar stock'}
          </TextureButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <div>
      <label className="mb-1 block text-[13px] font-medium text-brand-950/60">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-brand-950/10 px-3 py-2 text-[14px] outline-none focus:border-brand-400"
        {...rest}
      />
    </div>
  );
}
