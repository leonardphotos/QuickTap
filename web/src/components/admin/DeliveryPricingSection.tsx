import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import type { DeliveryZone } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardHeader, TextureCardTitle, TextureCardContent } from '@/components/ui/texture-card';
import { AddressAutocomplete, reverseGeocode } from '@/components/AddressAutocomplete';

// Los íconos por defecto de Leaflet se rompen con bundlers (rutas relativas al CSS).
// No usamos marcador de ícono personalizado, así que no hace falta arreglarlo aquí.

type PricingMode = 'DISABLED' | 'DISTANCE' | 'ZONE';

const MODE_OPTIONS: { value: PricingMode; label: string; description: string }[] = [
  { value: 'DISABLED', label: 'Desactivado', description: 'No se cobra envío.' },
  { value: 'DISTANCE', label: 'Por distancia', description: 'Tarifa base + precio por Km desde tu local.' },
  { value: 'ZONE', label: 'Por zona', description: 'Precio fijo según la zona del mapa donde caiga el cliente.' },
];

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
  const [gettingLocation, setGettingLocation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      await api.patch('/restaurant', {
        deliveryPricingMode: mode,
        deliveryOriginLat: originLat ?? undefined,
        deliveryOriginLng: originLng ?? undefined,
        deliveryBaseFee: Number(baseFee) || 0,
        deliveryPricePerKm: Number(pricePerKm) || 0,
      });
      await refresh();
      setMessage('Configuración de delivery guardada.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Precio de Delivery</TextureCardTitle>
        <p className="text-sm text-brand-950/60 font-light">
          Cobra el envío automáticamente: por distancia desde tu local, o con un precio fijo por zona.
        </p>
      </TextureCardHeader>
      <TextureCardContent className="space-y-5">
        <div className="grid sm:grid-cols-3 gap-2">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setMode(opt.value)}
              className={`text-left rounded-xl border p-3 transition-colors ${
                mode === opt.value ? 'border-brand-500 bg-brand-500/5' : 'border-brand-950/10 hover:border-brand-950/20'
              }`}
            >
              <p className="text-sm font-medium text-brand-950">{opt.label}</p>
              <p className="text-xs text-brand-950/50 font-light mt-0.5">{opt.description}</p>
            </button>
          ))}
        </div>

        <div className="space-y-2 max-w-md">
          <p className="text-sm font-medium text-brand-950">Ubicación de tu local</p>
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

        {mode === 'DISTANCE' && (
          <div className="grid sm:grid-cols-2 gap-3 max-w-md">
            <label className="block text-sm">
              <span className="text-brand-950/70">Tarifa base</span>
              <input
                value={baseFee}
                onChange={(e) => setBaseFee(e.target.value.replace(/[^0-9.]/g, ''))}
                className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
            </label>
            <label className="block text-sm">
              <span className="text-brand-950/70">Precio por Km</span>
              <input
                value={pricePerKm}
                onChange={(e) => setPricePerKm(e.target.value.replace(/[^0-9.]/g, ''))}
                className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
            </label>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-brand-500">{message}</p>}

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

function ZoneMapEditor({ originLat, originLng }: { originLat: number | null; originLng: number | null }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const drawLayerRef = useRef<L.LayerGroup | null>(null);
  const zonesLayerRef = useRef<L.LayerGroup | null>(null);
  const draftPointsRef = useRef<[number, number][]>([]);

  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [draftCount, setDraftCount] = useState(0);
  const [pendingSave, setPendingSave] = useState<[number, number][] | null>(null);
  const [zoneName, setZoneName] = useState('');
  const [zonePrice, setZonePrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);

  function loadZones() {
    api.get('/delivery-zones').then((res) => setZones(res.data.data));
  }

  useEffect(loadZones, []);

  // Inicializa el mapa una sola vez.
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const center: [number, number] = originLat != null && originLng != null ? [originLat, originLng] : DEFAULT_CENTER;
    const map = L.map(mapContainerRef.current).setView(center, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    drawLayerRef.current = L.layerGroup().addTo(map);
    zonesLayerRef.current = L.layerGroup().addTo(map);

    if (originLat != null && originLng != null) {
      L.circleMarker([originLat, originLng], { radius: 7, color: '#056cf2', fillOpacity: 1 })
        .addTo(map)
        .bindTooltip('Tu local');
    }

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!drawingRef.current) return;
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

  const drawingRef = useRef(false);
  useEffect(() => {
    drawingRef.current = drawing;
  }, [drawing]);

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

  // Redibuja las zonas guardadas cuando cambian.
  useEffect(() => {
    if (!zonesLayerRef.current) return;
    zonesLayerRef.current.clearLayers();
    for (const zone of zones) {
      const latlngs = zone.polygon.map((p) => [p.lat, p.lng] as [number, number]);
      L.polygon(latlngs, { color: '#056cf2', fillOpacity: 0.1 })
        .addTo(zonesLayerRef.current)
        .bindTooltip(`${zone.name} · $${zone.price}`);
    }
  }, [zones]);

  function startDrawing() {
    draftPointsRef.current = [];
    drawLayerRef.current?.clearLayers();
    setDraftCount(0);
    setDrawing(true);
  }

  function cancelDrawing() {
    draftPointsRef.current = [];
    drawLayerRef.current?.clearLayers();
    setDraftCount(0);
    setDrawing(false);
    setPendingSave(null);
  }

  function finishDrawing() {
    if (draftPointsRef.current.length < 3) {
      setError('Marca al menos 3 puntos en el mapa para formar la zona.');
      return;
    }
    setPendingSave(draftPointsRef.current);
    setDrawing(false);
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

  async function removeZone(id: string) {
    if (!confirm('¿Eliminar esta zona de envío?')) return;
    await api.delete(`/delivery-zones/${id}`);
    loadZones();
  }

  function startEditPrice(zone: DeliveryZone) {
    setEditingZoneId(zone.id);
    setEditingPrice(String(zone.price));
  }

  async function saveEditedPrice(id: string) {
    if (!editingPrice) return;
    setSavingPrice(true);
    setError(null);
    try {
      await api.patch(`/delivery-zones/${id}`, { price: Number(editingPrice) });
      setEditingZoneId(null);
      loadZones();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo actualizar el precio.');
    } finally {
      setSavingPrice(false);
    }
  }

  return (
    <div className="space-y-3 pt-3 border-t border-brand-950/[0.06]">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-medium text-brand-950">Zonas de envío</p>
        {!drawing && !pendingSave && (
          <TextureButton variant="brand" size="sm" className="!w-auto" onClick={startDrawing}>
            + Dibujar zona
          </TextureButton>
        )}
        {drawing && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-brand-950/60">{draftCount} punto(s) · haz clic en el mapa</span>
            <TextureButton variant="brand" size="sm" className="!w-auto" onClick={finishDrawing}>
              Finalizar zona
            </TextureButton>
            <TextureButton variant="minimal" size="sm" className="!w-auto" onClick={cancelDrawing}>
              Cancelar
            </TextureButton>
          </div>
        )}
      </div>

      <div ref={mapContainerRef} className="h-80 w-full rounded-xl overflow-hidden border border-brand-950/10" />

      {pendingSave && (
        <div className="rounded-xl bg-brand-950/[0.04] p-3 space-y-2">
          <p className="text-sm text-brand-950">Nombre y precio de la zona que acabas de dibujar:</p>
          <div className="grid sm:grid-cols-2 gap-2">
            <input
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              placeholder="Ej: Zona Norte"
              className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
            />
            <input
              value={zonePrice}
              onChange={(e) => setZonePrice(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="Precio de envío"
              className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="divide-y divide-brand-950/[0.06]">
        {zones.length === 0 && <p className="text-sm text-brand-950/40 font-light py-2">Sin zonas dibujadas todavía.</p>}
        {zones.map((z) =>
          editingZoneId === z.id ? (
            <div key={z.id} className="flex items-center gap-2 py-2">
              <p className="text-sm text-brand-950 shrink-0">{z.name}</p>
              <input
                value={editingPrice}
                onChange={(e) => setEditingPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                autoFocus
                className="w-24 border border-brand-950/15 rounded-lg px-2 py-1 text-sm"
              />
              <button
                onClick={() => saveEditedPrice(z.id)}
                disabled={savingPrice}
                className="text-xs text-brand-500 font-medium hover:text-brand-400 disabled:opacity-50 shrink-0"
              >
                Guardar
              </button>
              <button
                onClick={() => setEditingZoneId(null)}
                className="text-xs text-brand-950/50 hover:text-brand-950 shrink-0"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div key={z.id} className="flex items-center justify-between gap-3 py-2">
              <p className="text-sm text-brand-950">
                {z.name} <span className="text-brand-950/50">· ${z.price}</span>
              </p>
              <div className="flex items-center gap-3 shrink-0">
                <button onClick={() => startEditPrice(z)} className="text-xs text-brand-500 hover:text-brand-400">
                  Editar precio
                </button>
                <button onClick={() => removeZone(z.id)} className="text-xs text-red-600 hover:text-red-700">
                  Eliminar
                </button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
