import { api,getToken } from '@/api/client';
import { useAuth } from '@/context/AuthContext.shared';
import { apiOrigin } from '@/utils/apiOrigin';
import { notifyNative } from '@/utils/nativeNotify';
import { canManageIncomingOrders } from '@/utils/roles';
import { Capacitor } from '@capacitor/core';
import { Bike,Martini,Store,Table2,Zap } from 'lucide-react';
import type { MouseEvent as ReactMouseEvent,PointerEvent as ReactPointerEvent } from 'react';
import { useEffect,useRef,useState } from 'react';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import type { LiveOrder } from './LiveOrdersPanel.shared';

const CHANNEL_META: Record<LiveOrder['channel'], { label: string; icon: typeof Bike; className: string }> = {
  DINE_IN: { label: 'Mesa', icon: Table2, className: 'bg-secondary text-brand-950' },
  DELIVERY: { label: 'Delivery', icon: Bike, className: 'bg-accent text-accent-foreground' },
  PICKUP: { label: 'Pick-up', icon: Store, className: 'bg-[#e3f5ec] text-[#0f6e46]' },
  BAR: { label: 'Barra', icon: Martini, className: 'bg-secondary text-brand-950' },
  EXPRESS: { label: 'Express', icon: Zap, className: 'bg-secondary text-brand-950' },
};

const NEW_ORDER_SOUND = '/sounds/pedido-nuevo.mp3';
const DELIVERY_ORDER_SOUND = '/sounds/pedido-delivery.mp3';

function soundForOrder(channel: LiveOrder['channel']) {
  return channel === 'DELIVERY' ? DELIVERY_ORDER_SOUND : NEW_ORDER_SOUND;
}

interface Props {
  /** Abre en Comandas el pedido concreto mostrado en el aviso. */
  onNavigate: (orderId: string) => void;
}

interface AlertEntry {
  id: string;
  order: LiveOrder;
  receivedAt: number;
}

/** Banner deslizable de pedido nuevo, para que nunca pase desapercibido: suena en bucle
 * hasta que se toca la pantalla, se puede aceptar/rechazar, o deslizar para silenciar. */
