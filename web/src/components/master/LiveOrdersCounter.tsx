import { useEffect, useRef, useState } from 'react';
import { Receipt } from 'lucide-react';
import { masterApi } from '@/api/client';
import { formatBsAbsolute } from '@/utils/format';

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
export function LiveOrdersCounter({
  initial,
  initialUsd,
  initialBs,
}: {
  initial: number;
  initialUsd: string;
  initialBs: string;
}) {
  const [target, setTarget] = useState(initial);
  const [shown, setShown] = useState(initial);
  const [totalUsd, setTotalUsd] = useState(initialUsd);
  const [totalBs, setTotalBs] = useState(initialBs);
  const [justChanged, setJustChanged] = useState(false);
  const shownRef = useRef(initial);

  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  useEffect(() => {
    const id = setInterval(() => {
      masterApi
        .get('/master/summary/live')
        .then((res) => {
          setTarget(res.data.data.ordersAllTime);
          setTotalUsd(res.data.data.ordersAllTimeUsd);
          setTotalBs(res.data.data.ordersAllTimeBs);
        })
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
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 px-6 py-7 text-white shadow-[0_18px_40px_-24px_rgba(0,154,255,0.8)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-brand-950/50" />
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-950/50">Pedidos procesados</p>
        </div>

        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          En vivo
        </span>
      </div>

      {/* items-start + leading-none en las dos cifras grandes: así comparten línea base aunque la
          columna de la derecha lleve una línea más abajo (los Bs). Con items-end se alineaban por
          abajo y el número de pedidos quedaba hundido respecto al monto. */}
      <div className="mt-4 flex flex-wrap items-start gap-x-10 gap-y-4">
        <div className="min-w-0">
          <p
            className={`text-5xl font-bold leading-none tabular-nums transition-colors duration-500 ${
              justChanged ? 'text-emerald-300' : 'text-white'
            }`}
          >
            {shown.toLocaleString('es-VE')}
          </p>
          <p className="mt-2.5 text-xs font-light text-brand-950/45">pedidos</p>
        </div>

        {/* El separador solo cuando las dos cifras van lado a lado: al apilarse en pantalla
            angosta, una línea vertical a la izquierda del bloque queda suelta y sin sentido. */}
        <div className="min-w-0 sm:self-stretch sm:border-l sm:border-brand-950/20 sm:pl-10">
          <p className="text-5xl font-bold leading-none tabular-nums text-white">
            ${Number(totalUsd).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="mt-2.5 text-lg font-semibold leading-none tabular-nums text-brand-950/70">
            {formatBsAbsolute(totalBs)}
          </p>
          <p className="mt-2 text-xs font-light text-brand-950/45">facturado</p>
        </div>
      </div>

      <p className="mt-4 text-xs font-light text-brand-950/45">
        Total desde que arrancó QuickTap, en todos los locales. No cuenta la cuenta demo. El monto en $ es el
        equivalente a la tasa de hoy.
      </p>
    </div>
  );
}
