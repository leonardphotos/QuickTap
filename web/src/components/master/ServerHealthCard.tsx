import { useEffect, useRef, useState } from 'react';
import { masterApi } from '@/api/client';

const POLL_MS = 10000;

interface ExchangeRateInfo {
  currency: 'USD' | 'EUR';
  rateBs: string | null;
  fetchedAt: string | null;
  source: string | null;
  stale: boolean;
}

interface ServerHealth {
  uptimeSeconds: number;
  memory: { rssMb: number; heapUsedMb: number };
  system: { freeMb: number; totalMb: number; usedPercent: number };
  loadAvg1m: number;
  dbLatencyMs: number | null;
  socketsConnected: number;
  exchangeRate: { USD: ExchangeRateInfo; EUR: ExchangeRateInfo };
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Verde/amarillo/rojo según qué tan cerca está un valor de su límite. */
function levelColor(value: number, warn: number, danger: number): string {
  if (value >= danger) return '#ef4444';
  if (value >= warn) return '#f59e0b';
  return '#10b981';
}

/** Salud del servidor en vivo (RAM, CPU, latencia de BD, sockets conectados) + botón para forzar el refresh de la tasa BCV. */
export function ServerHealthCard() {
  const [health, setHealth] = useState<ServerHealth | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedMessage, setRefreshedMessage] = useState<string | null>(null);

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

  async function refreshCache() {
    setRefreshing(true);
    setRefreshedMessage(null);
    try {
      const res = await masterApi.post('/master/server-status/refresh-cache');
      setHealth(res.data.data);
      setRefreshedMessage('Tasa BCV actualizada.');
    } catch {
      setRefreshedMessage('No se pudo actualizar la tasa BCV.');
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshedMessage(null), 4000);
    }
  }

  const ramColor = health ? levelColor(health.system.usedPercent, 70, 90) : '#94a3b8';
  const dbColor = health?.dbLatencyMs != null ? levelColor(health.dbLatencyMs, 150, 400) : '#94a3b8';
  const loadColor = health ? levelColor(health.loadAvg1m, 1, 2) : '#94a3b8';

  return (
    <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-brand-950/70">Salud del servidor</p>
        <button
          onClick={refreshCache}
          disabled={refreshing}
          className="text-xs font-medium text-brand-500 hover:text-brand-400 disabled:opacity-50"
        >
          {refreshing ? 'Limpiando…' : 'Limpiar caché (tasa BCV)'}
        </button>
      </div>

      {!health ? (
        <p className="text-xs text-brand-950/40 font-light">Cargando…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Metric label="RAM usada" value={`${health.system.usedPercent}%`} sub={`${health.system.freeMb} MB libres`} color={ramColor} />
            <Metric label="Carga CPU (1m)" value={health.loadAvg1m.toFixed(2)} sub="promedio" color={loadColor} />
            <Metric
              label="Latencia BD"
              value={health.dbLatencyMs != null ? `${health.dbLatencyMs} ms` : 'Sin conexión'}
              sub="SELECT 1"
              color={dbColor}
            />
            <Metric label="Conexiones en vivo" value={String(health.socketsConnected)} sub="sockets" color="#0597F2" />
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mt-4 pt-4 border-t border-brand-950/10 text-xs text-brand-950/50 font-light">
            <span>Activo hace {formatUptime(health.uptimeSeconds)}</span>
            <span>Memoria del proceso: {health.memory.rssMb} MB</span>
            <RateBadge label="Tasa USD" info={health.exchangeRate.USD} />
            <RateBadge label="Tasa EUR" info={health.exchangeRate.EUR} />
          </div>

          {refreshedMessage && <p className="text-xs text-brand-500 mt-2">{refreshedMessage}</p>}
        </>
      )}
    </div>
  );
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div>
      <p className="text-xl font-semibold" style={{ color }}>
        {value}
      </p>
      <p className="text-xs text-brand-950/60 font-medium">{label}</p>
      <p className="text-[11px] text-brand-950/40 font-light">{sub}</p>
    </div>
  );
}

function RateBadge({ label, info }: { label: string; info: ExchangeRateInfo }) {
  return (
    <span className="flex items-center gap-1">
      {label}: {info.rateBs ?? '—'}
      <span className={`w-1.5 h-1.5 rounded-full ${info.stale ? 'bg-amber-500' : 'bg-emerald-500'}`} />
    </span>
  );
}
