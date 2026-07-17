import { useEffect, useRef, useState } from 'react';
import { masterApi } from '@/api/client';

const MAX_MS = 600;
const POLL_MS = 5000;
const GREEN_MAX = 150;
const YELLOW_MAX = 350;

function zoneColor(ms: number | null): string {
  if (ms == null) return '#94a3b8';
  if (ms < GREEN_MAX) return '#10b981';
  if (ms < YELLOW_MAX) return '#f59e0b';
  return '#ef4444';
}

function zoneLabel(ms: number | null): string {
  if (ms == null) return 'Sin conexión';
  if (ms < GREEN_MAX) return 'Rápido';
  if (ms < YELLOW_MAX) return 'Normal';
  return 'Lento';
}

/** Punto sobre el semicírculo del gauge: fraction 0 = extremo izquierdo, 1 = extremo derecho. */
function polarPoint(fraction: number, r: number) {
  const theta = Math.PI * (1 - fraction);
  return { x: 100 + r * Math.cos(theta), y: 100 - r * Math.sin(theta) };
}

function arcPath(f0: number, f1: number, r: number) {
  const p0 = polarPoint(f0, r);
  const p1 = polarPoint(f1, r);
  const largeArc = f1 - f0 > 0.5 ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${largeArc} 1 ${p1.x} ${p1.y}`;
}

/** Velocímetro con la latencia del API (Dashboard maestro), medida con un ping liviano sin BD. */
export function SpeedGauge() {
  const [latency, setLatency] = useState<number | null>(null);
  const [checking, setChecking] = useState(true);

  async function ping() {
    const start = performance.now();
    try {
      await masterApi.get('/ping');
      setLatency(Math.round(performance.now() - start));
    } catch {
      setLatency(null);
    } finally {
      setChecking(false);
    }
  }

  const pingRef = useRef(ping);
  pingRef.current = ping;

  useEffect(() => {
    pingRef.current();
    const id = window.setInterval(() => pingRef.current(), POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  const fraction = latency == null ? 0 : Math.min(latency, MAX_MS) / MAX_MS;
  const needle = polarPoint(fraction, 68);
  const color = zoneColor(latency);
  const greenEnd = GREEN_MAX / MAX_MS;
  const yellowEnd = YELLOW_MAX / MAX_MS;

  return (
    <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 flex flex-col items-center">
      <p className="text-sm font-medium text-brand-950/70 self-start mb-1">Velocidad del API</p>
      <svg viewBox="0 0 200 115" className="w-full max-w-[220px]">
        <path d={arcPath(0, greenEnd, 80)} fill="none" stroke="#10b981" strokeWidth="14" strokeOpacity="0.25" />
        <path d={arcPath(greenEnd, yellowEnd, 80)} fill="none" stroke="#f59e0b" strokeWidth="14" strokeOpacity="0.25" />
        <path d={arcPath(yellowEnd, 1, 80)} fill="none" stroke="#ef4444" strokeWidth="14" strokeOpacity="0.25" />
        <line
          x1="100"
          y1="100"
          x2={needle.x}
          y2={needle.y}
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          style={{ transition: 'x2 0.6s ease, y2 0.6s ease, stroke 0.6s ease' }}
        />
        <circle cx="100" cy="100" r="7" fill={color} style={{ transition: 'fill 0.6s ease' }} />
      </svg>
      <p className="text-2xl font-semibold text-brand-950 -mt-2">{checking ? '—' : latency != null ? `${latency} ms` : 'Sin conexión'}</p>
      <p className="text-xs font-medium mt-0.5" style={{ color }}>
        {checking ? 'Midiendo…' : zoneLabel(latency)}
      </p>
    </div>
  );
}
