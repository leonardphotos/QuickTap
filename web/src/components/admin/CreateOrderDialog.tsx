import { useEffect, useMemo, useState } from 'react';
import { Bike, ClipboardList, MapPin, ReceiptText, Search, Store, UtensilsCrossed } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, formatBase, formatBs } from '@/utils/format';
import type { FloorPlan, Product } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';

interface ExistingOrderOption {
  id: string;
  orderNumber: number;
  channel: 'DINE_IN' | 'DELIVERY' | 'PICKUP';
  customerName: string | null;
  table: { number: string } | null;
}

interface Props {
  existingOrders: ExistingOrderOption[];
  onClose: () => void;
  onCreated: () => void;
  onSelectExisting: (orderId: string) => void;
}

type Channel = 'DINE_IN' | 'DELIVERY' | 'PICKUP';

interface AvailableTable {
  id: string;
  number: string;
  zoneName: string | null;
}

const CHANNEL_OPTIONS: { value: Channel; label: string; icon: typeof UtensilsCrossed }[] = [
  { value: 'DINE_IN', label: 'Mesa', icon: UtensilsCrossed },
  { value: 'DELIVERY', label: 'Delivery', icon: Bike },
  { value: 'PICKUP', label: 'Pick-up', icon: Store },
];

const CHANNEL_LABELS: Record<Channel, string> = { DINE_IN: 'Mesa', DELIVERY: 'Delivery', PICKUP: 'Pickup' };

