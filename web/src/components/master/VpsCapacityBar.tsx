import { useEffect, useRef, useState } from 'react';
import { masterApi } from '@/api/client';

const POLL_MS = 15000;

interface VpsCapacity {
  percent: number;
  bottleneck: 'cpu' | 'ram' | 'swap' | 'disco' | 'ninguno';
  bottleneckLabel: string;
}

interface CapacityHealth {
  system: { usedPercent: number };
  loadAvg1m: number;
  cpuCores: number;
  swap: { usedPercent: number } | null;
  diskUsedPercent: number | null;
  vpsCapacity: VpsCapacity;
}

function barColor(percent: number): string {
  if (percent >= 85) return '#ef4444';
  if (percent >= 60) return '#f59e0b';
  return '#10b981';
}

function statusText(percent: number): string {
  if (percent >= 85) return 'Actualiza el VPS pronto';
  if (percent >= 60) return 'Empieza a vigilar de cerca';
  return 'Con margen de sobra';
}

/**
 * Barra de capacidad del VPS: combina RAM/CPU/swap/disco en un solo % "hacia
 * necesitar un VPS más grande", usando los umbrales del estudio de capacidad
 * (26 jul 2026). El cuello de botella mostrado es el peor de los 4, no un
 * promedio — es el que primero se agota en la práctica.
 */
export function VpsCapacityBar() {
  const [health, setHealth] = useState<CapacityHealth | null>(null);

  function load() {
    masterApi
      .get('/master/server-status')
      .then((res) => setHealth(res.data.data))
      .catch(() => setHealth(null));
  }

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    loadRef.current();
    const id = window.setInterval(() => loadRef.current(), POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  if (!health) {
    return (
      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6">
        <p className="text-xs text-brand-950/40 font-light">Cargando capacidad del VPS…</p>
      </div>
    );
  }

  const { percent, bottleneckLabel } = health.vpsCapacity;
  const color = barColor(percent);

  return (
    <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium text-brand-950/70">Capacidad del VPS</p>
        <span className="text-xs font-medium" style={{ color }}>
          {statusText(percent)}
        </span>
      </div>

      <div className="flex items-baseline gap-2 mt-2 mb-3">
        <span className="text-3xl font-semibold tabular-nums" style={{ color }}>
          {percent}%
        </span>
        <span className="text-xs text-brand-950/50 font-light">
          hacia necesitar actualizar el plan · cuello de botella: {bottleneckLabel}
        </span>
      </div>

      <div className="h-2.5 w-full rounded-full bg-brand-950/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.max(percent, 3)}%`, backgroundColor: color }}
        />
        {/* Marcas de referencia: 60% (vigilar) y 85% (actualizar). */}
        <div className="relative -mt-2.5 h-2.5">
          <div className="absolute top-0 h-2.5 w-px bg-white/70" style={{ left: '60%' }} />
          <div className="absolute top-0 h-2.5 w-px bg-white/70" style={{ left: '85%' }} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[11px] text-brand-950/40 font-light">
        <span>
          CPU: {health.loadAvg1m.toFixed(2)} carga / {health.cpuCores} {health.cpuCores === 1 ? 'núcleo' : 'núcleos'}
        </span>
        <span>RAM: {health.system.usedPercent}%</span>
        <span>Swap: {health.swap ? `${health.swap.usedPercent}%` : '—'}</span>
        <span>Disco: {health.diskUsedPercent != null ? `${health.diskUsedPercent}%` : '—'}</span>
      </div>
    </div>
  );
}
