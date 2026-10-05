import { api } from '@/api/client';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { reverseGeocode } from '@/components/AddressAutocomplete.shared';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard,TextureCardContent,TextureCardHeader,TextureCardTitle } from '@/components/ui/texture-card';
import { useAuth } from '@/context/AuthContext.shared';
import type { DeliveryZone } from '@/types';
import { quickTapTileDefinition } from '@/utils/map-tiles';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair,Maximize2,Minimize2,Plus,X } from 'lucide-react';
import { useEffect,useRef,useState } from 'react';
import { ImportZonesDialog } from './ImportZonesDialog';

// Los íconos por defecto de Leaflet se rompen con bundlers (rutas relativas al CSS).
// No usamos marcador de ícono personalizado, así que no hace falta arreglarlo aquí.

type PricingMode = 'DISABLED' | 'DISTANCE' | 'DISTANCE_TIERS' | 'ZONE';

const MODE_OPTIONS: { value: PricingMode; label: string; description: string }[] = [
  { value: 'DISABLED', label: 'Desactivado', description: 'No se cobra envío.' },
  { value: 'DISTANCE', label: 'Por distancia', description: 'Tarifa base + precio por km recorrido por carretera desde tu local.' },
  { value: 'DISTANCE_TIERS', label: 'Por tramos', description: 'Precio fijo por tramo de kilómetros. Fuera del último tramo, consultar la tarifa.' },
  { value: 'ZONE', label: 'Por zona', description: 'Precio fijo en tus zonas; fuera de ellas, tarifa por carretera calculada con tus puntos de referencia.' },
];

const EXAMPLE_RATES = [{ upToKm: 3, price: 2 }, { upToKm: 5, price: 3 }, { upToKm: 9, price: 4 }, { upToKm: 12, price: 5 }, { upToKm: 15, price: 6 }];

const DEFAULT_CENTER: [number, number] = [10.4806, -66.9036]; // Caracas, si no hay ubicación aún.

