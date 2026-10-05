import { productNeedsOptions } from '@/utils/productNeedsOptions';
import { manualOrderNeedsCustomer, manualOrderError } from '@/utils/manual-order-validation';
import { OrderMenuCatalog } from './OrderMenuCatalog';
import { SendOrderToKitchenDialog } from './SendOrderToKitchenDialog';
import { api } from '@/api/client';
import { hasOrderDraftContent, listOrderDrafts, ownsOrderDraft, orderDraftKey, readOrderDraft, removeOrderDraft, saveOrderDraft, type OrderDraft } from '@/utils/order-draft';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { reverseGeocode } from '@/components/AddressAutocomplete.shared';
import { TextureButton } from '@/components/ui/texture-button';
import { useAuth } from '@/context/AuthContext.shared';
import type { CartLine,Customer,FloorPlan,ModifierCategory,Product,TableSession } from '@/types';
import { CURRENCY_SYMBOLS,cartLineUnitPrice,formatBase,formatBs,formatModifierLabel,modifierSelectionKey } from '@/utils/format';
import { quickTapTileDefinition } from '@/utils/map-tiles';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
ArrowLeft,
Bike,
Check,
ChevronRight,
Clock,
MapPin,
Plus,
Martini,
Search,
SplitSquareHorizontal,
Store,
UserRound,
UtensilsCrossed,
X,
Zap,
} from 'lucide-react';
import { useEffect,useMemo,useRef,useState } from 'react';
import { CustomerPicker, type CustomerPickerHandle } from './CustomerPicker';
import type { LiveOrder } from './LiveOrdersPanel.shared';
import { ProductOptionsDialog } from './ProductOptionsDialog';

interface ExistingOrderOption {
  id: string;
  orderNumber: number;
  channel: 'DINE_IN' | 'DELIVERY' | 'PICKUP' | 'BAR' | 'EXPRESS';
  customerName: string | null;
  table: { number: string } | null;
}

interface Props {
  resumeDraftKey?: string;
  freshDraft?: boolean;
  existingOrders: ExistingOrderOption[];
  onClose: () => void;
  /** Pedido nuevo creado: si venía con intención de pago (FULL/SPLIT), el padre debe abrir PaymentDialog. */
  onCreated: (newOrder?: LiveOrder, paymentMode?: 'full' | 'split') => void;
  onSelectExisting: (orderId: string) => void;
  employeeConsumption?: boolean;
  /** Abre el mismo flujo de Crear pedido desde una mesa puntual. Al terminar, la comanda
   * va directo a cocina y la cuenta queda abierta, igual que el flujo de Sala. */
  initialTableId?: string;
  initialNewAccount?: boolean;
}

type Channel = 'DINE_IN' | 'DELIVERY' | 'PICKUP' | 'BAR' | 'EXPRESS';
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
  { value: 'EXPRESS', label: 'Express', icon: Zap },
  { value: 'BAR', label: 'Barra', icon: Martini },
  { value: 'DELIVERY', label: 'Delivery', icon: Bike },
  { value: 'PICKUP', label: 'Pick-up', icon: Store },
];

const CHANNEL_LABELS: Record<Channel, string> = {
  DINE_IN: 'Mesa',
  DELIVERY: 'Delivery',
  PICKUP: 'Pickup',
  BAR: 'Barra',
  EXPRESS: 'Express',
};

/**
 * Express no pasa por la pantalla de Cliente: es una venta al paso, se cobra y se va. Pedirle
 * nombre y teléfono a quien compra un café en el mostrador solo agrega un toque de más por
 * venta. Barra sí la conserva, porque ahí a veces se abre una cuenta a nombre de alguien.
 */

const STEP_LABELS: Record<Step, string> = { 1: 'Cliente', 2: 'Menú', 3: 'Pago' };

/** Vista rápida del punto de entrega. No permite editar zonas: solo confirma visualmente que la
 * dirección elegida corresponde al lugar que verá el repartidor. */
