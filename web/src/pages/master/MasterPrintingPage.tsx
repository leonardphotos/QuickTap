import { useEffect, useState, useMemo } from 'react';
import {
  Printer,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Store,
  ChevronRight,
  Search,
  Zap,
  Timer,
  FileText,
  Wifi,
  WifiOff,
  Check,
} from 'lucide-react';
import { masterApi } from '@/api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface Result {
  printer: string;
  kitchen: string;
  status: 'STARTED' | 'ACCEPTED' | 'FAILED' | 'UNCONFIRMED' | string;
  error?: string;
}

interface Delivery {
  id: string;
  stationId: string;
  status: 'ACCEPTED' | 'PROCESSING' | 'FAILED' | 'UNCONFIRMED' | string;
  error?: string | null;
  startedAt: string;
  updatedAt: string;
  results: Record<string, Result>;
  printers: string[];
  isAccepted: boolean;
  durationMs: number | null;
  durationSeconds: number | null;
}

interface Item {
  name: string;
  quantity: number;
  kitchenName: string | null;
  notes?: string | null;
  variantName?: string | null;
  unitPrice?: string | number | null;
  lineTotal?: string | number | null;
  modifiers?: string[];
}

interface Job {
  id: string;
  restaurantId: string;
  restaurantName: string;
  orderId?: string | null;
  orderNumber: number;
  kind: string;
  automatic: boolean;
  createdAt: string;
  channel?: string | null;
  tableName?: string | null;
  placedByUser?: string | null;
  customerName?: string | null;
  totalBase?: string | number | null;
  totalBs?: string | number | null;
  currency?: string;
  isPrinted: boolean;
  durationMs: number | null;
  durationSeconds: number | null;
  printers: string[];
  deliveries: Delivery[];
  items: Item[];
}

interface RegisteredPrinter {
  id: string;
  key: string;
  name: string;
  driver: string | null;
  kind: string;
  configured: boolean;
  assignments: string[];
  lastSeenAt?: string;
}

interface Station {
  id: string;
  name: string;
  restaurantId: string;
  restaurantName: string;
  platform: string;
  online: boolean;
  socketOnline: boolean;
  autoPrint: boolean;
  lastSeenAt: string;
  printers: RegisteredPrinter[];
}

const kindLabels: Record<string, string> = {
  comanda: 'Comanda de cocina',
  'comanda-adicion': 'Agregado / Adición',
  recibo: 'Nota de entrega',
};

const channelLabels: Record<string, string> = {
  DINE_IN: 'En mesa',
  DELIVERY: 'Delivery',
  PICKUP: 'Para llevar',
  EXPRESS: 'Express',
  BAR: 'Barra',
};

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || isNaN(ms)) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleTimeString('es-VE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoDate;
  }
}

function formatDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString('es-VE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

export default function MasterPrintingPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Filtros
  const [q, setQ] = useState('');
  const [orderNumberInput, setOrderNumberInput] = useState('');
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'printed' | 'processing' | 'failed'>('all');
  const [page, setPage] = useState(1);

  // Estados de control
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState('');

  // Carga de datos
  async function loadData(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [jobsRes, stationsRes] = await Promise.all([
        masterApi.get('/master/printing', {
          params: {
            q: q || undefined,
            orderNumber: orderNumberInput || undefined,
            page,
            limit: 80,
          },
        }),
        masterApi.get('/master/printing/stations', {
          params: { q: q || undefined },
        }),
      ]);
      setJobs(jobsRes.data.data || []);
      setStations(stationsRes.data.data || []);
      setError('');
      setUpdated(new Date().toLocaleTimeString('es-VE'));
    } catch {
      setError('No se pudo actualizar el monitor de impresión.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadData();
    const interval = setInterval(() => void loadData(true), 15000);
    return () => clearInterval(interval);
  }, [q, orderNumberInput, page]);

  // Lista única de restaurantes de ambos sets (stations y jobs)
  const restaurants = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number; online: boolean }>();
    for (const s of stations) {
      const existing = map.get(s.restaurantName);
      map.set(s.restaurantName, {
        id: s.restaurantId,
        name: s.restaurantName,
        count: existing?.count || 0,
        online: existing?.online || s.online,
      });
    }
    for (const j of jobs) {
      const existing = map.get(j.restaurantName);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(j.restaurantName, {
          id: j.restaurantId,
          name: j.restaurantName,
          count: 1,
          online: false,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [stations, jobs]);

  // Filtrado de jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter(j => {
      if (selectedRestaurant !== 'all' && j.restaurantName !== selectedRestaurant && j.restaurantId !== selectedRestaurant) {
        return false;
      }
      if (statusFilter === 'printed' && !j.isPrinted) return false;
      if (statusFilter === 'processing' && (j.isPrinted || j.deliveries.every(d => d.status === 'FAILED'))) return false;
      if (statusFilter === 'failed' && (j.isPrinted || !j.deliveries.some(d => d.status === 'FAILED'))) return false;
      return true;
    });
  }, [jobs, selectedRestaurant, statusFilter]);

  // Estaciones filtradas
  const filteredStations = useMemo(() => {
    if (selectedRestaurant === 'all') return stations;
    return stations.filter(s => s.restaurantName === selectedRestaurant || s.restaurantId === selectedRestaurant);
  }, [stations, selectedRestaurant]);

  // Métricas agregadas
  const stats = useMemo(() => {
    const totalJobs = jobs.length;
    const printedJobs = jobs.filter(j => j.isPrinted).length;
    const validDurations = jobs.filter(j => j.isPrinted && j.durationMs !== null && j.durationMs > 0).map(j => j.durationMs!);
    const avgDurationMs = validDurations.length ? Math.round(validDurations.reduce((a, b) => a + b, 0) / validDurations.length) : null;
    const totalPrinters = stations.reduce((acc, s) => acc + s.printers.filter(p => p.configured).length, 0);
    const onlineStations = stations.filter(s => s.online).length;
    return {
      totalJobs,
      printedJobs,
      successRate: totalJobs ? Math.round((printedJobs / totalJobs) * 100) : 100,
      avgDurationMs,
      totalPrinters,
      onlineStations,
    };
  }, [jobs, stations]);

  return (
    <main className="space-y-6 pb-12">
      {/* Encabezado */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Estación de Impresión</h1>
              <p className="text-sm text-slate-500">
                Monitoreo en tiempo real de comandas, impresoras térmicas y tiempos de despacho por restaurante.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span>En vivo · {updated || 'Cargando...'}</span>
          </div>

          <button
            onClick={() => void loadData()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-slate-900' : 'text-slate-500'}`} />
            <span>Refrescar</span>
          </button>
        </div>
      </header>

      {/* Tarjetas de Métricas Rápidas */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium uppercase tracking-wider">Comandas analizadas</span>
            <FileText className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{stats.totalJobs}</div>
          <p className="mt-1 text-xs text-slate-500">Envíos registrados recientes</p>
        </div>

        <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/50 p-4 shadow-sm">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-xs font-semibold uppercase tracking-wider">Señal Verde · Salió OK</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-800">{stats.printedJobs}</span>
            <span className="text-xs font-semibold text-emerald-600">({stats.successRate}%)</span>
          </div>
          <p className="mt-1 text-xs text-emerald-700/80">Confirmadas por la impresora</p>
        </div>

        <div className="rounded-2xl border border-blue-200/70 bg-blue-50/50 p-4 shadow-sm">
          <div className="flex items-center justify-between text-blue-700">
            <span className="text-xs font-semibold uppercase tracking-wider">Tiempo Promedio</span>
            <Zap className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-900">
            {stats.avgDurationMs ? formatDuration(stats.avgDurationMs) : '—'}
          </div>
          <p className="mt-1 text-xs text-blue-700/80">Desde envío hasta impresión</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium uppercase tracking-wider">Impresoras activas</span>
            <Printer className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{stats.totalPrinters}</span>
            <span className="text-xs text-slate-500">({stats.onlineStations} est. en línea)</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Configuradas en estaciones</p>
        </div>
      </section>

      {/* Controles de Búsqueda y Filtros */}
      <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Búsqueda por texto */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por restaurante..."
              value={q}
              onChange={e => {
                setQ(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>

          {/* Búsqueda por número de pedido */}
          <div className="w-full sm:w-48">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Nº Pedido (ej. 593)"
              value={orderNumberInput}
              onChange={e => {
                setOrderNumberInput(e.target.value.replace(/\D/g, ''));
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 font-mono"
            />
          </div>

          {/* Selector de Estado */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50/50 p-1 text-xs font-medium text-slate-600">
            <button
              onClick={() => setStatusFilter('all')}
              className={`rounded-lg px-3 py-1.5 transition-colors ${statusFilter === 'all' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'hover:text-slate-900'}`}
            >
              Todos
            </button>
            <button
              onClick={() => setStatusFilter('printed')}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 transition-colors ${statusFilter === 'printed' ? 'bg-emerald-600 text-white shadow-sm font-semibold' : 'text-emerald-700 hover:bg-emerald-100/50'}`}
            >
              <span>✓ Salió</span>
            </button>
            <button
              onClick={() => setStatusFilter('processing')}
              className={`rounded-lg px-3 py-1.5 transition-colors ${statusFilter === 'processing' ? 'bg-amber-500 text-white shadow-sm font-semibold' : 'text-amber-700 hover:bg-amber-100/50'}`}
            >
              En curso
            </button>
            <button
              onClick={() => setStatusFilter('failed')}
              className={`rounded-lg px-3 py-1.5 transition-colors ${statusFilter === 'failed' ? 'bg-red-600 text-white shadow-sm font-semibold' : 'text-red-700 hover:bg-red-100/50'}`}
            >
              Falló
            </button>
          </div>
        </div>

        {/* Carrusel / Selector de Restaurantes */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
            <span className="text-slate-400 font-medium whitespace-nowrap mr-1 flex items-center gap-1">
              <Store className="h-3.5 w-3.5" />
              Restaurantes:
            </span>
            <button
              onClick={() => setSelectedRestaurant('all')}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-medium transition-colors ${
                selectedRestaurant === 'all'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
              }`}
            >
              Todos los locales ({jobs.length})
            </button>
            {restaurants.map(r => (
              <button
                key={r.name}
                onClick={() => setSelectedRestaurant(r.name)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  selectedRestaurant === r.name
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${r.online ? 'bg-emerald-500' : 'bg-slate-300'}`}
                />
                <span>{r.name}</span>
                {r.count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                      selectedRestaurant === r.name ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {r.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Sección 1: Estaciones e Impresoras del Restaurante (Hardware) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              Impresoras y Estaciones {selectedRestaurant !== 'all' ? `· ${selectedRestaurant}` : 'Registradas'}
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {filteredStations.length} {filteredStations.length === 1 ? 'estación' : 'estaciones'}
            </span>
          </div>
        </div>

        {!filteredStations.length ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
            No hay estaciones de impresión reportadas para este restaurante.
          </div>
        ) : (
          <div className="grid gap-3.5 md:grid-cols-2">
            {filteredStations.map(station => (
              <article
                key={station.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm hover:border-slate-300 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Store className="h-4 w-4 text-slate-400" />
                        <strong className="text-sm font-bold text-slate-900">{station.restaurantName}</strong>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 font-mono">
                        {station.name} · {station.platform}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          station.online
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                            : 'bg-amber-50 text-amber-700 border border-amber-200/80'
                        }`}
                      >
                        {station.online ? (
                          <>
                            <Wifi className="h-3 w-3 text-emerald-600" />
                            <span>En línea</span>
                          </>
                        ) : (
                          <>
                            <WifiOff className="h-3 w-3 text-amber-600" />
                            <span>Sin señal</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Impresoras disponibles ({station.printers.length})
                    </span>

                    {!station.printers.length ? (
                      <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
                        Esta estación no tiene impresoras configuradas aún.
                      </p>
                    ) : (
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {station.printers.map(printer => (
                          <div
                            key={printer.id}
                            className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs"
                          >
                            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                              <Printer className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                              <span className="truncate" title={printer.name}>
                                {printer.name}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {printer.assignments.length ? (
                                printer.assignments.map((a, i) => (
                                  <span
                                    key={i}
                                    className="rounded bg-white border border-slate-200 px-1.5 py-0.2 text-[10px] text-slate-600 font-medium truncate max-w-[120px]"
                                  >
                                    {a}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">Predeterminada</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Última señal: {new Date(station.lastSeenAt).toLocaleTimeString('es-VE')}</span>
                  <span>Auto-impresión: {station.autoPrint ? 'Sí ✓' : 'Manual'}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Sección 2: Historial de Comandas por Restaurante e Impresora */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Comandas Enviadas a Impresoras
            </h2>
            <p className="text-xs text-slate-500">
              Haz clic en cualquier pedido para ver el ticket exacto que salió por la impresora física.
            </p>
          </div>
          <span className="text-xs font-medium text-slate-500">
            Mostrando {filteredJobs.length} {filteredJobs.length === 1 ? 'comanda' : 'comandas'}
          </span>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {!filteredJobs.length && !loading ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-12 text-center shadow-sm">
            <Printer className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-700">No se encontraron comandas con los filtros actuales.</p>
            <p className="text-xs text-slate-400 mt-1">Prueba seleccionando otro restaurante o cambiando el número de pedido.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredJobs.map(job => {
              // Obtener la información de la impresora
              const primaryDelivery = job.deliveries[0];
              const resultEntries = primaryDelivery ? Object.values(primaryDelivery.results || {}) : [];
              const printerNames = job.printers.length
                ? job.printers
                : resultEntries.map(r => r.printer).filter(Boolean);
              const displayPrinter = printerNames.length ? printerNames.join(' + ') : 'En espera de impresora';

              // Duración calculada
              const durationText = job.durationSeconds !== null && job.durationSeconds !== undefined
                ? `${job.durationSeconds}s`
                : (primaryDelivery?.durationMs ? formatDuration(primaryDelivery.durationMs) : null);

              return (
                <div
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm hover:border-slate-400 hover:shadow-md cursor-pointer transition-all text-left"
                >
                  {/* Encabezado de la tarjeta: Restaurante y Nº de Pedido */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 truncate max-w-[170px]" title={job.restaurantName}>
                          <Store className="h-3 w-3 text-slate-400 shrink-0" />
                          {job.restaurantName}
                        </span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span className="text-xl font-extrabold text-slate-900 tracking-tight font-mono">
                            #{job.orderNumber}
                          </span>
                          <span className="text-xs font-medium text-slate-500">
                            {kindLabels[job.kind] || job.kind}
                          </span>
                        </div>
                      </div>

                      {/* SEÑAL VERDE: Indicador prominente de que SÍ salió */}
                      <div>
                        {job.isPrinted ? (
                          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-xs font-bold text-emerald-700 shadow-xs">
                            <span className="relative flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                            </span>
                            <span>Salió ✓</span>
                          </div>
                        ) : primaryDelivery?.status === 'PROCESSING' ? (
                          <div className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-700">
                            <Clock className="h-3 w-3 animate-spin text-amber-600" />
                            <span>Imprimiendo</span>
                          </div>
                        ) : primaryDelivery?.status === 'FAILED' ? (
                          <div className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700">
                            <XCircle className="h-3 w-3 text-red-600" />
                            <span>Falló</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
                            <Clock className="h-3 w-3 text-slate-400" />
                            <span>Pendiente</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* BLOQUE DE LA IMPRESORA Y MÉTRICA DE TIEMPO */}
                    <div className="mt-3.5 rounded-xl bg-slate-50/80 border border-slate-100 p-2.5 space-y-2">
                      {/* Nombre de la Impresora */}
                      <div className="flex items-center justify-between gap-1 text-xs">
                        <span className="text-slate-500 font-medium flex items-center gap-1">
                          <Printer className="h-3.5 w-3.5 text-slate-400" />
                          Impresora:
                        </span>
                        <strong className="text-slate-900 font-bold truncate max-w-[160px]" title={displayPrinter}>
                          {displayPrinter}
                        </strong>
                      </div>

                      {/* NÚMERO DE DURACIÓN: Tiempo desde que se mandó hasta que se imprimió */}
                      <div className="flex items-center justify-between gap-1 text-xs border-t border-slate-200/60 pt-1.5">
                        <span className="text-slate-500 font-medium flex items-center gap-1">
                          <Timer className="h-3.5 w-3.5 text-slate-400" />
                          Tiempo transcurrido:
                        </span>
                        {durationText ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200/70 px-1.5 py-0.5 text-xs font-extrabold text-blue-800 font-mono">
                            <Zap className="h-3 w-3 text-blue-600" />
                            {durationText}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </div>
                    </div>

                    {/* Resumen de contenido de la comanda */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                        <span>
                          {job.tableName || (job.channel ? channelLabels[job.channel] || job.channel : 'Comanda')}
                        </span>
                        <span>{formatTime(job.createdAt)}</span>
                      </div>
                      <p className="text-xs text-slate-700 line-clamp-2 leading-relaxed">
                        {job.items.map(i => `${i.quantity}x ${i.name}`).join(' · ') || 'Sin productos'}
                      </p>
                    </div>
                  </div>

                  {/* Pie interactivo: Invita a presionar para ver la comanda completa */}
                  <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-600 group-hover:text-slate-900">
                    <span className="text-[11px] text-slate-400 group-hover:text-slate-600">
                      Presiona para ver ticket
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-xs text-blue-600 font-medium group-hover:translate-x-0.5 transition-transform">
                      Ver comanda
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Paginación */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <button
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40 hover:bg-slate-50 shadow-sm"
          >
            ← Anterior
          </button>
          <span className="text-xs text-slate-500 font-medium">Página {page}</span>
          <button
            disabled={jobs.length < 50}
            onClick={() => setPage(p => p + 1)}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40 hover:bg-slate-50 shadow-sm"
          >
            Siguiente →
          </button>
        </div>
      </section>

      {/* MODAL DE DETALLE DE COMANDA (Al presionar sobre el pedido/impresora) */}
      <Dialog open={!!selectedJob} onOpenChange={open => !open && setSelectedJob(null)}>
        <DialogContent className="max-w-lg p-0 overflow-hidden rounded-[24px]">
          {selectedJob && (
            <div className="flex flex-col max-h-[85vh]">
              <DialogHeader className="sr-only">
                <DialogTitle>Detalle de Comanda #{selectedJob.orderNumber}</DialogTitle>
                <DialogDescription>Comanda impresa en {selectedJob.restaurantName}</DialogDescription>
              </DialogHeader>
              {/* Encabezado del Ticket / Comanda */}
              <div className="bg-slate-900 text-white p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                      {selectedJob.restaurantName}
                    </span>
                    <h3 className="text-2xl font-black tracking-tight font-mono">
                      PEDIDO #{selectedJob.orderNumber}
                    </h3>
                    <p className="text-xs text-slate-300 mt-0.5">
                      {kindLabels[selectedJob.kind] || selectedJob.kind} ·{' '}
                      {selectedJob.tableName || (selectedJob.channel ? channelLabels[selectedJob.channel] || selectedJob.channel : 'Comanda')}
                    </p>
                  </div>

                  {/* Señal Verde en el encabezado */}
                  <div>
                    {selectedJob.isPrinted ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 px-3 py-1 text-xs font-bold text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        Salió e Impreso
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-400/30 px-3 py-1 text-xs font-semibold text-amber-300">
                        <Clock className="h-3.5 w-3.5" />
                        Pendiente
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
                  <span>Enviado: {formatTime(selectedJob.createdAt)} ({formatDate(selectedJob.createdAt)})</span>
                  {selectedJob.placedByUser && <span>Tomado por: {selectedJob.placedByUser}</span>}
                </div>
              </div>

              {/* Contenido scrolleable del ticket */}
              <div className="p-5 overflow-y-auto space-y-4">
                {/* BANNER DE CONFIRMACIÓN Y DURACIÓN (SEÑAL VERDE Y TIEMPO DESTACADO) */}
                <div
                  className={`rounded-2xl p-4 border ${
                    selectedJob.isPrinted
                      ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                      : 'bg-amber-50/80 border-amber-200 text-amber-950'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {selectedJob.isPrinted ? (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                        <Check className="h-5 w-5 stroke-[2.5]" />
                      </div>
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
                        <Clock className="h-5 w-5" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold">
                        {selectedJob.isPrinted
                          ? 'Comanda confirmada: el papel salió por la impresora'
                          : 'Procesando comanda en la estación de impresión'}
                      </h4>

                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg bg-white/70 p-2 border border-black/5">
                          <span className="text-slate-500 block text-[10px] uppercase font-semibold">
                            Tiempo de respuesta
                          </span>
                          <span className="text-base font-extrabold font-mono text-slate-900 flex items-center gap-1">
                            <Zap className="h-3.5 w-3.5 text-blue-600" />
                            {selectedJob.durationSeconds !== null && selectedJob.durationSeconds !== undefined
                              ? `${selectedJob.durationSeconds} seg`
                              : (selectedJob.durationMs ? formatDuration(selectedJob.durationMs) : '—')}
                          </span>
                        </div>

                        <div className="rounded-lg bg-white/70 p-2 border border-black/5">
                          <span className="text-slate-500 block text-[10px] uppercase font-semibold">
                            Impresora de salida
                          </span>
                          <span className="text-xs font-bold text-slate-900 truncate block mt-0.5" title={selectedJob.printers.join(', ')}>
                            {selectedJob.printers.length ? selectedJob.printers.join(', ') : 'Predeterminada'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* DETALLE EXACTO DE QUÉ COMANDA SALIÓ (PRODUCTOS Y CANTIDADES) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Productos del ticket ({selectedJob.items.length})
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {selectedJob.automatic ? 'Disparo automático al crear' : 'Impresión manual'}
                    </span>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 divide-y divide-slate-100 overflow-hidden">
                    {selectedJob.items.map((item, idx) => (
                      <div key={idx} className="p-3 text-xs space-y-1 bg-white">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <span className="inline-flex items-center justify-center rounded-md bg-slate-900 text-white font-mono font-bold text-xs px-2 py-0.5">
                              {item.quantity}x
                            </span>
                            <div>
                              <strong className="text-slate-900 font-semibold text-sm block">
                                {item.name}
                              </strong>
                              {item.variantName && (
                                <span className="text-slate-500 text-xs">
                                  Variante: {item.variantName}
                                </span>
                              )}
                            </div>
                          </div>

                          {item.kitchenName && (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200/80 shrink-0">
                              {item.kitchenName}
                            </span>
                          )}
                        </div>

                        {/* Modificadores / Extras */}
                        {item.modifiers && item.modifiers.length > 0 && (
                          <div className="pl-8 text-slate-500 text-[11px] space-y-0.5">
                            {item.modifiers.map((m, mIdx) => (
                              <p key={mIdx}>+ {m}</p>
                            ))}
                          </div>
                        )}

                        {/* Notas de cocina */}
                        {item.notes && (
                          <div className="pl-8 pt-0.5">
                            <span className="inline-block rounded bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 text-[11px] font-medium">
                              Nota: {item.notes}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* DETALLE TÉCNICO DE ENTREGAS POR IMPRESORA */}
                {selectedJob.deliveries.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Auditoría de Controladores
                    </span>
                    {selectedJob.deliveries.map(del => (
                      <div key={del.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between text-slate-600">
                          <span className="font-mono text-[11px]">Estación ID: {del.stationId.slice(0, 10)}...</span>
                          <span className={`font-semibold text-xs ${del.isAccepted ? 'text-emerald-700' : 'text-slate-700'}`}>
                            {del.status === 'ACCEPTED' ? '✓ Aceptado por el controlador' : del.status}
                          </span>
                        </div>

                        {Object.entries(del.results).map(([key, r]) => (
                          <div key={key} className="rounded-lg bg-white border border-slate-200/80 p-2 flex items-center justify-between text-xs">
                            <div>
                              <strong className="text-slate-900">{r.printer}</strong>
                              <span className="text-slate-500 ml-1.5">({r.kitchen})</span>
                            </div>
                            <span className={r.status === 'ACCEPTED' ? 'text-emerald-600 font-semibold' : 'text-slate-600'}>
                              {r.status === 'ACCEPTED' ? '✓ Impreso' : r.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Botón de Cierre */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                <button
                  onClick={() => setSelectedJob(null)}
                  className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors"
                >
                  Cerrar ticket
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
