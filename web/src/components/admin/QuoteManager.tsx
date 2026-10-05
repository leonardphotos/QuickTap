import { api } from '@/api/client';
import { Dialog,DialogContent,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard } from '@/components/ui/texture-card';
import { Toast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext.shared';
import { useToast } from '@/hooks/useToast';
import type { Quote,QuoteItem } from '@/types';
import { CURRENCY_SYMBOLS } from '@/utils/format';
import { sendWhatsappOrOpen } from '@/utils/sendWhatsapp';
import { FileText,Plus,Send,Trash2,X } from 'lucide-react';
import { useEffect,useState } from 'react';
import { ShopCustomerSearch } from '@/pages/admin/shop/ShopCustomerSearch';
import type { RawShopProduct } from '@/pages/admin/shop/shopApi';
import { shopTierPrice } from '@/utils/shop-tier-price';
import { downloadQuotePdf } from '@/utils/quote-pdf';

// La misma referencia visual para todos los campos, incluido el buscador compartido.
const quoteFieldClass = 'min-w-0 rounded-lg border border-brand-950/15 bg-white px-3 py-2 text-sm font-normal leading-5 text-brand-950 placeholder:text-brand-950/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30';

function whatsappUrl(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

function buildQuoteMessage(quote: Quote, businessName: string, symbol: string): string {
  const lines = quote.items.map((i) => `• ${i.qty}x ${i.name} — ${symbol}${(i.qty * i.unitPrice * (1 - (i.discountPercent || 0) / 100)).toFixed(2)} (descuento ${i.discountPercent || 0}%)`);
  return [
    `*Presupuesto — ${businessName}*`,
    '━━━━━━━━━━━━━━━━━━━━',
    ...lines,
    '━━━━━━━━━━━━━━━━━━━━',
    `*Total: ${symbol}${Number(quote.totalBase).toFixed(2)}*`,
    quote.paymentTerms === 'CREDIT' ? `Crédito: ${quote.creditDays} días` : 'Contado',
    quote.note ? `\n${quote.note}` : '',
    '\n_Cotización de QuickTap.club — no es un cobro, es solo referencia._',
  ]
    .filter(Boolean)
    .join('\n');
}

interface DraftItem extends QuoteItem {
  key: number;
}

/**
 * Cotizaciones/presupuestos: un total para que el cliente apruebe (catering, pedido grande,
 * venta al mayor) sin cobrar ni tocar cocina/inventario todavía — compartido tal cual por el
 * panel de restaurante (QuotesPage.tsx) y por Local Comercial (ShopQuotesPage.tsx), porque los
 * ítems son un snapshot libre (nombre/cantidad/precio), no referencias al catálogo de uno u otro.
 * "Convertida" es una marca manual (no hay conversión automática a pedido/venta real — eso
 * implicaría revalidar cada línea contra el catálogo vivo, lo mismo que ya hace el flujo normal).
 */
export function QuoteManager() {
  const { restaurant } = useAuth();
  const isShop = restaurant?.businessType === 'SHOP';
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const { show, toastMessage } = useToast();

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerId, setCustomerId] = useState<string>();
  const [customerIdNumber, setCustomerIdNumber] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [paymentTerms, setPaymentTerms] = useState<'CASH' | 'CREDIT'>('CASH');
  const [creditDays, setCreditDays] = useState(30);
  const [catalog, setCatalog] = useState<RawShopProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<DraftItem[]>([{ key: 0, name: '', qty: 1, unitPrice: 0 }]);
  const [nextKey, setNextKey] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [convertRef, setConvertRef] = useState('');

  function load() {
    api.get('/quotes').then((res) => setQuotes(res.data.data)).catch(() => setError('No se pudieron cargar las cotizaciones.'));
  }

  useEffect(load, []);
  useEffect(() => {
    if (!open || !isShop) return;
    let active = true;
    setCatalogLoading(true); setCatalogError('');
    api.get('/quotes/catalog').then(r => { if (active) setCatalog(r.data.data); })
      .catch(() => { if (active) setCatalogError('No pudimos cargar el catálogo. Cierra y vuelve a abrir la cotización para reintentar.'); })
      .finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, [open, isShop]);

  function openNew() {
    setCustomerName('');
    setCustomerPhone('');
    setCustomerId(undefined); setCustomerIdNumber(''); setCustomerAddress(''); setPaymentTerms('CASH'); setCreditDays(30); setSearch('');
    setNote('');
    setItems(isShop ? [] : [{ key: 0, name: '', qty: 1, unitPrice: 0 }]);
    setNextKey(1);
    setError(null);
    setOpen(true);
  }

  function updateItem(key: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it) => {
      if (it.key !== key) return it;
      const next = { ...it, ...patch };
      const product = catalog.find(p => p.id === next.productId);
      const variant = product?.variants.find(v => v.id === next.variantId);
      if (patch.qty !== undefined && product && product.pricingMode !== 'SERVICE') next.unitPrice = shopTierPrice({ ...product, price: variant?.price ?? product.price }, next.qty);
      return next;
    }));
  }
  function addProduct(product: RawShopProduct, variant: RawShopProduct['variants'][number]) {
    const existing = items.find(i => i.variantId === variant.id);
    if (existing) { updateItem(existing.key, { qty: existing.qty + 1 }); return; }
    setItems(prev => [...prev, { key: nextKey, productId: product.id, variantId: variant.id, name: [product.name, variant.v1, variant.v2].filter(Boolean).join(' · '), qty: 1, unitPrice: shopTierPrice({ ...product, price: variant.price ?? product.price }, 1), discountPercent: 0 }]);
    setNextKey(k => k + 1);
  }

  function addItemRow() {
    setItems((prev) => [...prev, { key: nextKey, name: '', qty: 1, unitPrice: 0 }]);
    setNextKey((k) => k + 1);
  }

  function removeItemRow(key: number) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  const draftTotal = items.reduce((acc, it) => acc + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0) * (1 - (it.discountPercent || 0) / 100), 0);

  async function save() {
    if (isShop && [customerName, customerPhone, customerIdNumber, customerAddress].some(v => !v.trim())) { setError('Completa nombre, RIF, teléfono y dirección.'); return; }
    if (items.some(i => !Number.isFinite(i.qty) || i.qty <= 0 || !Number.isFinite(i.unitPrice) || i.unitPrice < 0 || (i.discountPercent || 0) < 0 || (i.discountPercent || 0) > 100)) { setError('Revisa cantidades, precios y descuentos (0 a 100%).'); return; }
    const cleanItems = items
      .map(({ key: _key, ...it }) => ({ ...it, name: it.name.trim(), qty: Number(it.qty), unitPrice: Number(it.unitPrice) }))
      .filter((it) => it.name && it.qty > 0);
    if (cleanItems.length === 0) {
      setError('Agrega al menos un ítem con nombre y cantidad.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await api.post('/quotes', {
        customerId, customerIdNumber, customerAddress, paymentTerms, creditDays: paymentTerms === 'CREDIT' ? creditDays : undefined,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        note: note.trim() || undefined,
        items: cleanItems,
      });
      setOpen(false);
      load();
      try { downloadQuotePdf(response.data.data, restaurant?.name ?? ''); }
      catch { show('Cotización guardada. Puedes volver a descargar el PDF desde la lista.'); }
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar la cotización.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar esta cotización?')) return;
    await api.delete(`/quotes/${id}`);
    load();
  }

  async function sendQuote(q: Quote) {
    if (!q.customerPhone) return;
    const message = buildQuoteMessage(q, restaurant?.name ?? '', CURRENCY_SYMBOLS[q.currency]);
    const sent = await sendWhatsappOrOpen(q.customerPhone, message, whatsappUrl(q.customerPhone, message));
    if (sent) show('Mensaje enviado');
  }

  async function confirmConvert(id: string) {
    if (!convertRef.trim()) return;
    await api.patch(`/quotes/${id}/converted`, { convertedToId: convertRef.trim() });
    setConvertingId(null);
    setConvertRef('');
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-950">Cotizaciones</h1>
          <p className="text-brand-950/60 font-light text-base">
            Arma un presupuesto para que el cliente apruebe — no cobra ni descuenta inventario.
          </p>
        </div>
        <TextureButton variant="brand" size="default" className="!w-auto flex items-center gap-1.5" onClick={openNew}>
          <Plus className="h-4 w-4" /> Nueva cotización
        </TextureButton>
      </div>

      <TextureCard>
        {!open && error && <p role="alert" className="p-4 text-red-600 text-base">{error}</p>}
        <ul className="divide-y divide-brand-950/10">
          {quotes.map((q) => (
            <li key={q.id} className="px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-brand-950 text-base">
                    {q.customerName || 'Sin nombre de cliente'}
                    {q.convertedToId && (
                      <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        Convertida
                      </span>
                    )}
                  </p>
                  <p className="text-brand-950/50 font-light text-base">
                    {new Date(q.createdAt).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}
                    {q.items.length} ítem{q.items.length === 1 ? '' : 's'}
                  </p>
                </div>
                <p className="text-lg font-semibold text-brand-950 shrink-0">
                  {CURRENCY_SYMBOLS[q.currency]}
                  {Number(q.totalBase).toFixed(2)}
                </p>
              </div>

              <ul className="mt-2 space-y-0.5">
                {q.items.map((it, i) => (
                  <li key={i} className="text-sm text-brand-950/60 flex justify-between gap-2">
                    <span className="truncate">
                      {it.qty} {it.unit || 'x'} {it.name} {it.discountPercent ? `(-${it.discountPercent}%)` : '(sin descuento)'}
                    </span>
                    <span className="shrink-0">
                      {CURRENCY_SYMBOLS[q.currency]}
                      {(it.qty * it.unitPrice * (1 - (it.discountPercent || 0) / 100)).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
              {q.note && <p className="mt-1.5 text-brand-950/40 italic text-xs">{q.note}</p>}
              <p className="mt-2 text-brand-950/60 text-xs">{q.paymentTerms === 'CREDIT' ? `Crédito a ${q.creditDays} días` : 'Contado'}</p>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => downloadQuotePdf(q, restaurant?.name ?? '')} className="min-h-11 text-sm font-semibold text-brand-500">Descargar PDF</button>
                {q.customerPhone && (
                  <button
                    type="button"
                    onClick={() => sendQuote(q)}
                    className="text-sm text-brand-500 hover:text-brand-600 flex items-center gap-1"
                  >
                    <Send className="h-3.5 w-3.5" /> Enviar por WhatsApp
                  </button>
                )}
                {!q.convertedToId &&
                  (convertingId === q.id ? (
                    <span className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={convertRef}
                        onChange={(e) => setConvertRef(e.target.value)}
                        placeholder="Ej: pedido #45"
                        className="border border-brand-950/15 rounded-lg px-2 py-1 w-32 text-base"
                      />
                      <button onClick={() => confirmConvert(q.id)} className="text-xs font-medium text-emerald-600 hover:text-emerald-700">
                        Guardar
                      </button>
                      <button onClick={() => setConvertingId(null)} className="text-brand-950/30 hover:text-brand-950">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setConvertingId(q.id);
                        setConvertRef('');
                      }}
                      className="text-sm text-brand-950/50 hover:text-brand-950"
                    >
                      Marcar como convertida
                    </button>
                  ))}
                {!q.convertedToId && (
                  <button onClick={() => remove(q.id)} className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1">
                    <Trash2 className="h-3.5 w-3.5" /> Eliminar
                  </button>
                )}
              </div>
            </li>
          ))}
          {quotes.length === 0 && (
            <li className="px-4 py-10 text-center text-brand-950/40 text-sm font-light flex flex-col items-center gap-2">
              <FileText className="h-6 w-6 text-brand-950/20" />
              Sin cotizaciones todavía.
            </li>
          )}
        </ul>
      </TextureCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva cotización</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {isShop && <ShopCustomerSearch inputClassName={quoteFieldClass} onSelect={c => { setCustomerId(c.id); setCustomerName(c.name); setCustomerPhone(c.phone); setCustomerIdNumber(c.idNumber ?? ''); setCustomerAddress(c.address ?? ''); }} />}
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={customerName}
                onChange={(e) => { setCustomerName(e.target.value); setCustomerId(undefined); }}
                aria-label="Nombre del cliente"
                placeholder={isShop ? 'Nombre del cliente *' : 'Cliente (opcional)'}
                className={quoteFieldClass}
              />
              <input
                value={customerPhone}
                onChange={(e) => { setCustomerPhone(e.target.value); setCustomerId(undefined); }}
                aria-label="Teléfono del cliente"
                placeholder={isShop ? 'Teléfono *' : 'WhatsApp (opcional)'}
                className={quoteFieldClass}
              />
            </div>

            {isShop && <div className="grid gap-2 sm:grid-cols-2">
              <input aria-label="RIF o cédula" placeholder="RIF / cédula *" maxLength={30} value={customerIdNumber} onChange={e => setCustomerIdNumber(e.target.value)} className={quoteFieldClass} />
              <input aria-label="Dirección del cliente" placeholder="Dirección *" maxLength={300} value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} className={quoteFieldClass} />
            </div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-brand-950/60 text-sm font-medium">Condición de pago<select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value as 'CASH' | 'CREDIT')} className={`${quoteFieldClass} mt-1 w-full`}><option value="CASH">Contado</option><option value="CREDIT">Crédito</option></select></label>
              {paymentTerms === 'CREDIT' && <label className="text-brand-950/60 text-sm font-medium">Plazo en días<input type="number" min={1} max={365} value={creditDays} onChange={e => setCreditDays(Number(e.target.value))} className={`${quoteFieldClass} mt-1 w-full`} /></label>}
            </div>
            {isShop && <section className="rounded-lg border border-brand-950/15 p-3 space-y-2">
              <h3 className="text-sm font-normal text-brand-950">Catálogo de productos</h3>
              <input aria-label="Buscar productos" placeholder="Buscar por nombre o SKU" value={search} onChange={e => setSearch(e.target.value)} className={`${quoteFieldClass} w-full`} />
              <p className="text-brand-950/60 text-xs">Existencias informativas; cotizar no reserva productos. Los precios por cantidad se calculan automáticamente.</p>
              {catalogLoading ? <p className="text-base">Cargando catálogo…</p> : catalogError ? <p role="alert" className="text-red-600 text-base">{catalogError}</p> : <div className="max-h-52 overflow-y-auto divide-y divide-brand-950/15">
                {catalog.filter(p => `${p.name} ${p.sku}`.toLowerCase().includes(search.toLowerCase())).map(p => <div key={p.id} className="py-2"><p className="font-normal leading-5 text-base">{p.name}</p>{p.variants.map(v => <button type="button" key={v.id} onClick={() => addProduct(p,v)} className="flex w-full justify-between gap-2 py-2 text-left text-sm font-normal leading-5"><span>{[v.v1,v.v2].filter(Boolean).join(' · ')} · {v.stock} {p.saleUnit === 'MT' ? 'm' : v.soldByWeight ? 'kg' : 'und.'} disponibles</span><span className="shrink-0 text-brand-500">+ Agregar</span></button>)}</div>)}
                {!catalog.length && <p className="py-3 text-base">No hay productos cargados todavía.</p>}
              </div>}
            </section>}

            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.key} className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-950/15 p-3">
                  <input
                    value={it.name}
                    readOnly={isShop}
                    aria-label="Producto"
                    onChange={(e) => updateItem(it.key, { name: e.target.value })}
                    placeholder="Producto / servicio"
                    className={`${quoteFieldClass} flex-1 basis-full sm:basis-40`}
                  />
                  <input
                    type="number"
                    aria-label="Cantidad"
                    step="0.001"
                    min={0}
                    value={it.qty}
                    onChange={(e) => updateItem(it.key, { qty: Number(e.target.value) || 0 })}
                    placeholder="Cant."
                    className={`${quoteFieldClass} w-20 shrink-0 text-center`}
                  />
                  <input
                    type="number"
                    aria-label="Precio unitario"
                    readOnly={isShop && catalog.find(p => p.id === it.productId)?.pricingMode !== 'SERVICE'}
                    min={0}
                    step="0.01"
                    value={it.unitPrice}
                    onChange={(e) => updateItem(it.key, { unitPrice: Number(e.target.value) || 0 })}
                    placeholder="Precio"
                    className={`${quoteFieldClass} w-24 shrink-0 text-right`}
                  />
                  <label className="flex items-center gap-2 text-brand-950/60 text-sm font-medium">Descuento %<input aria-label={`Descuento de ${it.name}`} type="number" min={0} max={100} step="0.01" value={it.discountPercent || 0} onChange={e => updateItem(it.key, { discountPercent: Number(e.target.value) })} className={`${quoteFieldClass} w-20`} /></label>
                  <button
                    type="button"
                    onClick={() => removeItemRow(it.key)}
                    aria-label="Quitar producto"
                    className="shrink-0 text-brand-950/30 hover:text-red-500 disabled:opacity-30"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {!isShop && <button type="button" onClick={addItemRow} className="text-sm font-medium text-brand-500 hover:text-brand-600 flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> Agregar ítem
              </button>}
            </div>

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nota (opcional) — ej: válido por 7 días"
              rows={2}
              className={`${quoteFieldClass} w-full`}
            />

            <div className="flex items-center justify-between pt-1 border-t border-brand-950/15">
              <span className="text-sm text-brand-950/60">Total</span>
              <span className="text-lg font-semibold text-brand-950">
                {symbol}
                {draftTotal.toFixed(2)}
              </span>
            </div>

            {error && <p className="text-red-600 text-base">{error}</p>}

            <TextureButton variant="brand" size="default" disabled={saving} onClick={save} className="!w-auto disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar y descargar PDF'}
            </TextureButton>
          </div>
        </DialogContent>
      </Dialog>

      <Toast message={toastMessage} />
    </div>
  );
}
