import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bike,
  Check,
  Clock,
  MapPin,
  Martini,
  ScanLine,
  Search,
  SplitSquareHorizontal,
  Store,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, cartLineUnitPrice, formatBase, formatBs, formatModifierLabel, modifierSelectionKey } from '@/utils/format';
import type { CartLine, Customer, FloorPlan, Product, TableSession } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { AddressAutocomplete, reverseGeocode } from '@/components/AddressAutocomplete';
import { CustomerPicker } from './CustomerPicker';
import { ProductOptionsDialog } from './ProductOptionsDialog';
import ProductBarcodeScanDialog from './ProductBarcodeScanDialog';
import type { LiveOrder } from './LiveOrdersPanel';

interface ExistingOrderOption {
  id: string;
  orderNumber: number;
  channel: 'DINE_IN' | 'DELIVERY' | 'PICKUP' | 'BAR';
  customerName: string | null;
  table: { number: string } | null;
}

interface Props {
  existingOrders: ExistingOrderOption[];
  onClose: () => void;
  /** Pedido nuevo creado: si venía con intención de pago (FULL/SPLIT), el padre debe abrir PaymentDialog. */
  onCreated: (newOrder?: LiveOrder, paymentMode?: 'full' | 'split') => void;
  onSelectExisting: (orderId: string) => void;
}

type Channel = 'DINE_IN' | 'DELIVERY' | 'PICKUP' | 'BAR';
type PaymentIntent = 'FULL' | 'SPLIT' | 'DEBT';
type Step = 1 | 2 | 3;
// Solo aplica al canal Mesa: "Abrir mesa" arma una cuenta nueva (pasos 2 y 3 normales);
// "Añadir a mesa" agrega la comanda directamente a una cuenta de mesa ya abierta, sin pasar
// por Pago/Clientes (esos datos ya quedaron fijados cuando se abrió la cuenta).
type TableMode = 'OPEN' | 'ADD';

interface AvailableTable {
  id: string;
  number: string;
  zoneName: string | null;
  sessions: TableSession[];
}

const CHANNEL_OPTIONS: { value: Channel; label: string; icon: typeof UtensilsCrossed }[] = [
  { value: 'DINE_IN', label: 'Mesa', icon: UtensilsCrossed },
  { value: 'BAR', label: 'Barra', icon: Martini },
  { value: 'DELIVERY', label: 'Delivery', icon: Bike },
  { value: 'PICKUP', label: 'Pick-up', icon: Store },
];

const CHANNEL_LABELS: Record<Channel, string> = { DINE_IN: 'Mesa', DELIVERY: 'Delivery', PICKUP: 'Pickup', BAR: 'Barra' };

const STEP_LABELS: Record<Step, string> = { 1: 'Menú', 2: 'Pago', 3: 'Clientes' };

/** Cargo por envase de UNA unidad del producto — misma regla que computeEnvaseFee del backend:
 * FIXED usa el precio propio, INVENTORY el del insumo vinculado, NONE no cobra. */
function unitPackagingFee(product: Product): number {
  if (product.packagingMode === 'FIXED') return Number(product.packagingFeeBase ?? 0);
  if (product.packagingMode === 'INVENTORY') return Number(product.packagingItem?.salePriceBase ?? 0);
  return 0;
}