/** "Crear pedido" desde el Dashboard: pedido nuevo (Mesa/Delivery/Pick-up) o sumar productos a uno ya activo. */
export function CreateOrderDialog({ existingOrders, onClose, onCreated, onSelectExisting }: Props) {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [existingSearch, setExistingSearch] = useState('');
  const [channel, setChannel] = useState<Channel>('DINE_IN');

  const [products, setProducts] = useState<Product[]>([]);
  const [tables, setTables] = useState<AvailableTable[]>([]);
  const [tableId, setTableId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerIdNumber, setCustomerIdNumber] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [addressCoords, setAddressCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [customerNote, setCustomerNote] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryFeeBase, setDeliveryFeeBase] = useState<number | null>(null);
  const [quotingFee, setQuotingFee] = useState(false);
  const [showComanda, setShowComanda] = useState(false);
  const [rateBs, setRateBs] = useState<string | null>(null);
  const [addingToId, setAddingToId] = useState<string | null>(null);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationError('Tu navegador no soporta geolocalización.');
      return;
    }
    setGettingLocation(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setAddressCoords({ lat: latitude, lng: longitude });
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
    () => products.map((p) => ({ product: p, quantity: quantities[p.id] ?? 0 })).filter((l) => l.quantity > 0),
    [products, quantities],
  );
  const subtotalBase = lines.reduce((acc, l) => acc + Number(l.product.price) * l.quantity, 0);
  const serviceChargeBase = restaurant?.serviceChargeEnabled ? subtotalBase * 0.1 : 0;
  const ivaBase = restaurant?.ivaEnabled ? subtotalBase * 0.16 : 0;
  const totalBase =
    subtotalBase + serviceChargeBase + ivaBase + (channel === 'DELIVERY' ? deliveryFeeBase ?? 0 : 0);
  const hasCharges = restaurant?.serviceChargeEnabled || restaurant?.ivaEnabled || Boolean(deliveryFeeBase);

  const filteredExistingOrders = useMemo(() => {
    const query = existingSearch.trim().toLowerCase();
    if (!query) return existingOrders;
    return existingOrders.filter(
      (o) =>
        String(o.orderNumber).includes(query) ||
        o.customerName?.toLowerCase().includes(query) ||
        o.table?.number.toLowerCase().includes(query) ||
        CHANNEL_LABELS[o.channel].toLowerCase().includes(query),
    );
  }, [existingOrders, existingSearch]);

  function setQty(productId: string, quantity: number) {
    setQuantities((q) => ({ ...q, [productId]: Math.max(0, quantity) }));
  }

  async function submit() {
    if (lines.length === 0) {
      setError('Agrega al menos un producto.');
      return;
    }
    if (channel === 'DINE_IN' && !tableId) {
      setError('Selecciona una mesa.');
      return;
    }
    if (channel !== 'DINE_IN' && !customerName.trim()) {
      setError('Escribe el nombre del cliente.');
      return;
    }
    if (channel === 'DELIVERY' && !customerAddress.trim()) {
      setError('Escribe la dirección de entrega.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api.post('/orders/manual', {
        channel,
        tableId: channel === 'DINE_IN' ? tableId : undefined,
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        customerName: customerName.trim() || undefined,
        customerIdNumber: customerIdNumber.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        customerLat: channel === 'DELIVERY' ? addressCoords?.lat : undefined,
        customerLng: channel === 'DELIVERY' ? addressCoords?.lng : undefined,
        customerNote: customerNote.trim() || undefined,
      });
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo crear el pedido.');
    } finally {
      setSending(false);
    }
  }

  /** Añade la comanda armada en "Pedido nuevo" directamente a un pedido ya activo, sin perderla. */
  async function addToExisting(orderId: string) {
    if (lines.length === 0) return;
    setAddingToId(orderId);
    setError(null);
    try {
      // Secuencial: el backend recalcula el total del pedido a partir de todos sus ítems en cada llamada.
      for (const l of lines) {
        await api.post(`/orders/${orderId}/items`, { productId: l.product.id, quantity: l.quantity });
      }
      onCreated();
      onClose();
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
          <div className="grid grid-cols-2 gap-1.5 rounded-full bg-brand-950/[0.06] p-1">
            <button
              onClick={() => setMode('new')}
              className={`flex items-center justify-center gap-1.5 rounded-full py-1.5 text-sm font-medium transition-colors ${
                mode === 'new' ? 'bg-white shadow-sm text-brand-950' : 'text-brand-950/50'
              }`}
            >
              Pedido nuevo
            </button>
            <button
              onClick={() => setMode('existing')}
              className={`flex items-center justify-center gap-1.5 rounded-full py-1.5 text-sm font-medium transition-colors ${
                mode === 'existing' ? 'bg-white shadow-sm text-brand-950' : 'text-brand-950/50'
              }`}
            >
              Añadir a uno existente
            </button>
          </div>

          {mode === 'existing' ? (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-950/30" />
                <input
                  value={existingSearch}
                  onChange={(e) => setExistingSearch(e.target.value)}
                  placeholder="Buscar por número, cliente o mesa…"
                  className="w-full text-sm border border-brand-950/15 rounded-lg pl-8 pr-2.5 py-1.5"
                />
              </div>
              {lines.length === 0 && (
                <p className="text-xs text-brand-950/40">
                  Agrega productos en "Pedido nuevo" para poder añadirlos a un pedido con "Añadir".
                </p>
              )}
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {existingOrders.length === 0 && (
                  <p className="text-sm text-brand-950/40 font-light text-center py-4">No hay pedidos activos.</p>
                )}
                {existingOrders.length > 0 && filteredExistingOrders.length === 0 && (
                  <p className="text-sm text-brand-950/40 font-light text-center py-4">
                    No se encontraron pedidos.
                  </p>
                )}
                {filteredExistingOrders.map((o) => (
                  <div
                    key={o.id}
                    className="w-full flex items-center gap-2 rounded-xl border border-brand-950/10 px-3 py-2.5 hover:border-brand-400/50 hover:bg-brand-950/[0.02] transition-colors"
                  >
                    <button
                      onClick={() => onSelectExisting(o.id)}
                      className="flex-1 min-w-0 flex items-center gap-3 text-left"
                    >
                      <ClipboardList className="h-4 w-4 text-brand-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-brand-950">
                          #{o.orderNumber}
                          {o.customerName && (
                            <span className="font-normal text-brand-950/60"> · {o.customerName}</span>
                          )}
                        </p>
                        <p className="text-xs text-brand-950/40">
                          {CHANNEL_LABELS[o.channel]}
                          {o.table && ` ${o.table.number}`}
                        </p>
                      </div>
                    </button>
                    <TextureButton
                      variant="brand"
                      size="sm"
                      className="!w-auto px-3 shrink-0 disabled:opacity-40"
                      disabled={lines.length === 0 || addingToId !== null}
                      onClick={() => addToExisting(o.id)}
                    >
                      {addingToId === o.id ? 'Añadiendo…' : 'Añadir'}
                    </TextureButton>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-1.5">
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

              {channel === 'DINE_IN' ? (
                <div className="space-y-2">
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
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Nombre (si la mesa no tiene cuenta abierta)"
                    className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                  />
                  <input
                    value={customerIdNumber}
                    onChange={(e) => setCustomerIdNumber(e.target.value)}
                    placeholder="Cédula (si la mesa no tiene cuenta abierta)"
                    className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Nombre del cliente *"
                    className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                  />
                  <input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Teléfono"
                    className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                  />
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

              <div className="space-y-4 max-h-56 overflow-y-auto pt-1 border-t border-brand-950/10">
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

              {lines.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowComanda(true)}
                  className="flex items-center gap-1.5 text-xs font-medium text-brand-500 hover:text-brand-400 -mb-1"
                >
                  <ReceiptText className="h-3.5 w-3.5" />
                  Ver comanda ({lines.reduce((acc, l) => acc + l.quantity, 0)} {lines.reduce((acc, l) => acc + l.quantity, 0) === 1 ? 'ítem' : 'ítems'})
                </button>
              )}

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
              {channel === 'DELIVERY' && quotingFee && (
                <p className="text-xs text-brand-950/40">Calculando envío…</p>
              )}

              <div className="flex items-center justify-between text-sm font-semibold pt-1">
                <span>Total</span>
                <span>{formatBase(totalBase, symbol)}</span>
              </div>
              {rateBs && (
                <div className="flex items-center justify-between text-xs text-brand-950/50 -mt-2">
                  <span>Equivalente</span>
                  <span>{formatBs(totalBase, rateBs)}</span>
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              <TextureButton variant="brand" size="default" disabled={sending} onClick={submit} className="disabled:opacity-50">
                {sending ? 'Enviando…' : 'Crear pedido'}
              </TextureButton>
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
                {lines.map((l) => (
                  <li
                    key={l.product.id}
                    className="flex items-center justify-between gap-2 border-b border-brand-950/10 pb-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-brand-950 truncate">{l.product.name}</p>
                      <p className="text-xs text-brand-950/50">
                        {formatBase(l.product.price, symbol)} c/u · {formatBase(Number(l.product.price) * l.quantity, symbol)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setQty(l.product.id, l.quantity - 1)}
                        className="w-7 h-7 rounded-full border border-brand-950/20 font-bold text-brand-950"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-sm font-medium">{l.quantity}</span>
                      <button
                        onClick={() => setQty(l.product.id, l.quantity + 1)}
                        className="w-7 h-7 rounded-full border border-brand-950/20 font-bold text-brand-950"
                      >
                        +
                      </button>
                    </div>
                  </li>
                ))}
                {lines.length === 0 && (
                  <p className="text-sm text-brand-950/40 font-light text-center py-4">No hay productos agregados.</p>
                )}
              </ul>
              <div className="flex items-center justify-between text-sm font-semibold pt-1 border-t border-brand-950/10">
                <span>Total</span>
                <span>{formatBase(totalBase, symbol)}</span>
              </div>
              <TextureButton variant="secondary" size="default" onClick={() => setShowComanda(false)}>
                Volver al menú
              </TextureButton>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