export function NewOrderAlert({ onNavigate }: Props) {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [now, setNow] = useState(Date.now());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);
  const alertsRef = useRef<AlertEntry[]>([]);

  useEffect(() => {
    audioRef.current = new Audio(NEW_ORDER_SOUND);
    audioRef.current.preload = 'auto';

    // Safari/Chrome móvil no permiten audio iniciado por un socket hasta que el usuario
    // interactúa con la página. Esta primera interacción prepara el audio para las comandas
    // siguientes; si ya hay una alerta activa, deja que el sonido continúe normalmente.
    function unlockAudio() {
      const audio = audioRef.current;
      if (!audio || audioUnlockedRef.current) return;
      audio
        .play()
        .then(() => {
          audioUnlockedRef.current = true;
          if (alertsRef.current.length === 0) {
            audio.pause();
            audio.currentTime = 0;
          }
        })
        .catch(() => undefined);
    }
    document.addEventListener('pointerdown', unlockAudio, { capture: true, once: true });
    document.addEventListener('keydown', unlockAudio, { capture: true, once: true });

    const socket: Socket = io(apiOrigin() || '/', { auth: { token: getToken() } });
    socket.on('order:new', async (payload: { orderId: string }) => {
      try {
        const res = await api.get('/orders/live');
        const orders: LiveOrder[] = res.data.data;
        const fresh = orders.find((o) => o.id === payload.orderId);
        if (!fresh || !user) return;
        // Cocina nunca acepta pedidos — este aviso no le sirve de nada.
        if (user.role === 'KITCHEN') return;
        // Solo tiene sentido avisar mientras el pedido de verdad espera que alguien lo
        // acepte: los que carga el propio staff (mesero/cajero/admin) ya entran directo
        // a cocina, así que nunca llegan aquí en ese estado.
        const needsAccept = fresh.status === 'PENDING' || fresh.status === 'NEEDS_CONFIRMATION';
        if (!needsAccept) return;
        // Delivery/Pickup solo lo acepta Caja/Admin/Dueño (implica coordinar cobro/despacho);
        // Mesa/Barra las puede aceptar también el Mesero asignado. Quien generó el pedido
        // nunca recibe su propio aviso; Pantalla siempre lo ve.
        const isDeliveryOrPickup = fresh.channel === 'DELIVERY' || fresh.channel === 'PICKUP';
        const relevant =
          user.role === 'SCREEN' ||
          (fresh.placedByUser?.id !== user.id &&
            (isDeliveryOrPickup
              ? canManageIncomingOrders(user.role)
              : canManageIncomingOrders(user.role) ||
                fresh.acceptedByUserId === user.id ||
                (fresh.table?.assignedWaiterId
                  ? fresh.table.assignedWaiterId === user.id
                  : !fresh.placedByUser && !fresh.acceptedByUserId)));
        if (relevant) openBanner(fresh);
      } catch {
        // Si falla el refetch, este pedido puntual simplemente no muestra aviso — sigue
        // visible igual en la pestaña Comandas.
      }
    });

    // En Android el sistema corta la conexión al pasar a segundo plano por un rato — al volver
    // a primer plano, socket.io a veces tarda en notarlo solo. Forzar la reconexión acá evita
    // quedarse "conectado" en apariencia pero sin recibir nada hasta el próximo pedido con suerte.
    let removeAppListener: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(({ App }) => {
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive && !socket.connected) socket.connect();
        }).then((handle) => {
          removeAppListener = () => handle.remove();
        });
      });
    }

    return () => {
      socket.disconnect();
      audioRef.current?.pause();
      document.removeEventListener('pointerdown', unlockAudio, true);
      document.removeEventListener('keydown', unlockAudio, true);
      removeAppListener?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (alerts.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [alerts.length]);

  // El sonido se repite hasta que el mesero toque la pantalla en cualquier parte
  // (no solo la notificación) — para que un pedido nunca pase desapercibido.
  useEffect(() => {
    if (alerts.length === 0) return;
    function stopLoop() {
      if (audioRef.current) audioRef.current.loop = false;
    }
    document.addEventListener('pointerdown', stopLoop, true);
    return () => document.removeEventListener('pointerdown', stopLoop, true);
  }, [alerts.length]);

  function openBanner(fresh: LiveOrder) {
    // No reemplazar un pedido por otro: cada comanda conserva su propia tarjeta y la nueva
    // entra debajo de las anteriores. El id evita duplicados si Socket.IO reintenta un evento.
    if (!alertsRef.current.some((entry) => entry.id === fresh.id)) {
      const next = [...alertsRef.current, { id: fresh.id, order: fresh, receivedAt: Date.now() }];
      alertsRef.current = next;
      setAlerts(next);
    }
    if (audioRef.current) {
      const audio = audioRef.current;
      const sound = soundForOrder(fresh.channel);
      // Reutilizamos el mismo elemento que ya fue desbloqueado por la interacción del usuario:
      // así Safari móvil permite que el siguiente aviso suene aunque venga de un socket.
      if (new URL(audio.src).pathname !== sound) {
        audio.pause();
        audio.src = sound;
      }
      audio.loop = true;
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
    // En la app de escritorio (Electron) esto además dispara una notificación nativa
    // del sistema operativo — así se ve aunque la ventana esté minimizada o sin foco,
    // algo que el banner de acá (solo visible con la ventana abierta) no puede lograr.
    const title = fresh.channel === 'DINE_IN' ? `Mesa ${fresh.table?.number ?? 'sin número'}` : CHANNEL_META[fresh.channel].label;
    void notifyNative({
      title: `Nuevo pedido — ${title}`,
      body: [fresh.customerName, fresh.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')].filter(Boolean).join(' · ') || 'Sin productos',
    });
  }

  function removeAlert(orderId: string) {
    const next = alertsRef.current.filter((entry) => entry.id !== orderId);
    alertsRef.current = next;
    setAlerts(next);
    if (next.length === 0 && audioRef.current) {
      audioRef.current.loop = false;
      audioRef.current.pause();
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[60] mx-auto flex max-w-sm flex-col gap-2.5">
      {alerts.map((entry) => (
        <NewOrderAlertCard
          key={entry.id}
          entry={entry}
          now={now}
          onDismiss={() => removeAlert(entry.id)}
          onOpen={(event) => {
            event.stopPropagation();
            onNavigate(entry.id);
          }}
        />
      ))}
    </div>
  );
}

function NewOrderAlertCard({
  entry,
  now,
  onDismiss,
  onOpen,
}: {
  entry: AlertEntry;
  now: number;
  onDismiss: () => void;
  onOpen: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const [shown, setShown] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartX = useRef(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const order = entry.order;
  const meta = CHANNEL_META[order.channel];
  const Icon = meta.icon;
  const elapsed = Math.max(0, Math.floor((now - entry.receivedAt) / 1000));
  const timeLabel = elapsed < 60 ? `hace ${elapsed}s` : `hace ${Math.floor(elapsed / 60)} min`;
  const title = order.channel === 'DINE_IN' ? `Mesa ${order.table?.number ?? 'sin número'}` : meta.label;
  const customerLabel = order.customerName || (order.channel === 'DINE_IN' ? null : 'Cliente sin identificar');
  const itemsSummary = order.items.map((item) => `${item.quantity}x ${item.productName}`).join(', ');

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => {
      cancelAnimationFrame(frame);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  function dismiss() {
    setShown(false);
    closeTimer.current = setTimeout(onDismiss, 260);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('[data-no-drag]')) return;
    dragStartX.current = event.clientX;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragX(Math.min(0, event.clientX - dragStartX.current));
  }

  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (dragX < -80) {
      setDragX(-520);
      dismiss();
    } else {
      setDragX(0);
    }
  }

  return (
    <div
      className="pointer-events-auto cursor-pointer rounded-[20px] border border-emerald-300/35 bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 p-4 shadow-[0_20px_40px_-12px_rgba(3,92,67,0.58)]"
      style={{
        touchAction: 'pan-y',
        transform: `translateY(${shown ? 0 : -24}px) translateX(${dragX}px)`,
        opacity: shown ? 1 : 0,
        transition: dragging ? 'none' : 'transform 420ms cubic-bezier(0.23,1,0.32,1), opacity 260ms ease',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="mb-2 flex items-center justify-between">
        <span
          title={meta.label}
          aria-label={meta.label}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 !bg-white/16 !text-white backdrop-blur-sm ${meta.className}`}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="text-xs tabular-nums text-white/70">{timeLabel}</span>
      </div>
      <p className="text-xl font-bold leading-tight tracking-[-0.025em] text-white">{title}</p>
      {customerLabel && <p className="mt-0.5 font-medium text-white/85 text-xs">{customerLabel}</p>}
      <p className="mb-3 mt-1 font-light text-white/70 text-xs">{itemsSummary || 'Sin productos'}</p>
      <div className="flex gap-2" data-no-drag>
        <button
          type="button"
          className="flex-1 rounded-xl border border-white/20 bg-white/14 py-2.5 text-sm font-semibold text-white backdrop-blur-sm"
          onClick={dismiss}
        >
          Minimizar
        </button>
        <button
          type="button"
          className="flex-1 rounded-xl bg-white py-2.5 text-sm font-semibold text-emerald-700 shadow-[0_8px_18px_-10px_rgba(0,0,0,0.45)] transition-transform duration-150 active:scale-[0.98]"
          onClick={(event) => {
            onOpen(event);
            dismiss();
          }}
        >
          Abrir
        </button>
      </div>
    </div>
  );
}