/** "12 min" / "1h 05min" desde que se abrió la cuenta — para las tarjetas de mesa. */
function elapsedSince(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

const PAYMENT_INTENT_OPTIONS: {
  value: PaymentIntent;
  label: string;
  description: string;
  icon: typeof Check;
  iconClass: string;
  activeClass: string;
  hoverClass: string;
}[] = [
  {
    value: 'FULL',
    label: 'Pagar completo',
    description: 'El cliente paga todo de una vez.',
    icon: Check,
    iconClass: 'text-emerald-600',
    activeClass: 'border-emerald-500 bg-emerald-50',
    hoverClass: 'hover:border-emerald-300',
  },
  {
    value: 'SPLIT',
    label: 'Pago fraccionado',
    description: 'El cliente abona en varias partes.',
    icon: SplitSquareHorizontal,
    iconClass: 'text-brand-500',
    activeClass: 'border-brand-500 bg-brand-500/5',
    hoverClass: 'hover:border-brand-300',
  },
  {
    value: 'DEBT',
    label: 'Deuda',
    description: 'Queda en cuentas por pagar, se cobra después.',
    icon: Clock,
    iconClass: 'text-amber-500',
    activeClass: 'border-amber-500 bg-amber-50',
    hoverClass: 'hover:border-amber-300',
  },
];

/** "Crear pedido" desde el Dashboard: wizard de 3 pasos (Menú → Pago → Clientes). */
export function CreateOrderDialog({ existingOrders, onClose, onCreated, onSelectExisting }: Props) {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [step, setStep] = useState<Step>(1);
  const [channel, setChannel] = useState<Channel>('DINE_IN');
  const [tableMode, setTableMode] = useState<TableMode>('OPEN');

  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [tables, setTables] = useState<AvailableTable[]>([]);
  const [tableId, setTableId] = useState('');
  // Cuando la mesa elegida ya tiene cuenta(s) abierta(s): a cuál se agrega, o 'new' para una independiente.
  const [accountChoice, setAccountChoice] = useState<string | 'new' | null>(null);
  const [customerAddress, setCustomerAddress] = useState('');
  const [addressCoords, setAddressCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [customerNote, setCustomerNote] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [optionsProduct, setOptionsProduct] = useState<Product | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryFeeBase, setDeliveryFeeBase] = useState<number | null>(null);
  const [quotingFee, setQuotingFee] = useState(false);
  // Envío escrito a mano: null = usar la cotización automática. Se guarda como texto para no
  // pelear con el input mientras se escribe (ej. "3." o campo vacío a medio borrar).
  const [manualFeeText, setManualFeeText] = useState<string | null>(null);
  const [rateBs, setRateBs] = useState<string | null>(null);
  const [addingToId, setAddingToId] = useState<string | null>(null);
  // En teléfono no cabe el panel lateral: la comanda se abre a pantalla completa desde la barra inferior.
  const [cartOpen, setCartOpen] = useState(false);

  const [paymentIntent, setPaymentIntent] = useState<PaymentIntent | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [existingSearch, setExistingSearch] = useState('');

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationError('Tu navegador no soporta geolocalización.');
      return;
    }
    setGettingLocation(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setAddressCoords({ lat: latitude, lng: longitude });
        // El campo de dirección nunca debe quedar vacío tras tomar la ubicación —
        // si no se había escrito nada, se rellena con la dirección legible (o, si
        // falla el reverse geocoding, con las coordenadas).
        if (!customerAddress.trim()) {
          setCustomerAddress(await reverseGeocode(latitude, longitude));
        }
        setGettingLocation(false);
      },
      () => {
        setLocationError('No se pudo obtener tu ubicación. Revisa los permisos del navegador.');
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  useEffect(() => {
    api.get('/products').then((res) => setProducts(res.data.data));
    api.get('/tables/floor-plan').then((res) => {
      const plan: FloorPlan = res.data.data;
      // No se ocultan las mesas ocupadas: elegir una con cuenta(s) abierta(s) permite añadir a una
      // de ellas o abrir una cuenta nueva e independiente (mesa con "varias cuentas").
      const zoned = plan.zones.flatMap((z) =>
        z.tables.map((t) => ({ id: t.id, number: t.number, zoneName: z.name, sessions: t.sessions })),
      );
      const unzoned = plan.unzoned.map((t) => ({ id: t.id, number: t.number, zoneName: null, sessions: t.sessions }));
      setTables([...zoned, ...unzoned]);
    });
    api
      .get('/public/exchange-rate')
      .then((res) => setRateBs(res.data.data?.[restaurant?.baseCurrency ?? 'USD']?.rateBs ?? null))
      .catch(() => setRateBs(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cotiza el envío en vivo apenas hay una ubicación de entrega, igual que el checkout público.
  // No pisa el monto si el cajero ya lo escribió a mano (manualFee !== null).
  useEffect(() => {
    if (channel !== 'DELIVERY' || !addressCoords || !restaurant) {
      setDeliveryFeeBase(null);
      return;
    }
    setQuotingFee(true);
    api
      .get(`/public/checkout/delivery/${restaurant.slug}/quote`, { params: addressCoords })
      .then((res) => setDeliveryFeeBase(Number(res.data.data.feeBase)))
      .catch(() => setDeliveryFeeBase(null))
      .finally(() => setQuotingFee(false));
  }, [addressCoords, channel, restaurant]);

  const categoryNames = useMemo(() => {
    const names = new Set(products.map((p) => p.category?.name ?? 'Sin categoría'));
    return [...names].sort((a, b) => a.localeCompare(b, 'es'));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    return products.filter((p) => {
      const matchesCategory = !categoryFilter || (p.category?.name ?? 'Sin categoría') === categoryFilter;
      const matchesSearch = !query || p.name.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [products, categoryFilter, productSearch]);

  const totalItems = lines.reduce((acc, l) => acc + l.quantity, 0);
  const subtotalBase = lines.reduce((acc, l) => acc + cartLineUnitPrice(l) * l.quantity, 0);
  const serviceChargeBase = restaurant?.serviceChargeEnabled ? subtotalBase * 0.1 : 0;
  const ivaBase = restaurant?.ivaEnabled ? subtotalBase * 0.16 : 0;

  // El envío que se va a cobrar: el escrito a mano si lo hay, si no la cotización automática.
  const manualFee = manualFeeText !== null && manualFeeText.trim() !== '' ? Number(manualFeeText) : null;
  const effectiveDeliveryFee =
    channel === 'DELIVERY' ? (manualFee != null && Number.isFinite(manualFee) ? manualFee : deliveryFeeBase ?? 0) : 0;

  // Envase (envase/caja/bolsa por producto): el servidor lo cobra en Delivery y Pickup, así que
  // el total de acá tiene que incluirlo o el cajero ve menos de lo que se termina cobrando.
  const envaseFeeBase =
    channel === 'DELIVERY' || channel === 'PICKUP'
      ? lines.reduce((acc, l) => acc + unitPackagingFee(l.product) * l.quantity, 0)
      : 0;

  const totalBase = subtotalBase + serviceChargeBase + ivaBase + effectiveDeliveryFee + envaseFeeBase;

  // Cuentas abiertas de canales sin mesa (Delivery/Pickup/Barra), ofrecidas en el paso "Clientes" (paso 3).
  const nonDineInExistingOrders = useMemo(() => existingOrders.filter((o) => o.channel !== 'DINE_IN'), [existingOrders]);

  function matchesSearch(o: ExistingOrderOption, query: string) {
    return (
      !query ||
      String(o.orderNumber).includes(query) ||
      o.customerName?.toLowerCase().includes(query) ||
      o.table?.number.toLowerCase().includes(query) ||
      CHANNEL_LABELS[o.channel].toLowerCase().includes(query)
    );
  }

  const filteredExistingOrders = useMemo(() => {
    const query = existingSearch.trim().toLowerCase();
    return nonDineInExistingOrders.filter((o) => matchesSearch(o, query));
  }, [nonDineInExistingOrders, existingSearch]);

  /** Línea armada en ProductOptionsDialog (con variante/modificadores elegidos): se fusiona con una idéntica si existe. */
  function addPickedLine(line: CartLine) {
    setLines((prev) => {
      const matchIndex = prev.findIndex(
        (l) =>
          l.product.id === line.product.id &&
          l.note === line.note &&
          l.variantId === line.variantId &&
          modifierSelectionKey(l.selectedModifiers) === modifierSelectionKey(line.selectedModifiers),
      );
      if (matchIndex === -1) return [...prev, line];
      const next = [...prev];
      next[matchIndex] = { ...next[matchIndex], quantity: next[matchIndex].quantity + line.quantity };
      return next;
    });
  }

  /** Ajusta la cantidad de una línea específica por índice (necesario porque un mismo producto puede tener varias líneas con distinta variante/modificadores). */
  const selectedTable = tables.find((t) => t.id === tableId);
  // "Abrir mesa": solo mesas sin ninguna cuenta activa, para arrancar una cuenta nueva.
  const freeTables = useMemo(() => tables.filter((t) => t.sessions.length === 0), [tables]);

  function adjustLineAt(index: number, delta: number) {
    setLines((prev) => {
      const next = [...prev];
      const newQty = next[index].quantity + delta;
      if (newQty <= 0) next.splice(index, 1);
      else next[index] = { ...next[index], quantity: newQty };
      return next;
    });
  }

  function goToStep2() {
    if (lines.length === 0) {
      setError('Agrega al menos un producto.');
      return;
    }
    if (channel === 'DINE_IN' && !tableId) {
      setError('Selecciona una mesa.');
      return;
    }
    if (channel === 'DINE_IN' && tableMode === 'OPEN' && selectedTable && selectedTable.sessions.length > 0 && !accountChoice) {
      setError('Esta mesa ya tiene cuenta(s) abierta(s): elige a cuál agregar, o abre una nueva.');
      return;
    }
    if (channel === 'DELIVERY' && !customerAddress.trim()) {
      setError('Escribe la dirección de entrega.');
      return;
    }
    setError(null);
    setStep(2);
  }

  async function submit() {
    if (!paymentIntent) {
      setError('Elige cómo se va a pagar.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await api.post('/orders/manual', {
        channel,
        tableId: channel === 'DINE_IN' ? tableId : undefined,
        // Mesa con varias cuentas abiertas: a cuál se agrega, o abre una nueva independiente.
        sessionId: channel === 'DINE_IN' && accountChoice && accountChoice !== 'new' ? accountChoice : undefined,
        openNewAccount: channel === 'DINE_IN' && accountChoice === 'new' ? true : undefined,
        items: lines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
          variantId: l.variantId,
          modifierIds: l.selectedModifiers.flatMap((m) => Array(m.quantity ?? 1).fill(m.modifierId)),
          note: l.note,
        })),
        // Nombre/cédula/teléfono ya no se piden en "Menú": vienen del cliente elegido en "Clientes".
        customerName: selectedCustomer?.name,
        customerIdNumber: selectedCustomer?.idNumber ?? undefined,
        customerPhone: selectedCustomer?.phone,
        customerAddress: channel === 'DELIVERY' ? customerAddress || selectedCustomer?.address || undefined : undefined,
        customerLat: channel === 'DELIVERY' ? addressCoords?.lat : undefined,
        customerLng: channel === 'DELIVERY' ? addressCoords?.lng : undefined,
        // Solo se manda si el cajero lo escribió: si no, el servidor lo cotiza como siempre.
        deliveryFeeBase: channel === 'DELIVERY' && manualFee != null ? manualFee : undefined,
        customerNote: customerNote.trim() || undefined,
        customerId: selectedCustomer?.id,
        paymentIntent,
      });
      const newOrder: LiveOrder = { ...res.data.data, payments: res.data.data.payments ?? [] };
      onCreated(newOrder, paymentIntent === 'FULL' ? 'full' : paymentIntent === 'SPLIT' ? 'split' : undefined);
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo crear el pedido.');
    } finally {
      setSending(false);
    }
  }

  /** Añade la comanda armada en "Menú" directamente a un pedido ya activo, sin perderla. */
  async function addToExisting(orderId: string) {
    if (lines.length === 0) return;
    setAddingToId(orderId);
    setError(null);
    try {
      // Secuencial: el backend recalcula el total del pedido a partir de todos sus ítems en cada llamada.
      for (const l of lines) {
        await api.post(`/orders/${orderId}/items`, {
          productId: l.product.id,
          quantity: l.quantity,
          variantId: l.variantId,
          modifierIds: l.selectedModifiers.flatMap((m) => Array(m.quantity ?? 1).fill(m.modifierId)),
          note: l.note,
        });
      }
      onCreated();
      onSelectExisting(orderId);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo añadir al pedido.');
    } finally {
      setAddingToId(null);
    }
  }

  const currentContextLabel =
    channel !== 'DINE_IN'
      ? CHANNEL_LABELS[channel]
      : tableMode === 'ADD'
        ? 'Abrir mesa'
        : selectedTable
          ? `${selectedTable.zoneName ? `${selectedTable.zoneName} · ` : ''}Mesa ${selectedTable.number}`
          : 'Nuevo pedido';

  const stepDots = (
    <div className="flex gap-1.5">
      {([1, 2, 3] as Step[]).map((s) => (
        <div
          key={s}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            step === s ? 'bg-brand-500' : step > s ? 'bg-emerald-500' : 'bg-brand-950/10'
          }`}
        />
      ))}
    </div>
  );

  const cartLinesList =
    lines.length === 0 ? (
      <p className="text-center text-brand-950/40 text-[13px] font-light py-10">
        Sin productos aún.
        <br />
        Toca un producto para añadirlo.
      </p>
    ) : (
      <ul>
        {lines.map((l, i) => {
          const unitPrice = cartLineUnitPrice(l);
          return (
            <li key={i} className="flex items-center gap-2.5 py-2.5 border-b border-brand-950/10">
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-semibold text-brand-950 truncate">
                  {l.quantity}x {l.product.name}
                  {l.variantName && <span className="text-brand-950/50 font-normal"> ({l.variantName})</span>}
                </p>
                {l.selectedModifiers.length > 0 && (
                  <p className="text-[11px] text-brand-950/50">{l.selectedModifiers.map(formatModifierLabel).join(', ')}</p>
                )}
                <p className="text-[11px] text-brand-950/40">{formatBase(unitPrice, symbol)} c/u</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => adjustLineAt(i, -1)}
                  className="w-6 h-6 rounded-full border border-brand-950/20 flex items-center justify-center font-bold text-brand-950 text-xs"
                >
                  −
                </button>
                <span className="w-4 text-center text-xs font-bold">{l.quantity}</span>
                <button
                  onClick={() => adjustLineAt(i, 1)}
                  className="w-6 h-6 rounded-full border border-brand-950/20 flex items-center justify-center font-bold text-brand-950 text-xs"
                >
                  +
                </button>
              </div>
              <span className="text-[12.5px] font-bold text-brand-950 w-14 text-right shrink-0">
                {formatBase(unitPrice * l.quantity, symbol)}
              </span>
            </li>
          );
        })}
      </ul>
    );

  const cartSummaryRows = (
    <>
      <div className="flex justify-between text-[12.5px] text-brand-950/60">
        <span>Subtotal</span>
        <span>{formatBase(subtotalBase, symbol)}</span>
      </div>
      {restaurant?.serviceChargeEnabled && (
        <div className="flex justify-between text-[12.5px] text-brand-950/60">
          <span>Servicio (10%)</span>
          <span>{formatBase(serviceChargeBase, symbol)}</span>
        </div>
      )}
      {restaurant?.ivaEnabled && (
        <div className="flex justify-between text-[12.5px] text-brand-950/60">
          <span>IVA (16%)</span>
          <span>{formatBase(ivaBase, symbol)}</span>
        </div>
      )}
      {channel === 'DELIVERY' && effectiveDeliveryFee > 0 && (
        <div className="flex justify-between text-[12.5px] text-brand-950/60">
          <span>Envío{manualFee != null ? ' (manual)' : ''}</span>
          <span>{formatBase(effectiveDeliveryFee, symbol)}</span>
        </div>
      )}
      {envaseFeeBase > 0 && (
        <div className="flex justify-between text-[12.5px] text-brand-950/60">
          <span>Envase</span>
          <span>{formatBase(envaseFeeBase, symbol)}</span>
        </div>
      )}
      {channel === 'DELIVERY' && quotingFee && <p className="text-[11px] text-brand-950/40">Calculando envío…</p>}
      <div className="flex justify-between text-base font-bold text-brand-950 pt-1.5">
        <span>Total</span>
        <span>{formatBase(totalBase, symbol)}</span>
      </div>
      {rateBs && (
        <div className="flex justify-between text-[11px] text-brand-950/40 -mt-1">
          <span>Equivalente</span>
          <span>{formatBs(totalBase, rateBs)}</span>
        </div>
      )}
    </>
  );

  const actionButtons = (
    <div className="flex gap-2 pt-2">
      {step > 1 && (
        <TextureButton variant="secondary" size="default" className="!w-auto" onClick={() => setStep((step - 1) as Step)}>
          Atrás
        </TextureButton>
      )}
      {step === 1 && (
        <TextureButton
          variant="brand"
          size="default"
          disabled={lines.length === 0}
          onClick={goToStep2}
          className="flex-1 disabled:opacity-50"
        >
          Siguiente
        </TextureButton>
      )}
      {step === 2 && (
        <TextureButton
          variant="brand"
          size="default"
          className="flex-1 disabled:opacity-50"
          disabled={!paymentIntent}
          onClick={() => setStep(3)}
        >
          Siguiente
        </TextureButton>
      )}
      {step === 3 && (
        <TextureButton
          variant="brand"
          size="default"
          className="flex-1 disabled:opacity-50"
          disabled={sending}
          onClick={submit}
        >
          {sending ? 'Creando…' : 'Crear pedido'}
        </TextureButton>
      )}
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-50 bg-[#f4f6f9] flex flex-col">
        {/* ---------- topline ---------- */}
        <div className="px-4 md:px-5 py-3 border-b border-brand-950/10 bg-white shrink-0 space-y-2 md:space-y-0 md:flex md:items-center md:gap-3">
          <div className="flex items-center gap-3 md:flex-1 md:min-w-0">
            <button
              type="button"
              onClick={() => (step > 1 ? setStep((step - 1) as Step) : onClose())}
              className="flex items-center justify-center h-9 w-9 rounded-xl border border-brand-950/10 text-brand-950 hover:bg-brand-950/5 shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-brand-950 truncate">Crear pedido</h1>
              <p className="text-xs text-brand-950/50 font-light truncate">
                {STEP_LABELS[step]}
                <span className="md:hidden"> · {currentContextLabel}</span>
              </p>
            </div>
          </div>
          {step === 1 && (
            <div className="flex gap-1 bg-brand-950/[0.05] p-1 rounded-xl overflow-x-auto md:shrink-0">
              {CHANNEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setChannel(opt.value)}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    channel === opt.value ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
                  }`}
                >
                  <opt.icon className="h-3.5 w-3.5" /> {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 flex min-h-0">
          {/* ---------- left: browse / steps ---------- */}
          <div className="flex-1 overflow-y-auto p-5 min-w-0">
            {step === 1 && (
              <div className="space-y-4">
                {channel === 'DINE_IN' && (
                  <div className="grid grid-cols-2 gap-2 max-w-sm">
                    <button
                      onClick={() => setTableMode('OPEN')}
                      className={`rounded-xl border py-2.5 text-sm font-semibold transition-colors ${
                        tableMode === 'OPEN'
                          ? 'border-brand-500 bg-brand-500/5 text-brand-500'
                          : 'border-brand-950/10 text-brand-950/60 hover:border-brand-950/20'
                      }`}
                    >
                      Añadir a mesa
                    </button>
                    <button
                      onClick={() => setTableMode('ADD')}
                      className={`rounded-xl border py-2.5 text-sm font-semibold transition-colors ${
                        tableMode === 'ADD'
                          ? 'border-brand-500 bg-brand-500/5 text-brand-500'
                          : 'border-brand-950/10 text-brand-950/60 hover:border-brand-950/20'
                      }`}
                    >
                      Abrir mesa
                    </button>
                  </div>
                )}

                {/* Añadir a mesa: se muestran TODAS las mesas en tarjetas — las libres para
                    abrir una cuenta nueva, y las ocupadas con cliente + tiempo abierto para
                    decidir de un vistazo a cuál añadir. */}
                {channel === 'DINE_IN' && tableMode === 'OPEN' && (
                  <div className="space-y-2">
                    {tables.length === 0 ? (
                      <p className="text-sm text-brand-950/40 font-light">No hay mesas disponibles.</p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-6 gap-2">
                        {tables.map((t) => {
                          const busy = t.sessions.length > 0;
                          const active = tableId === t.id;
                          const firstSession = t.sessions[0];
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                setTableId(t.id);
                                setAccountChoice(null);
                              }}
                              className={`rounded-xl border-2 px-2 py-2.5 text-left transition-colors ${
                                active
                                  ? 'border-brand-500 bg-brand-500/5'
                                  : busy
                                    ? 'border-amber-300/60 bg-amber-50/50 hover:border-amber-400'
                                    : 'border-brand-950/10 bg-white hover:border-brand-500/40'
                              }`}
                            >
                              <p className="text-sm font-bold text-brand-950 truncate">Mesa {t.number}</p>
                              {t.zoneName && <p className="text-[10px] text-brand-950/40 truncate">{t.zoneName}</p>}
                              {busy && firstSession ? (
                                <>
                                  <p className="text-[10px] font-semibold text-amber-600 truncate mt-0.5">
                                    {firstSession.customerName || 'Sin nombre'}
                                  </p>
                                  <p className="text-[10px] text-amber-600/70">
                                    {elapsedSince(firstSession.openedAt)}
                                    {t.sessions.length > 1 ? ` · ${t.sessions.length} cuentas` : ''}
                                  </p>
                                </>
                              ) : (
                                <p className="text-[10px] font-semibold mt-0.5 text-emerald-600">Libre</p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {selectedTable && selectedTable.sessions.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-brand-950/50">
                          Esta mesa ya tiene cuenta(s) abierta(s) — elige a cuál agregar, o abre una nueva:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedTable.sessions.map((s, i) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => setAccountChoice(s.id)}
                              className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                                accountChoice === s.id
                                  ? 'bg-brand-500 text-white'
                                  : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
                              }`}
                            >
                              {s.label ?? `Cuenta ${i + 1}`} · {formatBase(s.totalBase, symbol)}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setAccountChoice('new')}
                            className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                              accountChoice === 'new'
                                ? 'bg-brand-500 text-white'
                                : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
                            }`}
                          >
                            + Nueva cuenta
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Abrir mesa: mismas tarjetas que "Añadir a mesa", pero solo las libres —
                    esta pantalla es exclusivamente para arrancar una cuenta nueva. */}
                {channel === 'DINE_IN' && tableMode === 'ADD' && (
                  <div className="space-y-2">
                    {freeTables.length === 0 ? (
                      <p className="text-sm text-brand-950/40 font-light">Sin mesas disponibles.</p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-6 gap-2">
                        {freeTables.map((t) => {
                          const active = tableId === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setTableId(t.id)}
                              className={`rounded-xl border-2 px-2 py-2.5 text-left transition-colors ${
                                active
                                  ? 'border-brand-500 bg-brand-500/5'
                                  : 'border-brand-950/10 bg-white hover:border-brand-500/40'
                              }`}
                            >
                              <p className="text-sm font-bold text-brand-950 truncate">Mesa {t.number}</p>
                              {t.zoneName && <p className="text-[10px] text-brand-950/40 truncate">{t.zoneName}</p>}
                              <p className="text-[10px] font-semibold mt-0.5 text-emerald-600">Libre</p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {channel !== 'DINE_IN' && (
                  <div className="space-y-2 max-w-md">
                    {channel === 'DELIVERY' && (
                      <>
                        <AddressAutocomplete
                          value={customerAddress}
                          onChange={setCustomerAddress}
                          onSelect={(s) => {
                            setCustomerAddress(s.displayName);
                            setAddressCoords({ lat: s.lat, lng: s.lng });
                          }}
                          biasLat={restaurant?.deliveryOriginLat}
                          biasLng={restaurant?.deliveryOriginLng}
                          placeholder="Dirección de entrega *"
                          className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                        />
                        <div className="flex items-center gap-2 -mt-1">
                          <button
                            type="button"
                            onClick={useCurrentLocation}
                            disabled={gettingLocation}
                            className="flex items-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-400 disabled:opacity-50"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            {gettingLocation
                              ? 'Obteniendo ubicación…'
                              : addressCoords
                                ? 'Actualizar ubicación'
                                : 'Usar mi ubicación actual'}
                          </button>
                          {addressCoords && !gettingLocation && (
                            <span className="text-xs text-emerald-600 font-medium">✓ Ubicación agregada</span>
                          )}
                        </div>
                        {locationError && <p className="text-xs text-red-600 -mt-1">{locationError}</p>}

                        {/* Envío a mano: para pedidos por teléfono (sin GPS), direcciones fuera
                            de toda zona, o restaurantes que nunca configuraron tarifas — casos
                            donde el cálculo automático da 0 y no había forma de corregirlo. */}
                        <div className="rounded-xl border border-brand-950/10 bg-white px-3 py-2.5 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-brand-950">Costo de envío</span>
                            {quotingFee && <span className="text-[11px] text-brand-950/40">Calculando…</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-brand-950/50">{symbol}</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={manualFeeText ?? (deliveryFeeBase ?? 0).toFixed(2)}
                              onChange={(e) => setManualFeeText(e.target.value)}
                              className="w-28 text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                            />
                            {manualFeeText !== null && (
                              <button
                                type="button"
                                onClick={() => setManualFeeText(null)}
                                className="text-xs font-medium text-brand-500 hover:text-brand-400"
                              >
                                Volver al automático
                              </button>
                            )}
                          </div>
                          <p className="text-[11px] text-brand-950/40 font-light">
                            {manualFeeText !== null
                              ? 'Monto fijado a mano — se cobra este, no el calculado.'
                              : addressCoords
                                ? 'Calculado según la ubicación. Puedes escribirlo a mano si no aplica.'
                                : 'Sin ubicación no se puede calcular: escríbelo a mano si cobras envío.'}
                          </p>
                        </div>
                      </>
                    )}
                    <input
                      value={customerNote}
                      onChange={(e) => setCustomerNote(e.target.value)}
                      placeholder="Nota (opcional)"
                      className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2 sticky top-0 bg-[#f4f6f9] pt-1 pb-2 -mt-1 z-10">
                  <div className="relative flex-1 min-w-0 max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-950/30" />
                    <input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Buscar en el menú…"
                      className="w-full text-sm bg-white border border-brand-950/10 rounded-xl pl-8 pr-2.5 py-2"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setScanOpen(true)}
                    title="Escanear código de barras"
                    aria-label="Escanear código de barras"
                    className="shrink-0 flex items-center justify-center h-[38px] w-[38px] rounded-xl border border-brand-950/10 bg-white text-brand-950/50 hover:bg-brand-950/5 hover:text-brand-950"
                  >
                    <ScanLine className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    onClick={() => setCategoryFilter(null)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                      !categoryFilter ? 'bg-brand-950 text-white' : 'bg-white border border-brand-950/10 text-brand-950/50'
                    }`}
                  >
                    Todas
                  </button>
                  {categoryNames.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategoryFilter(c)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                        categoryFilter === c ? 'bg-brand-950 text-white' : 'bg-white border border-brand-950/10 text-brand-950/50'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5 pt-1">
                  {filteredProducts.map((p) => {
                    const qty = lines.filter((l) => l.product.id === p.id).reduce((acc, l) => acc + l.quantity, 0);
                    return (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => setOptionsProduct(p)}
                        className={`text-left bg-white rounded-2xl border-2 overflow-hidden transition-colors hover:border-brand-500/40 ${
                          qty > 0 ? 'border-brand-500' : 'border-transparent'
                        }`}
                      >
                        {p.photoUrl ? (
                          <div className="aspect-square w-full bg-brand-500/[0.04] flex items-center justify-center">
                            <img src={p.photoUrl} alt="" className="h-full w-full object-contain" />
                          </div>
                        ) : (
                          <div className="aspect-square w-full bg-brand-500/[0.06]" />
                        )}
                        <div className="px-3 py-2.5 space-y-1">
                          <p className="text-xs font-semibold text-brand-950 leading-tight line-clamp-2">{p.name}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-brand-500">{formatBase(p.price, symbol)}</span>
                            {qty > 0 && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-500 text-white">
                                {qty}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <p className="col-span-full text-sm text-brand-950/40 font-light text-center py-4">
                      No hay productos que coincidan.
                    </p>
                  )}
                </div>

              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-5 max-w-4xl mx-auto">
                <div className="rounded-2xl bg-white px-6 py-6 text-center shrink-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-950/40">Total del pedido</p>
                  <p className="text-5xl font-bold text-brand-950 mt-1.5">{formatBase(totalBase, symbol)}</p>
                  {rateBs && <p className="text-lg font-medium text-brand-950/50 mt-1">{formatBs(totalBase, rateBs)}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:flex-1 sm:min-h-0 sm:max-h-72">
                  {PAYMENT_INTENT_OPTIONS.map((opt) => {
                    const active = paymentIntent === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setPaymentIntent(opt.value)}
                        className={`flex flex-col items-center justify-center text-center gap-3 rounded-2xl border-2 p-5 min-h-[10rem] transition-colors ${
                          active ? opt.activeClass : `border-brand-950/10 bg-white ${opt.hoverClass}`
                        }`}
                      >
                        <opt.icon className={`h-10 w-10 shrink-0 ${opt.iconClass}`} />
                        <div>
                          <p className="text-lg font-bold text-brand-950">{opt.label}</p>
                          <p className="text-xs text-brand-950/50 mt-1">{opt.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-5 max-w-4xl mx-auto">
                <div className="rounded-2xl bg-white px-6 py-6 text-center shrink-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-950/40">Total del pedido</p>
                  <p className="text-5xl font-bold text-brand-950 mt-1.5">{formatBase(totalBase, symbol)}</p>
                  {rateBs && <p className="text-lg font-medium text-brand-950/50 mt-1">{formatBs(totalBase, rateBs)}</p>}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:flex-1 lg:min-h-0 lg:max-h-96">
                  <div className="rounded-2xl bg-white p-5 flex flex-col min-h-0">
                    <p className="text-base font-bold text-brand-950 mb-3 shrink-0">Cliente</p>
                    {selectedCustomer ? (
                      <div className="flex items-center justify-between rounded-xl border border-brand-950/10 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-brand-950 truncate">{selectedCustomer.name}</p>
                          <p className="text-xs text-brand-950/50 truncate">{selectedCustomer.phone}</p>
                        </div>
                        <button
                          onClick={() => setSelectedCustomer(null)}
                          className="text-xs font-semibold text-brand-500 hover:text-brand-600 shrink-0 ml-2"
                        >
                          Cambiar
                        </button>
                      </div>
                    ) : (
                      <div className="flex-1 min-h-0 overflow-y-auto">
                        <CustomerPicker onSelect={setSelectedCustomer} />
                      </div>
                    )}
                  </div>

                  {nonDineInExistingOrders.length > 0 && (
                    <div className="rounded-2xl bg-white p-5 flex flex-col min-h-0">
                      <p className="text-base font-bold text-brand-950 shrink-0">O añade a una cuenta abierta</p>
                      <p className="text-xs text-brand-950/50 font-light mt-0.5 mb-3 shrink-0">
                        En vez de crear un pedido nuevo, suma estos productos a uno ya activo.
                      </p>
                      <div className="relative shrink-0 mb-2">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-950/30" />
                        <input
                          value={existingSearch}
                          onChange={(e) => setExistingSearch(e.target.value)}
                          placeholder="Buscar por número, cliente o mesa…"
                          className="w-full text-sm border border-brand-950/15 rounded-lg pl-8 pr-2.5 py-2"
                        />
                      </div>
                      <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
                        {filteredExistingOrders.length === 0 && (
                          <p className="text-sm text-brand-950/40 font-light text-center py-3">No se encontraron pedidos.</p>
                        )}
                        {filteredExistingOrders.map((o) => (
                          <div
                            key={o.id}
                            className="w-full flex items-center gap-2 rounded-xl border border-brand-950/10 px-3 py-2 hover:border-brand-400/50 hover:bg-brand-950/[0.02] transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-brand-950">
                                #{o.orderNumber}
                                {o.customerName && <span className="font-normal text-brand-950/60"> · {o.customerName}</span>}
                              </p>
                              <p className="text-xs text-brand-950/40">
                                {CHANNEL_LABELS[o.channel]}
                                {o.table && ` ${o.table.number}`}
                              </p>
                            </div>
                            <TextureButton
                              variant="secondary"
                              size="sm"
                              className="!w-auto shrink-0 disabled:opacity-40"
                              disabled={addingToId !== null}
                              onClick={() => addToExisting(o.id)}
                            >
                              {addingToId === o.id ? 'Añadiendo…' : 'Agregar'}
                            </TextureButton>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ---------- right: cart panel (tablet/desktop) ---------- */}
          <div className="hidden md:flex w-[360px] shrink-0 border-l border-brand-950/10 bg-white flex-col">
            <div className="p-5 pb-3 border-b border-brand-950/10 space-y-2.5">
              <p className="text-[15px] font-bold text-brand-950">{currentContextLabel}</p>
              {stepDots}
            </div>
            <div className="flex-1 overflow-y-auto px-5">{cartLinesList}</div>
            <div className="p-5 pt-3 border-t border-brand-950/10 space-y-1.5">
              {cartSummaryRows}
              {error && <p className="text-[12.5px] text-red-600 pt-1">{error}</p>}
              {actionButtons}
            </div>
          </div>
        </div>

        {/* ---------- bottom bar (teléfono): resumen + acción ---------- */}
        <div className="md:hidden shrink-0 border-t border-brand-950/10 bg-white px-4 py-3 space-y-1.5">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="w-full flex items-center justify-between rounded-xl bg-brand-950/[0.04] px-3 py-2"
          >
            <span className="text-[12.5px] font-semibold text-brand-950">
              {totalItems === 0 ? 'Sin productos' : `${totalItems} ${totalItems === 1 ? 'ítem' : 'ítems'} · ver comanda`}
            </span>
            <span className="text-[13px] font-bold text-brand-950">{formatBase(totalBase, symbol)}</span>
          </button>
          {error && <p className="text-[12.5px] text-red-600">{error}</p>}
          {actionButtons}
        </div>
      </div>

      {/* ---------- comanda a pantalla completa (teléfono) ---------- */}
      {cartOpen && (
        <div className="md:hidden fixed inset-0 z-[60] bg-white flex flex-col">
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-brand-950/10 shrink-0">
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-brand-950 truncate">Comanda</p>
              <p className="text-xs text-brand-950/50 font-light truncate">{currentContextLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => setCartOpen(false)}
              className="shrink-0 flex items-center justify-center h-9 w-9 rounded-xl border border-brand-950/10 text-brand-950"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5">{cartLinesList}</div>
          <div className="px-5 py-4 border-t border-brand-950/10 space-y-1.5 shrink-0">
            {cartSummaryRows}
            <TextureButton variant="secondary" size="default" className="mt-2" onClick={() => setCartOpen(false)}>
              Volver al menú
            </TextureButton>
          </div>
        </div>
      )}

      {optionsProduct && (
        <ProductOptionsDialog
          product={optionsProduct}
          currencySymbol={symbol}
          onClose={() => setOptionsProduct(null)}
          onAdd={addPickedLine}
        />
      )}

      <ProductBarcodeScanDialog open={scanOpen} onOpenChange={setScanOpen} products={products} onFound={setOptionsProduct} />
    </>
  );
}