function DeliveryLocationPreview({
  coords,
  origin,
  onSelect,
}: {
  coords: { lat: number; lng: number } | null;
  origin: { lat: number | null | undefined; lng: number | null | undefined };
  onSelect: (coords: { lat: number; lng: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pointsRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false }).setView([10.4806, -66.9036], 12);
    const [tileUrl, tileOptions] = quickTapTileDefinition();
    L.tileLayer(tileUrl, tileOptions).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    pointsRef.current = L.layerGroup().addTo(map);
    // Un punto único: cada toque reemplaza el anterior para que la coordenada que se cobra
    // siempre sea exactamente la que el cajero dejó marcada.
    map.on('click', (event: L.LeafletMouseEvent) => {
      onSelectRef.current({ lat: event.latlng.lat, lng: event.latlng.lng });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const points = pointsRef.current;
    if (!map || !points) return;
    points.clearLayers();
    const originPoint = origin.lat != null && origin.lng != null ? L.latLng(origin.lat, origin.lng) : null;
    const customerPoint = coords ? L.latLng(coords.lat, coords.lng) : null;

    if (originPoint) L.circleMarker(originPoint, { radius: 6, color: '#082b5b', fillColor: '#082b5b', fillOpacity: 1, weight: 2 }).bindTooltip('Local').addTo(points);
    if (customerPoint) L.circleMarker(customerPoint, { radius: 8, color: '#ffffff', fillColor: '#1598f2', fillOpacity: 1, weight: 3 }).bindTooltip('Entrega').addTo(points);

    if (originPoint && customerPoint) map.fitBounds(L.latLngBounds([originPoint, customerPoint]), { padding: [28, 28], maxZoom: 15 });
    else if (customerPoint) map.setView(customerPoint, 15);
    else if (originPoint) map.setView(originPoint, 14);
  }, [coords, origin.lat, origin.lng]);

  return (
    <section className="overflow-hidden rounded-2xl border border-brand-950/10 bg-white shadow-sm min-h-[240px]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-brand-950/[0.06]">
        <span className="text-xs font-semibold text-brand-950">Ubicación de entrega</span>
        <span className={`text-[11px] font-medium ${coords ? 'text-emerald-600' : 'text-brand-950/40'}`}>{coords ? 'Punto seleccionado' : 'Toca el mapa para marcar'}</span>
      </div>
      <div ref={containerRef} className="h-[210px] w-full" aria-label="Mapa de ubicación de entrega" />
    </section>
  );
}

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
export function CreateOrderDialog({
  existingOrders,
  onClose,
  onCreated,
  onSelectExisting,
  employeeConsumption = false,
  initialTableId,
  initialNewAccount = false,
  resumeDraftKey,
  freshDraft = false,
}: Props) {
  const { restaurant, user } = useAuth();
  const contextKey = orderDraftKey(restaurant?.id ?? '', user?.id ?? '', initialTableId, employeeConsumption, initialNewAccount);
  const [draftAtOpen] = useState(() => {
    const existing = !freshDraft ? listOrderDrafts(restaurant?.id ?? '', user?.id ?? '').find(d => d.key === contextKey || d.key.startsWith(`${contextKey}:`))?.key : undefined;
    const requested = resumeDraftKey && ownsOrderDraft(resumeDraftKey, restaurant?.id ?? '', user?.id ?? '') ? resumeDraftKey : undefined;
    // El relay puede abrirse por HTTP en la red local, donde randomUUID no está disponible.
    const draftId = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const key = requested || existing || `${contextKey}:${draftId}`;
    return { key, contextKey, data: readOrderDraft(key) };
  });
  const draftKey = draftAtOpen.contextKey === contextKey ? draftAtOpen.key : contextKey;
  const restoredDraft = draftAtOpen.data;
  const draftCompleted = useRef(false);
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);
  const [isEmployeeConsumption, setIsEmployeeConsumption] = useState(() => restoredDraft ? restoredDraft.isEmployeeConsumption : (employeeConsumption));
  const [employees, setEmployees] = useState<{ id: string; name: string; role: string }[]>([]);
  const [employeeConsumerId, setEmployeeConsumerId] = useState(() => restoredDraft ? restoredDraft.employeeConsumerId : (''));
  useEffect(() => { if (isEmployeeConsumption) api.get('/team/consumption-users').then((r) => setEmployees(r.data.data)).catch(() => setEmployees([])); }, [isEmployeeConsumption]);
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [step, setStep] = useState<Step>(() => restoredDraft ? restoredDraft.step : (1));
  const [channel, setChannel] = useState<Channel>(() => restoredDraft ? restoredDraft.channel : ('DINE_IN'));
  // Qué canales ofrece este restaurante (ver availableChannels en el backend). Hasta que
  // responda queda null y se muestran todos: es preferible ofrecer de más por un instante
  // que parpadear escondiendo el canal que el cajero iba a tocar.
  const [canales, setCanales] = useState<Record<Channel, boolean> | null>(null);
  const [tableMode, setTableMode] = useState<TableMode>(() => restoredDraft ? restoredDraft.tableMode : ('OPEN'));

  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [internalModifierCategories, setInternalModifierCategories] = useState<ModifierCategory[]>([]);
  const [tables, setTables] = useState<AvailableTable[]>([]);
  const [tableId, setTableId] = useState(() => restoredDraft ? restoredDraft.tableId : (initialTableId ?? ''));
  // El selector de mesas es una ventana aparte: con 30 mesas en pantalla, la cuadrícula se
  // comía el paso entero y no se veía ni qué se estaba eligiendo. Se abre, se elige, se cierra.
  const [mostrarMesas, setMostrarMesas] = useState(false);
  // Cuando la mesa elegida ya tiene cuenta(s) abierta(s): a cuál se agrega, o 'new' para una independiente.
  const [accountChoice, setAccountChoice] = useState<string | 'new' | null>(() => restoredDraft ? restoredDraft.accountChoice : (initialNewAccount ? 'new' : null));
  const [accountLabel, setAccountLabel] = useState(() => restoredDraft ? restoredDraft.accountLabel : (''));
  const [customerAddress, setCustomerAddress] = useState(() => restoredDraft ? restoredDraft.customerAddress : (''));
  const [addressCoords, setAddressCoords] = useState<{ lat: number; lng: number } | null>(() => restoredDraft ? restoredDraft.addressCoords : (null));
  const [gettingLocation, setGettingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [customerNote, setCustomerNote] = useState(() => restoredDraft ? restoredDraft.customerNote : (''));
  const [couriers, setCouriers] = useState<Array<{ id: string; name: string; availableInApp: boolean; nextInTurn: boolean }>>([]);
  const [deliveryCourierId, setDeliveryCourierId] = useState(() => restoredDraft ? restoredDraft.deliveryCourierId : (''));
  const [courierError, setCourierError] = useState<string | null>(null);
  const [loadingCouriers, setLoadingCouriers] = useState(false);
  useEffect(() => {
    if (channel !== 'DELIVERY') return;
    let active = true;
    setLoadingCouriers(true);
    setCourierError(null);
    api.get('/delivery-couriers').then((response) => {
      if (active) setCouriers(response.data.data.filter((c: { availableInApp: boolean }) => c.availableInApp));
    }).catch(() => {
      if (active) setCourierError('No se pudieron cargar los motorizados. Vuelve a seleccionar Delivery para reintentar.');
    }).finally(() => { if (active) setLoadingCouriers(false); });
    return () => { active = false; };
  }, [channel]);
  const [lines, setLines] = useState<CartLine[]>(() => restoredDraft ? restoredDraft.lines : ([]));
  const [optionsProduct, setOptionsProduct] = useState<Product | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryFeeBase, setDeliveryFeeBase] = useState<number | null>(null);
  const [quotingFee, setQuotingFee] = useState(false);
  const [deliveryQuoteError, setDeliveryQuoteError] = useState<string | null>(null);
  // Envío escrito a mano: null = usar la cotización automática. Se guarda como texto para no
  // pelear con el input mientras se escribe (ej. "3." o campo vacío a medio borrar).
  const [manualFeeText, setManualFeeText] = useState<string | null>(() => restoredDraft ? restoredDraft.manualFeeText : (null));
  const [rateBs, setRateBs] = useState<string | null>(null);
  const [addingToId, setAddingToId] = useState<string | null>(null);
  // En teléfono no cabe el panel lateral: la comanda se abre a pantalla completa desde la barra inferior.
  const [cartOpen, setCartOpen] = useState(false);

  const [paymentIntent, setPaymentIntent] = useState<PaymentIntent | null>(() => restoredDraft ? restoredDraft.paymentIntent : (null));
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(() => restoredDraft ? restoredDraft.selectedCustomer : (null));
  const customerPickerRef = useRef<CustomerPickerHandle>(null);
  const resolvingCustomer = useRef(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  async function continueFromCustomer() {
    if (resolvingCustomer.current) return;
    resolvingCustomer.current = true; setSavingCustomer(true);
    try {
      if (!selectedCustomer) {
        const customer = await customerPickerRef.current?.resolve();
        if (customer) setSelectedCustomer(customer);
        else if (!isEmployeeConsumption && manualOrderNeedsCustomer(channel)) {
          setError(`Para ${CHANNEL_LABELS[channel]}, elige o crea un cliente antes de continuar.`);
          return;
        }
      }
      setError(null);
      setStep(2);
    } catch { /* El buscador conserva el nombre y muestra el error. */ }
    finally { resolvingCustomer.current = false; setSavingCustomer(false); }
  }
  const [existingSearch, setExistingSearch] = useState('');
  const [showOpenAccounts, setShowOpenAccounts] = useState(false);
  // Factura fiscal (paso Cliente): sin esto la factura sale a nombre de "Consumidor Final"
  // (ver fiscal-invoicing.service.ts) — solo aplica cuando NO es delivery, que ya manda su
  // propia dirección de entrega como customerAddress.
  const [wantsFiscalInvoice, setWantsFiscalInvoice] = useState(() => restoredDraft ? restoredDraft.wantsFiscalInvoice : (false));
  const [fiscalIdNumber, setFiscalIdNumber] = useState(() => restoredDraft ? restoredDraft.fiscalIdNumber : (''));
  const [fiscalAddress, setFiscalAddress] = useState(() => restoredDraft ? restoredDraft.fiscalAddress : (''));
  const directKitchenTableOrder = Boolean(initialTableId);

  const draftSnapshot = useMemo<OrderDraft>(() => ({ step, channel, tableMode, tableId, accountChoice, accountLabel,
    lines, selectedCustomer, customerAddress, customerNote, addressCoords, deliveryCourierId, manualFeeText,
    paymentIntent, paymentMethod: '', isEmployeeConsumption, employeeConsumerId, wantsFiscalInvoice, fiscalIdNumber, fiscalAddress,
  }), [step, channel, tableMode, tableId, accountChoice, accountLabel, lines, selectedCustomer, customerAddress,
    customerNote, addressCoords, deliveryCourierId, manualFeeText, paymentIntent, isEmployeeConsumption,
    employeeConsumerId, wantsFiscalInvoice, fiscalIdNumber, fiscalAddress]);
  useEffect(() => {
    // Sin temporizador: cada cambio se guarda antes de salir o recargar.
    if (!restaurant?.id || !user?.id || draftAtOpen.key !== draftKey || draftCompleted.current) return;
    setDraftSaveFailed(!saveOrderDraft(draftKey, draftSnapshot));
  }, [draftSnapshot, draftKey, draftAtOpen.key, restaurant?.id, user?.id]);
  useEffect(() => {
    // Si cambia el usuario, restaurante o contexto, no reutilizar el pedido del anterior.
    if (draftAtOpen.key !== draftKey) onClose();
  }, [draftAtOpen.key, draftKey, onClose]);

  function closeKeepingDraft() {
    if (sending || addingToId) return;
    if (!draftCompleted.current && draftAtOpen.key === draftKey && !saveOrderDraft(draftKey, draftSnapshot)) {
      setDraftSaveFailed(true);
      if (!window.confirm('No se pudo guardar el borrador en este dispositivo. Si sales podrías perderlo. ¿Salir de todos modos?')) return;
    }
    onClose();
  }
  function finishDraft() {
    draftCompleted.current = true;
    removeOrderDraft(draftAtOpen.key);
  }
  function discardDraft() {
    if (sending || addingToId || !window.confirm('¿Descartar este borrador? Sus productos y datos se perderán.')) return;
    if (!removeOrderDraft(draftAtOpen.key)) { setDraftSaveFailed(true); return; }
    draftCompleted.current = true;
    onClose();
  }
  function validateRestoredDraft() {
    if (!restoredDraft) return true;
    if (!productsLoaded) { setError('Espera a que cargue el catálogo para revisar el borrador.'); return false; }
    const unavailable = lines.find(line => !line.product.id.startsWith('modifier:') && !products.some(product => product.id === line.product.id && product.isAvailable !== false));
    if (unavailable) { setError(`Revisa «${unavailable.product.name}»: ya no está disponible. Retíralo del borrador antes de confirmar.`); return false; }
    return true;
  }

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

  const opcionesCanal = useMemo(
    () => (canales ? CHANNEL_OPTIONS.filter((o) => canales[o.value]) : CHANNEL_OPTIONS),
    [canales],
  );

  // Si el canal elegido no lo ofrece este restaurante (arranca en Mesa y resulta que no tiene
  // mesas), se cae al primero disponible en vez de dejar el selector marcando algo imposible.
  useEffect(() => {
    if (!canales || canales[channel]) return;
    const primero = opcionesCanal[0]?.value;
    if (primero) setChannel(primero);
  }, [canales, channel, opcionesCanal]);

  // OJO: no saltar automáticamente al menú cuando el canal quede en Express. Antes había un
  // efecto que lo hacía, y en un restaurante sin canal Mesa el fallback de arriba dejaba el
  // canal en Express y el diálogo abría directo en el menú vacío ("Sin productos aún"),
  // saltándose la pantalla de Cliente / Pedido Express. El salto a Express es solo explícito:
  // el botón "Pedido Express" del paso Cliente ya hace su propio setStep(2).

  useEffect(() => {
    api.get('/products').then((res) => {
      const currentProducts: Product[] = res.data.data;
      setProducts(currentProducts);
      setProductsLoaded(true);
      if (restoredDraft) setLines(current => current.map(line => {
        const product = currentProducts.find(item => item.id === line.product.id);
        if (!product) return line; // No borrar elecciones: se pide revisarlas antes de enviar.
        const modifiers = product.modifierCategories?.flatMap(category => category.modifiers) ?? [];
        return { ...line, product, selectedModifiers: line.selectedModifiers.map(selected => {
          const modifier = modifiers.find(item => item.id === selected.modifierId);
          return modifier ? { ...selected, name: modifier.name, priceBase: String(Math.max(0, Number(modifier.priceBase) - Number(modifier.discountBase ?? 0))) } : selected;
        }) };
      }));
    }).catch(() => setError('No se pudo cargar el catálogo. Tu borrador se conserva; vuelve a abrir el pedido para reintentar.'));
    if (employeeConsumption) {
      api.get('/modifier-categories').then((res) => setInternalModifierCategories(res.data.data)).catch(() => setInternalModifierCategories([]));
    }
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
      .get('/orders/channels')
      .then((res) => setCanales(res.data.data))
      .catch(() => setCanales(null));
    api
      .get('/public/exchange-rate')
      .then((res) => setRateBs(res.data.data?.[restaurant?.baseCurrency ?? 'USD']?.rateBs ?? null))
      .catch(() => setRateBs(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const standaloneModifiers = useMemo(
    () => internalModifierCategories.flatMap((category) => category.modifiers
      .filter((modifier) => modifier.isAvailable !== false)
      .map((modifier) => ({ ...modifier, categoryName: category.name }))),
    [internalModifierCategories],
  );

  function addStandaloneModifier(modifier: (typeof standaloneModifiers)[number]) {
    const unitPrice = Math.max(0, Number(modifier.priceBase) - Number(modifier.discountBase ?? 0));
    const syntheticProduct = {
      id: `modifier:${modifier.id}`, categoryId: 'internal-extras', name: modifier.name,
      price: unitPrice.toFixed(2), costSource: 'MANUAL', isAvailable: true,
      isStar: false, isPromo: false, isHouseSpecial: false, priority: 0,
      category: { id: 'internal-extras', name: modifier.categoryName },
    } as Product;
    addPickedLine({ product: syntheticProduct, quantity: 1, selectedModifiers: [] });
  }

  // Cotiza el envío en vivo apenas hay una ubicación de entrega, igual que el checkout público.
  // No pisa el monto si el cajero ya lo escribió a mano (manualFee !== null).
  useEffect(() => {
    if (channel !== 'DELIVERY' || !addressCoords || !restaurant) {
      setDeliveryFeeBase(null);
      setDeliveryQuoteError(null);
      return;
    }
    setQuotingFee(true);
    setDeliveryQuoteError(null);
    api
      .get(`/public/checkout/delivery/${restaurant.slug}/quote`, { params: addressCoords })
      .then((res) => setDeliveryFeeBase(Number(res.data.data.feeBase)))
      .catch((err) => {
        setDeliveryFeeBase(null);
        setDeliveryQuoteError(err.response?.data?.error ?? 'No se pudo calcular el envío.');
      })
      .finally(() => setQuotingFee(false));
  }, [addressCoords, channel, restaurant]);

  const totalItems = lines.reduce((acc, l) => acc + l.quantity, 0);
  const subtotalBase = lines.reduce((acc, l) => acc + cartLineUnitPrice(l) * l.quantity, 0);
  // Si la sesión aún no recibió la lista (pestaña abierta antes de esta mejora), conserva el
  // comportamiento histórico: el 10% aplica en todos los canales hasta refrescar.
  const internalConsumption = isEmployeeConsumption || selectedCustomer?.isPartner;
  const appliesServiceCharge = !internalConsumption && restaurant?.serviceChargeEnabled && (restaurant.serviceChargeChannels?.includes(channel) ?? true);
  const ivaBase = !internalConsumption && restaurant?.ivaEnabled ? subtotalBase * 0.16 : 0;
  // El 10% se calcula luego de sumar el IVA, igual que en el servidor.
  const serviceChargeBase = appliesServiceCharge ? Math.round((subtotalBase + ivaBase) * 0.1 * 100) / 100 : 0;

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
  // Las dos listas son disjuntas a propósito: cada modo hace una cosa sola, así que mostrar
  // mesas que no sirven para lo que se está haciendo solo agrega ruido y errores.
  // Se muestran juntas las mesas libres y ocupadas. El sistema decide el flujo al tocarlas:
  // una libre abre su primera cuenta; una ocupada deja elegir una existente o crear otra.
  const tablesForMode = tables;

  function adjustLineAt(index: number, delta: number) {
    setLines((prev) => {
      const next = [...prev];
      const newQty = next[index].quantity + delta;
      if (newQty <= 0) next.splice(index, 1);
      else next[index] = { ...next[index], quantity: newQty };
      return next;
    });
  }

  function goToPayment() {
    if (!validateCustomerForChannel()) return;
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
    // Desde Sala una cuenta de mesa se abre para seguir comandando: no se cobra en este
    // momento. Mantiene el mismo lienzo de Crear pedido, pero su acción final es cocina.
    if (directKitchenTableOrder && channel === 'DINE_IN') {
      void submit();
      return;
    }
    setStep(3);
  }

  const [createdOrder, setCreatedOrder] = useState<LiveOrder | null>(null);

  function validateCustomerForChannel() {
    if (!isEmployeeConsumption && manualOrderNeedsCustomer(channel) && !selectedCustomer) {
      setError(`Para ${CHANNEL_LABELS[channel]}, elige o crea un cliente. Para vender sin datos del cliente, selecciona Pedido Express.`);
      setStep(1);
      return false;
    }
    return true;
  }

  function selectChannel(next: Channel) {
    setChannel(next);
    setError(null);
    if (!isEmployeeConsumption && manualOrderNeedsCustomer(next) && !selectedCustomer) {
      setStep(1);
    }
  }

  async function submit() {
    if (sending || addingToId || draftCompleted.current) return;
    if (!validateCustomerForChannel()) return;
    if (!validateRestoredDraft()) return;
    const isDirectTableOrder = directKitchenTableOrder && channel === 'DINE_IN';
    if (!paymentIntent && !isEmployeeConsumption && !isDirectTableOrder) {
      setError('Elige cómo se va a pagar.');
      return;
    }
    if (isEmployeeConsumption && !employeeConsumerId) { setError('Selecciona un empleado.'); return; }
    setSending(true);
    setError(null);
    try {
      const res = await api.post('/orders/manual', {
        sendToKitchen: false,
        channel,
        deliveryCourierId: channel === 'DELIVERY' ? deliveryCourierId || undefined : undefined,
        tableId: channel === 'DINE_IN' ? tableId : undefined,
        // Mesa con varias cuentas abiertas: a cuál se agrega, o abre una nueva independiente.
        sessionId: channel === 'DINE_IN' && accountChoice && accountChoice !== 'new' ? accountChoice : undefined,
        openNewAccount: channel === 'DINE_IN' && accountChoice === 'new' ? true : undefined,
        accountLabel: channel === 'DINE_IN' && accountChoice === 'new' ? accountLabel.trim() || undefined : undefined,
        items: lines.map((l) => ({
          productId: l.product.id.startsWith('modifier:') ? undefined : l.product.id,
          standaloneModifierId: l.product.id.startsWith('modifier:') ? l.product.id.slice('modifier:'.length) : undefined,
          quantity: l.quantity,
          variantId: l.variantId,
          modifierIds: l.selectedModifiers.flatMap((m) => Array(m.quantity ?? 1).fill(m.modifierId)),
          comboSelections: l.comboSelections,
          note: l.note,
        })),
        // Nombre/cédula/teléfono ya no se piden en "Menú": vienen del cliente elegido en "Clientes".
        customerName: isEmployeeConsumption ? `Consumo: ${user?.name ?? 'Empleado'}` : selectedCustomer?.name,
        // RIF/cédula: el del cliente en ficha, o el escrito a mano para la factura fiscal de
        // este pedido puntual si no tiene uno guardado.
        customerIdNumber: selectedCustomer?.idNumber ?? (wantsFiscalInvoice ? fiscalIdNumber.trim() || undefined : undefined),
        customerPhone: selectedCustomer?.phone || undefined,
        // Delivery manda su dirección de entrega (la necesita el repartidor); fuera de delivery,
        // solo se manda si el cliente pidió factura fiscal (ver fiscal-invoicing.service.ts,
        // cae a "Consumidor Final" sin esto).
        customerAddress:
          channel === 'DELIVERY'
            ? customerAddress || selectedCustomer?.address || undefined
            : wantsFiscalInvoice
              ? fiscalAddress.trim() || selectedCustomer?.address || undefined
              : undefined,
        customerLat: channel === 'DELIVERY' ? addressCoords?.lat : undefined,
        customerLng: channel === 'DELIVERY' ? addressCoords?.lng : undefined,
        // Solo se manda si el cajero lo escribió: si no, el servidor lo cotiza como siempre.
        deliveryFeeBase: channel === 'DELIVERY' && manualFee != null ? manualFee : undefined,
        customerNote: customerNote.trim() || undefined,
        customerId: selectedCustomer?.id,
        // Se guarda en el pedido para que el cobro sepa qué documento ofrecer. Si el cliente
        // no lo pidió acá, igual se puede cambiar al pagar — que es cuando lo pide casi todo
        // el mundo (ver PaymentDialog).
        wantsFiscalInvoice,
        paymentIntent: isEmployeeConsumption ? 'DEBT' : isDirectTableOrder ? undefined : paymentIntent,
        isEmployeeConsumption,
        employeeConsumerId: isEmployeeConsumption ? employeeConsumerId : undefined,
      });
      const newOrder: LiveOrder = { ...res.data.data, payments: res.data.data.payments ?? [] };
      finishDraft();
      setCreatedOrder(newOrder);
    } catch (e: any) {
      setError(manualOrderError(e.response?.data));
    } finally {
      setSending(false);
    }
  }

  /** Añade la comanda armada en "Menú" directamente a un pedido ya activo, sin perderla. */
  async function addToExisting(orderId: string) {
    if (sending || addingToId || draftCompleted.current) return;
    if (!validateRestoredDraft()) return;
    if (lines.length === 0) return;
    setAddingToId(orderId);
    setError(null);
    try {
      // Una sola llamada con TODAS las líneas: así cocina recibe UNA comanda de adición con
      // todo junto, no una por producto (ver order.service.ts addItems).
      await api.post(`/orders/${orderId}/items/batch`, {
        items: lines.map((l) => ({
          productId: l.product.id.startsWith('modifier:') ? undefined : l.product.id,
          standaloneModifierId: l.product.id.startsWith('modifier:') ? l.product.id.slice('modifier:'.length) : undefined,
          quantity: l.quantity,
          variantId: l.variantId,
          modifierIds: l.selectedModifiers.flatMap((m) => Array(m.quantity ?? 1).fill(m.modifierId)),
          comboSelections: l.comboSelections,
          note: l.note,
        })),
      });
      finishDraft();
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
          ? `${selectedTable.zoneName ? `${selectedTable.zoneName} · ` : ''}${selectedTable.number}`
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
      <p className="text-center text-brand-950/40 font-light py-10 text-base">
        Sin productos aún.
        <br />
        Toca un producto para añadirlo.
      </p>
    ) : (
      <div>
      {isEmployeeConsumption && <label className="block pt-3 text-brand-950 text-sm font-medium">Empleado
        <select value={employeeConsumerId} onChange={event => setEmployeeConsumerId(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-brand-950/10 bg-white px-3 text-base">
          <option value="">Selecciona el empleado</option>
          {employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name} · {employee.role === 'OWNER' || employee.role === 'ADMIN' ? 'Administración' : 'Cuenta por cobrar'}</option>)}
        </select>
      </label>}
      <ul className="order-cart-lines">
        {lines.map((line, index) => {
          const unitPrice = cartLineUnitPrice(line);
          return <li key={index} className="order-cart-line">
            <div className="order-cart-thumb">{line.product.photoUrl ? <img src={line.product.photoUrl} alt="" /> : <UtensilsCrossed size={24} aria-hidden="true" />}</div>
            <div className="min-w-0">
              <p className="order-cart-item-name text-base">{line.product.name}{line.variantName && <span className="font-normal text-brand-950/60"> · {line.variantName}</span>}</p>
              {line.selectedModifiers.length > 0 && <p className="mt-1 text-brand-950/60 text-xs">{line.selectedModifiers.map(formatModifierLabel).join(', ')}</p>}
              {line.note && <p className="mt-1 text-brand-950/60 text-xs">{line.note}</p>}
              <div className="order-cart-controls">
                <div className="order-cart-stepper">
                  <button type="button" aria-label={`Quitar una unidad de ${line.product.name}`} onClick={() => adjustLineAt(index, -1)} disabled={sending}>−</button>
                  <span>{line.quantity}</span>
                  <button type="button" aria-label={`Agregar una unidad de ${line.product.name}`} onClick={() => adjustLineAt(index, 1)} disabled={sending}>+</button>
                </div>
                <strong>{formatBase(unitPrice * line.quantity, symbol)}</strong>
              </div>
            </div>
          </li>;
        })}
      </ul>
      </div>
    );

  const cartSummaryRows = (
    <>
      <div className="flex justify-between text-[12.5px] text-brand-950/60">
        <span>Subtotal</span>
        <span>{formatBase(subtotalBase, symbol)}</span>
      </div>
      {!internalConsumption && restaurant?.ivaEnabled && (
        <div className="flex justify-between text-[12.5px] text-brand-950/60">
          <span>IVA (16%)</span>
          <span>{formatBase(ivaBase, symbol)}</span>
        </div>
      )}
      {appliesServiceCharge && (
        <div className="flex justify-between text-[12.5px] text-brand-950/60">
          <span>Servicio (10%)</span>
          <span>{formatBase(serviceChargeBase, symbol)}</span>
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
      {channel === 'DELIVERY' && quotingFee && <p className="text-brand-950/40 text-xs">Calculando envío…</p>}
      <div className="flex items-center justify-between text-xl font-semibold tracking-tight text-brand-950 border-t border-brand-950/10 pt-3 pb-1">
        <span>Total</span>
        <span className="text-2xl font-bold tabular-nums">{formatBase(totalBase, symbol)}</span>
      </div>
      {rateBs && (
        <div className="flex justify-between text-[11px] text-brand-950/40 -mt-1">
          <span>Equivalente</span>
          <span>{formatBs(totalBase, rateBs)}</span>
        </div>
      )}
    </>
  );

  // Desde el menú siempre se puede volver a la pantalla de Cliente — incluso en Express,
  // por si el cajero se equivocó de botón (ya no existe el efecto que rebotaba al menú).
  function atras() {
    if (step > 1) setStep((step - 1) as Step);
    else closeKeepingDraft();
  }

  const actionButtons = (
    <div className="flex gap-2 pt-2">
      {step > 1 && (
        <TextureButton variant="secondary" size="default" className="!w-auto" onClick={atras}>
          Atrás
        </TextureButton>
      )}
      {step === 1 && (
        <TextureButton variant="brand" size="default" onClick={continueFromCustomer} disabled={savingCustomer} className="order-primary flex-1">
          {savingCustomer ? 'Guardando cliente…' : 'Siguiente'}
        </TextureButton>
      )}
      {step === 2 && (
        <TextureButton
          variant="brand"
          size="default"
          disabled={lines.length === 0 || sending}
          onClick={goToPayment}
          className="order-primary flex-1 disabled:opacity-50"
        >
          {directKitchenTableOrder ? (sending ? 'Creando…' : 'Crear pedido') : 'Siguiente'}
        </TextureButton>
      )}
      {step === 3 && !showOpenAccounts && (
        <TextureButton
          variant="brand"
          size="default"
          className="order-primary flex-1 disabled:opacity-50"
          disabled={sending || (!paymentIntent && !isEmployeeConsumption)}
          onClick={submit}
        >
          {sending ? 'Creando…' : isEmployeeConsumption ? 'Registrar consumo' : 'Crear pedido'}
        </TextureButton>
      )}
    </div>
  );

  if (draftAtOpen.key !== draftKey) return null;
  if (createdOrder) return <SendOrderToKitchenDialog order={createdOrder} onDone={sent => {
    onCreated({ ...createdOrder, status: sent ? 'KITCHEN' : createdOrder.status });
    onClose();
  }} />;

  return (
    <>
      <div
        className="order-workspace fixed inset-0 z-50 flex flex-col"
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-brand-950/[0.04] bg-white/50 px-4 py-1 text-[11px] text-brand-950/65">
          <p role={draftSaveFailed ? 'alert' : 'status'} className={draftSaveFailed ? 'text-red-700' : ''}>
            {draftSaveFailed ? 'No se pudo guardar el borrador. No cierres la página.' : hasOrderDraftContent(draftSnapshot) ? 'Borrador guardado en este dispositivo · Sin enviar a cocina' : 'Tu pedido se guardará como borrador al agregar productos o datos.'}
            {restoredDraft && <span className="ml-1">Pedido recuperado: revisa disponibilidad y precios antes de confirmar.</span>}
          </p>
          <div className="flex items-center gap-3">
            {hasOrderDraftContent(draftSnapshot) && <button type="button" disabled={sending || !!addingToId} onClick={discardDraft} className="min-h-10 px-2 text-red-600 disabled:opacity-50">Descartar borrador</button>}
            <button type="button" disabled={sending || !!addingToId} onClick={closeKeepingDraft} className="min-h-10 rounded-full border border-brand-950/[0.08] bg-white px-4 font-semibold disabled:opacity-50">Guardar y salir</button>
          </div>
        </div>
        {/* ---------- topline ---------- */}
        <div className="mx-3 mt-3 rounded-[24px] px-4 md:px-5 py-3 bg-white shrink-0 space-y-3 xl:space-y-0 xl:flex xl:items-center xl:gap-6">
          <div className="flex items-center gap-3 md:flex-1 md:min-w-0">
            <button
              type="button"
              onClick={atras}
              className="flex items-center justify-center h-11 w-11 rounded-full border border-brand-950/10 text-brand-950 hover:bg-brand-950/5 shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight text-brand-950 truncate">{isEmployeeConsumption ? 'Consumo de empleado' : 'Crear pedido'}</h1>
              <p className="text-brand-950/50 font-light truncate text-xs">
                {STEP_LABELS[step]}
                <span className="md:hidden"> · {currentContextLabel}</span>
              </p>
            </div>
            {selectedCustomer && !isEmployeeConsumption && (
              <button
                type="button"
                onClick={() => setStep(1)}
                aria-label={`Cambiar cliente: ${selectedCustomer.name}`}
                className="ml-auto flex min-w-0 max-w-[16rem] touch-manipulation items-center gap-2 rounded-2xl border border-brand-950/[0.08] bg-brand-950/[0.04] py-1.5 pl-1.5 pr-2.5 text-left transition-[background-color,transform] hover:bg-brand-950/[0.07] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-950 text-white">
                  <UserRound aria-hidden="true" className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-950/40">
                    Cliente
                  </span>
                  <span className="block truncate text-xs font-semibold text-brand-950">{selectedCustomer.name}</span>
                </span>
                <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-brand-950/30" />
              </button>
            )}
          </div>
          {step === 2 && !directKitchenTableOrder && (
            <div
              role="group"
              aria-label="Tipo de pedido"
              className="grid auto-cols-fr grid-flow-col gap-1 rounded-full border border-brand-950/[0.06] bg-[#f8f7f6] p-1 xl:w-[32rem] xl:shrink-0"
            >
              {opcionesCanal.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={channel === opt.value}
                  onClick={() => selectChannel(opt.value)}
                  className={`flex h-[44px] min-w-0 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[11px] font-semibold leading-tight transition-[color,background-color,box-shadow,transform] duration-150 motion-reduce:transition-none active:scale-[0.97] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:flex-row sm:gap-1.5 sm:px-2 sm:text-sm ${
                    channel === opt.value ? 'bg-[#102b4e] text-white shadow-sm' : 'text-brand-950/65 hover:bg-white/60 hover:text-brand-950 active:bg-white/80'
                  }`}
                >
                  <opt.icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${channel === opt.value ? 'text-white' : ''}`} />
                  <span className="whitespace-nowrap">{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 flex min-h-0 gap-3 p-3">
          {/* ---------- left: browse / steps ---------- */}
          <div className="flex-1 overflow-y-auto p-1 md:p-3 min-w-0">
            {step === 1 && (
              <div className="flex flex-col gap-5 max-w-xl mx-auto">
                <button
                  type="button"
                  onClick={() => setIsEmployeeConsumption((value) => !value)}
                  className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${isEmployeeConsumption ? 'border-amber-400 bg-amber-50 text-brand-950' : 'border-brand-950/10 bg-white text-brand-950/70 hover:border-brand-500'}`}
                >
                  {isEmployeeConsumption ? '✓ Consumo de empleado — no se cobrará' : 'Consumo de empleado'}
                </button>
                <div className="rounded-2xl bg-white p-5 flex flex-col min-h-0">
                  <p className="text-lg font-bold tracking-tight text-brand-950 mb-1 shrink-0">¿Para quién es el pedido?</p>
                  <p className="text-brand-950/50 font-light mb-4 shrink-0 text-base">
                    Busca un cliente o escribe su nombre y pulsa Siguiente.
                  </p>
                  {selectedCustomer ? (
                    <div className="rounded-2xl border border-emerald-500/25 bg-emerald-50/70 p-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-sm">
                          <Check aria-hidden="true" className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold uppercase tracking-[0.09em] text-emerald-700/70 text-xs">Cliente seleccionado</p>
                          <p className="truncate font-bold tracking-tight text-brand-950 text-base">{selectedCustomer.name}</p>
                          <p className="truncate text-brand-950/50 text-xs">
                            {selectedCustomer.phone}{selectedCustomer.idNumber ? ` · ${selectedCustomer.idNumber}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedCustomer(null)}
                          className="shrink-0 touch-manipulation rounded-xl bg-white px-3 py-2 text-xs font-semibold text-brand-950 shadow-sm ring-1 ring-brand-950/[0.06] transition-transform active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
                        >
                          Cambiar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <CustomerPicker onSelect={setSelectedCustomer} resolveRef={customerPickerRef} onContinue={continueFromCustomer} />
                  )}
                </div>

                {/* La barra de canales solo existe en el paso del menú, así que sin este atajo
                    Express era inalcanzable: había que pasar por la pantalla de Cliente que el
                    canal justamente evita. Salta derecho al menú y deja el pedido sin cliente. */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(null);
                    setWantsFiscalInvoice(false);
                    setChannel('EXPRESS');
                    setError(null);
                    setStep(2);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-brand-500/30 bg-brand-500/[0.06] px-5 py-4 text-sm font-semibold text-brand-500 transition-colors hover:bg-brand-500/10 active:scale-[0.99]"
                >
                  <Zap className="h-4 w-4" />
                  Pedido Express
                  <span className="font-light text-brand-950/45">· sin datos del cliente</span>
                </button>

                <div className="rounded-2xl bg-white p-5 flex flex-col min-h-0">
                  <label className="flex items-center gap-2 text-brand-950 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={wantsFiscalInvoice}
                      onChange={(e) => {
                        setWantsFiscalInvoice(e.target.checked);
                        // Precarga con lo que ya tenga el cliente en ficha — se puede corregir igual.
                        if (e.target.checked && selectedCustomer) {
                          setFiscalIdNumber((v) => v || selectedCustomer.idNumber || '');
                          setFiscalAddress((v) => v || selectedCustomer.address || '');
                        }
                      }}
                    />
                    ¿Desea factura fiscal?
                  </label>
                  {wantsFiscalInvoice && (
                    <div className="mt-3 space-y-2">
                      <input
                        value={fiscalIdNumber}
                        onChange={(e) => setFiscalIdNumber(e.target.value)}
                        placeholder="RIF / Cédula"
                        className="w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-base"
                      />
                      <input
                        value={fiscalAddress}
                        onChange={(e) => setFiscalAddress(e.target.value)}
                        placeholder="Dirección corta (para la factura)"
                        className="w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-base"
                      />
                      <p className="text-brand-950/40 font-light text-xs">
                        Sin esto la factura sale a nombre de "Consumidor Final".
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                {/* La mesa se elige en una ventana aparte y no en una cuadrícula acá adentro:
                    con muchas mesas, la cuadrícula tapaba el resto del paso y no se distinguía
                    qué estaba elegido. Acá solo queda el resultado; el detalle vive en el modal. */}
                {channel === 'DINE_IN' && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setMostrarMesas(true)}
                      className={`flex min-h-[4.5rem] w-full items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-[background-color,border-color,transform] active:scale-[0.995] motion-reduce:transition-none motion-reduce:active:scale-100 ${
                        selectedTable ? 'border-brand-500 bg-brand-500/5' : 'border-dashed border-brand-950/20 hover:border-brand-500/50'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-[11px] font-semibold uppercase tracking-wide text-brand-950/40">
                          Mesa del pedido
                        </span>
                        {selectedTable ? (
                          <>
                            <span className="block text-base font-bold text-brand-950 truncate">
                              {selectedTable.zoneName ? `${selectedTable.zoneName} · ` : ''}
                              {selectedTable.number}
                            </span>
                            {selectedTable.sessions[0] && (
                              <span className="block text-[11px] text-amber-600 truncate">
                                {selectedTable.sessions[0].customerName || 'Sin nombre'} ·{' '}
                                {elapsedSince(selectedTable.sessions[0].openedAt)}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="block text-sm font-medium text-brand-950/50">
                            {tablesForMode.length === 0 ? 'No hay mesas disponibles' : 'Toca para elegir una mesa'}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-brand-500">
                        {selectedTable ? 'Cambiar mesa' : `${tablesForMode.length} mesas`}
                      </span>
                    </button>

                    {/* Desde la primera cuenta se puede abrir otra independiente. */}
                    {tableMode === 'OPEN' && selectedTable && selectedTable.sessions.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="font-semibold text-brand-950 text-base">
                          ¿En cuál cuenta va este pedido?
                        </p>
                        <p className="text-brand-950/50 text-xs">
                          {selectedTable.sessions.length === 1 ? 'Esta mesa tiene una cuenta abierta.' : `Esta mesa tiene ${selectedTable.sessions.length} cuentas abiertas.`}
                        </p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {selectedTable.sessions.map((s, i) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => setAccountChoice(s.id)}
                              className={`min-h-16 touch-manipulation rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-[color,background-color,border-color,transform] active:scale-[0.98] ${
                                accountChoice === s.id
                                  ? 'border-brand-500 bg-brand-500 text-white'
                                  : 'border-brand-950/10 bg-white text-brand-950 hover:border-brand-500/40'
                              }`}
                            >
                              <span className="block">{s.label ?? `Cuenta ${i + 1}`}</span>
                              <span className={`mt-0.5 block text-xs font-medium ${accountChoice === s.id ? 'text-white/75' : 'text-brand-950/45'}`}>
                                {s.customerName} · {formatBase(s.totalBase, symbol)}
                              </span>
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setAccountChoice('new')}
                            className={`min-h-16 touch-manipulation rounded-2xl border-2 border-dashed px-4 py-3 text-left text-sm font-semibold transition-[color,background-color,border-color,transform] active:scale-[0.98] ${
                              accountChoice === 'new'
                                ? 'border-brand-500 bg-brand-500 text-white'
                                : 'border-brand-500/35 bg-brand-500/[0.04] text-brand-500 hover:bg-brand-500/[0.08]'
                            }`}
                          >
                            <span className="block">+ Crear otra cuenta</span>
                            <span className={`mt-0.5 block text-xs font-medium ${accountChoice === 'new' ? 'text-white/75' : 'text-brand-950/45'}`}>
                              Pedido y pago separados
                            </span>
                          </button>
                        </div>
                        {accountChoice === 'new' && (
                          <label className="block pt-2 text-brand-950/70 text-sm font-medium">
                            Nombre de la cuenta (opcional)
                            <input value={accountLabel} onChange={(event) => setAccountLabel(event.target.value)} maxLength={40}
                              placeholder={`Cuenta ${selectedTable.sessions.length + 1}`}
                              className="mt-1 min-h-12 w-full rounded-xl border border-brand-950/15 bg-white px-3 text-brand-950 text-base" />
                            <span className="mt-1 block text-xs">Sus pedidos y pagos quedarán separados de las otras cuentas.</span>
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {channel !== 'DINE_IN' && (
                  <div className={channel === 'DELIVERY' ? 'grid grid-cols-1 lg:grid-cols-[minmax(0,40rem)_minmax(280px,1fr)] gap-4 max-w-5xl items-start' : 'space-y-2 max-w-md'}>
                    <div className={channel === 'DELIVERY' ? 'space-y-2' : undefined}>
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
                        {locationError && <p className="text-red-600 -mt-1 text-xs">{locationError}</p>}

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
                              className="w-28 border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-base"
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
                          <p className="text-brand-950/40 font-light text-xs">
                            {manualFeeText !== null
                              ? 'Monto fijado a mano — se cobra este, no el calculado.'
                              : addressCoords
                                ? 'Calculado según la ubicación. Puedes escribirlo a mano si no aplica.'
                                : 'Sin ubicación no se puede calcular: escríbelo a mano si cobras envío.'}
                          </p>
                          {deliveryQuoteError && <p className="text-rose-600 text-xs">{deliveryQuoteError}</p>}
                        </div>
                      </>
                    )}
                    <input
                      value={customerNote}
                      onChange={(e) => setCustomerNote(e.target.value)}
                      placeholder="Nota (opcional)"
                      className="w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-base"
                    />
                    {channel === 'DELIVERY' && (
                      <div className="rounded-xl border border-brand-950/10 bg-white p-3 space-y-2">
                        <label htmlFor="new-order-courier" className="flex items-center gap-2 text-brand-950 text-sm font-medium"><Bike size={18} /> Motorizado asignado</label>
                        <select id="new-order-courier" value={deliveryCourierId} onChange={(e) => setDeliveryCourierId(e.target.value)} disabled={loadingCouriers || !!courierError} className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-base">
                          <option value="">{loadingCouriers ? 'Cargando motorizados…' : 'Asignar automáticamente por turno'}</option>
                          {couriers.map((courier) => <option key={courier.id} value={courier.id}>{courier.name}{courier.nextInTurn ? ' · Próximo en turno' : ''}</option>)}
                        </select>
                        {courierError ? <p role="alert" className="text-rose-600 text-xs">{courierError}</p> : !loadingCouriers && (
                          <p className="text-brand-950/60 text-xs">{deliveryCourierId
                            ? `Se enviará a ${couriers.find((c) => c.id === deliveryCourierId)?.name ?? 'el motorizado seleccionado'} al crear el pedido.`
                            : couriers.length ? `Próximo en turno: ${couriers.find((c) => c.nextInTurn)?.name ?? couriers[0].name}. El turno se confirma al crear el pedido.`
                            : 'No hay motorizados activos. Crea un usuario con rol Motorizado en Equipo; mientras tanto el pedido quedará sin asignar.'}</p>
                        )}
                      </div>
                    )}
                    </div>
                    {channel === 'DELIVERY' && (
                      <DeliveryLocationPreview
                        coords={addressCoords}
                        origin={{ lat: restaurant?.deliveryOriginLat, lng: restaurant?.deliveryOriginLng }}
                        onSelect={(coords) => {
                          setAddressCoords(coords);
                          setManualFeeText(null);
                          setLocationError(null);
                          void reverseGeocode(coords.lat, coords.lng).then(setCustomerAddress);
                        }}
                      />
                    )}
                  </div>
                )}

                <OrderMenuCatalog products={products} symbol={symbol}
                  quantityFor={id => lines.filter(line => line.product.id === id).reduce((total, line) => total + line.quantity, 0)}
                  onSelect={product => { if (productNeedsOptions(product)) setOptionsProduct(product); else addPickedLine({ product, quantity: 1, selectedModifiers: [] }); }} />

                {employeeConsumption && standaloneModifiers.length > 0 && (
                  <section className="rounded-2xl border border-brand-500/15 bg-brand-500/[0.04] p-4">
                    <div className="mb-3">
                      <p className="font-bold text-brand-950 text-base">Extras y modificadores</p>
                      <p className="text-brand-950/50 text-xs">Úsalos como producto independiente en el menú interno.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                      {standaloneModifiers.map((modifier) => {
                        const id = `modifier:${modifier.id}`;
                        const qty = lines.filter((line) => line.product.id === id).reduce((total, line) => total + line.quantity, 0);
                        return <button key={modifier.id} type="button" onClick={() => addStandaloneModifier(modifier)} className={`rounded-xl border bg-white p-3 text-left ${qty ? 'border-brand-500' : 'border-brand-950/10'}`}>
                          <p className="font-semibold text-brand-950 text-xs">{modifier.name}</p>
                          <p className="mt-1 text-brand-950/45 text-xs">{modifier.categoryName}</p>
                          <p className="mt-2 font-bold text-brand-500 text-base">{formatBase(Math.max(0, Number(modifier.priceBase) - Number(modifier.discountBase ?? 0)), symbol)}{qty ? ` · ${qty}` : ''}</p>
                        </button>;
                      })}
                    </div>
                  </section>
                )}


              </div>
            )}

            {step === 3 && isEmployeeConsumption ? (
              <div className="mx-auto max-w-xl rounded-2xl bg-amber-50 px-6 py-8 text-center">
                <p className="text-lg font-bold text-brand-950">Consumo de empleado</p>
                <p className="mt-2 text-brand-950/60 text-base">Se envía a cocina y se excluye de las ventas.</p>
              </div>
            ) : step === 3 && (
              <div className="flex flex-col gap-5 max-w-4xl mx-auto">
                <div className="rounded-2xl bg-white px-6 py-6 text-center shrink-0">
                  <p className="font-semibold uppercase tracking-wide text-brand-950/40 text-xs">Total del pedido</p>
                  <p className="text-5xl font-bold text-brand-950 mt-1.5">{formatBase(totalBase, symbol)}</p>
                  {rateBs && <p className="text-lg font-medium text-brand-950/50 mt-1">{formatBs(totalBase, rateBs)}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {PAYMENT_INTENT_OPTIONS.map((opt) => {
                    const active = !showOpenAccounts && paymentIntent === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => { setShowOpenAccounts(false); setPaymentIntent(opt.value); }}
                        className={`flex flex-col items-center justify-center text-center gap-3 rounded-2xl border-2 p-5 min-h-[10rem] transition-colors ${
                          active ? opt.activeClass : `border-brand-950/10 bg-white ${opt.hoverClass}`
                        }`}
                      >
                        <opt.icon className={`h-10 w-10 shrink-0 ${opt.iconClass}`} />
                        <div>
                          <p className="text-lg font-bold text-brand-950">{opt.label}</p>
                          <p className="text-brand-950/50 mt-1 text-xs">{opt.description}</p>
                        </div>
                      </button>
                    );
                  })}
                  <button type="button" aria-pressed={showOpenAccounts} onClick={() => { setShowOpenAccounts(true); setPaymentIntent(null); }}
                    className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 p-5 min-h-[10rem] text-center ${showOpenAccounts ? 'border-brand-500 bg-brand-500/5' : 'border-brand-950/10 bg-white'}`}>
                    <Plus className="h-10 w-10 text-brand-500" />
                    <div><p className="text-lg font-bold text-brand-950">Agregar a cuenta abierta</p><p className="mt-1 text-brand-950/50 text-xs">Sumar a un pedido existente</p></div>
                  </button>
                </div>
                  {showOpenAccounts && (
                    <div className="rounded-2xl bg-white p-5 flex flex-col min-h-0">
                      <p className="font-bold text-brand-950 shrink-0 text-base">Agregar a cuenta abierta</p>
                      <p className="text-brand-950/50 font-light mt-0.5 mb-3 shrink-0 text-xs">
                        En vez de crear un pedido nuevo, suma estos productos a uno ya activo.
                      </p>
                      <div className="relative shrink-0 mb-2">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-950/30" />
                        <input
                          value={existingSearch}
                          onChange={(e) => setExistingSearch(e.target.value)}
                          placeholder="Buscar por número, cliente o mesa…"
                          className="w-full border border-brand-950/15 rounded-lg pl-8 pr-2.5 py-2 text-base"
                        />
                      </div>
                      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
                        {filteredExistingOrders.length === 0 && (
                          <p className="col-span-full py-8 text-center text-brand-950/45 text-base">No se encontraron pedidos.</p>
                        )}
                        {filteredExistingOrders.map((o) => (
                          <article key={o.id} className="flex min-h-44 flex-col justify-between rounded-2xl border border-brand-950/10 bg-[#f8f7f6] p-4 transition-colors hover:border-brand-500/40">
                            <div className="space-y-3">
                              <div className="flex items-start justify-between gap-2">
                                <p className="min-w-0 break-words font-semibold text-brand-950 text-base">{o.customerName?.trim() || 'Cliente sin nombre'}</p>
                                <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-950/70">Pedido #{o.orderNumber}</span>
                              </div>
                              <p className="text-brand-950/60 text-base">{o.table ? `Mesa ${o.table.number}` : CHANNEL_LABELS[o.channel]}</p>
                            </div>
                            <button type="button" className="mt-4 flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-brand-800 disabled:cursor-wait disabled:opacity-55" disabled={addingToId !== null} onClick={() => addToExisting(o.id)}>
                              {addingToId === o.id ? 'Enviando a cocina…' : 'Agregar productos'}
                            </button>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}

              </div>
            )}
          </div>

          {/* ---------- right: cart panel (tablet/desktop) ---------- */}
          <div className="hidden md:flex w-[340px] xl:w-[380px] shrink-0 overflow-hidden rounded-[28px] bg-white flex-col">
            <div className="p-5 pb-3 border-b border-brand-950/10 space-y-2.5">
              <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-semibold tracking-tight text-brand-950">Tu pedido</h2><span className="rounded-full bg-[#f4f3f2] px-3 py-1.5 text-[11px] text-brand-950/60">Borrador</span></div>
              <p className="text-brand-950/60 text-xs">{currentContextLabel} · {totalItems} {totalItems === 1 ? 'producto' : 'productos'}</p>
              {stepDots}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4">{cartLinesList}</div>
            <div className="m-3 mt-0 rounded-[22px] bg-[#f7f5f4] p-4 space-y-2">
              {cartSummaryRows}
              {error && <p className="text-red-600 pt-1 text-base">{error}</p>}
              {actionButtons}
              <p className="pt-1 text-center text-brand-950/55 text-xs">El pago puede hacerse después.</p>
            </div>
          </div>
        </div>

        {/* ---------- bottom bar (teléfono): resumen + acción ---------- */}
        <div className="md:hidden shrink-0 border-t border-brand-950/10 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-1.5">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className={`w-full min-h-12 flex items-center justify-between rounded-2xl px-4 py-3 ${totalItems > 0 ? 'bg-emerald-600 text-white' : 'bg-brand-950/[0.04] text-brand-950'}`}
          >
            <span className="text-sm font-semibold">
              {totalItems === 0 ? 'Sin productos' : `Ver pedido · ${totalItems} ${totalItems === 1 ? 'producto' : 'productos'}`}
            </span>
            <span className="text-sm font-bold tabular-nums">{formatBase(totalBase, symbol)}</span>
          </button>
          {error && <p className="text-red-600 text-base">{error}</p>}
          {actionButtons}
        </div>
      </div>

      {/* ---------- comanda a pantalla completa (teléfono) ---------- */}
      {cartOpen && (
        <div className="order-workspace md:hidden fixed inset-0 z-[60] flex flex-col">
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-brand-950/10 shrink-0">
            <div className="min-w-0">
              <p className="font-bold text-brand-950 truncate text-base">Tu pedido</p>
              <p className="text-brand-950/50 font-light truncate text-xs">{currentContextLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => setCartOpen(false)}
              className="shrink-0 flex items-center justify-center h-11 w-11 rounded-full border border-brand-950/10 text-brand-950"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4">{cartLinesList}</div>
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

      {/* Ventana de mesas. Se cierra sola al elegir: es una decisión de un toque, y dejarla
          abierta obligaría a un segundo toque de "listo" que nadie entiende para qué está. */}
      {mostrarMesas && (
        <div className="fixed inset-0 z-[70] bg-white">
          <div className="flex h-dvh w-full flex-col bg-white">
            <div className="flex shrink-0 items-center justify-between border-b border-brand-950/10 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <div>
                <h3 className="font-bold text-brand-950">Selecciona una mesa</h3>
                <p className="text-brand-950/50 font-light text-xs">
                  Libres y ocupadas · {tablesForMode.length}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMostrarMesas(false)}
                aria-label="Cerrar"
                className="w-11 h-11 rounded-full hover:bg-brand-950/[0.06] flex items-center justify-center text-brand-950/50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[#f6f7fa] px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {tablesForMode.length === 0 ? (
                <p className="text-brand-950/40 font-light text-center py-8 text-base">
                  No hay mesas disponibles.
                </p>
              ) : (
                <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
                  {tablesForMode.map((t) => {
                    const busy = t.sessions.length > 0;
                    const active = tableId === t.id;
                    const firstSession = t.sessions[0];
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setTableId(t.id);
                          setTableMode(t.sessions.length === 0 ? 'ADD' : 'OPEN');
                          setAccountLabel('');
                          setAccountChoice(t.sessions.length === 1 ? t.sessions[0].id : null);
                          if (t.sessions.length === 0) setAccountChoice('new');
                          setMostrarMesas(false);
                        }}
                        className={`min-h-28 touch-manipulation rounded-2xl border-2 px-3 py-3 text-left transition-[color,background-color,border-color,transform] active:scale-[0.97] ${
                          active
                            ? 'border-brand-500 bg-brand-500/5'
                            : busy
                              ? 'border-amber-300/60 bg-amber-50/50 hover:border-amber-400'
                              : 'border-brand-950/10 bg-white hover:border-brand-500/40'
                        }`}
                      >
                        <p className="font-bold text-brand-950 truncate text-base">{t.number}</p>
                        {t.zoneName && <p className="text-brand-950/40 truncate text-xs">{t.zoneName}</p>}
                        {busy && firstSession ? (
                          <>
                            <p className="font-semibold text-amber-600 truncate mt-0.5 text-xs">
                              {firstSession.customerName || 'Sin nombre'}
                            </p>
                            <p className="text-amber-600/70 text-xs">
                              {elapsedSince(firstSession.openedAt)}
                              {t.sessions.length > 1 ? ` · ${t.sessions.length} cuentas` : ''}
                            </p>
                          </>
                        ) : (
                          <p className="font-semibold mt-1 text-emerald-600 text-xs">Libre · abrir cuenta</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
