import { useEffect, useMemo, useState } from 'react';
import { Bike, Check, Clock, MapPin, Martini, ReceiptText, Search, SplitSquareHorizontal, Store, UtensilsCrossed } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, cartLineUnitPrice, formatBase, formatBs } from '@/utils/format';
import type { CartLine, Customer, FloorPlan, Product } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { AddressAutocomplete, reverseGeocode } from '@/components/AddressAutocomplete';
import { CustomerPicker } from './CustomerPicker';
import { ProductOptionsDialog } from './ProductOptionsDialog';
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
  const [customerAddress, setCustomerAddress] = useState('');
  const [addressCoords, setAddressCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [customerNote, setCustomerNote] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [optionsProduct, setOptionsProduct] = useState<Product | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryFeeBase, setDeliveryFeeBase] = useState<number | null>(null);
  const [quotingFee, setQuotingFee] = useState(false);
  const [showComanda, setShowComanda] = useState(false);
  const [rateBs, setRateBs] = useState<string | null>(null);
  const [addingToId, setAddingToId] = useState<string | null>(null);

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
      const zoned = plan.zones.flatMap((z) =>
        z.tables.filter((t) => !t.session).map((t) => ({ id: t.id, number: t.number, zoneName: z.name })),
      );
      const unzoned = plan.unzoned.filter((t) => !t.session).map((t) => ({ id: t.id, number: t.number, zoneName: null }));
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
  const hasCharges = restaurant?.serviceChargeEnabled || restaurant?.ivaEnabled || Boolean(deliveryFeeBase);

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
          JSON.stringify(l.selectedModifiers.map((m) => m.modifierId).sort()) ===
            JSON.stringify(line.selectedModifiers.map((m) => m.modifierId).sort()),
      );
      if (matchIndex === -1) return [...prev, line];
      const next = [...prev];
      next[matchIndex] = { ...next[matchIndex], quantity: next[matchIndex].quantity + line.quantity };
      return next;
    });
  }

  /** Ajusta la cantidad de una línea específica por índice (necesario porque un mismo producto puede tener varias líneas con distinta variante/modificadores). */
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
        items: lines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
          variantId: l.variantId,
          modifierIds: l.selectedModifiers.map((m) => m.modifierId),
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
          modifierIds: l.selectedModifiers.map((m) => m.modifierId),
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

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear pedido</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {([1, 2, 3] as Step[]).map((s) => (
                <div key={s} className="flex items-center gap-2 flex-1">
                  <div
                    className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-semibold shrink-0 ${
                      step === s
                        ? 'bg-brand-500 text-white'
                        : step > s
                          ? 'bg-emerald-500 text-white'
                          : 'bg-brand-950/[0.08] text-brand-950/40'
                    }`}
                  >
                    {step > s ? <Check className="h-3.5 w-3.5" /> : s}
                  </div>
                  <span className={`text-xs font-medium ${step === s ? 'text-brand-950' : 'text-brand-950/40'}`}>
                    {STEP_LABELS[s]}
                  </span>
                  {s < 3 && <div className={`flex-1 h-px ${step > s ? 'bg-emerald-500' : 'bg-brand-950/10'}`} />}
                </div>
              ))}
            </div>

            {step === 1 && (
              <>
                <div className="grid grid-cols-4 gap-1.5">
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

                {channel === 'DINE_IN' && (
                  <div className="grid grid-cols-2 gap-1.5">
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
                  <select
                    value={tableId}
                    onChange={(e) => setTableId(e.target.value)}
                    className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                  >
                    <option value="">{tables.length === 0 ? 'No hay mesas disponibles' : 'Selecciona una mesa…'}</option>
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.zoneName ? `${t.zoneName} · ` : ''}Mesa {t.number}
                      </option>
                    ))}
                  </select>
                )}

                {channel !== 'DINE_IN' && (
                  <div className="space-y-2">
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

                <div className="relative pt-1 border-t border-brand-950/10">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-950/30" />
                  <input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Buscar en el menú…"
                    className="w-full text-sm border border-brand-950/15 rounded-lg pl-8 pr-2.5 py-1.5"
                  />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <button
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
                      No hay productos que coincidan.
                    </p>
                  )}
                </div>

                {lines.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowComanda(true)}
                    className="flex items-center gap-1.5 text-xs font-medium text-brand-500 hover:text-brand-400"
                  >
                    <ReceiptText className="h-3.5 w-3.5" />
                    Ver comanda ({totalItems} {totalItems === 1 ? 'ítem' : 'ítems'}) · {formatBase(totalBase, symbol)}
                  </button>
                )}

                {error && <p className="text-sm text-red-600">{error}</p>}

                {channel === 'DINE_IN' && tableMode === 'ADD' ? (
                  <div className="space-y-2 pt-2 border-t border-brand-950/10">
                    <p className="text-sm font-medium text-brand-950/70">Elige la cuenta de mesa</p>
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
                      {filteredAddTableOrders.length === 0 && (
                        <p className="text-sm text-brand-950/40 font-light text-center py-3">
                          No hay cuentas de mesa abiertas.
                        </p>
                      )}
                      {filteredAddTableOrders.map((o) => (
                        <div
                          key={o.id}
                          className="w-full flex items-center gap-2 rounded-xl border border-brand-950/10 px-3 py-2"
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
                ) : (
                  <TextureButton
                    variant="brand"
                    size="default"
                    disabled={lines.length === 0}
                    onClick={goToStep2}
                    className="disabled:opacity-50"
                  >
                    Siguiente
                  </TextureButton>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <div className="flex items-center justify-between text-sm bg-brand-950/[0.03] rounded-xl px-3 py-2.5">
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

                {error && <p className="text-sm text-red-600">{error}</p>}

                <div className="flex gap-2">
                  <TextureButton variant="secondary" size="default" className="!w-auto" onClick={() => setStep(1)}>
                    Atrás
                  </TextureButton>
                  <TextureButton
                    variant="brand"
                    size="default"
                    className="flex-1 disabled:opacity-50"
                    disabled={!paymentIntent}
                    onClick={() => setStep(3)}
                  >
                    Siguiente
                  </TextureButton>
                </div>
              </>
            )}

            {step === 3 && (
              <>
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

                {error && <p className="text-sm text-red-600">{error}</p>}

                <div className="flex gap-2">
                  <TextureButton variant="secondary" size="default" className="!w-auto" onClick={() => setStep(2)}>
                    Atrás
                  </TextureButton>
                  <TextureButton
                    variant="brand"
                    size="default"
                    className="flex-1 disabled:opacity-50"
                    disabled={sending}
                    onClick={submit}
                  >
                    {sending ? 'Creando…' : 'Crear pedido'}
                  </TextureButton>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {showComanda && (
        <Dialog open onOpenChange={(o) => !o && setShowComanda(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Comanda</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <ul className="space-y-2 max-h-80 overflow-y-auto">
                {lines.map((l, i) => {
                  const unitPrice = cartLineUnitPrice(l);
                  return (
                    <li key={i} className="flex items-center justify-between gap-2 border-b border-brand-950/10 pb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-brand-950 truncate">
                          {l.product.name}
                          {l.variantName && <span className="text-brand-950/50"> ({l.variantName})</span>}
                        </p>
                        {l.selectedModifiers.length > 0 && (
                          <p className="text-xs text-brand-950/50">{l.selectedModifiers.map((m) => m.name).join(', ')}</p>
                        )}
                        <p className="text-xs text-brand-950/50">
                          {formatBase(unitPrice, symbol)} c/u · {formatBase(unitPrice * l.quantity, symbol)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => adjustLineAt(i, -1)}
                          className="w-7 h-7 rounded-full border border-brand-950/20 font-bold text-brand-950"
                        >
                          −
                        </button>
                        <span className="w-5 text-center text-sm font-medium">{l.quantity}</span>
                        <button
                          onClick={() => adjustLineAt(i, 1)}
                          className="w-7 h-7 rounded-full border border-brand-950/20 font-bold text-brand-950"
                        >
                          +
                        </button>
                      </div>
                    </li>
                  );
                })}
                {lines.length === 0 && (
                  <p className="text-sm text-brand-950/40 font-light text-center py-4">No hay productos agregados.</p>
                )}
              </ul>
              {hasCharges && (
                <div className="text-xs text-brand-950/60 space-y-1 pt-2 border-t border-brand-950/10">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatBase(subtotalBase, symbol)}</span>
                  </div>
                  {restaurant?.serviceChargeEnabled && (
                    <div className="flex justify-between">
                      <span>Servicio (10%)</span>
                      <span>{formatBase(serviceChargeBase, symbol)}</span>
                    </div>
                  )}
                  {restaurant?.ivaEnabled && (
                    <div className="flex justify-between">
                      <span>IVA (16%)</span>
                      <span>{formatBase(ivaBase, symbol)}</span>
                    </div>
                  )}
                  {channel === 'DELIVERY' && deliveryFeeBase != null && deliveryFeeBase > 0 && (
                    <div className="flex justify-between">
                      <span>Envío</span>
                      <span>{formatBase(deliveryFeeBase, symbol)}</span>
                    </div>
                  )}
                </div>
              )}
              {channel === 'DELIVERY' && quotingFee && <p className="text-xs text-brand-950/40">Calculando envío…</p>}
              <div className="flex items-center justify-between text-sm font-semibold pt-1 border-t border-brand-950/10">
                <span>Total</span>
                <span>{formatBase(totalBase, symbol)}</span>
              </div>
              {rateBs && (
                <div className="flex items-center justify-between text-xs text-brand-950/50 -mt-2">
                  <span>Equivalente</span>
                  <span>{formatBs(totalBase, rateBs)}</span>
                </div>
              )}
              <TextureButton variant="secondary" size="default" onClick={() => setShowComanda(false)}>
                Volver al menú
              </TextureButton>
            </div>
          </DialogContent>
        </Dialog>
      )}

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
