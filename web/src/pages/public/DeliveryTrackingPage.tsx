import { api } from '@/api/client';
import { apiOrigin } from '@/utils/apiOrigin';
import { quickTapTileDefinition } from '@/utils/map-tiles';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Bike, Check, ChefHat, Clock3, MapPin, PackageCheck, Store, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';

type TrackingData = {
  orderNumber: number;
  status: string;
  createdAt: string;
  deliveryAcceptedAt: string | null;
  deliveryPickedUpAt: string | null;
  deliveryRouteStartedAt: string | null;
  deliveryCompletedAt: string | null;
  deliveryCancelledAt: string | null;
  deliveryLastLat: number | null;
  deliveryLastLng: number | null;
  deliveryLocationAccuracy: number | null;
  deliveryLocationUpdatedAt: string | null;
  customerLat: number | null;
  customerLng: number | null;
  restaurant: { name: string; logoUrl: string | null };
  deliveryCourier: { name: string } | null;
  items: Array<{ id: string; productName: string; variantName: string | null; quantity: number }>;
};

function TrackingMap({ data }: { data: TrackingData }) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!elementRef.current || mapRef.current) return;
    const map = L.map(elementRef.current, { zoomControl: false }).setView([10.4806, -66.9036], 13);
    const [url, options] = quickTapTileDefinition(false);
    L.tileLayer(url, options).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 80);
    return () => { map.remove(); mapRef.current = null; layerRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const points: [number, number][] = [];
    if (data.customerLat != null && data.customerLng != null) {
      const destination: [number, number] = [data.customerLat, data.customerLng];
      points.push(destination);
      L.marker(destination, {
        icon: L.divIcon({ className: '', iconSize: [38, 46], iconAnchor: [19, 42], html: '<div style="width:38px;height:38px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#00234f;border:4px solid #fff;box-shadow:0 8px 24px rgba(0,35,79,.28)"><div style="width:10px;height:10px;margin:10px;border-radius:50%;background:#fff"></div></div>' }),
      }).bindTooltip('Tu dirección').addTo(layer);
    }
    if (data.deliveryLastLat != null && data.deliveryLastLng != null) {
      const courier: [number, number] = [data.deliveryLastLat, data.deliveryLastLng];
      points.push(courier);
      L.marker(courier, {
        zIndexOffset: 1000,
        icon: L.divIcon({ className: '', iconSize: [48, 48], iconAnchor: [24, 24], html: '<div style="width:48px;height:48px;display:grid;place-items:center;border-radius:50%;background:#0ea5e9;color:white;border:4px solid white;box-shadow:0 10px 28px rgba(14,165,233,.35);font-size:23px">●</div>' }),
      }).bindTooltip(data.deliveryCourier?.name ?? 'Tu motorizado').addTo(layer);
    }
    if (points.length === 2) map.fitBounds(points, { padding: [54, 54], maxZoom: 16, animate: true });
    else if (points[0]) map.setView(points[0], 15, { animate: true });
  }, [data.customerLat, data.customerLng, data.deliveryCourier?.name, data.deliveryLastLat, data.deliveryLastLng]);

  return <div ref={elementRef} className="h-[360px] w-full overflow-hidden rounded-[26px] bg-slate-100" />;
}

function relativeTime(value: string | null) {
  if (!value) return '';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 20) return 'ahora mismo';
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return minutes === 1 ? 'hace 1 min' : `hace ${minutes} min`;
}

