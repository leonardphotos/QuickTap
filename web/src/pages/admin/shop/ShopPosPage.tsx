import { useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { Camera, CheckCircle2, ClipboardList, Loader2, MessageCircle, Minus, Plus, Printer, ScanLine, Search, ShoppingCart, Wrench, X } from 'lucide-react';
import { api } from '@/api/client';
import type { AuthRestaurant } from '@/context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ShopRubro, ShopVariant } from '@/data/shopRubros';
import { shopMoneyFormatters } from './shopFormat';
import { effectivePrice, lineTotal, productStatus, productStock, type PaymentMeta, type Sale, type ShopProduct, type ShopSession } from './shopSession';
import ShopBarcodeScanDialog from './ShopBarcodeScanDialog';
import { playCashSound } from './shopSounds';

interface Props {
  session: ShopSession;
  restaurant: Pick<AuthRestaurant, 'currencySymbol' | 'exchangeRate' | 'name' | 'paymentMethodsConfig'>;
  rubro: ShopRubro;
}

/** Métodos de pago cuyo monto se cobra naturalmente en dólares — el recibo de WhatsApp muestra
 * el $ como monto principal para estos, y Bs para el resto (Pago Móvil, Transferencia, etc.). */
const USD_PAYMENT_LABELS = new Set(['Efectivo $', 'Zelle', 'Binance', 'PayPal']);

/** Normaliza un teléfono venezolano a formato internacional para wa.me: acepta que el cajero lo
 * haya escrito con o sin el código de país, con o sin el 0 inicial típico (04xx-xxx-xxxx). */
function waPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('58')) return digits;
  return `58${digits.replace(/^0+/, '')}`;
}

/** Texto del recibo para el enlace de WhatsApp: ítems, total en el monto principal según el
 * método de pago (USD_PAYMENT_LABELS) y el equivalente en la otra moneda como referencia. */
function buildReceiptMessage(sale: Sale, restaurantName: string, money: (n: number) => string, moneyBs: (n: number) => string | null): string {
  const primaryIsUsd = sale.paymentMethod ? USD_PAYMENT_LABELS.has(sale.paymentMethod) : false;
  const bs = moneyBs(sale.total);
  const primary = primaryIsUsd || !bs ? money(sale.total) : bs;
  const secondary = primaryIsUsd || !bs ? bs : money(sale.total);
  const lines = sale.items.map((it) => `• ${it.soldByWeight ? `${it.qty} Kg` : `${it.qty}x`} ${it.name} — ${money(it.price * it.qty)}`);
  return [
    `🧾 *${restaurantName}*`,
    `Ticket #${sale.id.slice(-6)}${sale.paymentMethod ? ` · ${sale.paymentMethod}` : ''}`,
    '',
    ...lines,
    '',
    `*Total: ${primary}*${secondary ? ` (${secondary})` : ''}`,
    '',
    '¡Gracias por tu compra!',
  ].join('\n');
}

/** Venta normal, o fiada (pago completo más adelante / abono ahora y el resto pendiente). */
type SaleMode = { kind: 'direct' } | { kind: 'fiado'; terms: 'FULL' | 'INSTALLMENT'; amountPaidNow: number };

const STATUS_LABEL: Record<string, string> = { ok: 'Disponible', warn: 'Stock bajo', danger: 'Agotado' };
const STATUS_CLASS: Record<string, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  warn: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
};
const CATEGORY_PALETTE = [
  'bg-brand-500/10 text-brand-500',
  'bg-amber-100 text-amber-700',
  'bg-purple-100 text-purple-700',
  'bg-emerald-100 text-emerald-700',
  'bg-red-100 text-red-700',
  'bg-sky-100 text-sky-700',
  'bg-pink-100 text-pink-700',
];