/** "Precio de Delivery": ubicación del local, tarifa por distancia o zonas dibujadas en el mapa. */
export function DeliveryPricingSection() {
  const { restaurant, refresh } = useAuth();
  const [mode, setMode] = useState<PricingMode>(restaurant?.deliveryPricingMode ?? 'DISABLED');
  const [originLat, setOriginLat] = useState<number | null>(restaurant?.deliveryOriginLat ?? null);
  const [originLng, setOriginLng] = useState<number | null>(restaurant?.deliveryOriginLng ?? null);
  const [originAddress, setOriginAddress] = useState('');
  const [baseFee, setBaseFee] = useState(restaurant?.deliveryBaseFee ?? '0');
  const [pricePerKm, setPricePerKm] = useState(restaurant?.deliveryPricePerKm ?? '0');
  const [rates, setRates] = useState(() => (restaurant?.deliveryDistanceRates?.length ? restaurant.deliveryDistanceRates : EXAMPLE_RATES).map(rate => ({ upToKm: String(rate.upToKm), price: String(rate.price) })));
  const [autoOpen, setAutoOpen] = useState(!!restaurant?.deliveryAutoOpenOnPaid);
  const [autoAssign, setAutoAssign] = useState(!!restaurant?.deliveryAutoAssignOnPaid);
  const [autoAssignOnAccept, setAutoAssignOnAccept] = useState(!!restaurant?.deliveryAutoAssignOnAccept);
  const [activeCourierCount, setActiveCourierCount] = useState<number | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Para las advertencias de "necesitas al menos un repartidor activo" — no tiene sentido
  // mostrarlas si el restaurante ya tiene repartidores cargados en Equipo de Delivery.
  useEffect(() => {
    api.get('/delivery-couriers').then((res) => {
      setActiveCourierCount((res.data.data as { isActive: boolean }[]).filter((c) => c.isActive).length);
    });
  }, []);

  // El texto de la dirección nunca se guarda en el backend (solo lat/lng) — sin esto, el
  // campo siempre aparecía vacío al reabrir Ajustes aunque la ubicación sí estuviera
  // guardada, dando la falsa impresión de que "no guarda la ubicación".
  useEffect(() => {
    if (restaurant?.deliveryOriginLat != null && restaurant?.deliveryOriginLng != null) {
      reverseGeocode(restaurant.deliveryOriginLat, restaurant.deliveryOriginLng).then(setOriginAddress);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.deliveryOriginLat, restaurant?.deliveryOriginLng]);

  /** Si el usuario escribió una dirección pero nunca hizo clic en una sugerencia del
   * autocompletado, originLat/originLng quedan en null y el guardado no tenía con qué
   * calcular el delivery. Geocodifica el texto escrito como último recurso antes de guardar. */
  async function resolveTypedAddress(): Promise<{ lat: number; lng: number } | null> {
    if (originLat != null && originLng != null) return { lat: originLat, lng: originLng };
    const query = originAddress.trim();
    if (!query) return null;
    try {
      const params = new URLSearchParams({ format: 'jsonv2', q: query, limit: '1' });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
      const data: any[] = await res.json();
      if (data[0]) {
        const lat = Number(data[0].lat);
        const lng = Number(data[0].lon);
        setOriginLat(lat);
        setOriginLng(lng);
        return { lat, lng };
      }
    } catch {
      // Sin conexión al servicio de geocodificación — se maneja como "no se pudo resolver".
    }
    return null;
  }

  function useCurrentLocationAsOrigin() {
    if (!navigator.geolocation) {
      setError('Tu navegador no soporta geolocalización.');
      return;
    }
    setGettingLocation(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setOriginLat(latitude);
        setOriginLng(longitude);
        // El campo de dirección nunca debe quedar vacío tras tomar la ubicación —
        // si no se había escrito nada, se rellena con la dirección legible (o, si
        // falla el reverse geocoding, con las coordenadas).
        if (!originAddress.trim()) {
          setOriginAddress(await reverseGeocode(latitude, longitude));
        }
        setGettingLocation(false);
      },
      () => {
        setError('No se pudo obtener tu ubicación. Revisa los permisos del navegador.');
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const origin = await resolveTypedAddress();
      if (origin == null && originAddress.trim() && (mode === 'DISTANCE' || mode === 'DISTANCE_TIERS')) {
        setError('No se pudo ubicar esa dirección. Elige una sugerencia de la lista o usa "Usar mi ubicación actual".');
        setSaving(false);
        return;
      }
      if (mode === 'DISTANCE_TIERS') {
        if (!origin) throw new Error('Selecciona la ubicación del local para calcular los kilómetros por carretera.');
        if (!rates.length || rates.some((rate, i) => !rate.upToKm.trim() || !rate.price.trim() || !Number.isFinite(Number(rate.upToKm)) || !Number.isFinite(Number(rate.price)) || Number(rate.upToKm) <= (i ? Number(rates[i - 1].upToKm) : 0) || Number(rate.upToKm) > 60 || Number(rate.price) < 0)) throw new Error('Completa los tramos con distancias crecientes de hasta 60 km y precios válidos.');
      }
      await api.patch('/restaurant', {
        deliveryPricingMode: mode,
        ...(mode === 'DISTANCE_TIERS' ? { deliveryDistanceRates: rates.map(rate => ({ upToKm: Number(rate.upToKm), price: Number(rate.price) })) } : {}),
        deliveryOriginLat: origin?.lat ?? undefined,
        deliveryOriginLng: origin?.lng ?? undefined,
        deliveryBaseFee: Number(baseFee) || 0,
        deliveryPricePerKm: Number(pricePerKm) || 0,
        deliveryAutoOpenOnPaid: autoOpen,
        deliveryAutoAssignOnPaid: autoAssign,
        deliveryAutoAssignOnAccept: autoAssignOnAccept,
      });
      await refresh();
      setMessage('Configuración de delivery guardada.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? err.message ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Precio de Delivery</TextureCardTitle>
        <p className="text-brand-950/60 font-light text-base">
          Cobra el envío automáticamente: por kilómetro, por tramos de distancia o con un precio fijo por zona.
        </p>
      </TextureCardHeader>
      <TextureCardContent className="space-y-5">
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-2">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setMode(opt.value)}
              className={`text-left rounded-xl border p-3 transition-colors ${
                mode === opt.value ? 'border-brand-500 bg-brand-500/5' : 'border-brand-950/10 hover:border-brand-950/20'
              }`}
            >
              <p className="font-medium text-brand-950 text-base">{opt.label}</p>
              <p className="text-brand-950/50 font-light mt-0.5 text-xs">{opt.description}</p>
            </button>
          ))}
        </div>

        <div className="space-y-2 max-w-md">
          <p className="font-medium text-brand-950 text-base">Ubicación de tu local</p>
          <AddressAutocomplete
            value={originAddress}
            onChange={setOriginAddress}
            onSelect={(s) => {
              setOriginAddress(s.displayName);
              setOriginLat(s.lat);
              setOriginLng(s.lng);
            }}
            biasLat={originLat}
            biasLng={originLng}
            placeholder="Escribe la dirección de tu local…"
            className="w-full text-sm border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <TextureButton
              variant="minimal"
              size="sm"
              className="!w-auto"
              disabled={gettingLocation}
              onClick={useCurrentLocationAsOrigin}
            >
              {gettingLocation ? 'Obteniendo ubicación…' : 'Usar mi ubicación actual'}
            </TextureButton>
            {originLat != null && originLng != null && (
              <span className="text-xs text-emerald-600 font-medium">
                ✓ Ubicación guardada ({originLat.toFixed(4)}, {originLng.toFixed(4)})
              </span>
            )}
          </div>
        </div>

        {mode === 'DISTANCE_TIERS' && (
          <section className="max-w-2xl rounded-2xl border border-brand-950/10 bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-brand-950">Por tramos</h3>
              <button type="button" onClick={() => setRates(EXAMPLE_RATES.map(rate => ({ upToKm: String(rate.upToKm), price: String(rate.price) })))} className="min-h-10 text-sm font-medium text-brand-500">Usar tarifas de ejemplo</button>
            </div>
            <p className="text-brand-950/60 text-base">Distancia por carretera desde tu local. Cada precio cubre todo el tramo, sin sumar un cargo por kilómetro. Precios en {restaurant?.baseCurrency ?? 'USD'}.</p>
            <div className="grid grid-cols-[1fr_1fr_1fr_2.5rem] gap-2 text-xs font-semibold text-brand-950/60"><span>Desde</span><span>Hasta (km)</span><span>Precio</span><span /></div>
            {rates.map((rate, index) => <div key={index} className="grid grid-cols-[1fr_1fr_1fr_2.5rem] items-center gap-2">
              <span className="text-sm text-brand-950/70">{index === 0 ? '0 km' : `Más de ${rates[index - 1].upToKm || '…'} km`}</span>
              <input aria-label={`Hasta kilómetros tramo ${index + 1}`} type="number" min="0.01" max="60" step="0.01" value={rate.upToKm} onChange={event => setRates(current => current.map((row, i) => i === index ? { ...row, upToKm: event.target.value } : row))} className="min-h-11 min-w-0 rounded-xl border border-brand-950/15 px-3 text-base" />
              <input aria-label={`Precio tramo ${index + 1}`} type="number" min="0" max="100000" step="0.01" value={rate.price} onChange={event => setRates(current => current.map((row, i) => i === index ? { ...row, price: event.target.value } : row))} className="min-h-11 min-w-0 rounded-xl border border-brand-950/15 px-3 text-base" />
              <button type="button" aria-label={`Quitar tramo ${index + 1}`} disabled={rates.length === 1} onClick={() => setRates(current => current.filter((_, i) => i !== index))} className="flex min-h-11 items-center justify-center rounded-xl text-red-600 disabled:opacity-30"><X size={18} /></button>
            </div>)}
            <button type="button" disabled={rates.length >= 20} onClick={() => setRates(current => [...current, { upToKm: '', price: '' }])} className="flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-500 disabled:opacity-40"><Plus size={16} /> Agregar tramo</button>
            <p className="rounded-xl bg-amber-50 p-3 text-amber-900 text-base">Más de {rates[rates.length - 1]?.upToKm || '…'} km: <strong>tarifa por confirmar</strong>. Consulta el costo antes de aceptar el envío y colócalo manualmente en el pedido.</p>
            <p className="text-brand-950/50 text-xs">Los tramos se unen sin huecos: 3 km usa el primer precio; cualquier distancia mayor de 3 km pasa al siguiente.</p>
          </section>
        )}

        {mode === 'DISTANCE' && (
          <div className="grid sm:grid-cols-2 gap-3 max-w-md">
            <label className="block text-sm font-medium">
              <span className="text-brand-950/70">Tarifa base</span>
              <input
                value={baseFee}
                onChange={(e) => setBaseFee(e.target.value.replace(/[^0-9.]/g, ''))}
                className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 text-base"
              />
            </label>
            <label className="block text-sm font-medium">
              <span className="text-brand-950/70">Precio por Km</span>
              <input
                value={pricePerKm}
                onChange={(e) => setPricePerKm(e.target.value.replace(/[^0-9.]/g, ''))}
                className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 text-base"
              />
            </label>
          </div>
        )}

        <div className="space-y-2 pt-1 border-t border-brand-950/[0.06]">
          <p className="font-medium text-brand-950 pt-3 text-base">Al aceptar un pedido de delivery</p>
          <DeliveryPaidToggle
            checked={autoAssignOnAccept}
            onChange={setAutoAssignOnAccept}
            title="Asignar repartidor automáticamente al aceptar"
            description="Apenas se acepta el pedido (antes de cobrarlo), elige repartidor por turnos y abre su WhatsApp con la comanda, sin preguntar."
          />
          {autoAssignOnAccept && activeCourierCount === 0 && (
            <p className="font-light text-amber-700 text-xs">
              Necesitas al menos un repartidor activo en Ajustes → Equipo de Delivery. Si no hay ninguno, el pedido
              se acepta igual y queda sin despachar.
            </p>
          )}
        </div>

        <div className="space-y-2 pt-1 border-t border-brand-950/[0.06]">
          <p className="font-medium text-brand-950 pt-3 text-base">Al terminar de cobrar un pedido de delivery</p>
          <DeliveryPaidToggle
            checked={autoOpen}
            onChange={(v) => {
              setAutoOpen(v);
              if (v) setAutoAssign(false);
            }}
            title="Abrir el equipo de delivery automáticamente"
            description="Apenas se completa el cobro, se abre la ventana para elegir a qué repartidor mandarlo — sin buscar el pedido en la lista."
          />
          <DeliveryPaidToggle
            checked={autoAssign}
            onChange={(v) => {
              setAutoAssign(v);
              if (v) setAutoOpen(false);
            }}
            title="Enviar a un repartidor automáticamente"
            description="No pregunta: elige repartidor por turnos (el que lleve más tiempo sin recibir un pedido) y abre su WhatsApp con la comanda."
          />
          {autoAssign && activeCourierCount === 0 && (
            <p className="font-light text-amber-700 text-xs">
              Necesitas al menos un repartidor activo en Ajustes → Equipo de Delivery. Si no hay ninguno, el cobro se
              completa igual y el pedido queda sin despachar.
            </p>
          )}
        </div>

        {error && <p className="text-red-600 text-base">{error}</p>}
        {message && <p className="text-brand-500 text-base">{message}</p>}

        <TextureButton variant="brand" size="default" disabled={saving} onClick={save} className="!w-auto disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </TextureButton>

        {mode === 'ZONE' && (
          <ZoneMapEditor originLat={originLat} originLng={originLng} />
        )}
      </TextureCardContent>
    </TextureCard>
  );
}

