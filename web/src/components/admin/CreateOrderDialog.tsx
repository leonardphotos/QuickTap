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
  const totalBase =
    subtotalBase + serviceChargeBase + ivaBase + (channel === 'DELIVERY' ? deliveryFeeBase ?? 0 : 0);

  // Cuentas de mesa abiertas, para "Añadir a mesa" (paso 1). El resto de canales (Delivery/Pickup/
  // Barra) se ofrecen en el paso "Clientes" (paso 3), como antes.
  const dineInExistingOrders = useMemo(() => existingOrders.filter((o) => o.channel === 'DINE_IN'), [existingOrders]);
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

  const filteredAddTableOrders = useMemo(() => {
    const query = existingSearch.trim().toLowerCase();
    return dineInExistingOrders.filter((o) => matchesSearch(o, query));
  }, [dineInExistingOrders, existingSearch]);

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
    if (channel === 'DINE_IN' && tableMode === 'OPEN' && !tableId) {
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
        ? 'Añadir a mesa'
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
      {channel === 'DELIVERY' && deliveryFeeBase != null && deliveryFeeBase > 0 && (
        <div className="flex justify-between text-[12.5px] text-brand-950/60">
          <span>Envío</span>
          <span>{formatBase(deliveryFeeBase, symbol)}</span>
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
      {step === 1 &&
        (channel === 'DINE_IN' && tableMode === 'ADD' ? (
          <p className="flex-1 text-center text-[11.5px] text-brand-950/40 font-light py-2.5">
            Elige una cuenta para añadir estos productos.
          </p>
        ) : (
          <TextureButton
            variant="brand"
            size="default"
            disabled={lines.length === 0}
            onClick={goToStep2}
            className="flex-1 disabled:opacity-50"
          >
            Siguiente
          </TextureButton>
        ))}
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
                  <div className="grid grid-cols-2 gap-1.5 max-w-xs">
                    <button
                      onClick={() => setTableMode('OPEN')}
                      className={`rounded-xl border py-2 text-xs font-medium transition-colors ${
                        tableMode === 'OPEN'
                          ? 'border-brand-500 bg-brand-500/5 text-brand-500'
                          : 'border-brand-950/10 text-brand-950/60 hover:border-brand-950/20'
                      }`}
                    >
                      Abrir mesa
                    </button>
                    <button
                      onClick={() => setTableMode('ADD')}
                      className={`rounded-xl border py-2 text-xs font-medium transition-colors ${
                        tableMode === 'ADD'
                          ? 'border-brand-500 bg-brand-500/5 text-brand-500'
                          : 'border-brand-950/10 text-brand-950/60 hover:border-brand-950/20'
                      }`}
                    >
                      Añadir a mesa
                    </button>
                  </div>
                )}

                {channel === 'DINE_IN' && tableMode === 'OPEN' && (
                  <div className="space-y-2 max-w-md">
                    <select
                      value={tableId}
                      onChange={(e) => {
                        setTableId(e.target.value);
                        setAccountChoice(null);
                      }}
                      className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                    >
                      <option value="">{tables.length === 0 ? 'No hay mesas disponibles' : 'Selecciona una mesa…'}</option>
                      {tables.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.zoneName ? `${t.zoneName} · ` : ''}Mesa {t.number}
                          {t.sessions.length > 0 ? ` (${t.sessions.length} cuenta${t.sessions.length > 1 ? 's' : ''})` : ''}
                        </option>
                      ))}
                    </select>

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

                <div className="grid grid-cols-2 xl:grid-cols-3 gap-3.5 pt-1">
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
                          <img src={p.photoUrl} alt="" className="h-24 w-full object-cover" />
                        ) : (
                          <div className="h-24 w-full bg-brand-500/[0.06]" />
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

                {channel === 'DINE_IN' && tableMode === 'ADD' && (
                  <div className="space-y-2 pt-3 border-t border-brand-950/10">
                    <p className="text-sm font-medium text-brand-950/70">Elige la cuenta de mesa a la que añadir</p>
                    <div className="relative max-w-md">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-950/30" />
                      <input
                        value={existingSearch}
                        onChange={(e) => setExistingSearch(e.target.value)}
                        placeholder="Buscar por número, cliente o mesa…"
                        className="w-full text-sm border border-brand-950/15 rounded-lg pl-8 pr-2.5 py-1.5"
                      />
                    </div>
                    <div className="space-y-2 max-w-md">
                      {filteredAddTableOrders.length === 0 && (
                        <p className="text-sm text-brand-950/40 font-light text-center py-3">
                          No hay cuentas de mesa abiertas.
                        </p>
                      )}
                      {filteredAddTableOrders.map((o) => (
                        <div
                          key={o.id}
                          className="w-full flex items-center gap-2 rounded-xl border border-brand-950/10 bg-white px-3 py-2"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-brand-950">
                              #{o.orderNumber}
                              {o.customerName && <span className="font-normal text-brand-950/60"> · {o.customerName}</span>}
                            </p>
                            <p className="text-xs text-brand-950/40">{o.table && `Mesa ${o.table.number}`}</p>
                          </div>
                          <TextureButton
                            variant="secondary"
                            size="sm"
                            className="!w-auto shrink-0 disabled:opacity-40"
                            disabled={lines.length === 0 || addingToId !== null}
                            onClick={() => addToExisting(o.id)}
                          >
                            {addingToId === o.id ? 'Añadiendo…' : 'Agregar a la cuenta'}
                          </TextureButton>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="max-w-md space-y-3">
                <div className="flex items-center justify-between text-sm bg-white rounded-xl px-3 py-2.5">
                  <span className="text-brand-950/60">Total del pedido</span>
                  <span className="font-semibold text-brand-950">{formatBase(totalBase, symbol)}</span>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={() => setPaymentIntent('FULL')}
                    className={`w-full flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors ${
                      paymentIntent === 'FULL' ? 'border-emerald-500 bg-emerald-50' : 'border-brand-950/10 hover:border-emerald-300'
                    }`}
                  >
                    <Check className="h-5 w-5 text-emerald-600 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-brand-950">Pagar completo</p>
                      <p className="text-xs text-brand-950/50">El cliente paga todo de una vez.</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setPaymentIntent('SPLIT')}
                    className={`w-full flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors ${
                      paymentIntent === 'SPLIT' ? 'border-brand-500 bg-brand-500/5' : 'border-brand-950/10 hover:border-brand-300'
                    }`}
                  >
                    <SplitSquareHorizontal className="h-5 w-5 text-brand-500 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-brand-950">Pago fraccionado</p>
                      <p className="text-xs text-brand-950/50">El cliente abona en varias partes.</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setPaymentIntent('DEBT')}
                    className={`w-full flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors ${
                      paymentIntent === 'DEBT' ? 'border-amber-500 bg-amber-50' : 'border-brand-950/10 hover:border-amber-300'
                    }`}
                  >
                    <Clock className="h-5 w-5 text-amber-500 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-brand-950">Deuda</p>
                      <p className="text-xs text-brand-950/50">Queda en cuentas por pagar, se cobra después.</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="max-w-md space-y-3">
                <div>
                  <p className="text-sm font-medium text-brand-950/70 mb-2">Cliente</p>
                  {selectedCustomer ? (
                    <div className="flex items-center justify-between rounded-lg border border-brand-950/10 px-2.5 py-2">
                      <div>
                        <p className="text-sm font-medium text-brand-950">{selectedCustomer.name}</p>
                        <p className="text-xs text-brand-950/50">{selectedCustomer.phone}</p>
                      </div>
                      <button
                        onClick={() => setSelectedCustomer(null)}
                        className="text-xs font-medium text-brand-500 hover:text-brand-600"
                      >
                        Cambiar
                      </button>
                    </div>
                  ) : (
                    <CustomerPicker onSelect={setSelectedCustomer} />
                  )}
                </div>

                {nonDineInExistingOrders.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-brand-950/10">
                    <p className="text-sm font-medium text-brand-950/70">O añade este pedido a una cuenta abierta</p>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-950/30" />
                      <input
                        value={existingSearch}
                        onChange={(e) => setExistingSearch(e.target.value)}
                        placeholder="Buscar por número, cliente o mesa…"
                        className="w-full text-sm border border-brand-950/15 rounded-lg pl-8 pr-2.5 py-1.5"
                      />
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
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
                            {addingToId === o.id ? 'Añadiendo…' : 'Agregar a la cuenta'}
                          </TextureButton>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
