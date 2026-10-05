import { AnimatedTabs, AnimatedTab } from '@/components/ui/animated-tabs';
import { api, getToken } from '@/api/client';
import { useAuth } from '@/context/AuthContext.shared';
import { apiOrigin } from '@/utils/apiOrigin';
import { waPhone } from '@/utils/waPhone';
import { Capacitor } from '@capacitor/core';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'motion/react';
import { AlertTriangle, Ban, Bike, Check, ChevronDown, ChevronRight, ChevronUp, Clock3, LocateFixed, LogOut, MapPin, MessageCircle, Moon, Navigation, PackageCheck, Phone, Route, Settings, Sun, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

type Point = { lat: number; lng: number };

interface RouteStep {
  distance: number;
  instruction: string;
  routeIndex: number;
}

interface NavigationRoute {
  coordinates: Point[];
  distance: number;
  duration: number;
  steps: RouteStep[];
}

interface CourierOrder {
  id: string;
  orderNumber: number;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerLat: number | null;
  customerLng: number | null;
  customerNote: string | null;
  deliveryDispatchedAt: string | null;
  deliveryAcceptedAt: string | null;
  deliveryRouteStartedAt: string | null;
  deliveryPickedUpAt: string | null;
  deliveryCompletedAt: string | null;
  deliveryCancelledAt: string | null;
  deliveryCancelReason: string | null;
  deliveryDistanceMeters: number | null;
  items: Array<{ id: string; quantity: number; productName: string; variantName: string | null; note?: string | null; modifiers?: Array<{ id: string; name: string; quantity: number }> }>;
}

interface CourierPayload {
  courier: { id: string; name: string; whatsappPhone: string };
  restaurant: { name: string; logoUrl: string | null; deliveryOriginLat: number | null; deliveryOriginLng: number | null } | null;
  orders: CourierOrder[];
  todayOrders: CourierOrder[];
}

const DEFAULT_CENTER: [number, number] = [10.4806, -66.9036];
const MAPBOX_ACCESS_TOKEN = String(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? '').trim();
const IS_NATIVE_MAP_RUNTIME = (() => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
})();
const USE_MAPBOX_TILES = Boolean(MAPBOX_ACCESS_TOKEN) && !IS_NATIVE_MAP_RUNTIME;

type TileSource = 'mapbox' | 'osm';

function tileDefinition(source: TileSource, dark: boolean): [string, L.TileLayerOptions] {
  if (source === 'mapbox') {
    const style = dark ? 'dark-v11' : 'streets-v12';
    return [
      `https://api.mapbox.com/styles/v1/mapbox/${style}/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_ACCESS_TOKEN}`,
      { maxZoom: 20, tileSize: 512, zoomOffset: -1, referrerPolicy: 'origin', attribution: '© <a href="https://www.mapbox.com/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
    ];
  }
  // CARTO devuelve imágenes válidas con «API KEY REQUIRED»: tileerror no detecta esa marca.
  // El respaldo usa el endpoint oficial de OSM y conserva la caché HTTP del navegador.
  return ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxNativeZoom: 19,
    referrerPolicy: 'origin',
    maxZoom: 20,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }];
}

function fallbackTileSource(source: TileSource): TileSource | null {
  if (source === 'mapbox') return 'osm';
  return null;
}
const CANCEL_REASONS = [
  ['CLIENTE_AUSENTE', 'El cliente no se encuentra'],
  ['DIRECCION_INCORRECTA', 'Dirección incorrecta o inaccesible'],
  ['CLIENTE_RECHAZO', 'El cliente rechazó el pedido'],
  ['PROBLEMA_MECANICO', 'Problema mecánico'],
  ['EMERGENCIA_SEGURIDAD', 'Emergencia o situación de seguridad'],
] as const;

function cancelReasonLabel(value: string | null) {
  return CANCEL_REASONS.find(([reason]) => reason === value)?.[1] ?? 'Entrega cancelada';
}