/** Interruptor de las dos automatizaciones de despacho al cobrar. Son excluyentes
 * entre sí (enviar solo ya implica no preguntar), así que el padre apaga una al
 * encender la otra. */
function DeliveryPaidToggle({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-brand-950/10 bg-brand-50/40 px-4 py-3">
      <div className="min-w-0">
        <p className="font-medium text-brand-950 text-base">{title}</p>
        <p className="mt-0.5 font-light text-brand-950/50 text-xs">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-brand-500' : 'bg-brand-950/20'
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-200 ease-out-strong motion-reduce:transition-none ${checked ? 'left-6' : 'left-1'}`}
        />
      </button>
    </div>
  );
}

/**
 * Pin del local: marcador en forma de gota. Antes era un `circleMarker` de 7px que
 * se confundía con los vértices del polígono que se está dibujando.
 */
const ORIGIN_ICON = L.divIcon({
  className: '',
  html: `<svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
    <path d="M13 0C5.82 0 0 5.82 0 13c0 9.75 13 23 13 23s13-13.25 13-23C26 5.82 20.18 0 13 0z" fill="#009aff"/>
    <circle cx="13" cy="13" r="5" fill="#ffffff"/>
  </svg>`,
  iconSize: [26, 36],
  iconAnchor: [13, 36],
  tooltipAnchor: [0, -30],
});

/**
 * Editor de zonas de envío. Todas las herramientas van flotando encima del mapa
 * (no en filas arriba/abajo) y hay modo pantalla completa, porque dibujar un
 * polígono sobre un mapa de 320px de alto es incómodo. Tocar una zona ya guardada
 * la selecciona y abre su modificador de precio ahí mismo.
 */
function ZoneMapEditor({ originLat, originLng }: { originLat: number | null; originLng: number | null }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const drawLayerRef = useRef<L.LayerGroup | null>(null);
  const zonesLayerRef = useRef<L.LayerGroup | null>(null);
  const originMarkerRef = useRef<L.Marker | null>(null);
  const draftPointsRef = useRef<[number, number][]>([]);
  const drawingRef = useRef(false);

  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [draftCount, setDraftCount] = useState(0);
  const [pendingSave, setPendingSave] = useState<[number, number][] | null>(null);
  const [zoneName, setZoneName] = useState('');
  const [zonePrice, setZonePrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;

  function loadZones() {
    api.get('/delivery-zones').then((res) => setZones(res.data.data));
  }

  useEffect(loadZones, []);

  useEffect(() => {
    drawingRef.current = drawing;
  }, [drawing]);

  // Inicializa el mapa una sola vez.
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const center: [number, number] = originLat != null && originLng != null ? [originLat, originLng] : DEFAULT_CENTER;
    const map = L.map(mapContainerRef.current, { zoomControl: false }).setView(center, 13);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    const [tileUrl, tileOptions] = quickTapTileDefinition();
    L.tileLayer(tileUrl, tileOptions).addTo(map);

    zonesLayerRef.current = L.layerGroup().addTo(map);
    drawLayerRef.current = L.layerGroup().addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      // Fuera del modo dibujo, un clic en el mapa vacío deselecciona la zona activa.
      if (!drawingRef.current) {
        setSelectedZoneId(null);
        return;
      }
      draftPointsRef.current = [...draftPointsRef.current, [e.latlng.lat, e.latlng.lng]];
      renderDraft();
      setDraftCount(draftPointsRef.current.length);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El pin del local se mantiene sincronizado: la ubicación se puede cambiar en
  // esta misma pantalla (buscador de dirección / "usar mi ubicación") sin recargar.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    originMarkerRef.current?.remove();
    originMarkerRef.current = null;
    if (originLat == null || originLng == null) return;
    originMarkerRef.current = L.marker([originLat, originLng], { icon: ORIGIN_ICON, interactive: false })
      .addTo(map)
      .bindTooltip('Tu local', { direction: 'top' });
  }, [originLat, originLng]);

  // Leaflet mide el contenedor al crearse: al entrar/salir de pantalla completa
  // hay que pedirle que vuelva a medir o el mapa queda recortado.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(id);
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen]);

  function renderDraft() {
    if (!drawLayerRef.current) return;
    drawLayerRef.current.clearLayers();
    const points = draftPointsRef.current;
    for (const p of points) {
      L.circleMarker(p, { radius: 4, color: '#e11d48', fillOpacity: 1 }).addTo(drawLayerRef.current);
    }
    if (points.length > 1) {
      L.polyline(points, { color: '#e11d48', dashArray: '4 4' }).addTo(drawLayerRef.current);
    }
    if (points.length > 2) {
      L.polygon(points, { color: '#e11d48', fillOpacity: 0.15 }).addTo(drawLayerRef.current);
    }
  }

  // Redibuja las zonas guardadas cuando cambian o cuando cambia cuál está seleccionada.
  useEffect(() => {
    const layer = zonesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const zone of zones) {
      const latlngs = zone.polygon.map((p) => [p.lat, p.lng] as [number, number]);
      const isSelected = zone.id === selectedZoneId;
      const polygon = L.polygon(latlngs, {
        color: isSelected ? '#f59e0b' : '#009aff',
        weight: isSelected ? 3 : 2,
        fillOpacity: isSelected ? 0.3 : 0.1,
      }).addTo(layer);
      polygon.bindTooltip(`${zone.name} · $${zone.price}`);
      polygon.on('click', (e: L.LeafletMouseEvent) => {
        // Mientras se dibuja, el clic sobre una zona existente debe seguir
        // agregando un punto al nuevo polígono (no robar el evento).
        if (drawingRef.current) return;
        L.DomEvent.stopPropagation(e);
        setSelectedZoneId(zone.id);
        setEditingPrice(String(zone.price));
        setError(null);
      });
    }
  }, [zones, selectedZoneId]);

  function startDrawing() {
    draftPointsRef.current = [];
    drawLayerRef.current?.clearLayers();
    setDraftCount(0);
    setSelectedZoneId(null);
    setError(null);
    setDrawing(true);
  }

  function cancelDrawing() {
    draftPointsRef.current = [];
    drawLayerRef.current?.clearLayers();
    setDraftCount(0);
    setDrawing(false);
    setPendingSave(null);
  }

  function undoLastPoint() {
    draftPointsRef.current = draftPointsRef.current.slice(0, -1);
    renderDraft();
    setDraftCount(draftPointsRef.current.length);
  }

  function finishDrawing() {
    if (draftPointsRef.current.length < 3) {
      setError('Marca al menos 3 puntos en el mapa para formar la zona.');
      return;
    }
    setError(null);
    setPendingSave(draftPointsRef.current);
    setDrawing(false);
  }

  function centerOnOrigin() {
    if (originLat == null || originLng == null || !mapRef.current) return;
    mapRef.current.setView([originLat, originLng], 14);
  }

  async function saveZone() {
    if (!pendingSave) return;
    if (!zoneName.trim() || !zonePrice) {
      setError('Ponle nombre y precio a la zona.');
      return;
    }
    setError(null);
    try {
      await api.post('/delivery-zones', {
        name: zoneName.trim(),
        price: Number(zonePrice),
        polygon: pendingSave.map(([lat, lng]) => ({ lat, lng })),
      });
      draftPointsRef.current = [];
      drawLayerRef.current?.clearLayers();
      setPendingSave(null);
      setZoneName('');
      setZonePrice('');
      setDraftCount(0);
      loadZones();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar la zona.');
    }
  }

  async function saveSelectedPrice() {
    if (!selectedZone || !editingPrice) return;
    setSavingPrice(true);
    setError(null);
    try {
      await api.patch(`/delivery-zones/${selectedZone.id}`, { price: Number(editingPrice) });
      loadZones();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo actualizar el precio.');
    } finally {
      setSavingPrice(false);
    }
  }

  async function removeZone(id: string) {
    if (!confirm('¿Eliminar esta zona de envío?')) return;
    await api.delete(`/delivery-zones/${id}`);
    if (selectedZoneId === id) setSelectedZoneId(null);
    loadZones();
  }

  function selectFromList(zone: DeliveryZone) {
    setSelectedZoneId(zone.id);
    setEditingPrice(String(zone.price));
    setError(null);
    const latlngs = zone.polygon.map((p) => [p.lat, p.lng] as [number, number]);
    if (latlngs.length > 0) mapRef.current?.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40] });
  }

  const zoneList = (
    <div className="divide-y divide-brand-950/[0.06]">
      {zones.length === 0 && <p className="text-brand-950/40 font-light py-2 text-base">Sin zonas dibujadas todavía.</p>}
      {zones.map((z) => (
        <button
          key={z.id}
          type="button"
          onClick={() => selectFromList(z)}
          className={`flex w-full items-center justify-between gap-3 py-2 text-left transition-colors ${
            z.id === selectedZoneId ? 'text-amber-600' : 'text-brand-950 hover:text-brand-500'
          }`}
        >
          <span className="text-sm truncate">{z.name}</span>
          <span className="text-sm text-brand-950/50 shrink-0">${z.price}</span>
        </button>
      ))}
    </div>
  );

  // En pantalla completa las herramientas flotan siempre (es la única forma de
  // llegar a ellas); en la vista normal la lista flota solo en pantallas anchas,
  // donde hay espacio de sobra al lado del mapa.
  const floatingListClass = fullscreen ? 'block' : 'hidden lg:block';

  return (
    <div className={fullscreen ? 'fixed inset-0 z-[80] bg-white p-3 sm:p-4' : 'space-y-3 pt-3 border-t border-brand-950/[0.06]'}>
      <div
        className={`relative w-full overflow-hidden rounded-xl border border-brand-950/10 ${
          fullscreen ? 'h-full' : 'h-96'
        }`}
      >
        <div ref={mapContainerRef} className="absolute inset-0" />

        {/* Capa de herramientas flotantes: transparente al puntero salvo en los paneles. */}
        <div className="pointer-events-none absolute inset-0 z-[1000] p-3">
          {/* Barra superior derecha: dibujar / pantalla completa. */}
          <div className="pointer-events-auto absolute top-3 right-3 flex flex-wrap items-center justify-end gap-2">
            {!drawing && !pendingSave && (
              <>
                <TextureButton variant="minimal" size="sm" className="!w-auto shadow-lg" onClick={() => setImportOpen(true)}>
                  Importar lista
                </TextureButton>
                <TextureButton variant="brand" size="sm" className="!w-auto shadow-lg" onClick={startDrawing}>
                  + Dibujar zona
                </TextureButton>
              </>
            )}
            {drawing && (
              <>
                <span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-brand-950 shadow-lg backdrop-blur">
                  {draftCount} punto(s) · toca el mapa
                </span>
                {draftCount > 0 && (
                  <TextureButton variant="minimal" size="sm" className="!w-auto shadow-lg" onClick={undoLastPoint}>
                    Deshacer
                  </TextureButton>
                )}
                <TextureButton variant="brand" size="sm" className="!w-auto shadow-lg" onClick={finishDrawing}>
                  Finalizar zona
                </TextureButton>
                <TextureButton variant="minimal" size="sm" className="!w-auto shadow-lg" onClick={cancelDrawing}>
                  Cancelar
                </TextureButton>
              </>
            )}
            {originLat != null && originLng != null && (
              <button
                type="button"
                onClick={centerOnOrigin}
                title="Centrar en tu local"
                aria-label="Centrar en tu local"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-brand-950/70 shadow-lg backdrop-blur hover:text-brand-500"
              >
                <Crosshair className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setFullscreen((v) => !v)}
              title={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
              aria-label={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-brand-950/70 shadow-lg backdrop-blur hover:text-brand-500"
            >
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>

          {/* Lista de zonas flotante. */}
          <div
            className={`pointer-events-auto absolute top-3 left-3 w-56 max-h-[45%] overflow-y-auto rounded-2xl border border-brand-950/10 bg-white/95 p-3 shadow-lg backdrop-blur ${floatingListClass}`}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="font-semibold uppercase tracking-wide text-brand-950/50 text-xs">Zonas de envío</p>
              {!drawing && !pendingSave && (
                <button
                  type="button"
                  onClick={startDrawing}
                  title="Añadir zona"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white hover:bg-brand-600"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {zoneList}
          </div>

          {/* Modificador de precio de la zona seleccionada. */}
          {selectedZone && !drawing && !pendingSave && (
            <div className="pointer-events-auto absolute bottom-3 left-1/2 w-[min(24rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-2xl border border-brand-950/10 bg-white/95 p-3 shadow-lg backdrop-blur">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="truncate font-semibold text-brand-950 text-base">{selectedZone.name}</p>
                <button
                  type="button"
                  onClick={() => setSelectedZoneId(null)}
                  aria-label="Cerrar"
                  className="shrink-0 rounded-full p-1 text-brand-950/40 hover:bg-brand-950/5 hover:text-brand-950"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-brand-950/60">Precio de envío</span>
                <input
                  value={editingPrice}
                  onChange={(e) => setEditingPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="decimal"
                  className="w-24 rounded-lg border border-brand-950/15 px-2 py-1.5 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40 text-base"
                />
                <TextureButton
                  variant="brand"
                  size="sm"
                  disabled={savingPrice}
                  className="!w-auto disabled:opacity-50"
                  onClick={saveSelectedPrice}
                >
                  {savingPrice ? 'Guardando…' : 'Guardar'}
                </TextureButton>
                <button
                  type="button"
                  onClick={() => removeZone(selectedZone.id)}
                  className="ml-auto shrink-0 text-xs text-red-600 hover:text-red-700"
                >
                  Eliminar
                </button>
              </div>
            </div>
          )}

          {/* Nombre + precio de la zona recién dibujada. */}
          {pendingSave && (
            <div className="pointer-events-auto absolute bottom-3 left-1/2 w-[min(26rem,calc(100%-1.5rem))] -translate-x-1/2 space-y-2 rounded-2xl border border-brand-950/10 bg-white/95 p-3 shadow-lg backdrop-blur">
              <p className="text-brand-950 text-base">Nombre y precio de la zona que acabas de dibujar:</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  placeholder="Ej: Zona Norte"
                  className="rounded-lg border border-brand-950/15 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40 text-base"
                />
                <input
                  value={zonePrice}
                  onChange={(e) => setZonePrice(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="Precio de envío"
                  inputMode="decimal"
                  className="rounded-lg border border-brand-950/15 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40 text-base"
                />
              </div>
              <div className="flex gap-2">
                <TextureButton variant="brand" size="sm" className="!w-auto" onClick={saveZone}>
                  Guardar zona
                </TextureButton>
                <TextureButton variant="minimal" size="sm" className="!w-auto" onClick={cancelDrawing}>
                  Cancelar
                </TextureButton>
              </div>
            </div>
          )}

          {error && (
            <div className="pointer-events-auto absolute bottom-3 left-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 shadow-lg">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* En celular (y fuera de pantalla completa) la lista va debajo del mapa. */}
      {!fullscreen && (
        <div className="lg:hidden">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="font-semibold uppercase tracking-wide text-brand-950/50 text-xs">Zonas de envío</p>
            {!drawing && !pendingSave && (
              <TextureButton variant="brand" size="sm" className="!w-auto !h-auto !py-1 !px-2.5 text-xs" onClick={startDrawing}>
                + Añadir zona
              </TextureButton>
            )}
          </div>
          {zoneList}
        </div>
      )}

      <ImportZonesDialog open={importOpen} onOpenChange={setImportOpen} onImported={loadZones} />
    </div>
  );
}
