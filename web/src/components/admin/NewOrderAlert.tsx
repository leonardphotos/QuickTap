import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { Bike, Grid2x2, Martini, ShoppingBag } from 'lucide-react';
import { api, getToken } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import type { LiveOrder } from './LiveOrdersPanel';

const CHANNEL_META: Record<LiveOrder['channel'], { label: string; icon: typeof Bike; className: string }> = {
  DINE_IN: { label: 'Mesa', icon: Grid2x2, className: 'bg-secondary text-brand-950' },
  DELIVERY: { label: 'Delivery', icon: Bike, className: 'bg-accent text-accent-foreground' },
  PICKUP: { label: 'Pick-up', icon: ShoppingBag, className: 'bg-[#e3f5ec] text-[#0f6e46]' },
  BAR: { label: 'Barra', icon: Martini, className: 'bg-secondary text-brand-950' },
};

interface Props {
  /** Cambia a la pestaña de Comandas — se llama al tocar la notificación (sin arrastrarla). */
  onNavigate: () => void;
}

/** Banner deslizable de pedido nuevo, para que nunca pase desapercibido: suena en bucle
 * hasta que se toca la pantalla, se puede aceptar/rechazar, o deslizar para silenciar. */
export function NewOrderAlert({ onNavigate }: Props) {
  const { user } = useAuth();
  const [order, setOrder] = useState<LiveOrder | null>(null);
  const [shown, setShown] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartX = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    audioRef.current = new Audio('/sounds/notification.mp3');

    const socket: Socket = io('/', { auth: { token: getToken() } });
    socket.on('order:new', async (payload: { orderId: string }) => {
      try {
        const res = await api.get('/orders/live');
        const orders: LiveOrder[] = res.data.data;
        const fresh = orders.find((o) => o.id === payload.orderId);
        if (!fresh || !user) return;
        const relevant =
          fresh.placedByUser?.id === user.id ||
          fresh.acceptedByUserId === user.id ||
          (fresh.table?.assignedWaiterId
            ? fresh.table.assignedWaiterId === user.id
            : !fresh.placedByUser && !fresh.acceptedByUserId);
        if (relevant) openBanner(fresh);
      } catch {
        // Si falla el refetch, este pedido puntual simplemente no muestra aviso — sigue
        // visible igual en la pestaña Comandas.
      }
    });

    return () => {
      socket.disconnect();
      audioRef.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!order) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [order]);

  // El sonido se repite hasta que el mesero toque la pantalla en cualquier parte
  // (no solo la notificación) — para que un pedido nunca pase desapercibido.
  useEffect(() => {
    if (!order) return;
    function stopLoop() {
      if (audioRef.current) audioRef.current.loop = false;
    }
    document.addEventListener('pointerdown', stopLoop, true);
    return () => document.removeEventListener('pointerdown', stopLoop, true);
  }, [order]);

  function openBanner(fresh: LiveOrder) {
    setOrder(fresh);
    setElapsed(0);
    setDragX(0);
    startTimeRef.current = Date.now();
    setShown(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    if (audioRef.current) {
      audioRef.current.loop = true;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }

  function close() {
    setShown(false);
    if (audioRef.current) {
      audioRef.current.loop = false;
      audioRef.current.pause();
    }
    setTimeout(() => {
      setOrder(null);
      setDragX(0);
    }, 260);
  }

  async function accept() {
    if (!order) return;
    const id = order.id;
    close();
    try {
      await api.post(`/orders/${id}/accept`);
    } catch {
      // Reintentable desde Comandas si falla.
    }
  }

  async function reject() {
    if (!order) return;
    const id = order.id;
    close();
    try {
      await api.delete(`/orders/${id}`);
    } catch {
      // Reintentable desde Comandas si falla.
    }
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    dragStartX.current = e.clientX;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragX(Math.min(0, e.clientX - dragStartX.current));
  }
  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (dragX < -80) {
      setDragX(-520);
      setTimeout(close, 240);
    } else if (Math.abs(dragX) < 6) {
      onNavigate();
      close();
    } else {
      setDragX(0);
    }
  }

  if (!order) return null;

  const meta = CHANNEL_META[order.channel];
  const Icon = meta.icon;
  const title = order.channel === 'DINE_IN' ? `Mesa ${order.table?.number ?? ''}` : order.customerName || meta.label;
  const itemsSummary = order.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ');
  const timeLabel = elapsed < 60 ? `hace ${elapsed}s` : `hace ${Math.floor(elapsed / 60)} min`;

  return (
    <div
      className="fixed inset-x-3 top-3 z-[60] mx-auto max-w-sm rounded-[20px] border border-brand-950/[0.06] bg-white p-4 shadow-[0_20px_40px_-12px_rgba(0,27,67,0.35)] cursor-pointer"
      style={{
        touchAction: 'pan-y',
        transform: `translateY(${shown ? 0 : -160}%) translateX(${dragX}px)`,
        opacity: shown ? 1 : 0,
        transition: dragging ? 'none' : 'transform 500ms cubic-bezier(0.23,1,0.32,1), opacity 400ms ease',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
          <Icon className="h-3.5 w-3.5" /> {meta.label}
        </span>
        <span className="text-xs text-brand-950/40 tabular-nums">{timeLabel}</span>
      </div>
      <p className="text-sm font-semibold text-brand-950">{title}</p>
      <p className="text-xs text-brand-950/50 font-light mb-3">{itemsSummary || 'Sin productos'}</p>
      <div className="flex gap-2" data-no-drag>
        <button
          type="button"
          className="flex-1 rounded-xl bg-brand-950/5 text-brand-950/60 text-sm font-semibold py-2.5"
          onClick={reject}
        >
          Rechazar
        </button>
        <TextureButton variant="brand" size="default" className="flex-1 !w-auto" onClick={accept}>
          Aceptar
        </TextureButton>
      </div>
    </div>
  );
}
