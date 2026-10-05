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
  initialRestaurantCounts,
}: {
  initial: number;
  initialUsd: string;
  initialBs: string;
  initialRestaurantCounts?: { active: number; inactive: number; expiring: number };
}) {
  const [restaurantCounts, setRestaurantCounts] = useState(initialRestaurantCounts);
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
          if (res.data.data.restaurantCounts) setRestaurantCounts(res.data.data.restaurantCounts);
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
    if (target < from || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
    <section aria-label="Pedidos procesados" className="h-full min-w-0 rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-brand-500"><Receipt size={18}/></span>
          <h2 className="text-sm font-semibold text-slate-900">Pedidos procesados</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"/>En vivo
        </span>
      </header>
      <div className="mt-6">
        <p className="font-medium text-gray-500 text-xs">Total de pedidos</p>
        <p className={`mt-1 text-4xl font-semibold tracking-tight tabular-nums transition-colors motion-reduce:transition-none ${justChanged?'text-brand-500':'text-slate-950'}`}>
          {shown.toLocaleString('es-VE')}
        </p>
      </div>
      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="font-medium text-gray-500 text-xs">Monto procesado</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="min-w-0 break-all text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
            ${Number(totalUsd).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-xs text-slate-500">USD</span>
        </div>
        <p className="mt-1 break-words text-gray-900 tabular-nums text-base">{formatBsAbsolute(totalBs)}</p>
      </div>
      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="mb-3 font-medium text-gray-500 text-xs">Estado de los locales</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Activos', value: restaurantCounts?.active, color: 'bg-blue-50 text-blue-700' },
            { label: 'Desactivados', value: restaurantCounts?.inactive, color: 'bg-slate-50 text-slate-700' },
            { label: 'Por vencer', value: restaurantCounts?.expiring, color: 'bg-amber-50 text-amber-800' },
          ].map(({ label, value, color }) => (
            <div key={label} className={`min-w-0 rounded-xl px-2 py-3 sm:px-3 ${color}`}>
              <p className="text-2xl font-semibold tracking-tight tabular-nums">{value?.toLocaleString('es-VE') ?? '—'}</p>
              <p className="mt-1 font-medium text-xs">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 leading-relaxed text-gray-500 text-xs">Por vencer: locales activos con vencimiento en las próximas 48 horas. No incluye sucursales ni cuentas demo.</p>
      </div>
      <footer className="mt-5 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] leading-relaxed text-slate-500">
        Acumulado de todos los locales, sin la cuenta demo. Equivalente en USD calculado a la tasa de hoy.
      </footer>
    </section>
  );
}
