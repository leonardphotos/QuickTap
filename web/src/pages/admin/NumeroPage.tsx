import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { API_ORIGIN } from '@/utils/apiOrigin';
import { LogOut } from 'lucide-react';
import { getToken } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';

interface ReadyOrder {
  orderId: string;
  orderNumber: number;
  channel: string;
  placedByRole: string | null;
  readyAt: number;
}

const CHANNEL_LABELS: Record<string, string> = { BAR: 'Autoservicio', DINE_IN: 'Autoservicio', PICKUP: 'Pickup' };

// El número queda al centro, gigante, 30s — después baja a la fila de "Listos" de abajo.
const CENTER_DURATION_MS = 30000;
const MAX_HISTORY = 10;

/** Rol Numero: pantalla horizontal para un monitor junto al mostrador — el número de
 * pedido más reciente (Autoservicio/Pickup) se muestra gigante al centro por 30s y
 * luego pasa a la fila de abajo, que guarda como máximo los últimos 10. */
export default function NumeroPage() {
  const { logout } = useAuth();
  const [current, setCurrent] = useState<ReadyOrder | null>(null);
  const [history, setHistory] = useState<ReadyOrder[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showOrder(order: ReadyOrder) {
    if (timerRef.current) clearTimeout(timerRef.current);
    // Si ya había uno al centro, baja de una vez a la fila de abajo para dejarle
    // el lugar al nuevo — nunca se pierde, solo se demota antes de tiempo.
    setCurrent((prev) => {
      if (prev) setHistory((h) => [prev, ...h].slice(0, MAX_HISTORY));
      return order;
    });
    timerRef.current = setTimeout(() => {
      setCurrent((prev) => {
        if (prev) setHistory((h) => [prev, ...h].slice(0, MAX_HISTORY));
        return null;
      });
    }, CENTER_DURATION_MS);
  }

  useEffect(() => {
    audioRef.current = new Audio('/sounds/notification.mp3');
    const socket: Socket = io(API_ORIGIN || '/', { auth: { token: getToken() } });
    socket.on(
      'order:ready-staff',
      (payload: { orderId: string; orderNumber: number; channel: string; placedByRole: string | null }) => {
        const isSelfService = payload.placedByRole === 'COMANDA' || payload.channel === 'PICKUP';
        if (!isSelfService) return;
        showOrder({ ...payload, readyAt: Date.now() });
        audioRef.current?.play().catch(() => {});
      },
    );
    return () => {
      socket.disconnect();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#fafafa]">
      <div className="fixed top-3 right-3 z-20">
        <TextureButton variant="icon" size="icon" aria-label="Cerrar sesión" onClick={logout}>
          <LogOut className="h-4 w-4 text-brand-950/70" />
        </TextureButton>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-0">
        {current ? (
          <>
            <p className="text-3xl md:text-4xl font-semibold text-brand-950/40 mb-2 tracking-wide">Ahora atendiendo</p>
            <p className="font-black text-brand-950 leading-none tabular-nums text-[26vw] md:text-[20vw]">
              #{current.orderNumber}
            </p>
            <p className="text-3xl md:text-4xl font-semibold text-brand-500 mt-4">
              {CHANNEL_LABELS[current.channel] ?? current.channel}
            </p>
          </>
        ) : (
          <p className="text-4xl text-brand-950/30 font-light">Esperando pedidos…</p>
        )}
      </div>

      {history.length > 0 && (
        <div className="shrink-0 border-t border-brand-950/10 bg-white px-8 py-6">
          <p className="text-base font-semibold text-brand-950/50 mb-3">Listos</p>
          <div className="flex gap-4 overflow-x-auto">
            {history.map((o) => (
              <div
                key={`${o.orderId}-${o.readyAt}`}
                className="shrink-0 rounded-2xl bg-brand-950/[0.05] px-7 py-4 text-center min-w-[8rem]"
              >
                <p className="text-4xl font-bold text-brand-950 tabular-nums">#{o.orderNumber}</p>
                <p className="text-sm text-brand-950/50 mt-1">{CHANNEL_LABELS[o.channel] ?? o.channel}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
