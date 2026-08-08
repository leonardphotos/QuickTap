import { useEffect, useRef, useState } from 'react';
import { Receipt } from 'lucide-react';
import { masterApi } from '@/api/client';

const POLL_MS = 8000;
/** Duración de la animación al subir el número (ms). */
const COUNT_UP_MS = 900;

/**
 * Total histórico de pedidos procesados por la plataforma, subiendo en vivo.
 *
 * Se sondea /master/summary/live (solo un COUNT) en vez de abrir un socket: el Dashboard maestro
 * no usa Socket.IO en ningún lado todavía, y montar la realtime para esto obligaría a meter el
 * JWT de plataforma en el gateway de sockets — más superficie en la separación de los dos realms
 * de auth, para un número que sube unas pocas veces por hora. El sondeo además se autocorrige:
 * siempre muestra el valor real de la base, no un acumulado local que pueda desfasarse.
 */
export function LiveOrdersCounter({ initial }: { initial: number }) {
  const [target, setTarget] = useState(initial);
  const [shown, setShown] = useState(initial);
  const [justChanged, setJustChanged] = useState(false);
  const shownRef = useRef(initial);

  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  useEffect(() => {
    const id = setInterval(() => {
      masterApi
        .get('/master/summary/live')
        .then((res) => setTarget(res.data.data.ordersAllTime))
        .catch(() => undefined); // un sondeo fallido no rompe la tarjeta: se reintenta al siguiente
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Sube el número de a poco hasta el nuevo total, en vez de saltar de golpe.
  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return;
    if (target < from) {
      // No debería pasar (el contador no descuenta cancelados), pero si la cifra baja por
      // cualquier motivo se acepta de una vez en vez de animar hacia atrás.
      setShown(target);
      return;
    }

    setJustChanged(true);
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      // easeOutCubic: arranca rápido y frena al final.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
      else setTimeout(() => setJustChanged(false), 600);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-brand-950 px-6 py-7 text-white shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-white/50" />
            <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Pedidos procesados</p>
          </div>
          <p
            className={`mt-2 text-5xl font-bold tabular-nums transition-colors duration-500 ${
              justChanged ? 'text-emerald-300' : 'text-white'
            }`}
          >
            {shown.toLocaleString('es-VE')}
          </p>
          <p className="mt-1 text-xs font-light text-white/45">
            Total desde que arrancó QuickTap, en todos los locales. No cuenta la cuenta demo.
          </p>
        </div>

        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          En vivo
        </span>
      </div>
    </div>
  );
}
