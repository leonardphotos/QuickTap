import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { Camera, CheckCircle2, ClipboardList, FileText, Loader2, MessageCircle, Minus, Plus, Printer, QrCode, ScanLine, Search, ShoppingCart, Wallet, Wrench, X } from 'lucide-react';
import { api } from '@/api/client';
import { shopApi, type RawConsumptionPlan } from './shopApi';
import type { AuthRestaurant } from '@/context/AuthContext';
import { useAuth } from '@/context/AuthContext';
import { ShopPassEnrollDialog } from './ShopPassEnrollDialog';
import type { PaymentMethodKey, PaymentMethodsConfig } from '@/types';
import {
  METHODS_ALLOWING_PROOF,
  METHODS_REQUIRING_PROOF_OR_REFERENCE,
  METHODS_WITH_QR,
  USD_FIRST_METHODS,
  paymentDocumentError,
  referenceLabel,
} from '@/utils/payments';
import { useToast } from '@/hooks/useToast';
import { methodAccountsOf } from '@/utils/payment-accounts';
import { PhotoUploadField } from '@/components/admin/PhotoUploadField';
import { PaymentClientScreen } from '@/components/admin/PaymentClientScreen';
import { MethodAccountPicker } from '@/components/admin/MethodAccountPicker';
import { PromoCodeField, promoDiscountAmount, type AppliedPromo } from '@/components/admin/crm/PromoCodeField';
import { sendWhatsappOrOpen } from '@/utils/sendWhatsapp';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Toast } from '@/components/ui/toast';
import type { ShopRubro, ShopVariant } from '@/data/shopRubros';
import { formatStock, shopMoneyFormatters } from './shopFormat';
import { tienePreciosDistintos } from './shopFormat';
import { effectivePrice, lineTotal, productStatus, productStock, type PaymentMeta, type Sale, type ShopProduct, type ShopSession } from './shopSession';
import ShopBarcodeScanDialog from './ShopBarcodeScanDialog';
import { playCashSound } from './shopSounds';
import { describePrint, formatRollWidths, quotePrint, rollWidthLabel } from './printPricing';

interface Props {
  session: ShopSession;
  restaurant: Pick<AuthRestaurant, 'currencySymbol' | 'exchangeRate' | 'name' | 'paymentMethodsConfig' | 'requireCustomerData'>;
  rubro: ShopRubro;
  /** Pedido abierto que se retomó desde Pedidos: al guardar actualiza ESTE, y al cobrarlo se borra. */
  pedidoAbierto?: { id: string; label: string } | null;
  /** Se llama cuando el pedido dejó de estar abierto (se cobró, se guardó de nuevo o se vació). */
  onPedidoAbiertoChange?: (p: { id: string; label: string } | null) => void;
}

/** Profesional que presta servicios, tal como lo devuelve GET /shop/service-providers — a
 * propósito más chico que StaffMember (sin email/role/etc.): ese endpoint solo expone lo
 * necesario para "Atendido por" y, si quien pide la lista es él mismo un barbero, SOLO
 * su propia fila (nunca los datos de cobro de sus compañeros — ver shop.service.ts). */