function distanceBetween(a: Point, b: Point) {
  const radius = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function closestRouteIndex(point: Point, coordinates: Point[]) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  coordinates.forEach((coordinate, index) => {
    const distance = distanceBetween(point, coordinate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return { index: bestIndex, distance: bestDistance };
}

function maneuverInstruction(step: any) {
  const maneuver = step?.maneuver ?? {};
  const road = step?.name ? ` por ${step.name}` : '';
  const modifier: Record<string, string> = {
    left: 'a la izquierda', right: 'a la derecha',
    'slight left': 'ligeramente a la izquierda', 'slight right': 'ligeramente a la derecha',
    'sharp left': 'pronunciadamente a la izquierda', 'sharp right': 'pronunciadamente a la derecha',
    straight: 'recto', uturn: 'en U',
  };
  if (maneuver.type === 'arrive') return 'Llegaste al destino';
  if (maneuver.type === 'depart') return `Inicia${road || ' la ruta'}`;
  if (maneuver.type === 'roundabout' || maneuver.type === 'rotary') {
    return maneuver.exit ? `En la redoma toma la salida ${maneuver.exit}${road}` : `Entra en la redoma${road}`;
  }
  if (maneuver.type === 'merge') return `Incorpórate ${modifier[maneuver.modifier] ?? ''}${road}`.replace(/\s+/g, ' ').trim();
  if (maneuver.type === 'fork') return `Mantente ${modifier[maneuver.modifier] ?? 'recto'}${road}`;
  if (maneuver.type === 'continue' || maneuver.modifier === 'straight') return `Continúa recto${road}`;
  return `Gira ${modifier[maneuver.modifier] ?? ''}${road}`.replace(/\s+/g, ' ').trim();
}

function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.max(10, Math.round(meters / 10) * 10)} m` : `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function DeliveryMap({ current, origin, destination, route, following, heading, recenterNonce, dark }: {
  current: Point | null;
  origin: Point | null;
  destination: Point | null;
  route: NavigationRoute | null;
  following: boolean;
  heading: number | null;
  recenterNonce: number;
  dark: boolean;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const tilesRef = useRef<L.TileLayer | null>(null);
  const tileSourceRef = useRef<TileSource>(USE_MAPBOX_TILES ? 'mapbox' : 'osm');
  const lastThemeRef = useRef(dark);

  const addTiles = useCallback((map: L.Map, source: TileSource, themeDark: boolean) => {
    const [url, options] = tileDefinition(source, themeDark);
    const tiles = L.tileLayer(url, options);
    tiles.once('tileerror', () => {
      // En WebViews algunos proveedores bloquean el Referer. Cambiamos de capa sin dejar un mapa gris.
      if (tileSourceRef.current !== source) return;
      const fallback = fallbackTileSource(source);
      if (!fallback) return;
      tileSourceRef.current = fallback;
      const replacement = addTiles(map, fallback, themeDark).addTo(map);
      tilesRef.current?.remove();
      tilesRef.current = replacement;
    });
    return tiles;
  }, []);

  useEffect(() => {
    if (!elementRef.current || mapRef.current) return;
    const map = L.map(elementRef.current, { zoomControl: false, attributionControl: true }).setView(DEFAULT_CENTER, 13);
    tilesRef.current = addTiles(map, tileSourceRef.current, lastThemeRef.current).addTo(map);
    // Los controles nativos de Leaflet no pueden competir por el mismo espacio
    // que el perfil del motorizado. Abajo a la derecha quedan accesibles sin
    // tapar la cabecera ni las indicaciones de navegación.
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [addTiles]);

  useEffect(() => {
    if (lastThemeRef.current === dark) return;
    lastThemeRef.current = dark;
    const map = mapRef.current;
    const currentTiles = tilesRef.current;
    if (!map || !currentTiles) return;
    const nextTiles = addTiles(map, tileSourceRef.current, dark).addTo(map);
    currentTiles.remove();
    tilesRef.current = nextTiles;
  }, [addTiles, dark]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const start = current ?? origin;
    const points = [start, destination].filter(Boolean) as Point[];

    if (start) {
      const safeHeading = Number.isFinite(heading) ? heading : 0;
      L.marker([start.lat, start.lng], {
        zIndexOffset: 1000,
        icon: L.divIcon({
          className: '',
          iconSize: [44, 44],
          iconAnchor: [22, 22],
          html: `<div style="width:44px;height:44px;display:grid;place-items:center;border-radius:50%;background:#fff;box-shadow:0 8px 22px rgba(0,35,79,.24)"><div style="width:30px;height:30px;display:grid;place-items:center;border-radius:50%;background:#0ea5e9;color:#fff;transform:rotate(${safeHeading}deg)"><span style="display:block;font-size:18px;line-height:1;transform:translateY(-1px)">▲</span></div></div>`,
        }),
      }).bindTooltip('Tu ubicación').addTo(layer);
    }
    if (destination) {
      L.circleMarker([destination.lat, destination.lng], {
        radius: 11,
        color: '#fff',
        weight: 4,
        fillColor: '#00234f',
        fillOpacity: 1,
      }).bindTooltip('Destino').addTo(layer);
    }
    if (route?.coordinates.length) {
      L.polyline(route.coordinates.map((point) => [point.lat, point.lng] as [number, number]), {
        color: '#fff', weight: 11, opacity: 0.92, lineCap: 'round', lineJoin: 'round',
      }).addTo(layer);
      L.polyline(route.coordinates.map((point) => [point.lat, point.lng] as [number, number]), {
        color: '#0ea5e9', weight: 7, opacity: 1, lineCap: 'round', lineJoin: 'round',
      }).addTo(layer);
    } else if (start && destination) {
      L.polyline([[start.lat, start.lng], [destination.lat, destination.lng]], {
        color: '#38bdf8', weight: 5, opacity: 0.55, dashArray: '8 10', lineCap: 'round',
      }).addTo(layer);
    }

    if (following && current) map.setView([current.lat, current.lng], Math.max(map.getZoom(), 17), { animate: true });
    else if (points.length === 2) map.fitBounds(points.map((p) => [p.lat, p.lng] as [number, number]), { padding: [56, 56], maxZoom: 16 });
    else if (points[0]) map.setView([points[0].lat, points[0].lng], 15);
  }, [current, dark, destination, following, heading, origin, recenterNonce, route]);

  return <div ref={elementRef} className="courier-map h-full w-full bg-slate-100" />;
}

function CompleteSlider({ disabled, busy, dark, onComplete }: { disabled: boolean; busy: boolean; dark: boolean; onComplete: () => Promise<void> }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const grabOffset = useRef(0);

  function limit(clientX: number) {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return Math.max(0, Math.min(clientX - rect.left - grabOffset.current - 4, rect.width - 64));
  }

  const maxDrag = Math.max(1, (trackRef.current?.clientWidth ?? 64) - 64);
  const fillWidth = disabled ? 0 : Math.min(100, ((drag + 64) / Math.max(1, maxDrag + 64)) * 100);

  return (
    <div
      ref={trackRef}
      aria-label="Desliza para finalizar la entrega"
      className={`relative h-16 select-none overflow-hidden rounded-full touch-none ${dark ? 'bg-white/10' : 'bg-slate-100'}`}
    >
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-400 via-brand-500 to-blue-700 will-change-[width]"
        style={{ width: `${fillWidth}%`, transition: dragging ? 'none' : 'width 280ms cubic-bezier(.2,.8,.2,1)' }}
      />
      <div className={`pointer-events-none absolute inset-0 flex items-center justify-center pl-9 text-sm font-semibold transition-colors ${disabled ? dark ? 'text-white/30' : 'text-brand-950/35' : drag > 28 || atEnd ? 'text-white' : dark ? 'text-white/55' : 'text-brand-950/55'}`}>
        {busy ? 'Listo' : atEnd ? 'Listo' : 'Desliza para finalizar'}
        {!disabled && !busy && !atEnd && <ChevronRight className="ml-1 h-4 w-4 opacity-65" />}
      </div>
      <button
        type="button"
        disabled={disabled || busy}
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          grabOffset.current = event.clientX - rect.left;
          event.currentTarget.setPointerCapture(event.pointerId);
          setAtEnd(false);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!dragging) return;
          const nextDrag = limit(event.clientX);
          setDrag(nextDrag);
          setAtEnd(nextDrag / Math.max(1, (trackRef.current?.clientWidth ?? 64) - 64) >= 0.92);
        }}
        onPointerUp={async (event) => {
          if (!dragging) return;
          event.currentTarget.releasePointerCapture(event.pointerId);
          setDragging(false);
          const max = Math.max(1, (trackRef.current?.clientWidth ?? 64) - 64);
          if (limit(event.clientX) / max >= 0.92) {
            setDrag(max);
            setAtEnd(true);
            navigator.vibrate?.(35);
            await onComplete();
          }
          setDrag(0);
          setAtEnd(false);
        }}
        onPointerCancel={() => { setDragging(false); setDrag(0); setAtEnd(false); }}
        style={{ transform: `translate3d(${drag}px,0,0)`, transition: dragging ? 'none' : 'transform 280ms cubic-bezier(.2,.8,.2,1)' }}
        className={`absolute left-1 top-1 flex h-14 w-14 items-center justify-center rounded-full bg-white text-brand-500 shadow-[0_7px_20px_rgba(0,35,79,0.20)] disabled:text-brand-950/25 motion-reduce:transition-none ${dragging ? 'ring-4 ring-sky-200/70' : ''}`}
      >
        <Check className="h-5 w-5" strokeWidth={2.5} />
      </button>
    </div>
  );
}

