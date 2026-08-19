import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { apiOrigin } from '@/utils/apiOrigin';
import { Truck } from 'lucide-react';
import { api, getToken } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { CourierPickerDialog } from '@/components/admin/CourierPickerDialog';
import type { DeliveryCourier } from '@/types';

interface ReadyOrder {
  orderId: string;
  orderNumber: number;
  channel: string;
}

/** Banner deslizable de "pedido listo", igual en estructura a NewOrderAlert: suena en
 * bucle hasta que se toca la pantalla, se puede deslizar para descartar. Solo pedidos
 * de canal Delivery muestran el botón "Enviar" (despachar repartidor); los demás
 * canales solo se descartan (recogen en el mostrador). */
export function OrderReadyToast() {
  const [order, setOrder] = useState<ReadyOrder | null>(null);
  const [shown, setShown] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [couriers, setCouriers] = useState<DeliveryCourier[]>([]);
  const [showCourierPicker, setShowCourierPicker] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const dragStartX = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio('/sounds/notification.mp3');
    api.get('/delivery-couriers').then((res) => setCouriers(res.data.data));

    const socket: Socket = io(apiOrigin() || '/', { auth: { token: getToken() } });
    socket.on('order:ready-staff', (payload: ReadyOrder) => openBanner(payload));

    return () => {
      socket.disconnect();
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (!order) return;
    function stopLoop() {
      if (audioRef.current) audioRef.current.loop = false;
    }
    document.addEventListener('pointerdown', stopLoop, true);
    return () => document.removeEventListener('pointerdown', stopLoop, true);
  }, [order]);

  function openBanner(fresh: ReadyOrder) {
    setOrder(fresh);
    setDragX(0);
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
      setShowCourierPicker(false);
    }, 260);
  }

  async function dispatchCourier(courierId: string) {
    if (!order) return;
    // Mismo motivo que en LiveOrdersPanel: abrir la pestaña antes del await para no
    // perder el gesto del clic y que el navegador bloquee el popup.
    const win = window.open('', '_blank');
    setDispatching(true);
    try {
      const res = await api.post(`/orders/${order.orderId}/dispatch-courier`, { courierId });
      const url = res.data.data?.url;
      if (win && url) win.location.href = url;
      else win?.close();
      close();
    } catch {
      win?.close();
      // Si falla, el banner sigue visible para reintentar.
    } finally {
      setDispatching(false);
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
    } else {
      setDragX(0);
    }
  }

  if (!order) return null;

  return (
    <>
      <div
        className="fixed inset-x-3 top-3 z-[60] mx-auto max-w-sm rounded-[20px] border border-brand-950/[0.06] bg-white p-4 shadow-[0_20px_40px_-12px_rgba(0,27,67,0.35)]"
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
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold bg-[#e3f5ec] text-[#0f6e46] mb-2">
          Listo
        </span>
        <p className="text-sm font-semibold text-brand-950">Pedido #{order.orderNumber} Listo</p>
        <div className="flex gap-2 mt-3" data-no-drag>
          <button
            type="button"
            className="flex-1 rounded-xl bg-brand-950/5 text-brand-950/60 text-sm font-semibold py-2.5"
            onClick={close}
          >
            Descartar
          </button>
          {order.channel === 'DELIVERY' && (
            <TextureButton
              variant="brand"
              size="default"
              className="flex-1 !w-auto flex items-center justify-center gap-1.5"
              onClick={() => setShowCourierPicker(true)}
            >
              <Truck className="h-4 w-4" /> Enviar
            </TextureButton>
          )}
        </div>
      </div>

      {showCourierPicker && (
        <CourierPickerDialog
          open
          couriers={couriers}
          busy={dispatching}
          onPick={dispatchCourier}
          onClose={() => setShowCourierPicker(false)}
        />
      )}
    </>
  );
}