export default function DeliveryTrackingPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [data, setData] = useState<TrackingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const response = await api.get(`/public/delivery-tracking/${token}`);
      setData(response.data.data);
      setError(null);
    } catch (requestError: any) {
      setError(requestError.response?.data?.error ?? 'No pudimos abrir este seguimiento.');
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!token) return;
    const socket: Socket = io(apiOrigin() || '/', { auth: { trackingToken: token } });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('delivery:tracking-updated', () => void load());
    const interval = window.setInterval(() => void load(), 15_000);
    return () => { window.clearInterval(interval); socket.disconnect(); };
  }, [load, token]);

  const steps = useMemo(() => data ? [
    { label: 'Pedido recibido', done: true, active: !data.deliveryAcceptedAt, icon: Store },
    { label: data.status === 'KITCHEN' ? 'En cocina' : data.status === 'SERVED' ? 'Listo para entregar' : 'Preparando tu pedido', done: ['KITCHEN', 'SERVED'].includes(data.status), active: !data.deliveryPickedUpAt && ['KITCHEN', 'SERVED'].includes(data.status), icon: ChefHat },
    { label: data.deliveryCourier ? `${data.deliveryCourier.name} tomó el pedido` : 'Motorizado asignado', done: !!data.deliveryAcceptedAt, active: !!data.deliveryAcceptedAt && !data.deliveryPickedUpAt, icon: Bike },
    { label: 'Pedido retirado', done: !!data.deliveryPickedUpAt, active: !!data.deliveryPickedUpAt && !data.deliveryRouteStartedAt, icon: PackageCheck },
    { label: data.deliveryCompletedAt ? 'Pedido entregado' : 'Va en vía', done: !!data.deliveryRouteStartedAt, active: !!data.deliveryRouteStartedAt && !data.deliveryCompletedAt, icon: data.deliveryCompletedAt ? Check : MapPin },
  ] : [], [data]);

  if (error && !data) return (
    <main className="grid min-h-screen place-items-center bg-[#f6f9fd] px-5 text-center text-[#00234f]">
      <div className="max-w-sm rounded-[28px] bg-white p-8 shadow-[0_18px_60px_rgba(0,35,79,.12)]"><X className="mx-auto h-11 w-11 text-red-500" /><h1 className="mt-4 text-xl font-bold">Seguimiento no disponible</h1><p className="mt-2 text-gray-900 text-base">{error}</p></div>
    </main>
  );
  if (!data) return <main className="grid min-h-screen place-items-center bg-[#f6f9fd] text-sm font-semibold text-[#00234f]/55">Preparando el seguimiento…</main>;

  const inTransit = !!data.deliveryRouteStartedAt && !data.deliveryCompletedAt && !data.deliveryCancelledAt;
  return (
    <main className="min-h-screen bg-[#f6f9fd] px-4 py-5 text-[#00234f] sm:py-10">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center gap-3 px-1">
          {data.restaurant.logoUrl ? <img src={data.restaurant.logoUrl} alt="" className="h-12 w-12 rounded-2xl object-cover shadow-sm" /> : <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#009cff] text-white"><Store className="h-6 w-6" /></span>}
          <div className="min-w-0 flex-1"><p className="truncate text-lg font-bold">{data.restaurant.name}</p><p className="font-semibold text-gray-500 text-xs">Pedido #{data.orderNumber}</p></div>
          <span className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${connected ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-700'}`}><span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />{connected ? 'En vivo' : 'Actualizando'}</span>
        </header>

        <section className="mt-5 overflow-hidden rounded-[30px] bg-gradient-to-br from-[#009cff] to-[#2545ed] p-6 text-white shadow-[0_22px_55px_rgba(0,93,220,.22)] sm:p-8">
          <p className="font-bold uppercase tracking-[.18em] text-white/65 text-xs">Estado de tu delivery</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{data.deliveryCancelledAt ? 'Entrega cancelada' : data.deliveryCompletedAt ? '¡Pedido entregado!' : inTransit ? 'Tu pedido va en vía' : data.deliveryPickedUpAt ? 'El motorizado lo retiró' : data.status === 'KITCHEN' ? 'Tu pedido está en cocina' : 'Estamos preparando tu pedido'}</h1>
          <p className="mt-2 text-white/75 text-base">Esta pantalla se actualiza automáticamente.</p>
        </section>

        {inTransit && (
          <section className="mt-5 rounded-[30px] bg-white p-3 shadow-[0_16px_45px_rgba(0,35,79,.09)]">
            <TrackingMap data={data} />
            <div className="flex items-center justify-between gap-3 px-3 pb-2 pt-4">
              <div><p className="font-bold text-base">{data.deliveryCourier?.name ?? 'Tu motorizado'} está en camino</p><p className="mt-0.5 text-gray-500 text-xs">Ubicación {relativeTime(data.deliveryLocationUpdatedAt)}</p></div>
              {!data.deliveryLocationUpdatedAt && <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-bold text-brand-500">Esperando GPS</span>}
            </div>
          </section>
        )}

        <div className="mt-5 grid gap-5 md:grid-cols-[1.2fr_.8fr]">
          <section className="rounded-[30px] bg-white p-6 shadow-[0_16px_45px_rgba(0,35,79,.07)]">
            <h2 className="text-lg font-bold">Recorrido del pedido</h2>
            <div className="mt-5 space-y-1">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return <div key={step.label} className="flex gap-3"><div className="flex flex-col items-center"><span className={`grid h-10 w-10 place-items-center rounded-full ${step.done ? 'bg-[#009cff] text-white' : 'bg-slate-100 text-slate-300'}`}><Icon className="h-4.5 w-4.5" /></span>{index < steps.length - 1 && <span className={`h-7 w-0.5 ${step.done && steps[index + 1]?.done ? 'bg-[#009cff]' : 'bg-slate-100'}`} />}</div><div className="pt-2"><p className={`text-sm font-bold ${step.done ? 'text-[#00234f]' : 'text-slate-300'}`}>{step.label}</p>{step.active && !data.deliveryCancelledAt && <p className="mt-0.5 flex items-center gap-1 font-semibold text-[#009cff] text-xs"><Clock3 className="h-3 w-3" /> Ahora</p>}</div></div>;
              })}
            </div>
          </section>

          <section className="rounded-[30px] bg-white p-6 shadow-[0_16px_45px_rgba(0,35,79,.07)]">
            <h2 className="text-lg font-bold">Tu pedido</h2>
            <div className="mt-4 divide-y divide-slate-100">
              {data.items.map((item) => <div key={item.id} className="flex gap-3 py-3 text-sm"><span className="font-extrabold text-[#009cff]">{item.quantity}x</span><p className="font-semibold text-base">{item.productName}{item.variantName ? <span className="block text-xs font-normal text-slate-400">{item.variantName}</span> : null}</p></div>)}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