function initials(name: string): string {
  return name
    .split(' ')
    .filter((w, i) => w.length > 2 || i === 0)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function categoryColor(categories: string[], category: string): string {
  const idx = categories.indexOf(category);
  return CATEGORY_PALETTE[(idx >= 0 ? idx : 0) % CATEGORY_PALETTE.length];
}

function bestVariant(product: ShopProduct): ShopVariant {
  return product.variants.find((v) => v.stock > 0) ?? product.variants[0];
}

type PaymentMethod = string;

/** Mismas claves/orden que PaymentMethodsSection.tsx (Ajustes) — el método de pago que se
 * ofrece al cobrar es exactamente el que el dueño activó ahí, no una lista fija. */
const PAYMENT_METHOD_META: { key: keyof NonNullable<AuthRestaurant['paymentMethodsConfig']>; label: string }[] = [
  { key: 'CASH', label: 'Efectivo Bs' },
  { key: 'CASH_USD', label: 'Efectivo $' },
  { key: 'MOBILE_PAYMENT', label: 'Pago Móvil' },
  { key: 'ZELLE', label: 'Zelle' },
  { key: 'BINANCE', label: 'Binance' },
  { key: 'PAYPAL', label: 'PayPal' },
  { key: 'TRANSFER', label: 'Transferencia' },
  { key: 'CARD', label: 'Punto de Venta' },
];

export default function ShopPosPage({ session, restaurant, rubro }: Props) {
  const { money, moneyBs } = shopMoneyFormatters(restaurant);
  const { products, cart, till, closedTills, categories, addToCart, addAdhocLine, updateCartQty, setCartQty, removeFromCart, setCartLineDiscount, openTill, closeTill, checkout } = session;

  const [adhocOpen, setAdhocOpen] = useState(false);
  const [adhocName, setAdhocName] = useState('');
  const [adhocCost, setAdhocCost] = useState('');
  const [adhocPrice, setAdhocPrice] = useState('');

  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [discount, setDiscount] = useState(0);

  const [weightOpen, setWeightOpen] = useState(false);
  const [weightProduct, setWeightProduct] = useState<ShopProduct | null>(null);
  const [weightVariant, setWeightVariant] = useState<ShopVariant | null>(null);
  const [weightInput, setWeightInput] = useState('');

  const [tillDialogOpen, setTillDialogOpen] = useState(false);
  const [cashReportsOpen, setCashReportsOpen] = useState(false);
  const [openingInput, setOpeningInput] = useState('');
  const [countedInput, setCountedInput] = useState('');

  const [saleMode, setSaleMode] = useState<SaleMode>({ kind: 'direct' });
  const [paymethodOpen, setPaymethodOpen] = useState(false);
  const [pagoMovilOpen, setPagoMovilOpen] = useState(false);
  const [pmReference, setPmReference] = useState('');
  const [pmProofUrl, setPmProofUrl] = useState<string | null>(null);
  const [pmUploadingProof, setPmUploadingProof] = useState(false);
  const [pmProofError, setPmProofError] = useState<string | null>(null);
  const pmFileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const cartPanelRef = useRef<HTMLDivElement>(null);
  const [scanCameraOpen, setScanCameraOpen] = useState(false);

  const [fiadoOpen, setFiadoOpen] = useState(false);
  const [fiadoStep, setFiadoStep] = useState<'choose' | 'installment'>('choose');
  const [fiadoAbono, setFiadoAbono] = useState('');

  const [ticketSale, setTicketSale] = useState<Sale | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);

  const subtotal = cart.reduce((a, c) => a + lineTotal(c), 0);
  const total = subtotal * (1 - discount / 100);
  const qrImageUrl = restaurant.paymentMethodsConfig?.MOBILE_PAYMENT?.qrImageUrl;
  // Solo se ofrecen al cobrar los métodos que el dueño activó en Ajustes > Métodos de pago —
  // si todavía no configuró ninguno, se cae a Efectivo Bs para no bloquear el cobro.
  const enabledPaymentMethods = PAYMENT_METHOD_META.filter((m) => restaurant.paymentMethodsConfig?.[m.key]?.enabled);
  const paymentMethodOptions = enabledPaymentMethods.length > 0 ? enabledPaymentMethods : [PAYMENT_METHOD_META[0]];
  // Monto a cobrar en la pantalla de Pago Móvil: el total normal, o el abono elegido si es fiado fraccionado.
  const pmTargetAmount = saleMode.kind === 'fiado' ? saleMode.amountPaidNow : total;
  const cartItemCount = cart.reduce((a, c) => a + c.qty, 0);

  /** Carrito flotante (solo celular, oculto en escritorio donde el panel ya está siempre visible):
   * lleva directo al panel de carrito, que en pantallas angostas queda debajo de toda la grilla
   * de productos. */
  function scrollToCart() {
    cartPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const filtered = products.filter(
    (p) =>
      (!category || p.category === category) &&
      (!search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()) || p.sku.toLowerCase().includes(search.trim().toLowerCase())),
  );

  function pickOrAddToCart(product: ShopProduct) {
    const variant = bestVariant(product);
    if (variant.soldByWeight) {
      setWeightProduct(product);
      setWeightVariant(variant);
      setWeightInput('');
      setWeightOpen(true);
      return;
    }
    addToCart(product, variant);
  }

  function confirmWeight() {
    const kg = Number(weightInput);
    if (!weightProduct || !weightVariant || !(kg > 0)) return;
    addToCart(weightProduct, weightVariant, kg);
    setWeightOpen(false);
  }

  /** Lectores de código de barras USB/Bluetooth funcionan como teclado: escriben el código y
   * mandan Enter. Si lo que hay en el buscador matchea exacto el SKU de un producto, lo agrega
   * directo al carrito — así el mismo campo sirve para escanear o para tipear el SKU a mano. */
  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const code = search.trim().toLowerCase();
    if (!code) return;
    const match = products.find((p) => p.sku.toLowerCase() === code);
    if (!match) return;
    e.preventDefault();
    pickOrAddToCart(match);
    setSearch('');
  }

  function openTillDialog() {
    setOpeningInput('');
    setCountedInput('');
    setTillDialogOpen(true);
  }

  function confirmOpenTill() {
    openTill(Number(openingInput) || 0);
    setTillDialogOpen(false);
  }

  const salesSinceOpen = till ? session.sales.filter((s) => !s.returned && s.time >= till.openedAt) : [];
  const totalVentas = salesSinceOpen.reduce((a, s) => a + s.total, 0);
  const expected = (till?.opening ?? 0) + totalVentas;
  const counted = Number(countedInput) || 0;
  const diff = counted - expected;

  function confirmCloseTill() {
    closeTill(counted);
    setTillDialogOpen(false);
  }

  function openAdhocDialog() {
    setAdhocName('');
    setAdhocCost('');
    setAdhocPrice('');
    setAdhocOpen(true);
  }

  function confirmAdhoc() {
    const name = adhocName.trim();
    const price = Number(adhocPrice);
    const cost = Number(adhocCost) || 0;
    if (!name || !(price > 0)) return;
    addAdhocLine(name, price, cost);
    setAdhocOpen(false);
  }

  function sendReceiptWhatsapp(sale: Sale) {
    const message = buildReceiptMessage(sale, restaurant.name, money, moneyBs);
    const phone = sale.customerPhone ? waPhone(sale.customerPhone) : '';
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }

  function startCheckout() {
    if (!till || cart.length === 0) return;
    setSaleMode({ kind: 'direct' });
    setPaymethodOpen(true);
  }

  function startFiado() {
    if (!till || cart.length === 0) return;
    setFiadoStep('choose');
    setFiadoAbono('');
    setFiadoOpen(true);
  }

  function chooseFiadoFull() {
    setSaleMode({ kind: 'fiado', terms: 'FULL', amountPaidNow: 0 });
    setFiadoOpen(false);
    setPaymethodOpen(true);
  }

  function confirmFiadoInstallment() {
    const abono = Number(fiadoAbono) || 0;
    if (abono <= 0 || abono > total) return;
    setSaleMode({ kind: 'fiado', terms: 'INSTALLMENT', amountPaidNow: abono });
    setFiadoOpen(false);
    setPaymethodOpen(true);
  }

  function closePaymethod() {
    setPaymethodOpen(false);
    setSaleMode({ kind: 'direct' });
  }

  function finalizeSale(method: PaymentMethod, meta: PaymentMeta | null) {
    const customer =
      custName.trim() || custPhone.trim()
        ? { name: custName.trim() || null, phone: custPhone.trim().replace(/\D/g, '') || null }
        : null;
    const credit = saleMode.kind === 'fiado' ? { terms: saleMode.terms, amountPaidNow: saleMode.amountPaidNow } : null;
    const sale = checkout(method, meta, customer, discount, credit);
    // Fiado a pago completo no cobra nada hoy (queda todo pendiente) — el sonido de caja es
    // para cuando efectivamente entra dinero: venta directa o el abono de un fiado fraccionado.
    if (credit?.terms !== 'FULL') playCashSound();
    setCustName('');
    setCustPhone('');
    setDiscount(0);
    setSaleMode({ kind: 'direct' });
    return sale;
  }

  function choosePaymethod(method: PaymentMethod) {
    setPaymethodOpen(false);
    // Fiado a pago completo: nada se cobra hoy, solo se registra con qué método se espera que
    // liquide la deuda más adelante — no hace falta pasar por la pantalla de Pago Móvil.
    if (saleMode.kind === 'fiado' && saleMode.terms === 'FULL') {
      setTicketSale(finalizeSale(method, null));
      return;
    }
    if (method === 'Pago Móvil') {
      setPmReference('');
      setPmProofUrl(null);
      setPmProofError(null);
      setPagoMovilOpen(true);
      return;
    }
    const sale = finalizeSale(method, null);
    setSuccessOpen(true);
    setTimeout(() => {
      setSuccessOpen(false);
      setTicketSale(sale);
    }, 1200);
  }

  function closePagoMovil() {
    setPagoMovilOpen(false);
    setSaleMode({ kind: 'direct' });
  }

  async function handleProofFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPmUploadingProof(true);
    setPmProofError(null);
    try {
      const form = new FormData();
      form.append('photo', file);
      const { data } = await api.post('/shop/upload-payment-proof', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPmProofUrl(data.data.url);
    } catch {
      setPmProofError('No se pudo subir el comprobante. Intenta de nuevo.');
    } finally {
      setPmUploadingProof(false);
    }
  }

  function confirmPagoMovil() {
    if (!pmReference.trim()) return;
    const meta: PaymentMeta = { reference: pmReference.trim(), hasProof: !!pmProofUrl, proofImageUrl: pmProofUrl ?? undefined };
    const sale = finalizeSale('Pago Móvil', meta);
    setPagoMovilOpen(false);
    setSuccessOpen(true);
    setTimeout(() => {
      setSuccessOpen(false);
      // Mismo comportamiento que el resto de métodos de pago (ver choosePaymethod): siempre se
      // muestra el ticket, tanto para venta directa como fiada — es ahí donde está el botón de
      // Enviar por WhatsApp, así que saltarlo dejaba sin recibo justo a las ventas por Pago Móvil.
      setTicketSale(sale);
    }, 1600);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm px-5 py-3.5 flex-wrap">
        <div className="flex items-center gap-2.5 text-sm font-semibold">
          <span className={`h-2 w-2 rounded-full ${till ? 'bg-emerald-500' : 'bg-brand-950/25'}`} />
          <span className="text-brand-950">{till ? 'Caja abierta' : 'Caja cerrada'}</span>
          <span className="font-normal text-brand-950/40">
            {till
              ? `· ${money(till.opening)} inicial · desde ${till.openedAt.toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })}`
              : '· abre la caja para empezar a cobrar'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <TextureButton variant="minimal" size="sm" className="!w-auto" onClick={() => setCashReportsOpen(true)}>
            <ClipboardList className="h-3.5 w-3.5" /> Informes de caja
          </TextureButton>
          <TextureButton variant="minimal" size="sm" className="!w-auto" onClick={openTillDialog}>
            {till ? 'Cerrar caja' : 'Abrir caja'}
          </TextureButton>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <div className="flex-[1.8] min-w-0 w-full flex flex-col gap-4">
          <div className="flex gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-950/30" />
              <input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Buscar producto, o escanea/tipea el SKU y Enter…"
                className="w-full border border-brand-950/15 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
            </div>
            <TextureButton
              variant="minimal"
              size="default"
              className="!w-auto"
              title="Escanea el código de barras con la cámara del celular"
              onClick={() => setScanCameraOpen(true)}
            >
              <ScanLine className="h-4 w-4" /> Escanear
            </TextureButton>
            {rubro.id === 'agencia_publicidad' && (
              <TextureButton
                variant="minimal"
                size="default"
                className="!w-auto"
                title="Cobrar un servicio que no está en el catálogo"
                onClick={openAdhocDialog}
              >
                <Wrench className="h-4 w-4" /> Servicio no registrado
              </TextureButton>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setCategory(null)}
              className={`text-[13px] font-semibold px-3.5 py-1.5 rounded-full border transition-colors ${
                !category ? 'bg-brand-500 border-brand-500 text-white' : 'border-brand-950/15 text-brand-950/60 hover:bg-brand-950/5'
              }`}
            >
              Todas
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`text-[13px] font-semibold px-3.5 py-1.5 rounded-full border transition-colors ${
                  category === c ? 'bg-brand-500 border-brand-500 text-white' : 'border-brand-950/15 text-brand-950/60 hover:bg-brand-950/5'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-brand-950/40 text-center py-10">Sin resultados para esta búsqueda.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {filtered.map((p) => {
                const status = productStatus(p);
                const stock = productStock(p);
                const disabled = status === 'danger';
                const isWeight = bestVariant(p).soldByWeight;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => pickOrAddToCart(p)}
                    className={`text-left rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-3 transition-transform ${
                      disabled ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-0.5 hover:border-brand-400'
                    }`}
                  >
                    <div className={`aspect-square w-full rounded-xl flex items-center justify-center font-bold text-lg mb-2 ${categoryColor(categories, p.category)}`}>
                      {initials(p.name)}
                    </div>
                    <p className="text-[13px] font-semibold text-brand-950 leading-tight line-clamp-2">{p.name}</p>
                    {p.promoPrice != null ? (
                      <p className="text-sm font-bold text-red-600 mt-1">
                        {money(p.promoPrice)}{isWeight ? ' / Kg' : ''}{' '}
                        <span className="text-[11px] font-medium text-brand-950/35 line-through">{money(p.price)}</span>
                      </p>
                    ) : (
                      <p className="text-sm font-bold text-brand-500 mt-1">{money(p.price)}{isWeight ? ' / Kg' : ''}</p>
                    )}
                    {moneyBs(p.price) && <p className="text-[11px] text-brand-950/40">{moneyBs(p.promoPrice ?? p.price)}{isWeight ? ' / Kg' : ''}</p>}
                    {p.wholesalePrice != null && p.wholesaleMinQty != null && (
                      <p className="text-[10.5px] font-medium text-emerald-600 mt-0.5">Mayorista {money(p.wholesalePrice)} desde {p.wholesaleMinQty} uds.</p>
                    )}
                    <span className={`inline-block mt-1.5 text-[10.5px] font-medium px-2 py-0.5 rounded-full ${STATUS_CLASS[status]}`}>
                      {STATUS_LABEL[status]}{status !== 'danger' ? ` · ${isWeight ? `${stock.toFixed(1)} Kg` : stock}` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div ref={cartPanelRef} className="w-full lg:w-[360px] shrink-0 rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-brand-950">Carrito</h3>
            <span className="text-[11px] font-bold bg-brand-500/10 text-brand-500 px-2.5 py-1 rounded-full">
              {cartItemCount} items
            </span>
          </div>

          {cart.length === 0 ? (
            <p className="text-sm text-brand-950/40 text-center py-6">Agrega productos para empezar la venta.</p>
          ) : (
            <div className="flex flex-col gap-3 max-h-[340px] overflow-y-auto">
              {cart.map((c) => (
                <div key={c.key} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-brand-950 truncate">{c.name}</p>
                    <p className="text-[11.5px] text-brand-950/40">{c.v1}{c.v2 ? ` · ${c.v2}` : ''}</p>
                    {effectivePrice(c) !== c.price && (
                      <p className="text-[10.5px] font-semibold text-emerald-600">
                        {c.promoPrice != null ? 'Promo' : 'Mayorista'} {money(effectivePrice(c))}/u
                      </p>
                    )}
                  </div>
                  {c.soldByWeight ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={c.qty}
                        onChange={(e) => setCartQty(c.key, Number(e.target.value) || 0)}
                        className="w-16 border border-brand-950/15 rounded-md text-center text-xs py-1"
                      />
                      <span className="text-[10px] font-medium text-brand-950/40">Kg</span>
                    </div>
                  ) : (
                    <div className="flex items-center border border-brand-950/15 rounded-lg overflow-hidden shrink-0">
                      <button type="button" onClick={() => updateCartQty(c.key, -1)} className="h-6 w-6 flex items-center justify-center hover:bg-brand-950/5">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center text-xs font-semibold">{c.qty}</span>
                      <button type="button" onClick={() => updateCartQty(c.key, 1)} className="h-6 w-6 flex items-center justify-center hover:bg-brand-950/5">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={c.disc || 0}
                    onChange={(e) => setCartLineDiscount(c.key, Number(e.target.value) || 0)}
                    title="Descuento % de este producto"
                    className="w-11 shrink-0 border border-brand-950/15 rounded-md text-center text-[11px] py-1"
                  />
                  <span className="w-14 shrink-0 text-right text-[13px] font-bold text-brand-950">{money(lineTotal(c))}</span>
                  <button type="button" onClick={() => removeFromCart(c.key)} className="shrink-0 text-brand-950/30 hover:text-red-500">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              value={custName}
              onChange={(e) => setCustName(e.target.value)}
              placeholder="Cliente (opcional)"
              className="flex-1 min-w-0 border border-brand-950/15 rounded-lg px-2.5 py-2 text-[13px]"
            />
            <input
              value={custPhone}
              onChange={(e) => setCustPhone(e.target.value)}
              placeholder="Teléfono (opcional)"
              className="flex-1 min-w-0 border border-brand-950/15 rounded-lg px-2.5 py-2 text-[13px]"
            />
          </div>

          <div className="border-t border-brand-950/[0.06] pt-3.5 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[13px] text-brand-950/50">
              <span>Subtotal</span>
              <span className="text-right text-brand-950">
                {money(subtotal)}
                {moneyBs(subtotal) && <span className="block text-[11px] text-brand-950/40">{moneyBs(subtotal)}</span>}
              </span>
            </div>
            <div className="flex items-center justify-between text-[13px] text-brand-950/50">
              <span>Descuento general</span>
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                  className="w-14 border border-brand-950/15 rounded-md text-center text-[12.5px] py-1"
                />
                %
              </span>
            </div>
            <div className="flex items-center justify-between text-[17px] font-bold text-brand-950">
              <span>Total</span>
              <span className="text-right">
                {money(total)}
                {moneyBs(total) && <span className="block text-[11px] font-medium text-brand-950/40">{moneyBs(total)}</span>}
              </span>
            </div>
            <div className="flex gap-2 mt-1">
              <TextureButton
                variant="brand"
                size="default"
                disabled={cart.length === 0 || !till}
                className="flex-1 disabled:opacity-40"
                onClick={startCheckout}
              >
                Cobrar
              </TextureButton>
              <TextureButton
                variant="minimal"
                size="default"
                disabled={cart.length === 0 || !till}
                className="flex-1 disabled:opacity-40"
                onClick={startFiado}
              >
                Fiado
              </TextureButton>
            </div>
          </div>
        </div>
      </div>

      {/* Carrito flotante: solo en celular (< lg, donde el panel de carrito queda debajo de toda
          la grilla de productos) y solo si hay algo en el carrito — toca para saltar directo ahí. */}
      {cartItemCount > 0 && (
        <div className="lg:hidden fixed bottom-[104px] inset-x-0 z-30 flex justify-center pointer-events-none px-4">
          <button
            type="button"
            onClick={scrollToCart}
            className="pointer-events-auto flex items-center gap-3 rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/30 pl-4 pr-5 py-3 max-w-full"
          >
            <span className="relative shrink-0">
              <ShoppingCart className="h-5 w-5" />
              <span className="absolute -top-2 -right-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-brand-500">
                {cartItemCount}
              </span>
            </span>
            <span className="text-sm font-bold truncate">
              {money(total)}
              {moneyBs(total) && <span className="font-medium opacity-80"> · {moneyBs(total)}</span>}
            </span>
          </button>
        </div>
      )}

      {/* ---------- Abrir/cerrar caja ---------- */}
      <Dialog open={tillDialogOpen} onOpenChange={setTillDialogOpen}>
        <DialogContent>
          {!till ? (
            <>
              <DialogHeader>
                <DialogTitle>Abrir caja</DialogTitle>
              </DialogHeader>
              <label className="block text-sm">
                <span className="text-brand-950/70">Monto inicial en efectivo</span>
                <input
                  type="number"
                  value={openingInput}
                  onChange={(e) => setOpeningInput(e.target.value)}
                  placeholder="50.00"
                  className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                />
              </label>
              <DialogFooter>
                <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setTillDialogOpen(false)}>
                  Cancelar
                </TextureButton>
                <TextureButton variant="brand" size="default" className="!w-auto" onClick={confirmOpenTill}>
                  Abrir caja
                </TextureButton>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Cerrar caja — arqueo</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between py-1.5 border-b border-brand-950/[0.06]"><span className="text-brand-950/60">Monto inicial</span><span className="font-medium">{money(till.opening)}</span></div>
                <div className="flex justify-between py-1.5 border-b border-brand-950/[0.06]"><span className="text-brand-950/60">Ventas registradas</span><span className="font-medium">{salesSinceOpen.length}</span></div>
                <div className="flex justify-between py-1.5 border-b border-brand-950/[0.06]"><span className="text-brand-950/60">Total vendido</span><span className="font-medium">{money(totalVentas)}</span></div>
                <div className="flex justify-between py-1.5"><span className="font-bold text-brand-950">Efectivo esperado</span><span className="font-bold text-brand-950">{money(expected)}</span></div>
              </div>
              <label className="block text-sm">
                <span className="text-brand-950/70">Efectivo contado en caja</span>
                <input
                  type="number"
                  value={countedInput}
                  onChange={(e) => setCountedInput(e.target.value)}
                  placeholder={expected.toFixed(2)}
                  className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                />
              </label>
              {countedInput !== '' && (
                <p className={`text-[12.5px] font-medium ${diff === 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                  {diff === 0 ? 'Cuadra exacto.' : diff > 0 ? `Sobran ${money(diff)}` : `Faltan ${money(Math.abs(diff))}`}
                </p>
              )}
              <DialogFooter>
                <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setTillDialogOpen(false)}>
                  Cancelar
                </TextureButton>
                <TextureButton variant="brand" size="default" className="!w-auto" onClick={confirmCloseTill}>
                  Cerrar caja
                </TextureButton>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- Informes de caja ---------- */}
      <Dialog open={cashReportsOpen} onOpenChange={setCashReportsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Informes de caja</DialogTitle>
          </DialogHeader>
          {closedTills.length === 0 ? (
            <p className="text-sm text-brand-950/40 text-center py-6">Todavía no cerraste ninguna caja.</p>
          ) : (
            <div className="flex flex-col gap-2.5 max-h-[420px] overflow-y-auto">
              {closedTills.map((ct) => (
                <div key={ct.id} className="rounded-xl border border-brand-950/[0.08] px-3.5 py-3">
                  <div className="flex items-center justify-between text-[13px] font-semibold text-brand-950">
                    <span>
                      {ct.closedAt.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })} ·{' '}
                      {ct.openedAt.toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })} –{' '}
                      {ct.closedAt.toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })}
                    </span>
                    <span className={ct.diff === 0 ? 'text-emerald-600' : ct.diff < 0 ? 'text-red-600' : 'text-amber-600'}>
                      {ct.diff === 0 ? 'Cuadró' : ct.diff > 0 ? `Sobró ${money(ct.diff)}` : `Faltó ${money(Math.abs(ct.diff))}`}
                    </span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[12px] text-brand-950/50">
                    <span>Monto inicial: {money(ct.opening)}</span>
                    <span>Ventas: {ct.salesCount}</span>
                    <span>Total vendido: {money(ct.totalSales)}</span>
                    <span>Esperado: {money(ct.expected)}</span>
                    <span>Contado: {money(ct.counted)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- Método de pago ---------- */}
      <Dialog open={paymethodOpen} onOpenChange={(o) => (o ? setPaymethodOpen(true) : closePaymethod())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {saleMode.kind === 'fiado'
                ? saleMode.terms === 'FULL'
                  ? 'Fiado — método esperado para el pago completo'
                  : `Fiado — ¿cómo abona ${money(saleMode.amountPaidNow)} ahora?`
                : 'Método de pago'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2.5">
            {paymentMethodOptions.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => choosePaymethod(m.label)}
                className="w-full flex items-center gap-3 rounded-2xl border border-brand-950/10 px-4 py-3.5 text-left font-semibold text-brand-950 hover:border-brand-400 hover:bg-brand-500/5 transition-colors"
              >
                {m.label}
              </button>
            ))}
          </div>
          {enabledPaymentMethods.length === 0 && (
            <p className="text-xs text-brand-950/40 text-center">
              Aún no activaste métodos de pago en Ajustes — por ahora solo puedes cobrar en Efectivo Bs.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- Pago móvil ---------- */}
      <Dialog open={pagoMovilOpen} onOpenChange={(o) => (o ? setPagoMovilOpen(true) : closePagoMovil())}>
        <DialogContent className="text-center max-w-md w-[calc(100vw-2rem)] sm:w-full max-h-[94vh] p-7 sm:p-9 gap-5">
          {qrImageUrl && (
            <img
              src={qrImageUrl}
              alt="QR de Pago Móvil"
              className="mx-auto w-full max-w-[340px] aspect-square object-contain rounded-2xl border border-brand-950/10"
            />
          )}
          <div>
            <p className="text-sm font-semibold text-brand-950/50">Monto a cancelar</p>
            <div className="text-[40px] sm:text-[48px] font-extrabold text-emerald-600 leading-none tracking-tight mt-1">
              {moneyBs(pmTargetAmount) ?? money(pmTargetAmount)}
            </div>
            {restaurant.exchangeRate && (
              <p className="text-[13.5px] font-semibold text-brand-950/50 mt-2">
                {money(pmTargetAmount)} &nbsp;x&nbsp; Bs{Number(restaurant.exchangeRate.rateBs).toFixed(2)} &nbsp;(tasa del día)
              </p>
            )}
          </div>
          <label className="block text-sm text-left">
            <span className="text-brand-950/70">Número de referencia</span>
            <input
              value={pmReference}
              onChange={(e) => setPmReference(e.target.value)}
              placeholder="Ej: 001234"
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            />
          </label>
          <TextureButton
            variant="minimal"
            size="default"
            className="w-full justify-center"
            disabled={pmUploadingProof}
            onClick={() => pmFileInputRef.current?.click()}
          >
            {pmUploadingProof ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {pmUploadingProof ? 'Subiendo…' : 'Adjuntar comprobante'}
          </TextureButton>
          <input ref={pmFileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleProofFileChange} />
          {pmProofUrl && (
            <div className="flex items-center gap-2.5 justify-center">
              <img src={pmProofUrl} alt="Comprobante" className="h-12 w-12 rounded-lg object-cover border border-brand-950/10" />
              <p className="text-[12px] font-semibold text-emerald-600">✓ Comprobante adjunto</p>
            </div>
          )}
          {pmProofError && <p className="text-[12px] font-semibold text-red-600">{pmProofError}</p>}
          <DialogFooter>
            <TextureButton variant="minimal" size="default" className="!w-auto" onClick={closePagoMovil}>
              Cancelar
            </TextureButton>
            <TextureButton variant="brand" size="default" className="!w-auto" disabled={!pmReference.trim()} onClick={confirmPagoMovil}>
              Listo
            </TextureButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Fiado: pago completo / fraccionado ---------- */}
      <Dialog open={fiadoOpen} onOpenChange={(o) => { setFiadoOpen(o); if (!o) setFiadoStep('choose'); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Venta fiada</DialogTitle>
          </DialogHeader>
          {fiadoStep === 'choose' ? (
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={chooseFiadoFull}
                className="w-full flex flex-col items-start gap-0.5 rounded-2xl border border-brand-950/10 px-4 py-3.5 text-left hover:border-brand-400 hover:bg-brand-500/5 transition-colors"
              >
                <span className="font-semibold text-brand-950">Pago completo</span>
                <span className="text-xs text-brand-950/50 font-light">Se paga todo el monto más adelante</span>
              </button>
              <button
                type="button"
                onClick={() => setFiadoStep('installment')}
                className="w-full flex flex-col items-start gap-0.5 rounded-2xl border border-brand-950/10 px-4 py-3.5 text-left hover:border-brand-400 hover:bg-brand-500/5 transition-colors"
              >
                <span className="font-semibold text-brand-950">Pago fraccionado</span>
                <span className="text-xs text-brand-950/50 font-light">Recibe un abono ahora, el resto queda pendiente</span>
              </button>
            </div>
          ) : (
            <>
              <label className="block text-sm">
                <span className="text-brand-950/70">Monto a abonar ahora (de {money(total)})</span>
                <input
                  type="number"
                  value={fiadoAbono}
                  onChange={(e) => setFiadoAbono(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                />
              </label>
              <DialogFooter>
                <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setFiadoStep('choose')}>
                  Atrás
                </TextureButton>
                <TextureButton
                  variant="brand"
                  size="default"
                  className="!w-auto"
                  disabled={!(Number(fiadoAbono) > 0 && Number(fiadoAbono) <= total)}
                  onClick={confirmFiadoInstallment}
                >
                  Continuar
                </TextureButton>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- Peso (productos vendidos por Kg) ---------- */}
      <Dialog open={weightOpen} onOpenChange={setWeightOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{weightProduct?.name}</DialogTitle>
          </DialogHeader>
          {weightProduct && (
            <>
              <p className="text-sm text-brand-950/50">{money(weightProduct.price)} / Kg{weightVariant?.v1 && weightVariant.v1 !== 'Kg' ? ` · ${weightVariant.v1}` : ''}</p>
              <label className="block text-sm">
                <span className="text-brand-950/70">Peso (Kg)</span>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  placeholder="0.500"
                  autoFocus
                  className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                />
              </label>
              {Number(weightInput) > 0 && (
                <p className="text-sm font-semibold text-brand-950">Subtotal: {money(weightProduct.price * Number(weightInput))}</p>
              )}
              <DialogFooter>
                <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setWeightOpen(false)}>
                  Cancelar
                </TextureButton>
                <TextureButton variant="brand" size="default" className="!w-auto" disabled={!(Number(weightInput) > 0)} onClick={confirmWeight}>
                  Agregar al carrito
                </TextureButton>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- Confirmación animada ---------- */}
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent hideClose className="text-center py-9">
          <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto animate-scale-in" />
          <p className="mt-4 text-[17px] font-bold text-brand-950">Pago Registrado</p>
        </DialogContent>
      </Dialog>

      {/* ---------- Escanear con cámara ---------- */}
      <ShopBarcodeScanDialog
        open={scanCameraOpen}
        onOpenChange={setScanCameraOpen}
        products={products}
        money={money}
        onAdd={(product, variant, qty) => addToCart(product, variant, qty)}
      />

      {/* ---------- Servicio no registrado (exclusivo Agencia de Publicidad) ---------- */}
      <Dialog open={adhocOpen} onOpenChange={setAdhocOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Servicio no registrado</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-semibold text-brand-950/60 mb-1 block">Nombre del servicio</label>
              <input
                autoFocus
                value={adhocName}
                onChange={(e) => setAdhocName(e.target.value)}
                placeholder="Ej: Diseño de flyer para evento"
                className="w-full border border-brand-950/15 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-semibold text-brand-950/60 mb-1 block">Costo</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={adhocCost}
                  onChange={(e) => setAdhocCost(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-brand-950/15 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-semibold text-brand-950/60 mb-1 block">Precio de venta</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={adhocPrice}
                  onChange={(e) => setAdhocPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-brand-950/15 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setAdhocOpen(false)}>
              Cancelar
            </TextureButton>
            <TextureButton
              variant="brand"
              size="default"
              className="!w-auto"
              disabled={!adhocName.trim() || !(Number(adhocPrice) > 0)}
              onClick={confirmAdhoc}
            >
              Añadir al carrito
            </TextureButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Ticket ---------- */}
      <Dialog open={!!ticketSale} onOpenChange={(o) => !o && setTicketSale(null)}>
        <DialogContent>
          {ticketSale && (
            <>
              <style>{`
                @media print {
                  body * { visibility: hidden; }
                  #shop-ticket-print, #shop-ticket-print * { visibility: visible; }
                  #shop-ticket-print { position: absolute; top: 0; left: 0; width: 100%; }
                }
              `}</style>
              <div id="shop-ticket-print">
              <div className="text-center mb-3.5 pb-3.5 border-b border-dashed border-brand-950/15">
                <p className="font-bold text-brand-950">{restaurant.name}</p>
                <p className="text-xs text-brand-950/40 mt-0.5">
                  Ticket #{ticketSale.id.slice(-6)}{ticketSale.paymentMethod ? ` · ${ticketSale.paymentMethod}` : ''}
                </p>
                <p className="text-xs text-brand-950/40">
                  {ticketSale.time.toLocaleDateString('es-VE')} {ticketSale.time.toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })}
                </p>
                {(ticketSale.customerName || ticketSale.customerPhone) && (
                  <p className="text-xs text-brand-950/40">
                    Cliente: {[ticketSale.customerName, ticketSale.customerPhone].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1 text-[13px]">
                {ticketSale.items.map((it, i) => (
                  <div key={i} className="flex justify-between gap-2">
                    <span className="flex-1">{it.soldByWeight ? `${it.qty} Kg` : `${it.qty}x`} {it.name}{it.v1 ? ` (${it.v1}${it.v2 ? '·' + it.v2 : ''})` : ''}</span>
                    <span>{money(it.price * it.qty)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-dashed border-brand-950/15 mt-2.5 pt-2.5 flex justify-between">
                <span className="font-bold text-brand-950">Total</span>
                <span className="text-right font-bold text-brand-950">
                  {money(ticketSale.total)}
                  {moneyBs(ticketSale.total) && <span className="block text-[11px] font-normal text-brand-950/40">{moneyBs(ticketSale.total)}</span>}
                </span>
              </div>
              {ticketSale.creditTerms && (
                <div className="mt-2.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  {ticketSale.creditTerms === 'FULL'
                    ? 'Venta fiada — pago completo pendiente'
                    : `Venta fiada — abonó ${money(ticketSale.amountPaidNow ?? 0)}, pendiente ${money(ticketSale.total - (ticketSale.amountPaidNow ?? 0))}`}
                </div>
              )}
              </div>
              <DialogFooter>
                <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setTicketSale(null)}>
                  Cerrar
                </TextureButton>
                <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" /> Imprimir
                </TextureButton>
                <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => sendReceiptWhatsapp(ticketSale)}>
                  <MessageCircle className="h-4 w-4" /> Enviar por WhatsApp
                </TextureButton>
                <TextureButton variant="brand" size="default" className="!w-auto" onClick={() => setTicketSale(null)}>
                  Nueva venta
                </TextureButton>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