function TodayHistory({ orders, dark, reduceMotion, onSelect }: {
  orders: CourierOrder[];
  dark: boolean;
  reduceMotion: boolean | null;
  onSelect: (order: CourierOrder) => void;
}) {
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, transform: 'translateY(12px)' }}
      animate={{ opacity: 1, transform: 'translateY(0)' }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(8px)' }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      className={`mt-4 border-t pt-4 ${dark ? 'border-white/10' : 'border-brand-950/8'}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-brand-500" /><h2 className="text-sm font-bold">Actividad de hoy</h2></div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${dark ? 'bg-white/10 text-white/65' : 'bg-brand-950/5 text-brand-950/55'}`}>{orders.length}</span>
      </div>
      {orders.length === 0 ? (
        <p className={`rounded-2xl py-8 text-center text-sm ${dark ? 'bg-white/[0.04] text-white/40' : 'bg-brand-950/[0.025] text-brand-950/40'}`}>Todavía no hay entregas registradas hoy.</p>
      ) : (
        <div className="space-y-2 pb-2">
          {orders.map((order, index) => {
            const completed = !!order.deliveryCompletedAt;
            const cancelled = !!order.deliveryCancelledAt;
            const pickedUp = !!order.deliveryPickedUpAt;
            const time = order.deliveryCompletedAt ?? order.deliveryCancelledAt ?? order.deliveryPickedUpAt ?? order.deliveryDispatchedAt;
            return (
              <motion.button
                key={order.id}
                type="button"
                disabled={completed || cancelled}
                onClick={() => onSelect(order)}
                initial={reduceMotion ? false : { opacity: 0, transform: 'translateY(8px)' }}
                animate={{ opacity: 1, transform: 'translateY(0)' }}
                transition={{ delay: reduceMotion ? 0 : Math.min(index, 5) * 0.035, duration: 0.2 }}
                className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-[transform,background-color] duration-150 active:scale-[0.98] disabled:cursor-default ${dark ? 'border-white/8 bg-white/[0.04]' : 'border-brand-950/8 bg-brand-950/[0.02]'}`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${cancelled ? 'bg-red-500/15 text-red-500' : completed ? 'bg-emerald-500/15 text-emerald-500' : pickedUp ? 'bg-brand-500/15 text-brand-500' : 'bg-amber-500/15 text-amber-500'}`}>
                  {cancelled ? <Ban className="h-5 w-5" /> : completed ? <Check className="h-5 w-5" /> : pickedUp ? <Bike className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-base">#{order.orderNumber} · {order.customerName || 'Cliente'}</p>
                  <p className={`mt-0.5 truncate text-xs ${dark ? 'text-white/42' : 'text-brand-950/42'}`}>{cancelled ? cancelReasonLabel(order.deliveryCancelReason) : order.customerAddress || 'Dirección no registrada'}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-xs font-semibold ${cancelled ? 'text-red-500' : completed ? 'text-emerald-500' : pickedUp ? 'text-brand-500' : 'text-amber-500'}`}>{cancelled ? 'Cancelado' : completed ? 'Entregado' : pickedUp ? 'En camino' : 'Asignado'}</p>
                  {time && <p className={`mt-0.5 text-[11px] ${dark ? 'text-white/35' : 'text-brand-950/35'}`}>{new Date(time).toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit' })}</p>}
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

export default function CourierPage() {
  const { logout } = useAuth();
  const reduceMotion = useReducedMotion();
  const sheetDragControls = useDragControls();
  const [data, setData] = useState<CourierPayload | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nextRouteId, setNextRouteId] = useState<string | null>(() => window.localStorage.getItem('quicktap-courier-next-route'));
  const [current, setCurrent] = useState<Point | null>(null);
  const [resolvedDestination, setResolvedDestination] = useState<Point | null>(null);
  const [busy, setBusy] = useState<'accept' | 'pickup' | 'complete' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [navigationActive, setNavigationActive] = useState(false);
  const [confirmRouteId, setConfirmRouteId] = useState<string | null>(null);
  const [startingRoute, setStartingRoute] = useState(false);
  const startingRouteRef = useRef(false);
  const [routeIntro, setRouteIntro] = useState(false);
  useEffect(() => {
    if (!routeIntro) return;
    const timer = window.setTimeout(() => setRouteIntro(false), 2000);
    return () => window.clearTimeout(timer);
  }, [routeIntro]);
  const [navigationRoute, setNavigationRoute] = useState<NavigationRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [recenterNonce, setRecenterNonce] = useState(0);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<'pending' | 'activity'>('pending');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = window.localStorage.getItem('quicktap-courier-theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'warning'; text: string } | null>(null);
  const currentRef = useRef<Point | null>(null);
  const activeTrackingOrderIdRef = useRef<string | null>(null);
  const lastLocationSentAtRef = useRef(0);
  const routeRequestRef = useRef<AbortController | null>(null);
  const lastRerouteAtRef = useRef(0);
  const arrivalNotifiedRef = useRef(false);
  const sheetDraggedRef = useRef(false);
  const dark = theme === 'dark';

  useEffect(() => {
    window.localStorage.setItem('quicktap-courier-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (nextRouteId) window.localStorage.setItem('quicktap-courier-next-route', nextRouteId);
    else window.localStorage.removeItem('quicktap-courier-next-route');
  }, [nextRouteId]);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const load = useCallback(async () => {
    try {
      const response = await api.get('/delivery-couriers/me/orders');
      setData(response.data.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudieron actualizar tus entregas.');
    }
  }, []);

  const loadNavigationRoute = useCallback(async (start: Point, end: Point) => {
    routeRequestRef.current?.abort();
    const controller = new AbortController();
    routeRequestRef.current = controller;
    setRouteLoading(true);
    setRouteError(null);
    try {
      const response = await api.get('/delivery-couriers/me/navigation/route', {
          params: { startLat: start.lat, startLng: start.lng, endLat: end.lat, endLng: end.lng },
          signal: controller.signal,
        });
      const payload = response.data.data;
      const result = payload?.routes?.[0];
      const rawCoordinates = result?.geometry?.coordinates as [number, number][] | undefined;
      if (!rawCoordinates?.length) throw new Error('route');
      const coordinates = rawCoordinates.map(([lng, lat]) => ({ lat, lng }));
      const rawSteps = (result.legs ?? []).flatMap((leg: any) => leg.steps ?? []);
      const steps = rawSteps.map((step: any) => {
        const [lng, lat] = step.maneuver?.location ?? [start.lng, start.lat];
        return {
          distance: Number(step.distance ?? 0),
          instruction: maneuverInstruction(step),
          routeIndex: closestRouteIndex({ lat, lng }, coordinates).index,
        };
      });
      setNavigationRoute({
        coordinates,
        distance: Number(result.distance ?? 0),
        duration: Number(result.duration ?? 0),
        steps,
      });
      lastRerouteAtRef.current = Date.now();
      return true;
    } catch {
      if (controller.signal.aborted) return false;
      setRouteError('No se pudo calcular la ruta. Verifica la conexión e inténtalo de nuevo.');
      return false;
    } finally {
      if (routeRequestRef.current === controller) setRouteLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const socket: Socket = io(apiOrigin() || '/', { auth: { token: getToken() } });
    socket.on('order:new', load);
    socket.on('order:updated', load);
    const interval = window.setInterval(load, 15000);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      socket.disconnect();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        currentRef.current = point;
        setCurrent(point);
        setAccuracy(position.coords.accuracy);
        setHeading(position.coords.heading);
        const trackingOrderId = activeTrackingOrderIdRef.current;
        const now = Date.now();
        if (trackingOrderId && now - lastLocationSentAtRef.current >= 5_000) {
          lastLocationSentAtRef.current = now;
          void api.patch(`/delivery-couriers/me/orders/${trackingOrderId}/location`, {
            ...point,
            accuracy: position.coords.accuracy,
            ...(position.coords.heading != null ? { heading: position.coords.heading } : {}),
          }).catch(() => undefined);
        }
      },
      (geolocationError) => {
        if (geolocationError.code === geolocationError.PERMISSION_DENIED) {
          setRouteError('Activa el permiso de ubicación para iniciar la navegación.');
        }
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  const orders = data?.orders ?? [];
  const todayOrders = data?.todayOrders ?? [];
  const selected = orders.find((order) => order.deliveryPickedUpAt)
    ?? orders.find((order) => order.deliveryRouteStartedAt)
    ?? orders.find((order) => order.id === selectedId)
    ?? orders.find((order) => order.id === nextRouteId)
    ?? orders[0]
    ?? null;
  useEffect(() => {
    activeTrackingOrderIdRef.current = selected?.deliveryAcceptedAt && selected.deliveryRouteStartedAt && !selected.deliveryCompletedAt
      ? selected.id
      : null;
    lastLocationSentAtRef.current = 0;
  }, [selected?.id, selected?.deliveryAcceptedAt, selected?.deliveryRouteStartedAt, selected?.deliveryCompletedAt]);
  const origin = data?.restaurant?.deliveryOriginLat != null && data.restaurant.deliveryOriginLng != null
    ? { lat: data.restaurant.deliveryOriginLat, lng: data.restaurant.deliveryOriginLng }
    : null;
  const storedDestination = selected?.customerLat != null && selected.customerLng != null
    ? { lat: selected.customerLat, lng: selected.customerLng }
    : null;
  const hasStoredDestination = storedDestination !== null;
  const destination = storedDestination ?? resolvedDestination;
  const destinationLat = destination?.lat;
  const destinationLng = destination?.lng;
  const originLat = origin?.lat;
  const originLng = origin?.lng;

  // Los pedidos manuales antiguos pueden tener solo dirección escrita. Primero intenta
  // rescatar coordenadas de un enlace de Maps guardado y, si no, geocodifica el texto.
  useEffect(() => {
    setResolvedDestination(null);
    if (hasStoredDestination || !selected?.customerAddress) return;
    const coordinateMatch = selected.customerAddress.match(/(?:q=|@)(-?\d+(?:\.\d+)?)[,%2C\s]+(-?\d+(?:\.\d+)?)/i);
    if (coordinateMatch) {
      setResolvedDestination({ lat: Number(coordinateMatch[1]), lng: Number(coordinateMatch[2]) });
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ format: 'jsonv2', q: selected.customerAddress, limit: '1' });
    fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((results) => {
        if (results?.[0]) setResolvedDestination({ lat: Number(results[0].lat), lng: Number(results[0].lon) });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [selected?.id, selected?.customerAddress, hasStoredDestination]);

  useEffect(() => {
    setNavigationActive(!!selected?.deliveryRouteStartedAt);
    setNavigationRoute(null);
    setRouteError(null);
    arrivalNotifiedRef.current = false;
    if (destinationLat == null || destinationLng == null) return;
    const restaurantOrigin = originLat != null && originLng != null ? { lat: originLat, lng: originLng } : null;
    const previewStart = selected?.deliveryPickedUpAt ? currentRef.current ?? restaurantOrigin : restaurantOrigin ?? currentRef.current;
    if (previewStart) void loadNavigationRoute(previewStart, { lat: destinationLat, lng: destinationLng });
    return () => routeRequestRef.current?.abort();
  }, [destinationLat, destinationLng, loadNavigationRoute, originLat, originLng, selected?.deliveryPickedUpAt, selected?.deliveryRouteStartedAt, selected?.id]);

  useEffect(() => {
    if (!navigationActive || !current || !destination || !navigationRoute?.coordinates.length) return;
    const offRoute = closestRouteIndex(current, navigationRoute.coordinates).distance;
    if (offRoute > 90 && Date.now() - lastRerouteAtRef.current > 15_000) {
      void loadNavigationRoute(current, destination);
    }
  }, [current, destination, loadNavigationRoute, navigationActive, navigationRoute]);

  const progress = current && navigationRoute?.coordinates.length
    ? closestRouteIndex(current, navigationRoute.coordinates)
    : null;
  const remainingDistance = navigationRoute && progress
    ? navigationRoute.coordinates.slice(progress.index).reduce((total, point, index, points) => (
      index === 0 ? total + distanceBetween(current!, point) : total + distanceBetween(points[index - 1], point)
    ), 0)
    : navigationRoute?.distance ?? 0;
  const remainingDuration = navigationRoute?.distance
    ? navigationRoute.duration * Math.min(1, remainingDistance / navigationRoute.distance)
    : 0;
  const nextStep = navigationRoute && progress
    ? navigationRoute.steps.find((step) => step.routeIndex > progress.index + 1) ?? navigationRoute.steps.at(-1)
    : navigationRoute?.steps[0];
  const distanceToNextStep = navigationRoute && progress && nextStep
    ? navigationRoute.coordinates.slice(progress.index, nextStep.routeIndex + 1).reduce((total, point, index, points) => (
      index === 0 ? total + distanceBetween(current!, point) : total + distanceBetween(points[index - 1], point)
    ), 0)
    : 0;
  const completionRadius = 150 + Math.min(accuracy ?? 0, 50);
  const distanceToDestination = current && destination ? distanceBetween(current, destination) : null;
  const arrived = distanceToDestination != null && distanceToDestination <= completionRadius;
  const inTransit = !!selected?.deliveryPickedUpAt;
  const canChangeDelivery = !!selected && !selected.deliveryRouteStartedAt && !selected.deliveryPickedUpAt && orders.length > 1;
  const nextDelivery = orders.find((order) => order.id === nextRouteId && order.id !== selected?.id && !order.deliveryPickedUpAt)
    ?? orders.find((order) => order.id !== selected?.id && !order.deliveryPickedUpAt)
    ?? null;
  const estimatedArrival = remainingDuration > 0
    ? new Date(Date.now() + remainingDuration * 1000).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })
    : null;

  useEffect(() => {
    if (!navigationActive || !arrived || arrivalNotifiedRef.current) return;
    arrivalNotifiedRef.current = true;
    navigator.vibrate?.([120, 80, 120]);
  }, [arrived, navigationActive]);

  async function startNavigation() {
    if (startingRouteRef.current || !selected) return;
    if (!selected.deliveryAcceptedAt) {
      setError('Primero debes tomar el pedido.');
      return;
    }
    if (!destination) {
      setRouteError('Este pedido no tiene una ubicación válida.');
      return;
    }
    startingRouteRef.current = true;
    setStartingRoute(true);
    setRouteError(null);
    try {
      const point = currentRef.current ?? await new Promise<Point>((resolve, reject) => {
        if (!navigator.geolocation) { reject(new Error('Este dispositivo no ofrece ubicación GPS.')); return; }
        navigator.geolocation.getCurrentPosition((position) => {
          setAccuracy(position.coords.accuracy);
          resolve({ lat: position.coords.latitude, lng: position.coords.longitude });
        }, () => reject(new Error('Permite el acceso a tu ubicación para iniciar la ruta.')),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 });
      });
      if (!await loadNavigationRoute(point, destination)) return;
      if (!selected.deliveryPickedUpAt) {
        await api.patch(`/delivery-couriers/me/orders/${selected.id}/pickup`);
      }
      if (!selected.deliveryRouteStartedAt) {
        await api.patch(`/delivery-couriers/me/orders/${selected.id}/start-route`);
      }
      await api.patch(`/delivery-couriers/me/orders/${selected.id}/location`, {
        ...point,
        accuracy: accuracy ?? undefined,
        ...(heading != null ? { heading } : {}),
      }).catch(() => undefined);
      setConfirmRouteId(null);
      setRouteIntro(true);
        currentRef.current = point;
        setCurrent(point);
        setNavigationActive(true);
        setSheetExpanded(false);
        setRecenterNonce((value) => value + 1);
        navigator.vibrate?.(30);
      await load();
    } catch (err: any) {
      setRouteError(err.response?.data?.error ?? err.message ?? 'No se pudo iniciar esta ruta.');
    } finally {
      startingRouteRef.current = false;
      setStartingRoute(false);
    }
  }

  function openDeliverySwitcher() {
    if (!canChangeDelivery && !inTransit) return;
    setSheetTab('pending');
    setSheetExpanded(true);
    navigator.vibrate?.(20);
  }

  function selectDelivery(order: CourierOrder) {
    if (order.id === selected?.id) return;
    if (inTransit) {
      if (order.deliveryRouteStartedAt || order.deliveryPickedUpAt) return;
      setNextRouteId(order.id);
      setSheetExpanded(false);
      setFeedback({ kind: 'success', text: `Siguiente ruta preparada para el pedido #${order.orderNumber}.` });
      navigator.vibrate?.(20);
      return;
    }
    if (!canChangeDelivery) return;
    setSelectedId(order.id);
    setNextRouteId(order.id);
    setSheetExpanded(false);
    setNavigationActive(false);
    setNavigationRoute(null);
    navigator.vibrate?.(20);
  }

  async function pickUp() {
    if (!selected) return;
    setBusy('pickup');
    setError(null);
    try {
      const response = await api.patch(`/delivery-couriers/me/orders/${selected.id}/pickup`);
      setSheetExpanded(false);
      await load();
      const customerNotified = response.data.data.customerNotified as boolean;
      setFeedback(customerNotified
        ? { kind: 'success', text: 'Pedido recogido. El cliente fue avisado por WhatsApp.' }
        : selected.customerPhone
          ? { kind: 'warning', text: 'Pedido recogido. El WhatsApp del restaurante no está vinculado o disponible.' }
          : { kind: 'success', text: 'Pedido recogido.' });
      if (destination) setConfirmRouteId(selected.id);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo marcar el pedido como recogido.');
    } finally {
      setBusy(null);
    }
  }

  async function acceptDelivery() {
    if (!selected || selected.deliveryAcceptedAt) return;
    const fallbackWindow = selected.customerPhone ? window.open('', '_blank') : null;
    setBusy('accept');
    setError(null);
    try {
      const response = await api.patch(`/delivery-couriers/me/orders/${selected.id}/accept`);
      const result = response.data.data as { customerNotified: boolean; customerWhatsappUrl: string | null; alreadyAccepted?: boolean };
      if (fallbackWindow) {
        if (!result.customerNotified && result.customerWhatsappUrl && !result.alreadyAccepted) fallbackWindow.location.href = result.customerWhatsappUrl;
        else fallbackWindow.close();
      }
      setFeedback({ kind: 'success', text: result.customerNotified ? 'Pedido tomado. El cliente recibió su seguimiento.' : 'Pedido tomado y listo para retirar.' });
      navigator.vibrate?.(35);
      await load();
    } catch (err: any) {
      fallbackWindow?.close();
      setError(err.response?.data?.error ?? 'No se pudo tomar este pedido.');
    } finally {
      setBusy(null);
    }
  }

  async function complete() {
    if (!selected) return;
    setBusy('complete');
    setError(null);
    try {
      if (!current) {
        setError('Activa el permiso de ubicación para finalizar la entrega.');
        return;
      }
      await api.patch(`/delivery-couriers/me/orders/${selected.id}/complete`, {
        lat: current.lat,
        lng: current.lng,
        accuracy: accuracy ?? undefined,
      });
      setSelectedId(null);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo finalizar la entrega.');
    } finally {
      setBusy(null);
    }
  }

  async function cancelDelivery(reason: string) {
    if (!selected) return;
    setBusy('cancel');
    setError(null);
    try {
      await api.patch(`/delivery-couriers/me/orders/${selected.id}/cancel`, { reason });
      setCancelOpen(false);
      setSelectedId(null);
      setFeedback({ kind: 'success', text: 'Entrega cancelada. El pedido quedó disponible para reasignación.' });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo cancelar la entrega.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className={`fixed inset-0 flex flex-col overflow-hidden transition-colors duration-200 ${dark ? 'bg-[#07111f] text-white' : 'bg-[#f7f9fc] text-brand-950'}`}>
      <section className={`relative flex-1 ${selected ? 'min-h-[54dvh]' : 'min-h-0'}`}>
        <DeliveryMap
          current={current}
          origin={origin}
          destination={destination}
          route={navigationRoute}
          following={navigationActive}
          heading={heading}
          recenterNonce={recenterNonce}
          dark={dark}
        />
        <header className={`pointer-events-none absolute inset-x-0 top-0 z-[500] flex items-center justify-between bg-gradient-to-b px-4 pb-10 pt-[max(14px,env(safe-area-inset-top))] ${dark ? 'from-[#07111f]/95 via-[#07111f]/65 to-transparent' : 'from-white/95 via-white/70 to-transparent'}`}>
          <button
            type="button"
            onClick={() => setSessionOpen(true)}
            aria-label="Abrir ajustes de sesión del motorizado"
            className={`pointer-events-auto flex min-w-0 items-center gap-3 rounded-2xl border px-3 py-2 text-left shadow-[0_10px_30px_rgba(0,35,79,0.10)] backdrop-blur-xl transition-transform duration-150 active:scale-[0.97] ${dark ? 'border-white/10 bg-[#0d1a2b]/88' : 'border-white/80 bg-white/90'}`}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white"><Bike className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className={`truncate text-[11px] font-semibold uppercase tracking-[0.12em] ${dark ? 'text-white/45' : 'text-brand-950/40'}`}>Motorizado</p>
              <p className="truncate font-bold text-base">{data?.courier.name ?? 'Cargando…'}</p>
            </div>
          </button>
          <div className="pointer-events-auto flex gap-2">
            <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={dark ? 'Usar tema claro' : 'Usar tema oscuro'} className={`flex h-11 w-11 items-center justify-center rounded-2xl border shadow-[0_10px_30px_rgba(0,35,79,0.10)] backdrop-blur-xl transition-[transform,background-color,color] duration-150 active:scale-95 ${dark ? 'border-white/10 bg-[#0d1a2b]/88 text-amber-300' : 'border-white/80 bg-white/90 text-brand-950/55'}`}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={theme} initial={reduceMotion ? false : { opacity: 0, rotate: -35, scale: 0.9 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} exit={reduceMotion ? undefined : { opacity: 0, rotate: 35, scale: 0.9 }} transition={{ duration: 0.16 }}>
                  {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </motion.span>
              </AnimatePresence>
            </button>
            <button type="button" onClick={logout} aria-label="Cerrar sesión" className={`flex h-11 w-11 items-center justify-center rounded-2xl border shadow-[0_10px_30px_rgba(0,35,79,0.10)] backdrop-blur-xl transition-transform duration-150 active:scale-95 ${dark ? 'border-white/10 bg-[#0d1a2b]/88 text-white/60' : 'border-white/80 bg-white/90 text-brand-950/55'}`}>
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>
        <Dialog open={sessionOpen} onOpenChange={setSessionOpen}>
          <DialogContent className={`rounded-[28px] p-5 ${dark ? 'border-white/10 bg-[#0b1727] text-white' : 'bg-white text-brand-950'}`}>
            <div className="pr-8">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/12 text-brand-500"><Settings className="h-6 w-6" /></span>
              <DialogTitle className="text-inherit">Ajustes de sesión</DialogTitle>
              <DialogDescription className={dark ? 'mt-1 text-white/55' : 'mt-1 text-brand-950/55'}>Personaliza esta sesión de reparto.</DialogDescription>
            </div>
            <div className={`rounded-2xl border p-4 ${dark ? 'border-white/10 bg-white/[0.05]' : 'border-brand-950/8 bg-brand-950/[0.025]'}`}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${dark ? 'text-white/45' : 'text-brand-950/45'}`}>Motorizado activo</p>
              <p className="mt-1 text-lg font-bold">{data?.courier.name ?? 'Cargando…'}</p>
              <p className={`mt-1 text-xs ${dark ? 'text-white/55' : 'text-brand-950/55'}`}>{current ? `Ubicación activa${accuracy ? ` · precisión ±${Math.round(accuracy)} m` : ''}` : 'Esperando permiso de ubicación'}</p>
            </div>
            <div>
              <p className={`mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] ${dark ? 'text-white/45' : 'text-brand-950/45'}`}>Apariencia</p>
              <div className={`grid grid-cols-2 rounded-2xl p-1 ${dark ? 'bg-white/[0.07]' : 'bg-brand-950/[0.045]'}`}>
                {(['light', 'dark'] as const).map((value) => (
                  <button key={value} type="button" onClick={() => setTheme(value)} className={`min-h-11 rounded-xl px-3 text-sm font-bold transition-[background-color,color,box-shadow] duration-150 ${theme === value ? dark ? 'bg-white/12 text-white shadow-sm' : 'bg-white text-brand-950 shadow-sm' : dark ? 'text-white/45' : 'text-brand-950/45'}`}>
                    {value === 'light' ? 'Claro' : 'Oscuro'}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={logout} className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-bold transition-transform duration-150 active:scale-[0.98] ${dark ? 'border-red-400/25 bg-red-400/10 text-red-300' : 'border-red-200 bg-red-50 text-red-600'}`}>
              <LogOut className="h-4 w-4" /> Cerrar sesión
            </button>
          </DialogContent>
        </Dialog>
        {navigationActive && (
          <motion.div initial={reduceMotion ? false : { opacity: 0, transform: 'translateY(-10px) scale(.97)' }} animate={{ opacity: 1, transform: 'translateY(0) scale(1)' }} className={`absolute inset-x-3 top-[88px] z-[500] rounded-[24px] border px-4 py-3 shadow-[0_14px_38px_rgba(0,35,79,0.18)] backdrop-blur-xl ${arrived ? 'border-emerald-200 bg-emerald-500/95 text-white' : dark ? 'border-white/10 bg-[#0d1a2b]/92 text-white' : 'border-white/80 bg-white/94'}`}>
            <div className="flex items-center gap-3">
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${arrived ? 'bg-white/20' : 'bg-brand-500 text-white'}`}>
                {arrived ? <Check className="h-7 w-7" strokeWidth={2.5} /> : <Navigation className="h-6 w-6" fill="currentColor" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${arrived ? 'text-white/75' : dark ? 'text-white/45' : 'text-brand-950/40'}`}>
                  {arrived ? 'Destino alcanzado' : distanceToNextStep ? `En ${formatDistance(distanceToNextStep)}` : 'Sigue la ruta'}
                </p>
                <p className="line-clamp-2 font-bold leading-5 tracking-tight text-base">{arrived ? 'Llegaste al destino' : nextStep?.instruction ?? 'Continúa por la ruta marcada'}</p>
              </div>
              {!arrived && (
                <div className={`shrink-0 border-l pl-3 text-right ${dark ? 'border-white/10' : 'border-brand-950/10'}`}>
                  <p className="text-lg font-extrabold leading-none tracking-tight">{routeLoading && !navigationRoute ? '···' : formatDuration(remainingDuration)}</p>
                  <p className={`mt-1 text-xs font-semibold ${dark ? 'text-white/50' : 'text-brand-950/50'}`}>{navigationRoute ? formatDistance(remainingDistance) : 'Calculando'}</p>
                  {estimatedArrival && <p className={`mt-0.5 text-[10px] ${dark ? 'text-white/35' : 'text-brand-950/35'}`}>Llegada {estimatedArrival}</p>}
                </div>
              )}
            </div>
            {selected && (
              <div className={`mt-3 flex items-center justify-between gap-3 border-t pt-2 text-xs ${arrived ? 'border-white/20 text-white/80' : dark ? 'border-white/10 text-white/55' : 'border-brand-950/10 text-brand-950/55'}`}>
                <span className="truncate font-semibold">{selected.customerName || 'Cliente del pedido'}</span>
                <span className="shrink-0">Entrega #{selected.orderNumber}</span>
              </div>
            )}
          </motion.div>
        )}
        {current && !navigationActive && (
          <button type="button" onClick={() => setRecenterNonce((value) => value + 1)} aria-label="Centrar mi ubicación" className={`absolute left-4 z-[500] flex h-12 w-12 items-center justify-center rounded-2xl border shadow-[0_10px_28px_rgba(0,35,79,0.16)] backdrop-blur-xl transition-[bottom,transform] duration-200 active:scale-95 ${destination && !navigationActive ? 'bottom-20' : 'bottom-4'} ${dark ? 'border-white/10 bg-[#0d1a2b]/92 text-white' : 'border-white/80 bg-white/95 text-brand-950'}`}>
            <LocateFixed className="h-5 w-5" />
          </button>
        )}
        {destination && !navigationActive && selected?.deliveryAcceptedAt && (
          <motion.button
            type="button"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            onClick={() => { setRouteError(null); setConfirmRouteId(selected?.id ?? null); }}
            disabled={routeLoading || startingRoute}
            className="absolute bottom-4 left-4 right-4 z-[500] flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(16,185,129,0.28)] transition-[transform,background-color] duration-150 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-65"
          >
            <Navigation className="h-5 w-5" />
            {routeLoading ? 'Calculando…' : selected?.deliveryRouteStartedAt ? 'Reanudar ruta' : 'Iniciar ruta'}
          </motion.button>
        )}
        {navigationActive && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, transform: 'translateY(12px) scale(.97)' }}
            animate={{ opacity: 1, transform: 'translateY(0) scale(1)' }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
            className={`absolute bottom-4 left-3 right-3 z-[500] flex items-center gap-2 rounded-[20px] border p-1.5 shadow-[0_14px_38px_rgba(0,35,79,0.22)] backdrop-blur-xl ${dark ? 'border-white/10 bg-[#0d1a2b]/92' : 'border-white/80 bg-white/94'}`}
          >
            {current && (
              <button type="button" onClick={() => setRecenterNonce((value) => value + 1)} aria-label="Centrar mi ubicación" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-[transform,background-color] duration-150 active:scale-95 ${dark ? 'bg-white/8 text-white' : 'bg-brand-50 text-brand-950'}`}>
                <LocateFixed className="h-5 w-5" />
              </button>
            )}
            <a
              href={selected?.customerPhone ? `tel:${selected.customerPhone.replace(/[^\d+]/g, '')}` : undefined}
              aria-disabled={!selected?.customerPhone}
              className={`flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-bold text-white transition-[transform,background-color] duration-150 active:scale-[0.98] ${selected?.customerPhone ? 'bg-emerald-500 hover:bg-emerald-600' : 'pointer-events-none bg-slate-300'}`}
            >
              <Phone className="h-5 w-5 shrink-0" />
              <span className="truncate">Llamar</span>
            </a>
            <a
              href={selected?.customerPhone ? `https://wa.me/${waPhone(selected.customerPhone)}` : undefined}
              target="_blank"
              rel="noreferrer"
              aria-label="Abrir conversación de WhatsApp con el cliente"
              aria-disabled={!selected?.customerPhone}
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-[transform,background-color] duration-150 active:scale-95 ${selected?.customerPhone ? dark ? 'bg-emerald-400/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700' : 'pointer-events-none bg-slate-100 text-slate-300'}`}
            >
              <MessageCircle className="h-5 w-5" />
            </a>
            <button type="button" onClick={() => setNavigationActive(false)} aria-label="Salir del modo ruta" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-[transform,background-color] duration-150 active:scale-95 ${dark ? 'bg-white/8 text-white/75' : 'bg-brand-50 text-brand-950/65'}`}>
              <X className="h-5 w-5" />
            </button>
          </motion.div>
        )}
      </section>

      {selected && <motion.section
        drag="y"
        dragListener={false}
        dragControls={sheetDragControls}
        dragConstraints={{ top: -280, bottom: 0 }}
        dragElastic={{ top: 0.08, bottom: 0.03 }}
        dragSnapToOrigin
        onDragStart={() => { sheetDraggedRef.current = true; }}
        onDragEnd={(_, info) => {
          if (info.offset.y < -42 || info.velocity.y < -420) setSheetExpanded(true);
          if (info.offset.y > 42 || info.velocity.y > 420) setSheetExpanded(false);
          window.setTimeout(() => { sheetDraggedRef.current = false; }, 0);
        }}
        animate={{ maxHeight: inTransit ? sheetExpanded ? '72dvh' : selected.deliveryRouteStartedAt ? '142px' : '76px' : sheetExpanded ? '82dvh' : navigationActive ? '36dvh' : '46dvh' }}
        transition={reduceMotion ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.32 }}
        className={`relative z-[600] -mt-3 overflow-y-auto rounded-t-[26px] border-t px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-14px_42px_rgba(0,35,79,0.10)] ${dark ? 'border-white/10 bg-[#0b1727]' : 'border-white bg-white'}`}
      >
        <button
          type="button"
          aria-expanded={sheetExpanded}
          onPointerDown={(event) => sheetDragControls.start(event)}
          onClick={() => { if (!sheetDraggedRef.current) setSheetExpanded((value) => !value); }}
          className="mx-auto mb-2 flex min-h-9 w-full touch-none items-center justify-center gap-2 text-xs font-semibold active:scale-[0.99]"
        >
          <span className={`h-1 w-9 rounded-full ${dark ? 'bg-white/20' : 'bg-brand-950/10'}`} />
          <span className={dark ? 'text-white/55' : 'text-brand-950/50'}>
            {inTransit ? nextDelivery ? `Siguiente · #${nextDelivery.orderNumber} · ${nextDelivery.customerName || 'Cliente'}` : 'Sin entregas pendientes' : 'Actividad y pendientes'}
          </span>
          {sheetExpanded ? <ChevronDown className="h-4 w-4 opacity-45" /> : <ChevronUp className="h-4 w-4 opacity-45" />}
        </button>
        {error && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 font-medium text-red-700 text-base">{error}</p>}
        {routeError && <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 font-medium text-amber-800 text-base">{routeError}</p>}
        <AnimatePresence initial={false}>
          {feedback && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, transform: 'translateY(-8px) scale(.98)' }}
              animate={{ opacity: 1, transform: 'translateY(0) scale(1)' }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(-5px) scale(.98)' }}
              transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              className={`mb-3 rounded-xl px-3 py-2 text-sm font-medium ${feedback.kind === 'success' ? dark ? 'bg-emerald-400/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700' : dark ? 'bg-amber-400/15 text-amber-200' : 'bg-amber-50 text-amber-800'}`}
            >
              {feedback.text}
            </motion.div>
          )}
        </AnimatePresence>

        {inTransit ? (
          <div className="mx-auto max-w-xl py-1">
            <AnimatePresence initial={false}>
              {sheetExpanded && (
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                  transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                  className={`mb-3 rounded-[22px] border p-4 ${dark ? 'border-white/10 bg-white/[0.04]' : 'border-brand-950/8 bg-brand-950/[0.025]'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold uppercase tracking-[0.14em] text-brand-500 text-xs">Siguiente entrega</p>
                      <h2 className="mt-1 truncate text-lg font-bold">{nextDelivery?.customerName || 'No hay otra entrega pendiente'}</h2>
                    </div>
                    {nextDelivery && <span className="rounded-xl bg-brand-500/10 px-2.5 py-1.5 text-xs font-bold text-brand-500">#{nextDelivery.orderNumber}</span>}
                  </div>
                  {nextDelivery && (
                    <>
                      <p className={`mt-2 flex items-start gap-2 text-sm ${dark ? 'text-white/58' : 'text-brand-950/58'}`}><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />{nextDelivery.customerAddress || 'Dirección no registrada'}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className={`rounded-2xl p-3 ${dark ? 'bg-white/[0.05]' : 'bg-white'}`}><p className={`text-[10px] font-semibold uppercase tracking-wider ${dark ? 'text-white/35' : 'text-brand-950/35'}`}>Distancia</p><p className="mt-1 font-bold text-base">{nextDelivery.deliveryDistanceMeters != null ? formatDistance(nextDelivery.deliveryDistanceMeters) : 'No disponible'}</p></div>
                        <div className={`rounded-2xl p-3 ${dark ? 'bg-white/[0.05]' : 'bg-white'}`}><p className={`text-[10px] font-semibold uppercase tracking-wider ${dark ? 'text-white/35' : 'text-brand-950/35'}`}>Productos</p><p className="mt-1 font-bold text-base">{nextDelivery.items.reduce((total, item) => total + item.quantity, 0)}</p></div>
                      </div>
                      <div className={`mt-3 space-y-1.5 border-t pt-3 ${dark ? 'border-white/8' : 'border-brand-950/8'}`}>
                        {nextDelivery.items.slice(0, 4).map((item) => <p key={item.id} className={`text-xs ${dark ? 'text-white/55' : 'text-brand-950/55'}`}><strong className="text-current">{item.quantity}x</strong> {item.productName}{item.variantName ? ` · ${item.variantName}` : ''}</p>)}
                        {nextDelivery.items.length > 4 && <p className="font-semibold text-brand-500 text-xs">+{nextDelivery.items.length - 4} productos más</p>}
                      </div>
                      <button
                        type="button"
                        onClick={openDeliverySwitcher}
                        className={`mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border px-3 text-sm font-bold transition-[transform,background-color] duration-150 active:scale-[0.98] ${dark ? 'border-brand-400/25 bg-brand-400/10 text-brand-300' : 'border-brand-200 bg-brand-50 text-brand-700'}`}
                      >
                        <Route className="h-4 w-4" /> Cambiar próxima ruta
                      </button>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {selected.deliveryRouteStartedAt && <CompleteSlider key={selected.id} disabled={!arrived || busy !== null} busy={busy === 'complete'} dark={dark} onComplete={complete} />}
          </div>
        ) : !selected ? (
          <div className="flex min-h-44 flex-col items-center justify-center text-center">
            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><PackageCheck className="h-7 w-7" /></span>
            <h1 className="text-xl font-bold">Todo entregado</h1>
            <p className={`mt-1 max-w-xs text-sm ${dark ? 'text-white/50' : 'text-brand-950/50'}`}>Cuando acepten un nuevo delivery aparecerá aquí automáticamente.</p>
          </div>
        ) : (
          <div className="mx-auto max-w-xl">
            <div className="mb-2.5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold uppercase tracking-[0.12em] text-brand-500 text-xs">Entrega {orders.findIndex((o) => o.id === selected.id) + 1} de {orders.length}</p>
                <h1 className="mt-0.5 truncate text-xl font-bold tracking-tight">{selected.customerName || 'Cliente sin nombre'}</h1>
                <p className={`mt-1 flex items-start gap-1.5 text-sm ${dark ? 'text-white/55' : 'text-brand-950/55'}`}><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{selected.customerAddress || 'Dirección no registrada'}</p>
                <p className={`mt-1.5 flex items-center gap-1.5 text-xs font-semibold ${dark ? 'text-white/65' : 'text-brand-950/60'}`}>
                  <Route className="h-3.5 w-3.5 text-brand-500" />
                  {(navigationRoute?.distance ?? selected.deliveryDistanceMeters) != null ? `${formatDistance((navigationRoute?.distance ?? selected.deliveryDistanceMeters)!)} desde el restaurante` : 'Distancia no disponible'}
                </p>
                <p className="mt-1.5 font-semibold text-brand-500 text-xs">{selected.deliveryAcceptedAt ? 'En progreso' : 'Nuevo pedido asignado'}</p>
              </div>
              <span className="shrink-0 rounded-xl bg-brand-500/10 px-3 py-2 text-sm font-bold text-brand-600">#{selected.orderNumber}</span>
            </div>

            {!selected.deliveryAcceptedAt ? (
              <div className="space-y-2.5">
                <button type="button" onClick={() => void acceptDelivery()} disabled={busy !== null} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-[#009cff] px-4 text-sm font-bold text-white shadow-[0_10px_26px_rgba(0,156,255,0.25)] transition-transform active:scale-[0.98] disabled:opacity-60">
                  <Bike className="h-5 w-5" />{busy === 'accept' ? 'Tomando pedido…' : 'Tomar pedido'}
                </button>
                <button type="button" onClick={() => setCancelOpen(true)} disabled={busy !== null} className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-[18px] border px-3 text-[13px] font-bold transition-transform duration-150 active:scale-[0.98] ${dark ? 'border-red-400/20 bg-red-400/10 text-red-300' : 'border-red-200 bg-red-50 text-red-600'}`}><Ban className="h-4 w-4" /> Rechazar asignación</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <button type="button" onClick={pickUp} disabled={!!selected.deliveryPickedUpAt || busy !== null} className="flex min-h-12 items-center justify-center gap-2 rounded-[18px] bg-emerald-500 px-3 text-[13px] font-bold text-white shadow-[0_8px_20px_rgba(16,185,129,0.18)] active:scale-[0.98] disabled:bg-emerald-50 disabled:text-emerald-700 disabled:shadow-none">
                  {selected.deliveryPickedUpAt ? <Check className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}
                  {busy === 'pickup' ? 'Marcando…' : selected.deliveryPickedUpAt ? 'En camino' : 'Pedido recogido'}
                </button>
                <a href={selected.customerPhone ? `tel:${selected.customerPhone.replace(/[^\d+]/g, '')}` : undefined} aria-disabled={!selected.customerPhone} className={`flex min-h-12 items-center justify-center gap-2 rounded-[18px] border px-3 text-[13px] font-bold transition-transform duration-150 active:scale-[0.97] ${selected.customerPhone ? dark ? 'border-white/10 bg-white/5 text-white shadow-[0_6px_18px_rgba(0,0,0,0.16)]' : 'border-brand-950/10 bg-white text-brand-950 shadow-[0_6px_18px_rgba(0,35,79,0.07)]' : dark ? 'pointer-events-none border-transparent bg-white/5 text-white/25' : 'pointer-events-none border-transparent bg-slate-100 text-brand-950/30'}`}>
                  <Phone className="h-4 w-4" /> Llamar al cliente
                </a>
                <button type="button" onClick={() => setCancelOpen(true)} disabled={busy !== null} className={`col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-[18px] border px-3 text-[13px] font-bold transition-transform duration-150 active:scale-[0.98] ${dark ? 'border-red-400/20 bg-red-400/10 text-red-300' : 'border-red-200 bg-red-50 text-red-600'}`}>
                  <Ban className="h-4 w-4" /> Cancelar entrega
                </button>
              </div>
            )}

          </div>
        )}
        <AnimatePresence initial={false}>
          {sheetExpanded && (
            <div className="mt-3">
              <AnimatedTabs tone={dark ? "onDark" : "light"} className={`grid grid-cols-2 rounded-2xl p-1 ${dark ? 'bg-white/[0.06]' : 'bg-brand-950/[0.04]'}`}>
                {(['pending', 'activity'] as const).map((tab) => (
                  <AnimatedTab active={sheetTab === tab} key={tab} type="button" onClick={() => setSheetTab(tab)} className={`rounded-xl px-3 py-2.5 text-sm font-bold transition-[background-color,color,box-shadow] duration-150 ${sheetTab === tab ? dark ? 'bg-white/12 text-white shadow-sm' : 'bg-white text-brand-950 shadow-sm' : dark ? 'text-white/45' : 'text-brand-950/45'}`}>
                    {tab === 'pending' ? `Pendientes (${orders.length})` : `Actividad (${todayOrders.length})`}
                  </AnimatedTab>
                ))}
              </AnimatedTabs>
              {sheetTab === 'activity' ? (
                <TodayHistory orders={todayOrders} dark={dark} reduceMotion={reduceMotion} onSelect={selectDelivery} />
              ) : (
                <div className="mt-3 space-y-2 pb-2">
                  {orders.map((order) => {
                    const isCurrent = order.id === selected.id;
                    const canSelect = !isCurrent && (inTransit ? !order.deliveryRouteStartedAt && !order.deliveryPickedUpAt : canChangeDelivery);
                    return (
                    <motion.button key={order.id} layout={reduceMotion ? false : 'position'} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} whileTap={canSelect && !reduceMotion ? { scale: 0.98 } : undefined} transition={{ type: 'spring', bounce: 0, duration: 0.25 }} type="button" disabled={!canSelect} onClick={() => selectDelivery(order)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left disabled:cursor-default ${isCurrent ? 'border-brand-500 bg-brand-500/10' : order.id === nextRouteId ? 'border-sky-300 bg-sky-50/80' : dark ? 'border-white/8 bg-white/[0.04]' : 'border-brand-950/8 bg-brand-950/[0.02]'}`}>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/12 text-brand-500"><MapPin className="h-5 w-5" /></span>
                      <div className="min-w-0 flex-1"><p className="truncate font-bold text-base">#{order.orderNumber} · {order.customerName || 'Cliente'}</p><p className={`mt-0.5 truncate text-xs ${dark ? 'text-white/42' : 'text-brand-950/42'}`}>{order.deliveryDistanceMeters != null ? `${formatDistance(order.deliveryDistanceMeters)} desde el restaurante` : order.customerAddress || 'Sin ubicación'}</p></div>
                      <span className="shrink-0 text-xs font-semibold text-brand-500">{isCurrent ? order.deliveryAcceptedAt ? 'En progreso' : 'Por tomar' : order.id === nextRouteId ? 'Siguiente' : canSelect ? 'Cambiar ruta' : order.deliveryAcceptedAt ? 'Pendiente' : 'Nuevo'}</span>
                    </motion.button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </AnimatePresence>
      </motion.section>}
      <Dialog open={!!selected && confirmRouteId === selected.id} onOpenChange={(open) => { if (!open && !startingRouteRef.current) setConfirmRouteId(null); }}>
        <DialogContent hideClose={startingRoute} className={`max-h-[88dvh] rounded-[28px] p-5 motion-reduce:animate-none ${dark ? 'border-white/10 bg-[#0b1727] text-white' : 'bg-white text-brand-950'}`}>
          <div className="pr-8">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500"><PackageCheck className="h-6 w-6" /></span>
            <DialogTitle className="text-xl font-bold text-inherit">¿Tienes el pedido completo?</DialogTitle>
            <DialogDescription className={`mt-2 ${dark ? 'text-white/60' : 'text-brand-950/60'}`}>Revisa la comanda antes de salir. Al confirmar avisaremos al restaurante que lo recogiste.</DialogDescription>
          </div>
          {selected && (
            <div className={`rounded-2xl border p-4 ${dark ? 'border-white/10 bg-white/5' : 'border-brand-950/10 bg-slate-50'}`}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div><p className="font-semibold uppercase tracking-wider text-brand-500 text-xs">Delivery · Comanda</p><h3 className="mt-1 text-lg font-bold">{selected.customerName || 'Cliente'}</h3></div>
                <span className="rounded-xl bg-brand-500/10 px-3 py-2 text-sm font-bold text-brand-500">#{selected.orderNumber}</span>
              </div>
              {selected.customerPhone && <p className="mb-1 opacity-70 text-base">{selected.customerPhone}</p>}
              {selected.customerAddress && <p className="mb-3 opacity-70 text-base">{selected.customerAddress}</p>}
              <div className={`space-y-3 border-t pt-3 ${dark ? 'border-white/10' : 'border-brand-950/10'}`}>
                {selected.items.map((item) => (
                  <div key={item.id}>
                    <p className="font-semibold text-base">{item.quantity}x {item.productName}{item.variantName ? ` · ${item.variantName}` : ''}</p>
                    {item.modifiers?.map((modifier) => <p key={modifier.id} className="mt-1 pl-4 opacity-70 text-base">{modifier.quantity > 1 ? `${modifier.quantity}x ` : ''}{modifier.name}</p>)}
                    {item.note && <p className="mt-1 font-medium text-amber-600 text-base">Nota: {item.note}</p>}
                  </div>
                ))}
              </div>
              {selected.customerNote && <p className="mt-4 font-medium text-base">Nota del cliente: {selected.customerNote}</p>}
            </div>
          )}
          {routeError && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-amber-800 text-base">{routeError}</p>}
          <motion.button type="button" disabled={startingRoute || busy !== null} onClick={() => void startNavigation()} whileTap={reduceMotion ? undefined : { scale: 0.97 }} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 font-bold text-white transition-colors hover:bg-emerald-600 disabled:opacity-60">
            <Navigation className="h-5 w-5" />{startingRoute ? 'Preparando ruta…' : 'Todo OK, iniciar ruta'}
          </motion.button>
          <button type="button" disabled={startingRoute} onClick={() => setConfirmRouteId(null)} className="min-h-11 rounded-xl text-sm font-semibold opacity-70 disabled:opacity-30">Volver a revisar</button>
        </DialogContent>
      </Dialog>
      <AnimatePresence>
        {routeIntro && (
          <motion.div key="route-intro" role="status" aria-live="polite" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0.12 : 0.3 }} className="fixed inset-0 z-[1300] flex flex-col items-center justify-center bg-emerald-500 px-6 text-center text-white">
            <motion.div initial={reduceMotion ? false : { opacity: 0, scale: 0.8, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', bounce: 0, duration: 0.4 }} className="mb-7 flex h-24 w-24 items-center justify-center rounded-full bg-white/20">
              <Navigation className="h-11 w-11" fill="currentColor" />
            </motion.div>
            <motion.h2 initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.1 }} className="text-3xl font-bold tracking-tight">Iniciando Ruta</motion.h2>
            <p className="mt-3 text-lg font-medium text-white/90">Maneja con cuidado</p>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {cancelOpen && selected && (
          <motion.div
            className="fixed inset-0 z-[1000] flex items-end bg-brand-950/35 px-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-sm"
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => busy !== 'cancel' && setCancelOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="cancel-delivery-title"
              initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.98 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.28 }}
              onClick={(event) => event.stopPropagation()}
              className={`mx-auto w-full max-w-lg rounded-[28px] border p-4 shadow-[0_24px_70px_rgba(0,35,79,0.28)] ${dark ? 'border-white/10 bg-[#0b1727]' : 'border-white bg-white'}`}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div><h2 id="cancel-delivery-title" className="text-lg font-bold tracking-tight">¿Por qué cancelas la entrega?</h2><p className={`mt-1 text-sm ${dark ? 'text-white/45' : 'text-brand-950/45'}`}>El pedido volverá al restaurante para ser reasignado.</p></div>
                <button type="button" onClick={() => setCancelOpen(false)} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:scale-95 ${dark ? 'bg-white/8 text-white/55' : 'bg-brand-950/5 text-brand-950/50'}`}><X className="h-5 w-5" /></button>
              </div>
              <div className="space-y-2">
                {CANCEL_REASONS.map(([value, label]) => (
                  <button key={value} type="button" disabled={busy === 'cancel'} onClick={() => void cancelDelivery(value)} className={`flex min-h-12 w-full items-center gap-3 rounded-2xl border px-4 text-left text-sm font-semibold transition-transform duration-150 active:scale-[0.98] disabled:opacity-50 ${dark ? 'border-white/8 bg-white/[0.04]' : 'border-brand-950/8 bg-brand-950/[0.02]'}`}>
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />{label}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