interface ServiceProvider {
  id: string;
  name: string;
  commissionPercent: number | null;
  paymentMethodsConfig: PaymentMethodsConfig | null;
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
  const lines = sale.items.map((it) => {
    // Impresión de gran formato: la cantidad son m² y el detalle dice qué pieza se imprimió.
    const qtyLabel = it.detail ? `${it.qty} m²` : it.soldByWeight ? `${it.qty} Kg` : `${it.qty}x`;
    const suffix = it.detail ? `\n   ${it.detail}` : '';
    return `• ${qtyLabel} ${it.name} — ${money(it.price * it.qty)}${suffix}`;
  });
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
const PAYMENT_METHOD_META: { key: PaymentMethodKey; label: string }[] = [
  { key: 'CASH', label: 'Efectivo Bs' },
  { key: 'CASH_USD', label: 'Efectivo $' },
  { key: 'MOBILE_PAYMENT', label: 'Pago Móvil' },
  { key: 'ZELLE', label: 'Zelle' },
  { key: 'BINANCE', label: 'Binance' },
  { key: 'PAYPAL', label: 'PayPal' },
  { key: 'TRANSFER', label: 'Transferencia' },
  { key: 'CARD', label: 'Punto de Venta' },
];

export default function ShopPosPage({ session, restaurant, rubro, pedidoAbierto, onPedidoAbiertoChange }: Props) {
  const { money, moneyBs } = shopMoneyFormatters(restaurant);

  /**
   * Qué precio mostrar en la tarjeta cuando las variantes valen distinto. Un solo número sería
   * mentira en dos de las tres presiones, así que se muestra el rango y el precio exacto queda
   * en el selector de variante.
   */
  const rangoPrecio = (p: ShopProduct) => {
    const precios = p.variants.map((v) => v.price ?? p.price);
    const min = Math.min(...precios, p.price);
    const max = Math.max(...precios, p.price);
    return min === max ? money(p.price) : `${money(min)} – ${money(max)}`;
  };
  const { products, cart, till, closedTills, categories, addToCart, addAdhocLine, addPrintLine, activeStaffUserId, setActiveStaffUserId, updateCartQty, setCartQty, removeFromCart, setCartLineDiscount, clearCart, addConsumptionPlanLine, toggleConsumePlan, openTill, closeTill, checkout, quickSale, addProduct } = session;
  const { show, toastMessage } = useToast();
  const { user } = useAuth();

  // "Crear venta": registra en un solo paso un producto/servicio que todavía no está en el
  // catálogo, para negocios que arrancan sin nada cargado en Inventario.
  const [quickSaleOpen, setQuickSaleOpen] = useState(false);
  const [qsName, setQsName] = useState('');
  const [qsCategory, setQsCategory] = useState('');
  const [qsCost, setQsCost] = useState('');
  const [qsPrice, setQsPrice] = useState('');
  const [qsPaymentMethod, setQsPaymentMethod] = useState('');
  // Foto del artículo que se está vendiendo: se toma acá, en el mostrador y con
  // el producto en la mano, que es el único momento en que se tiene delante.
  // Viaja hasta el alta en Inventario para que no quede un producto sin imagen.
  const [qsPhotoUrl, setQsPhotoUrl] = useState<string | null>(null);
  const [qsSaving, setQsSaving] = useState(false);
  // La pantalla de Pago Móvil (QR/monto/referencia/comprobante) es la MISMA que usa el cobro
  // normal del carrito — esta bandera le dice a esa pantalla y a confirmPagoMovil que, al
  // terminar, tienen que cerrar una "Crear venta" en vez de vaciar el carrito.
  const [qsPendingPayment, setQsPendingPayment] = useState(false);
  // Tras registrar la venta, se ofrece cargarla al catálogo — así el dueño va armando su
  // inventario sobre la marcha, en vez de tener que cargarlo todo antes de poder vender.
  const [addToInventoryPrompt, setAddToInventoryPrompt] = useState<{
    name: string;
    category: string;
    cost: number;
    price: number;
    photoUrl: string | null;
  } | null>(null);
  const [addingToInventory, setAddingToInventory] = useState(false);

  const [adhocOpen, setAdhocOpen] = useState(false);
  const [adhocName, setAdhocName] = useState('');
  const [adhocCost, setAdhocCost] = useState('');
  const [adhocPrice, setAdhocPrice] = useState('');

  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');

  // --- Plan de consumo ---
  // Planes ACTIVOS del teléfono en pantalla, por producto: se consulta apenas hay 7+ dígitos de
  // teléfono y el carrito tiene algún producto con plan habilitado, para poder ofrecer "cobrar
  // con cargo al plan" en esa línea sin que el cajero tenga que ir a buscarlo aparte.
  const [plansByProduct, setPlansByProduct] = useState<Record<string, RawConsumptionPlan | null>>({});
  const [planDialogProduct, setPlanDialogProduct] = useState<ShopProduct | null>(null);
  const [planUnits, setPlanUnits] = useState('');

  useEffect(() => {
    const telefono = custPhone.replace(/\D/g, '');
    const idsConPlan = [...new Set(cart.map((c) => c.productId).filter(Boolean))].filter(
      (id) => products.find((p) => p.id === id)?.consumptionPlanEnabled,
    );
    if (telefono.length < 7 || idsConPlan.length === 0) {
      setPlansByProduct({});
      return;
    }
    let vivo = true;
    Promise.all(idsConPlan.map((id) => shopApi.activePlan(id, telefono).then((plan) => [id, plan] as const).catch(() => [id, null] as const))).then(
      (pares) => {
        if (vivo) setPlansByProduct(Object.fromEntries(pares));
      },
    );
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custPhone, cart.map((c) => c.productId).join(',')]);
  const [discount, setDiscount] = useState(0);
  // Promoción del CRM aplicada con su código: descuenta del total y el backend registra el canje.
  const [posPromo, setPosPromo] = useState<AppliedPromo | null>(null);

  const [weightOpen, setWeightOpen] = useState(false);
  /** Unidad del producto que se está pesando/midiendo: Kg, Mt o unidad. */
  const unidadDe = (p: ShopProduct | null) => (p?.saleUnit === 'MT' ? 'Mt' : p?.saleUnit === 'KG' ? 'Kg' : 'Und');
  // Impresión de gran formato (rubro Agencia de Publicidad): medidas de la pieza a imprimir.
  const [printOpen, setPrintOpen] = useState(false);
  const [printProduct, setPrintProduct] = useState<ShopProduct | null>(null);
  const [printWidth, setPrintWidth] = useState('');
  const [printHeight, setPrintHeight] = useState('');
  const [weightProduct, setWeightProduct] = useState<ShopProduct | null>(null);
  const [weightVariant, setWeightVariant] = useState<ShopVariant | null>(null);
  const [weightInput, setWeightInput] = useState('');

  // Selector de variante: solo se abre si el producto tiene más de una (talla/color/presentación).
  // Con una sola, se agrega directo — no tiene sentido pedirle al cajero que "elija" lo único que hay.
  const [variantPickerProduct, setVariantPickerProduct] = useState<ShopProduct | null>(null);

  const [tillDialogOpen, setTillDialogOpen] = useState(false);
  const [cashReportsOpen, setCashReportsOpen] = useState(false);
  const [openingInput, setOpeningInput] = useState('');
  const [countedInput, setCountedInput] = useState('');

  const [saleMode, setSaleMode] = useState<SaleMode>({ kind: 'direct' });
  const [paymethodOpen, setPaymethodOpen] = useState(false);
  const [pagoMovilOpen, setPagoMovilOpen] = useState(false);
  // Qué método se está cobrando en esa pantalla. Antes era siempre Pago Móvil; ahora Zelle,
  // Binance, PayPal, Transferencia y Punto de Venta pasan por la misma para capturar su
  // referencia o comprobante (efectivo sigue cerrando de una, no deja rastro que pedir).
  const [pmMethodKey, setPmMethodKey] = useState<PaymentMethodKey>('MOBILE_PAYMENT');
  // Cuenta receptora elegida cuando el método tiene varias (varios Zelle / varios Pago Móvil).
  const [pmAccountKey, setPmAccountKey] = useState('main');
  // Pantalla completa que ve el cliente antes de que el cajero cargue referencia/comprobante.
  const [clientScreenOpen, setClientScreenOpen] = useState(false);
  const [pmReference, setPmReference] = useState('');
  const [pmProofUrl, setPmProofUrl] = useState<string | null>(null);
  const [pmUploadingProof, setPmUploadingProof] = useState(false);
  const [pmProofError, setPmProofError] = useState<string | null>(null);
  const pmFileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const cartPanelRef = useRef<HTMLDivElement>(null);
  const [scanCameraOpen, setScanCameraOpen] = useState(false);

  // Profesionales que prestan servicios (barberos/estilistas) y a quién se le acredita la venta.
  // GET /shop/service-providers (no /team): si quien pide la lista es él mismo un barbero, el
  // backend le devuelve SOLO su propia fila — nunca los datos de cobro de sus compañeros, ni
  // siquiera en la respuesta de red. Ver shop.service.ts#listServiceProviders.
  const [providers, setProviders] = useState<ServiceProvider[]>([]);

  useEffect(() => {
    api
      .get('/shop/service-providers')
      .then((res) => {
        const list = res.data.data as ServiceProvider[];
        setProviders(list);
        // Si quien está cobrando es él mismo un barbero, se preselecciona: en la práctica cada
        // uno carga sus propios cortes desde su sesión.
        if (user && list.some((u) => u.id === user.id)) setActiveStaffUserId(user.id);
      })
      .catch(() => setProviders([]));
  }, [user?.id]);

  const activeProvider = providers.find((p) => p.id === activeStaffUserId) ?? null;
  // El backend ya resolvió que quien pide la lista es él mismo un barbero (le mandó solo su
  // propia fila): el selector queda fijo en su nombre, sin poder ver ni elegir a otro.
  const lockedToSelfProvider = Boolean(user && providers.length === 1 && providers[0].id === user.id);

  const [fiadoOpen, setFiadoOpen] = useState(false);
  // Alta en QuickTap Pass + plan de cuotas, disparado desde el cobro. Cuando queda configurado,
  // la venta se cierra como fiada y el plan se crea contra ella apenas existe.
  const [passOpen, setPassOpen] = useState(false);
  const [planPendiente, setPlanPendiente] = useState<
    { cantidad: number; frecuencia: string; recargoPorcentaje: number; primeraFecha: string } | null
  >(null);
  const [fiadoStep, setFiadoStep] = useState<'choose' | 'installment'>('choose');
  const [fiadoAbono, setFiadoAbono] = useState('');

  const [ticketSale, setTicketSale] = useState<Sale | null>(null);
  // Qué se imprime cuando se toca "Imprimir" en el ticket: el ticket normal (formato térmico) o
  // la nota de entrega (documento más amplio, sin validez fiscal — ver más abajo). Los dos
  // bloques imprimibles conviven en el DOM; esto solo decide cuál queda visible al imprimir.
  const [printMode, setPrintMode] = useState<'ticket' | 'nota'>('ticket');
  const [printTick, setPrintTick] = useState(0);
  useEffect(() => {
    if (printTick > 0) window.print();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printTick]);
  function imprimir(modo: 'ticket' | 'nota') {
    setPrintMode(modo);
    setPrintTick((t) => t + 1);
  }
  const [successOpen, setSuccessOpen] = useState(false);

  const subtotal = cart.reduce((a, c) => a + lineTotal(c), 0);
  // Costo de lo que hay en el carrito, para ver la ganancia antes de cobrar (ver el bloque de
  // "Costo / Ganancia" bajo el Total). La línea solo trae `cost` propio cuando es una venta
  // suelta escrita a mano; en lo demás sale del producto, igual que lo resuelve el cobro
  // (ver shopSession.ts -> checkout), o el margen saldría 100% en todo.
  const costoCarrito = cart.reduce((a, c) => {
    const costo = c.cost ?? products.find((p) => p.id === c.productId)?.cost ?? 0;
    return a + costo * c.qty;
  }, 0);
  const puedeVerMargen = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const totalBeforePromo = subtotal * (1 - discount / 100);
  const posPromoDiscount = posPromo ? promoDiscountAmount(posPromo, totalBeforePromo) : 0;
  const total = Math.max(0, Math.round((totalBeforePromo - posPromoDiscount + Number.EPSILON) * 100) / 100);
  const margenCarrito = total > 0 ? ((total - costoCarrito) / total) * 100 : 0;
  // Datos de cobro que se le muestran al cliente: los del BARBERO si tiene los suyos cargados
  // (le paga directo a él), si no los del local. La venta se registra igual en el local.
  const payToConfig = qsPendingPayment ? restaurant.paymentMethodsConfig : (activeProvider?.paymentMethodsConfig ?? restaurant.paymentMethodsConfig);
  const payToName = !qsPendingPayment && activeProvider?.paymentMethodsConfig ? activeProvider.name : restaurant.name;
  const payToIsStaff = !qsPendingPayment && Boolean(activeProvider?.paymentMethodsConfig);
  // Cuentas receptoras del método elegido (la principal + las adicionales). Solo aplican
  // cuando el cobro va al LOCAL: si va a la cuenta personal del barbero, no hay banco del
  // negocio que sumar y el selector no aparece.
  const payAccounts = payToIsStaff ? [] : methodAccountsOf(restaurant.paymentMethodsConfig, pmMethodKey);
  const selectedPayAccount = payAccounts.find((a) => a.key === pmAccountKey) ?? payAccounts[0] ?? null;
  // El QR del local no aplica si el cobro va a la cuenta del barbero. Solo Pago Móvil, Zelle
  // y Binance tienen QR que enseñar; el resto se paga con los datos escritos.
  const qrImageUrl =
    payToIsStaff || !METHODS_WITH_QR.includes(pmMethodKey)
      ? undefined
      : selectedPayAccount?.qrImageUrl ?? undefined;
  const pmMethodLabel = PAYMENT_METHOD_META.find((m) => m.key === pmMethodKey)?.label ?? 'Pago Móvil';
  const pmAllowsProof = METHODS_ALLOWING_PROOF.includes(pmMethodKey);
  // Solo se ofrecen al cobrar los métodos que el dueño activó en Ajustes > Métodos de pago —
  // si todavía no configuró ninguno, se cae a Efectivo Bs para no bloquear el cobro.
  // Los métodos que se ofrecen al cobrar son los del local MÁS los propios del barbero que
  // atiende: si él tiene su Pago Móvil pero el local no lo activó, igual debe poder cobrarlo —
  // el cliente le paga a él. Sin esto, tener datos de cobro propios no servía de nada.
  const enabledPaymentMethods = PAYMENT_METHOD_META.filter(
    (m) => restaurant.paymentMethodsConfig?.[m.key]?.enabled || activeProvider?.paymentMethodsConfig?.[m.key]?.enabled,
  );
  const paymentMethodOptions = enabledPaymentMethods.length > 0 ? enabledPaymentMethods : [PAYMENT_METHOD_META[0]];
  // Monto a cobrar en la pantalla de Pago Móvil: el total normal, o el abono elegido si es fiado fraccionado.
  const pmTargetAmount = qsPendingPayment
    ? Number(qsPrice.replace(',', '.')) || 0
    : saleMode.kind === 'fiado'
      ? saleMode.amountPaidNow
      : total;
  // Las líneas con cantidad decimal (peso en Kg, m² de impresión) cuentan como 1 ítem cada una:
  // sumar su cantidad daría "1.096 items" para un solo banner, o "0.5 items" para medio kilo.
  const cartItemCount = cart.reduce((a, c) => a + (c.soldByWeight || c.unitLabel ? 1 : c.qty), 0);

  /** Carrito flotante (solo celular, oculto en escritorio donde el panel ya está siempre visible):
   * lleva directo al panel de carrito, que en pantallas angostas queda debajo de toda la grilla
   * de productos. */
  function scrollToCart() {
    cartPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const pedidoAbiertoId = pedidoAbierto?.id ?? null;
  const [abiertoOpen, setAbiertoOpen] = useState(false);
  const [nombreAbierto, setNombreAbierto] = useState('');
  const [guardandoAbierto, setGuardandoAbierto] = useState(false);

  /** Deja el carrito parado. Con un pedido retomado actualiza ese mismo, no crea otro. */
  async function guardarPedidoAbierto() {
    const nombre = nombreAbierto.trim();
    if (!nombre) return;
    setGuardandoAbierto(true);
    try {
      await api.post('/shop/open-orders', {
        ...(pedidoAbiertoId ? { id: pedidoAbiertoId } : {}),
        label: nombre,
        customerName: custName.trim() || undefined,
        customerPhone: custPhone.trim() || undefined,
        items: cart,
      });
      setAbiertoOpen(false);
      onPedidoAbiertoChange?.(null);
      clearCart();
    } finally {
      setGuardandoAbierto(false);
    }
  }

  /**
   * El botón flotante se esconde cuando el carrito ya está a la vista: si no, se queda encima
   * de "Cobrar" y "Dejar pedido abierto" justo cuando hacen falta, tapando los botones que
   * vino a buscar el que bajó hasta ahí.
   */
  const [carritoVisible, setCarritoVisible] = useState(false);
  useEffect(() => {
    const nodo = cartPanelRef.current;
    if (!nodo || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(([e]) => setCarritoVisible(e.isIntersecting), { threshold: 0.12 });
    obs.observe(nodo);
    return () => obs.disconnect();
  }, []);

  const filtered = products.filter(
    (p) =>
      (!category || p.category === category) &&
      (!search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()) || p.sku.toLowerCase().includes(search.trim().toLowerCase())),
  );

  function pickOrAddToCart(product: ShopProduct) {
    // Impresión de gran formato: no se agrega "una unidad", se piden las medidas de la pieza y
    // de ahí sale la cantidad en m² (ver printPricing.ts).
    if (product.pricingMode === 'AREA_ROLL') {
      setPrintProduct(product);
      setPrintWidth('');
      setPrintHeight('');
      setPrintOpen(true);
      return;
    }
    if (product.variants.length > 1) {
      setVariantPickerProduct(product);
      return;
    }
    addVariantToCart(product, bestVariant(product));
  }

  /** Cotización en vivo de la pieza que se está midiendo — null mientras falten datos. */
  const printQuote =
    printProduct && printProduct.rollWidths
      ? quotePrint(Number(printWidth.replace(',', '.')), Number(printHeight.replace(',', '.')), printProduct.rollWidths)
      : null;

  function confirmPrint() {
    if (!printProduct || !printQuote) return;
    const w = Number(printWidth.replace(',', '.'));
    const h = Number(printHeight.replace(',', '.'));
    addPrintLine(printProduct, printQuote, describePrint(w, h, printQuote));
    setPrintOpen(false);
  }

  /** Punto único por el que cualquier variante (elegida a mano o resuelta sola) llega al carrito
   * o al diálogo de peso — usado tanto desde la tarjeta directa como desde el selector. */
  function addVariantToCart(product: ShopProduct, variant: ShopVariant) {
    setVariantPickerProduct(null);
    // Por Kg o por Mt: se pide la cantidad exacta. soldByWeight se mantiene por las variantes
    // que ya venían marcadas así antes de que existiera saleUnit.
    if (variant.soldByWeight || product.saleUnit === 'KG' || product.saleUnit === 'MT') {
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

  function openQuickSaleDialog() {
    // La venta rápida no captura cliente: con datos obligatorios activos se usa el
    // carrito normal (que sí los pide) — el backend igual rechazaría la venta.
    if (restaurant.requireCustomerData) {
      show('Con datos del cliente obligatorios (CRM), usa el carrito para vender: la venta rápida no captura cliente.');
      return;
    }
    setQsName('');
    setQsCategory('');
    setQsCost('');
    setQsPrice('');
    setQsPaymentMethod(paymentMethodOptions[0]?.label ?? 'Efectivo Bs');
    setQsPhotoUrl(null);
    setQuickSaleOpen(true);
  }

  function confirmQuickSale() {
    const name = qsName.trim();
    const category = qsCategory.trim();
    const price = Number(qsPrice.replace(',', '.'));
    const cost = Number(qsCost.replace(',', '.')) || 0;
    if (!name || !(price > 0) || !qsPaymentMethod) return;

    // Los métodos que dejan rastro (Pago Móvil, Zelle, Binance, PayPal, Transferencia, Punto de
    // Venta) necesitan su propia pantalla (QR, monto, referencia, comprobante) antes de poder
    // cerrar el cobro — la misma que usa el checkout normal del carrito, ver pmTargetAmount/
    // payToConfig arriba y confirmPagoMovil más abajo.
    const qsMethodKey = PAYMENT_METHOD_META.find((m) => m.label === qsPaymentMethod)?.key;
    if (qsMethodKey && METHODS_REQUIRING_PROOF_OR_REFERENCE.includes(qsMethodKey)) {
      setQuickSaleOpen(false);
      setPmMethodKey(qsMethodKey);
      setPmAccountKey('main');
      setPmReference('');
      setPmProofUrl(null);
      setPmProofError(null);
      setQsPendingPayment(true);
      setPagoMovilOpen(true);
      return;
    }

    setQsSaving(true);
    try {
      quickSale({ name, category, cost, price, paymentMethod: qsPaymentMethod });
      setQuickSaleOpen(false);
      // Se pregunta aparte (no bloquea el cobro) si quiere sumarlo al catálogo para la próxima.
      setAddToInventoryPrompt({ name, category, cost, price, photoUrl: qsPhotoUrl });
    } finally {
      setQsSaving(false);
    }
  }

  async function confirmAddToInventory() {
    if (!addToInventoryPrompt) return;
    setAddingToInventory(true);
    try {
      addProduct({
        name: addToInventoryPrompt.name,
        category: addToInventoryPrompt.category || 'General',
        subcategory: '',
        brand: '',
        sku: '',
        location: '',
        price: addToInventoryPrompt.price,
        cost: addToInventoryPrompt.cost,
        minStock: 0,
        // La foto viene de la propia venta, así el producto entra al catálogo ya
        // identificable. Arranca sin stock: todavía no hay unidades cargadas,
        // solo el registro del producto.
        photoUrl: addToInventoryPrompt.photoUrl ?? undefined,
        variants: [{ v1: 'Único', v2: '', stock: 0 }],
      });
      show(
        addToInventoryPrompt.photoUrl
          ? 'Agregado a Inventario con su foto — carga el stock cuando puedas.'
          : 'Agregado a Inventario — carga la foto y el stock cuando puedas.',
      );
    } finally {
      setAddingToInventory(false);
      setAddToInventoryPrompt(null);
    }
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

  async function sendReceiptWhatsapp(sale: Sale) {
    if (!sale.customerPhone) return;
    const message = buildReceiptMessage(sale, restaurant.name, money, moneyBs);
    const phone = waPhone(sale.customerPhone);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    const sent = await sendWhatsappOrOpen(phone, message, url);
    if (sent) show('Mensaje enviado');
  }

  /** CRM: con el interruptor de datos obligatorios activo, no se cobra sin cliente. */
  function customerDataMissing(): boolean {
    if (!restaurant.requireCustomerData) return false;
    if (custName.trim() && custPhone.trim()) return false;
    show('Este negocio exige nombre y teléfono del cliente en cada venta (CRM).');
    return true;
  }

  function startCheckout() {
    if (!till || cart.length === 0) return;
    if (customerDataMissing()) return;
    setSaleMode({ kind: 'direct' });
    setPaymethodOpen(true);
  }

  function startFiado() {
    if (!till || cart.length === 0) return;
    if (customerDataMissing()) return;
    // El plan de consumo se paga completo al activarlo (así se acordó el producto): fiar esa
    // línea dejaría un plan activo sin haberse cobrado.
    if (cart.some((c) => c.newPlanProductId)) {
      show('Un plan de consumo no se puede fiar: se paga completo al activarlo.');
      return;
    }
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

  function finalizeSale(method: PaymentMethod, meta: PaymentMeta | null, bankAccountId?: string | null) {
    const customer =
      custName.trim() || custPhone.trim()
        ? { name: custName.trim() || null, phone: custPhone.trim().replace(/\D/g, '') || null }
        : null;
    const credit = saleMode.kind === 'fiado' ? { terms: saleMode.terms, amountPaidNow: saleMode.amountPaidNow } : null;
    // checkout() vacía el carrito de inmediato (venta optimista): las líneas de plan hay que
    // leerlas ANTES de llamarlo, o ya no están para saber qué activar/consumir.
    const lineasDePlan = cart.filter((c) => c.newPlanProductId || c.consumePlanId);
    const sale = checkout(
      method,
      meta,
      customer,
      discount,
      credit,
      bankAccountId,
      posPromo ? { code: posPromo.code, discountBase: posPromoDiscount } : null,
    );
    // El pedido abierto deja de existir en cuanto se cobra: ya es una venta. Si el borrado
    // falla no se le corta la venta al cajero — se le queda un pedido de más en la lista, que
    // puede descartar a mano.
    if (pedidoAbiertoId) {
      api.delete(`/shop/open-orders/${pedidoAbiertoId}`).catch(() => undefined);
      onPedidoAbiertoChange?.(null);
    }
    // Fiado a pago completo no cobra nada hoy (queda todo pendiente) — el sonido de caja es
    // para cuando efectivamente entra dinero: venta directa o el abono de un fiado fraccionado.
    if (credit?.terms !== 'FULL') playCashSound();
    // Plan de consumo: se resuelve DESPUÉS del cobro y en segundo plano, mismo criterio que el
    // resto de esta función — la venta ya quedó registrada localmente, esto no debe bloquearla.
    // Fiado deja el pago pendiente, así que activar/consumir un plan con eso no correspondería
    // (el paquete no está pagado todavía) — se salta.
    if (!credit) {
      for (const linea of lineasDePlan) {
        if (linea.newPlanProductId && linea.newPlanUnits && customer) {
          shopApi
            .createConsumptionPlan({
              productId: linea.newPlanProductId,
              customerName: customer.name || 'Sin nombre',
              customerPhone: customer.phone || '',
              totalUnits: linea.newPlanUnits,
              totalPaid: linea.price,
            })
            .then(() => show(`Plan de consumo activado: ${linea.newPlanUnits} para ${customer.name || customer.phone}.`))
            .catch(() => show('La venta quedó registrada, pero no se pudo activar el plan de consumo.'));
        }
        if (linea.consumePlanId) {
          shopApi
            .consumePlan(linea.consumePlanId, linea.qty)
            .catch(() => show('La venta quedó registrada, pero no se pudo descontar del plan de consumo.'));
        }
      }
    }
    // El plan se arma DESPUÉS de que la venta existe: necesita su id para colgarse de ella.
    if (planPendiente && sale?.id) {
      api
        .post(`/shop/sales/${sale.id}/installments`, planPendiente)
        .then(() => show('Cliente agregado a QuickTap Pass con su plan de cuotas.'))
        .catch(() => show('La venta quedó registrada, pero no se pudo crear el plan de cuotas.'));
      setPlanPendiente(null);
    }
    setCustName('');
    setCustPhone('');
    setDiscount(0);
    setPosPromo(null);
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
    const methodKey = PAYMENT_METHOD_META.find((m) => m.label === method)?.key;
    if (methodKey && METHODS_REQUIRING_PROOF_OR_REFERENCE.includes(methodKey)) {
      setPmMethodKey(methodKey);
      setPmAccountKey('main');
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
    setQsPendingPayment(false);
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
    // Basta con la referencia O el comprobante — misma regla que el resto de las pasarelas.
    if (paymentDocumentError(pmMethodKey, pmReference, pmProofUrl)) return;
    const meta: PaymentMeta = { reference: pmReference.trim(), hasProof: !!pmProofUrl, proofImageUrl: pmProofUrl ?? undefined };

    if (qsPendingPayment) {
      const name = qsName.trim();
      const category = qsCategory.trim();
      const price = Number(qsPrice.replace(',', '.'));
      const cost = Number(qsCost.replace(',', '.')) || 0;
      quickSale({
        name,
        category,
        cost,
        price,
        paymentMethod: pmMethodLabel,
        paymentMeta: meta,
        bankAccountId: selectedPayAccount?.bankAccountId ?? undefined,
      });
      setPagoMovilOpen(false);
      setQsPendingPayment(false);
      setAddToInventoryPrompt({ name, category, cost, price, photoUrl: qsPhotoUrl });
      return;
    }

    const sale = finalizeSale(pmMethodLabel, meta, selectedPayAccount?.bankAccountId ?? undefined);
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
                // La impresión de gran formato se cobra por m² y no lleva control de stock por
                // unidades (el material se descuenta por rollo, no por pieza), así que ni se
                // deshabilita por "agotado" ni muestra la etiqueta de stock.
                const isArea = p.pricingMode === 'AREA_ROLL';
                const disabled = status === 'danger' && !isArea;
                const isWeight = bestVariant(p).soldByWeight;
                const unitSuffix = isArea ? ' / m²' : isWeight ? ' / Kg' : '';
                return (
                  <div key={p.id} className="relative">
                  {/* Botón aparte y no anidado en la tarjeta: un <button> dentro de otro <button>
                      no es HTML válido, así que "Vender plan" vive como hermano superpuesto. */}
                  {p.consumptionPlanEnabled && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPlanDialogProduct(p);
                        setPlanUnits(String(p.consumptionPlanSizes?.[0] ?? ''));
                      }}
                      title="Vender plan de consumo"
                      className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-brand-500 px-2 py-1 text-[10px] font-bold text-white shadow"
                    >
                      <Wallet className="h-3 w-3" /> Plan
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => pickOrAddToCart(p)}
                    className={`text-left rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-3 transition-transform w-full ${
                      disabled ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-0.5 hover:border-brand-400'
                    }`}
                  >
                    {p.photoUrl ? (
                      <img
                        src={p.photoUrl}
                        alt=""
                        className="aspect-square w-full rounded-xl object-cover mb-2"
                      />
                    ) : (
                      <div className={`aspect-square w-full rounded-xl flex items-center justify-center font-bold text-lg mb-2 ${categoryColor(categories, p.category)}`}>
                        {initials(p.name)}
                      </div>
                    )}
                    <p className="text-[13px] font-semibold text-brand-950 leading-tight line-clamp-2">{p.name}</p>
                    {p.promoPrice != null ? (
                      <p className="text-sm font-bold text-red-600 mt-1">
                        {money(p.promoPrice)}{unitSuffix}{' '}
                        <span className="text-[11px] font-medium text-brand-950/35 line-through">{money(p.price)}</span>
                      </p>
                    ) : (
                      <p className="text-sm font-bold text-brand-500 mt-1">{rangoPrecio(p)}{unitSuffix}</p>
                    )}
                    {moneyBs(p.price) && !tienePreciosDistintos(p) && (
                      <p className="text-[11px] text-brand-950/40">{moneyBs(p.promoPrice ?? p.price)}{unitSuffix}</p>
                    )}
                    {p.wholesalePrice != null && p.wholesaleMinQty != null && (
                      <p className="text-[10.5px] font-medium text-emerald-600 mt-0.5">Mayorista {money(p.wholesalePrice)} desde {p.wholesaleMinQty} uds.</p>
                    )}
                    {isArea ? (
                      <span
                        className={`inline-block mt-1.5 text-[10.5px] font-medium px-2 py-0.5 rounded-full ${
                          stock > 0 ? 'bg-sky-100 text-sky-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        Por medida · {stock > 0 ? `${stock.toFixed(1)} m² de material` : 'sin material'}
                      </span>
                    ) : (
                      <span className={`inline-block mt-1.5 text-[10.5px] font-medium px-2 py-0.5 rounded-full ${STATUS_CLASS[status]}`}>
                        {STATUS_LABEL[status]}{status !== 'danger' ? ` · ${isWeight ? `${stock.toFixed(1)} Kg` : formatStock(stock)}` : ''}
                      </span>
                    )}
                  </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div ref={cartPanelRef} className="w-full lg:w-[360px] shrink-0 rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-5 flex flex-col gap-4">
          {lockedToSelfProvider ? (
            // Quien cobra es él mismo un barbero: fijo en su propio nombre, sin dropdown — no
            // debe poder ver ni elegir a ningún compañero (y el backend nunca le mandó sus datos).
            <div className="block text-sm">
              <span className="text-brand-950/70">Atendido por</span>
              <p className="mt-1 w-full rounded-lg border border-brand-950/15 bg-brand-950/[0.03] px-3 py-2 text-sm font-medium text-brand-950">
                {providers[0].name}
                {providers[0].commissionPercent ? ` · ${providers[0].commissionPercent}%` : ''}
              </p>
              <span className="mt-1 block text-[11px] text-brand-950/45">
                Cobras con tus propios datos de pago. Se te acredita lo que agregues al carrito.
              </span>
            </div>
          ) : (
            providers.length > 0 && (
              <label className="block text-sm">
                <span className="text-brand-950/70">Atendido por</span>
                <select
                  value={activeStaffUserId}
                  onChange={(e) => setActiveStaffUserId(e.target.value)}
                  className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                >
                  <option value="">— Sin asignar —</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.commissionPercent ? ` · ${p.commissionPercent}%` : ''}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] text-brand-950/45">
                  Se le acredita lo que agregues al carrito desde ahora. Cámbialo antes de agregar si atiende otro.
                </span>
              </label>
            )
          )}

          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-brand-950">Carrito</h3>
            <span className="text-[11px] font-bold bg-brand-500/10 text-brand-500 px-2.5 py-1 rounded-full">
              {cartItemCount} items
            </span>
          </div>

          {cart.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-brand-950/40">Agrega productos para empezar la venta.</p>
              {/* Cobro rápido de algo que no está en el catálogo. Vive acá, discreto, en vez de
                  como botón verde en la barra: ahí competía con "Crear pedido" del menú lateral. */}
              {till && (
                <button
                  type="button"
                  onClick={openQuickSaleDialog}
                  className="mt-2 text-[12px] font-medium text-brand-500 hover:text-brand-600"
                >
                  ¿Vendes algo que no está en tu inventario?
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-h-[340px] overflow-y-auto">
              {cart.map((c) => {
                const planActivo = c.productId ? plansByProduct[c.productId] : null;
                const puedeUsarPlan = !!planActivo && !c.consumePlanId && c.qty <= planActivo.remainingUnits;
                return (
                <div key={c.key} className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-brand-950 truncate">{c.name}</p>
                    <p className="text-[11.5px] text-brand-950/40">
                      {c.detail ?? `${c.v1}${c.v2 ? ` · ${c.v2}` : ''}`}
                      {c.staffUserId && providers.find((p) => p.id === c.staffUserId) && (
                        <span className="text-brand-500"> · {providers.find((p) => p.id === c.staffUserId)!.name}</span>
                      )}
                    </p>
                    {effectivePrice(c) !== c.price && (
                      <p className="text-[10.5px] font-semibold text-emerald-600">
                        {c.promoPrice != null ? 'Promo' : 'Mayorista'} {money(effectivePrice(c))}/u
                      </p>
                    )}
                  </div>
                  {c.soldByWeight || c.unitLabel ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={c.qty}
                        onChange={(e) => setCartQty(c.key, Number(e.target.value) || 0)}
                        className="w-16 border border-brand-950/15 rounded-md text-center text-xs py-1"
                      />
                      <span className="text-[10px] font-medium text-brand-950/40">{c.unitLabel ?? 'Kg'}</span>
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
                {/* Con cargo al plan: ya se cobró al activarlo, así que esta línea sale en $0 —
                    pero sigue siendo el producto real, o sea que el stock se descuenta igual. */}
                {c.consumePlanId && (
                  <p className="flex items-center gap-1 pl-0.5 text-[11px] font-medium text-brand-500">
                    <Wallet className="h-3 w-3" /> Con cargo al plan de consumo
                    <button type="button" onClick={() => toggleConsumePlan(c.key, null)} className="ml-1 text-brand-950/40 underline">
                      quitar
                    </button>
                  </p>
                )}
                {!c.consumePlanId && planActivo && (
                  <button
                    type="button"
                    disabled={!puedeUsarPlan}
                    onClick={() => toggleConsumePlan(c.key, planActivo.id)}
                    className="flex items-center gap-1 pl-0.5 text-[11px] font-medium text-brand-500 disabled:cursor-not-allowed disabled:text-brand-950/30"
                    title={
                      puedeUsarPlan
                        ? undefined
                        : `El plan solo tiene ${planActivo.remainingUnits}; reduce la cantidad de esta línea a eso o menos para usarlo.`
                    }
                  >
                    <Wallet className="h-3 w-3" /> {planActivo.customerName} tiene un plan con {planActivo.remainingUnits} restantes — cobrar con cargo al plan
                  </button>
                )}
                </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-2">
            <input
              value={custName}
              onChange={(e) => setCustName(e.target.value)}
              placeholder={restaurant.requireCustomerData ? 'Cliente *' : 'Cliente (opcional)'}
              className="flex-1 min-w-0 border border-brand-950/15 rounded-lg px-2.5 py-2 text-[13px]"
            />
            <input
              value={custPhone}
              onChange={(e) => setCustPhone(e.target.value)}
              placeholder={restaurant.requireCustomerData ? 'Teléfono *' : 'Teléfono (opcional)'}
              className="flex-1 min-w-0 border border-brand-950/15 rounded-lg px-2.5 py-2 text-[13px]"
            />
          </div>
          {restaurant.requireCustomerData && (
            <p className="text-[11px] font-light text-brand-950/40">
              Este negocio exige nombre y teléfono del cliente en cada venta (CRM).
            </p>
          )}

          {/* Código de promoción del CRM: valida contra la lista del cliente del ticket. */}
          <PromoCodeField phone={custPhone} applied={posPromo} onApplied={setPosPromo} symbol={restaurant.currencySymbol} />

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
            {posPromoDiscount > 0 && posPromo && (
              <div className="flex items-center justify-between text-[13px] font-medium text-emerald-600">
                <span>Promoción {posPromo.code}</span>
                <span>−{money(posPromoDiscount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-[17px] font-bold text-brand-950">
              <span>Total</span>
              <span className="text-right">
                {money(total)}
                {moneyBs(total) && <span className="block text-[11px] font-medium text-brand-950/40">{moneyBs(total)}</span>}
              </span>
            </div>
            {/*
              Costo y margen de lo que está en el carrito. Solo dueño y administrador: el costo
              de la mercancía no es algo que deba tener a la vista quien atiende la caja.
              Es una estimación al costo promedio del producto; al cobrar, el servidor recalcula
              con los lotes reales que salen (el más viejo primero), así que el margen final
              puede moverse un poco si el carrito consume dos lotes distintos.
            */}
            {puedeVerMargen && cart.length > 0 && (
              <div className="flex items-center justify-between text-[12px] text-brand-950/50 -mt-1">
                <span>Costo {money(costoCarrito)}</span>
                <span className={margenCarrito >= 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>
                  Ganancia {money(total - costoCarrito)} · {margenCarrito.toFixed(1)}%
                </span>
              </div>
            )}
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

            {/* Deja el carrito parado para seguirlo cargando después. No cobra ni descuenta
                stock: hasta que no se cobre, no es una venta. */}
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={() => {
                setNombreAbierto(pedidoAbiertoId ? nombreAbierto : '');
                setAbiertoOpen(true);
              }}
              className="mt-2 w-full rounded-full border border-brand-950/15 py-2 text-[12.5px] font-semibold text-brand-950/70 transition-colors hover:bg-brand-950/[0.04] disabled:opacity-40"
            >
              {pedidoAbiertoId ? 'Guardar pedido abierto' : 'Dejar pedido abierto'}
            </button>

            {/* Alta en el portal del cliente + plan de cuotas, en el mismo momento del cobro:
                es cuando el cliente está delante y se acuerdan las condiciones. */}
            <button
              type="button"
              disabled={cart.length === 0 || !till}
              onClick={() => setPassOpen(true)}
              className="mt-2 w-full rounded-full border border-brand-500/30 bg-brand-500/[0.07] py-2 text-[12.5px] font-semibold text-brand-500 transition-colors hover:bg-brand-500/15 disabled:opacity-40"
            >
              Agregar cliente a QuickTap Pass
            </button>
          </div>
        </div>
      </div>

      {/* Carrito flotante: solo en celular (< lg, donde el panel de carrito queda debajo de toda
          la grilla de productos) y solo si hay algo en el carrito — toca para saltar directo ahí. */}
      {cartItemCount > 0 && !carritoVisible && (
        <div className="lg:hidden fixed bottom-6 inset-x-0 z-30 flex justify-center pointer-events-none px-4">
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

      {/* ---------- Dejar pedido abierto ---------- */}
      <Dialog open={abiertoOpen} onOpenChange={setAbiertoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pedidoAbiertoId ? 'Guardar pedido abierto' : 'Dejar pedido abierto'}</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-light text-brand-950/60">
            El pedido queda en <span className="font-semibold text-brand-950">Pedidos → Pedidos abiertos</span> para
            seguir cargándole productos. No se cobra ni descuenta inventario hasta que lo cobres.
          </p>
          <label className="mt-3 block text-sm">
            <span className="text-brand-950/70">¿Con qué nombre lo reconoces?</span>
            <input
              autoFocus
              value={nombreAbierto}
              onChange={(e) => setNombreAbierto(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && guardarPedidoAbierto()}
              placeholder="Juan, Mesa 3, el de la camioneta…"
              className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2"
            />
          </label>
          <TextureButton
            variant="brand"
            size="default"
            className="mt-4 disabled:opacity-40"
            disabled={!nombreAbierto.trim() || guardandoAbierto}
            onClick={guardarPedidoAbierto}
          >
            {guardandoAbierto ? 'Guardando…' : 'Dejar abierto'}
          </TextureButton>
        </DialogContent>
      </Dialog>

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

      {/* ---------- Vender plan de consumo ---------- */}
      <Dialog open={!!planDialogProduct} onOpenChange={(o) => !o && setPlanDialogProduct(null)}>
        <DialogContent>
          {planDialogProduct && (
            <>
              <DialogHeader>
                <DialogTitle>Plan de consumo — {planDialogProduct.name}</DialogTitle>
              </DialogHeader>
              <p className="text-sm font-light text-brand-950/60">
                El cliente paga el paquete completo ahora y lo retira con el tiempo. Tarifa del plan:{' '}
                <span className="font-semibold text-brand-950">{money(planDialogProduct.consumptionPlanRate ?? 0)}</span> por{' '}
                {planDialogProduct.saleUnit === 'MT' ? 'metro' : planDialogProduct.saleUnit === 'KG' ? 'kilo' : 'unidad'}
                {' '}(normal {money(planDialogProduct.price)}).
              </p>

              {(planDialogProduct.consumptionPlanSizes?.length ?? 0) > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {planDialogProduct.consumptionPlanSizes!.map((tam) => (
                    <button
                      key={tam}
                      type="button"
                      onClick={() => setPlanUnits(String(tam))}
                      className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                        Number(planUnits) === tam ? 'border-brand-500 bg-brand-500/10 text-brand-500' : 'border-brand-950/15 text-brand-950/70'
                      }`}
                    >
                      {tam}{planDialogProduct.saleUnit === 'MT' ? 'mt' : planDialogProduct.saleUnit === 'KG' ? 'kg' : 'und'}
                    </button>
                  ))}
                </div>
              )}

              <label className="mt-3 block text-sm">
                <span className="text-brand-950/70">O escribe otra cantidad</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={planUnits}
                  onChange={(e) => setPlanUnits(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2"
                />
              </label>

              <div className="mt-4 flex items-baseline justify-between rounded-xl bg-brand-950/[0.03] px-3.5 py-2.5">
                <span className="text-sm text-brand-950/60">A cobrar ahora</span>
                <span className="text-lg font-bold text-brand-950">
                  {money((Number(planUnits) || 0) * (planDialogProduct.consumptionPlanRate ?? 0))}
                </span>
              </div>

              <TextureButton
                variant="brand"
                size="default"
                className="mt-4 disabled:opacity-40"
                disabled={!(Number(planUnits) > 0)}
                onClick={() => {
                  addConsumptionPlanLine(planDialogProduct, Number(planUnits));
                  setPlanDialogProduct(null);
                }}
              >
                Agregar al carrito
              </TextureButton>
            </>
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

      {/* ---------- Pantalla del cliente (se abre desde "Mostrar datos") ---------- */}
      {clientScreenOpen && (
        <PaymentClientScreen
          method={pmMethodKey}
          methodLabel={pmMethodLabel}
          qrImageUrl={qrImageUrl}
          amountBase={pmTargetAmount}
          symbol={restaurant.currencySymbol}
          rateBs={restaurant.exchangeRate?.rateBs}
          detailTitle={qsPendingPayment ? 'Detalle de la venta' : `Detalle de la venta (${cartItemCount} ítems)`}
          detailLines={
            qsPendingPayment
              ? [qsName.trim() || 'Venta rápida']
              : cart.map((c) => `${c.soldByWeight || c.unitLabel ? c.qty : `${c.qty}x`} ${c.name}`)
          }
          details={
            (() => {
              // Con varias cuentas del local, se muestran los datos de la CUENTA elegida.
              const pm = selectedPayAccount ? selectedPayAccount.fields : payToConfig?.[pmMethodKey];
              if (!pm?.telefono && !pm?.cedula && !pm?.correo && !pm?.id && !pm?.cuenta) return null;
              return (
                <div className="rounded-2xl border border-brand-950/10 bg-brand-950/[0.03] p-3.5 text-left">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-brand-950/45">
                    {payToIsStaff ? `Pagar a ${payToName}` : 'Pagar a'}
                  </p>
                  <div className="mt-1.5 space-y-0.5 text-sm text-brand-950">
                    {pm.titular && <p className="font-semibold">{pm.titular}</p>}
                    {pm.correo && <p>{pm.correo}</p>}
                    {pm.id && <p>{pm.id}</p>}
                    {pm.telefono && <p>{pm.telefono}</p>}
                    {pm.cuenta && <p>{pm.cuenta}</p>}
                    {pm.banco && <p className="text-brand-950/60">{pm.banco}</p>}
                    {pm.cedula && <p className="text-brand-950/60">{pm.cedula}</p>}
                  </div>
                </div>
              );
            })()
          }
          // Vuelve al diálogo de caja, que sigue abierto detrás, para cargar referencia/comprobante.
          onNext={() => setClientScreenOpen(false)}
          onBack={() => setClientScreenOpen(false)}
        />
      )}

      {/* ---------- Pago móvil ---------- */}
      <Dialog open={pagoMovilOpen} onOpenChange={(o) => (o ? setPagoMovilOpen(true) : closePagoMovil())}>
        <DialogContent
          className="text-center w-[calc(100vw-2rem)] max-w-md sm:w-full max-h-[94vh] p-7 sm:p-9 gap-5"
          // Con la pantalla del cliente encima, sus clics caen "fuera" del diálogo y Radix lo
          // cerraría, perdiendo el cobro en curso.
          onPointerDownOutside={(e) => clientScreenOpen && e.preventDefault()}
          onInteractOutside={(e) => clientScreenOpen && e.preventDefault()}
          onFocusOutside={(e) => clientScreenOpen && e.preventDefault()}
          onEscapeKeyDown={(e) => clientScreenOpen && e.preventDefault()}
        >
          {/* El QR y los datos de cobro NO van acá: ocupan media pantalla y el cliente no lee
              este diálogo. Se los enseña con "Mostrar datos" (pantalla completa) y acá queda
              solo lo que carga el cajero: monto, referencia y comprobante. */}
          <div className="flex flex-col gap-5 sm:text-left">
            <div className="min-w-0 flex-1 space-y-4">
              {/* Zelle y Binance mueven dólares: manda el monto en $ y el Bs queda de referencia. */}
              <div>
                <p className="text-sm font-semibold text-brand-950/50">Monto a cancelar</p>
                <div className="text-[40px] sm:text-[48px] font-extrabold text-emerald-600 leading-none tracking-tight mt-1">
                  {USD_FIRST_METHODS.includes(pmMethodKey)
                    ? money(pmTargetAmount)
                    : moneyBs(pmTargetAmount) ?? money(pmTargetAmount)}
                </div>
                {restaurant.exchangeRate && (
                  <p className="text-[13.5px] font-semibold text-brand-950/50 mt-2">
                    {USD_FIRST_METHODS.includes(pmMethodKey) ? (
                      <>
                        {moneyBs(pmTargetAmount)} &nbsp;(tasa del día)
                      </>
                    ) : (
                      <>
                        {money(pmTargetAmount)} &nbsp;x&nbsp; Bs{Number(restaurant.exchangeRate.rateBs).toFixed(2)} &nbsp;(tasa
                        del día)
                      </>
                    )}
                  </p>
                )}
              </div>

              <div className="text-left">
                <MethodAccountPicker
                  accounts={payAccounts}
                  value={selectedPayAccount?.key ?? 'main'}
                  onChange={setPmAccountKey}
                  label="¿A cuál cuenta te pagan?"
                />
              </div>

              <label className="block text-sm text-left">
                <span className="text-brand-950/70">
                  {referenceLabel(pmMethodKey)}
                  {pmAllowsProof && <span className="text-brand-950/45"> — o adjunta el comprobante</span>}
                </span>
                <input
                  value={pmReference}
                  onChange={(e) => setPmReference(e.target.value)}
                  placeholder="Ej: 001234"
                  className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                />
              </label>

              {pmAllowsProof && (
                <>
                  <TextureButton
                    variant="minimal"
                    size="default"
                    className="w-full justify-center"
                    disabled={pmUploadingProof}
                    onClick={() => pmFileInputRef.current?.click()}
                  >
                    {pmUploadingProof ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    {pmUploadingProof ? 'Subiendo…' : pmProofUrl ? 'Cambiar comprobante' : 'Adjuntar comprobante'}
                  </TextureButton>
                  <input
                    ref={pmFileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleProofFileChange}
                  />
                  {pmProofUrl && (
                    <div className="flex items-center gap-2.5 justify-center sm:justify-start">
                      <img src={pmProofUrl} alt="Comprobante" className="h-12 w-12 rounded-lg object-cover border border-brand-950/10" />
                      <p className="text-[12px] font-semibold text-emerald-600">✓ Comprobante adjunto</p>
                    </div>
                  )}
                  {pmProofError && <p className="text-[12px] font-semibold text-red-600">{pmProofError}</p>}
                </>
              )}
            </div>
          </div>

          <TextureButton variant="minimal" size="default" className="w-full justify-center" onClick={() => setClientScreenOpen(true)}>
            <QrCode className="h-4 w-4" />
            Mostrar datos
          </TextureButton>

          <DialogFooter>
            <TextureButton variant="minimal" size="default" className="!w-auto" onClick={closePagoMovil}>
              Cancelar
            </TextureButton>
            <TextureButton
              variant="brand"
              size="default"
              className="!w-auto"
              disabled={Boolean(paymentDocumentError(pmMethodKey, pmReference, pmProofUrl))}
              onClick={confirmPagoMovil}
            >
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

      {/* ---------- Selector de variante (talla/color/presentación) ---------- */}
      <Dialog open={!!variantPickerProduct} onOpenChange={(open) => !open && setVariantPickerProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{variantPickerProduct?.name}</DialogTitle>
          </DialogHeader>
          {variantPickerProduct && (
            <div className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto">
              {variantPickerProduct.variants.map((v, i) => {
                const label = [v.v1, v.v2].filter(Boolean).join(' · ') || 'Única';
                const out = v.stock <= 0 && !v.soldByWeight;
                return (
                  <button
                    key={`${v.v1}-${v.v2}-${i}`}
                    type="button"
                    disabled={out}
                    onClick={() => addVariantToCart(variantPickerProduct, v)}
                    className={`flex items-center justify-between gap-3 rounded-xl border border-brand-950/10 px-4 py-3 text-left transition-colors ${
                      out ? 'opacity-40 cursor-not-allowed' : 'hover:bg-brand-950/[0.04]'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-brand-950">{label}</span>
                      {/* El precio va acá porque con variantes que valen distinto (60/90/150 PSI)
                          elegir a ciegas y descubrir el monto en el carrito hace perder ventas. */}
                      <span className="block text-[12px] text-brand-500 font-semibold">
                        {money(v.price ?? variantPickerProduct.price)}
                      </span>
                    </span>
                    <span className="text-sm text-brand-950/50 shrink-0">
                      {out ? 'Agotado' : v.soldByWeight ? 'Por Kg' : `${formatStock(v.stock)} en stock`}
                    </span>
                  </button>
                );
              })}
            </div>
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
              <p className="text-sm text-brand-950/50">
                {money(weightProduct.price)} / {unidadDe(weightProduct)}
                {moneyBs(weightProduct.price) && ` · ${moneyBs(weightProduct.price)} / ${unidadDe(weightProduct)}`}
                {weightVariant?.v1 && weightVariant.v1 !== 'Kg' ? ` · ${weightVariant.v1}` : ''}
              </p>
              <label className="block text-sm">
                <span className="text-brand-950/70">
                  {weightProduct.saleUnit === 'MT' ? 'Metros' : 'Peso (Kg)'}
                </span>
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
              {/* El monto exacto en las dos monedas: es lo que el cliente pregunta apenas se pesa
                  o se mide, y tenerlo acá evita calcularlo aparte. */}
              {Number(weightInput) > 0 && (
                <div className="rounded-xl bg-brand-950/[0.04] px-3 py-2">
                  <p className="text-[11px] font-light text-brand-950/50">
                    {Number(weightInput)} {unidadDe(weightProduct)} × {money(weightProduct.price)}
                  </p>
                  <p className="text-lg font-bold tabular-nums text-brand-950">
                    {moneyBs(weightProduct.price * Number(weightInput)) ??
                      money(weightProduct.price * Number(weightInput))}
                  </p>
                  {moneyBs(weightProduct.price * Number(weightInput)) && (
                    <p className="text-sm font-medium tabular-nums text-brand-950/60">
                      {money(weightProduct.price * Number(weightInput))}
                    </p>
                  )}
                </div>
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

      {/* ---------- Medidas de impresión (gran formato) ---------- */}
      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{printProduct?.name}</DialogTitle>
          </DialogHeader>
          {printProduct && (
            <>
              <p className="text-sm text-brand-950/50">
                {money(printProduct.price)} / m² · anchos de rollo {formatRollWidths(printProduct.rollWidths ?? [])} m
              </p>
              <div className="flex gap-3">
                <label className="block text-sm flex-1">
                  <span className="text-brand-950/70">Ancho (m)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={printWidth}
                    onChange={(e) => setPrintWidth(e.target.value)}
                    placeholder="1,20"
                    autoFocus
                    className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                  />
                </label>
                <label className="block text-sm flex-1">
                  <span className="text-brand-950/70">Alto (m)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={printHeight}
                    onChange={(e) => setPrintHeight(e.target.value)}
                    placeholder="0,80"
                    className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                  />
                </label>
              </div>

              {printQuote && (
                <div className="rounded-xl bg-brand-950/[0.03] border border-brand-950/10 p-3 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-brand-950/60">Rollo que se usa</span>
                    <span className="font-medium text-brand-950">
                      {rollWidthLabel(printQuote.rollWidth)} m{printQuote.rotated ? ' · rotado' : ''}
                    </span>
                  </div>
                  {(() => {
                    // m² que quedan de ESE rollo (la variante cuyo v1 es su ancho). Se consume el
                    // ancho completo por el largo impreso, o sea exactamente lo que se factura.
                    const roll = printProduct.variants.find((v) => v.v1 === rollWidthLabel(printQuote.rollWidth));
                    if (!roll) return null;
                    const left = roll.stock - printQuote.billedM2;
                    return (
                      <div className="flex justify-between text-xs">
                        <span className="text-brand-950/40">Material del rollo</span>
                        <span className={left < 0 ? 'font-semibold text-red-600' : 'text-brand-950/40'}>
                          consume {printQuote.billedM2.toFixed(2).replace('.', ',')} m² · quedan{' '}
                          {Math.max(0, left).toFixed(2).replace('.', ',')} m² de {roll.stock.toFixed(2).replace('.', ',')} m²
                        </span>
                      </div>
                    );
                  })()}
                  <div className="flex justify-between text-sm">
                    <span className="text-brand-950/60">Se cobra</span>
                    <span className="font-medium text-brand-950">
                      {rollWidthLabel(printQuote.rollWidth)} × {printQuote.lengthM.toFixed(2).replace('.', ',')} ={' '}
                      {printQuote.billedM2.toFixed(3).replace('.', ',')} m²
                    </span>
                  </div>
                  {printQuote.wasteM2 > 0.001 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-brand-950/40">Sobrante del rollo (no reutilizable)</span>
                      <span className="text-brand-950/40">{printQuote.wasteM2.toFixed(3).replace('.', ',')} m²</span>
                    </div>
                  )}
                  {printQuote.rotated && (
                    <p className="text-xs text-brand-950/50">
                      Se imprime rotada: así entra en un rollo más angosto y sale más barato.
                    </p>
                  )}
                  {(() => {
                    const roll = printProduct.variants.find((v) => v.v1 === rollWidthLabel(printQuote.rollWidth));
                    if (!roll || roll.stock >= printQuote.billedM2) return null;
                    return (
                      <p className="text-xs text-red-700 bg-red-50 rounded-lg px-2 py-1.5">
                        No alcanza el material: quedan {roll.stock.toFixed(2).replace('.', ',')} m² del rollo de{' '}
                        {rollWidthLabel(printQuote.rollWidth)} y esta pieza necesita{' '}
                        {printQuote.billedM2.toFixed(2).replace('.', ',')} m². Puedes venderla igual, pero registra la compra del rollo.
                      </p>
                    );
                  })()}
                  {printQuote.needsPaneling && (
                    <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">
                      Más ancha que el rollo más grande — va por paneles con empalme. Revisa el precio antes de cobrar.
                    </p>
                  )}
                  <div className="flex justify-between text-base font-semibold text-brand-950 pt-1.5 border-t border-brand-950/10">
                    <span>Total</span>
                    <span>{money(printQuote.billedM2 * printProduct.price)}</span>
                  </div>
                </div>
              )}

              <DialogFooter>
                <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setPrintOpen(false)}>
                  Cancelar
                </TextureButton>
                <TextureButton variant="brand" size="default" className="!w-auto" disabled={!printQuote} onClick={confirmPrint}>
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

      {passOpen && (
        <ShopPassEnrollDialog
          saldo={total}
          money={money}
          moneyBs={moneyBs}
          onClose={() => setPassOpen(false)}
          onListo={({ cliente, plan }) => {
            // Los datos del cliente rellenan el cobro; el plan queda esperando a que la venta
            // exista para colgarse de ella.
            setCustName(cliente.name);
            setCustPhone(cliente.phone);
            setPlanPendiente(plan);
            setPassOpen(false);
            setSaleMode({ kind: 'fiado', terms: 'FULL', amountPaidNow: 0 });
            setPaymethodOpen(true);
          }}
        />
      )}

      {/* ---------- Crear venta (producto/servicio todavía no cargado en el catálogo) ---------- */}
      <Dialog open={quickSaleOpen} onOpenChange={setQuickSaleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear venta</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-brand-950/50 -mt-1">
            Para cobrar algo que todavía no está en tu inventario. Al terminar te preguntamos si quieres
            agregarlo al catálogo para la próxima vez.
          </p>
          <div className="flex flex-col gap-3">
            <PhotoUploadField
              value={qsPhotoUrl}
              onChange={setQsPhotoUrl}
              label="Foto del artículo (opcional)"
              helpText="Si después lo agregas al inventario, entra con esta foto."
              uploadUrl="/shop/products/upload-photo"
              shape="square"
              aiEnabled
            />
            <div>
              <label className="text-xs font-semibold text-brand-950/60 mb-1 block">Nombre</label>
              <input
                value={qsName}
                onChange={(e) => setQsName(e.target.value)}
                placeholder="Ej: Corte de cabello"
                className="w-full border border-brand-950/15 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-brand-950/60 mb-1 block">Categoría</label>
              <input
                value={qsCategory}
                onChange={(e) => setQsCategory(e.target.value)}
                placeholder="Ej: Servicios"
                list="quick-sale-categories"
                className="w-full border border-brand-950/15 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
              <datalist id="quick-sale-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-semibold text-brand-950/60 mb-1 block">Costo</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={qsCost}
                  onChange={(e) => setQsCost(e.target.value)}
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
                  value={qsPrice}
                  onChange={(e) => setQsPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-brand-950/15 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-brand-950/60 mb-1 block">Método de pago</label>
              <div className="flex flex-wrap gap-2">
                {paymentMethodOptions.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setQsPaymentMethod(m.label)}
                    className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                      qsPaymentMethod === m.label
                        ? 'bg-brand-500 text-white border-brand-500'
                        : 'border-brand-950/15 text-brand-950/70 hover:bg-brand-950/5'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setQuickSaleOpen(false)}>
              Cancelar
            </TextureButton>
            <TextureButton
              variant="brand"
              size="default"
              className="!w-auto disabled:opacity-50"
              disabled={qsSaving || !qsName.trim() || !(Number(qsPrice.replace(',', '.')) > 0) || !qsPaymentMethod}
              onClick={confirmQuickSale}
            >
              {qsSaving ? 'Registrando…' : 'Registrar venta'}
            </TextureButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- ¿Agregar esta venta al catálogo? ---------- */}
      <Dialog open={!!addToInventoryPrompt} onOpenChange={(o) => !o && setAddToInventoryPrompt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Venta registrada</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-brand-950/70">
            ¿Quieres agregar <strong>"{addToInventoryPrompt?.name}"</strong> a tu inventario? Así la próxima vez lo
            eliges directo de la lista, sin volver a escribirlo.
          </p>
          <p className="text-xs text-brand-950/45">
            {addToInventoryPrompt?.photoUrl
              ? 'Queda con la foto, el nombre, la categoría, el costo y el precio que acabas de cargar, y sin stock — solo entra a poner la cantidad disponible desde Inventario cuando puedas.'
              : 'Queda con el nombre, la categoría, el costo y el precio que acabas de cargar, y sin stock — solo entra a completar la foto y la cantidad disponible desde Inventario cuando puedas.'}
          </p>
          <DialogFooter>
            <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setAddToInventoryPrompt(null)}>
              No, gracias
            </TextureButton>
            <TextureButton
              variant="brand"
              size="default"
              className="!w-auto disabled:opacity-50"
              disabled={addingToInventory}
              onClick={confirmAddToInventory}
            >
              {addingToInventory ? 'Agregando…' : 'Sí, agregar a Inventario'}
            </TextureButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  #shop-print-active, #shop-print-active * { visibility: visible; }
                  #shop-print-active { position: absolute; top: 0; left: 0; width: 100%; }
                  /* El documento que NO se está imprimiendo se saca del flujo por completo — solo
                     con visibility:hidden se queda ocupando su espacio y empuja una página en
                     blanco detrás del que sí se imprime. */
                  [data-print-doc]:not(#shop-print-active) { display: none !important; }
                }
              `}</style>
              <div data-print-doc id={printMode === 'ticket' ? 'shop-print-active' : undefined}>
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
                    <span className="flex-1">{it.detail ? `${it.qty} m²` : it.soldByWeight ? `${it.qty} Kg` : `${it.qty}x`} {it.name}{it.detail ? ` (${it.detail})` : it.v1 ? ` (${it.v1}${it.v2 ? '·' + it.v2 : ''})` : ''}</span>
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

              {/* Nota de entrega: documento más amplio que el ticket térmico — para dejar
                  constancia de lo despachado cuando el cliente lo pide, o para acompañar un
                  envío. NO es un documento fiscal (no pasa por el SENIAT): lo dice explícito
                  abajo para que nadie la confunda con una factura. */}
              <div data-print-doc id={printMode === 'nota' ? 'shop-print-active' : undefined} className="hidden print:block">
                <div className="mb-4 flex items-start justify-between border-b border-brand-950/15 pb-3">
                  <div>
                    <p className="text-lg font-bold text-brand-950">{restaurant.name}</p>
                    <p className="text-xs text-brand-950/50">Nota de entrega</p>
                  </div>
                  <div className="text-right text-xs text-brand-950/50">
                    <p>Ref. #{ticketSale.id.slice(-6)}</p>
                    <p>{ticketSale.time.toLocaleDateString('es-VE')} {ticketSale.time.toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })}</p>
                  </div>
                </div>
                <div className="mb-3 text-sm text-brand-950">
                  <p><span className="text-brand-950/50">Entregado a:</span> {ticketSale.customerName || 'Consumidor final'}</p>
                  {ticketSale.customerPhone && <p><span className="text-brand-950/50">Teléfono:</span> {ticketSale.customerPhone}</p>}
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-brand-950/15 text-left text-xs text-brand-950/50">
                      <th className="pb-1.5 font-medium">Producto</th>
                      <th className="pb-1.5 text-right font-medium">Cant.</th>
                      <th className="pb-1.5 text-right font-medium">P. unit.</th>
                      <th className="pb-1.5 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ticketSale.items.map((it, i) => (
                      <tr key={i} className="border-b border-brand-950/[0.08]">
                        <td className="py-1.5">{it.name}{it.detail ? ` (${it.detail})` : it.v1 && it.v1 !== 'Único' ? ` (${it.v1}${it.v2 ? '·' + it.v2 : ''})` : ''}</td>
                        <td className="py-1.5 text-right">{it.detail ? `${it.qty} m²` : it.soldByWeight ? `${it.qty} Kg` : it.qty}</td>
                        <td className="py-1.5 text-right">{money(it.price)}</td>
                        <td className="py-1.5 text-right">{money(it.price * it.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 flex justify-end">
                  <p className="text-base font-bold text-brand-950">Total: {money(ticketSale.total)}</p>
                </div>
                <div className="mt-10 flex items-end justify-between text-xs text-brand-950/60">
                  <div className="w-56 border-t border-brand-950/30 pt-1">Recibí conforme (firma)</div>
                  <div className="w-40 border-t border-brand-950/30 pt-1">C.I. / RIF</div>
                </div>
                <p className="mt-6 text-center text-[10px] text-brand-950/35">
                  Documento interno de entrega — sin validez como factura fiscal.
                </p>
              </div>

              <DialogFooter>
                <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setTicketSale(null)}>
                  Cerrar
                </TextureButton>
                <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => imprimir('ticket')}>
                  <Printer className="h-4 w-4" /> Imprimir ticket
                </TextureButton>
                <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => imprimir('nota')}>
                  <FileText className="h-4 w-4" /> Nota de entrega
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

      <Toast message={toastMessage} />
    </div>
  );
}
