import { useEffect, useMemo, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { AuthRestaurant } from '@/context/AuthContext';
import { api } from '@/api/client';
import { BreakEvenCard } from '@/components/admin/BreakEvenCard';
import { shopMoneyFormatters } from './shopFormat';

interface SalesStats {
  range: 'week' | 'month';
  ventasCount: number;
  total: number;
  costo: number;
  ganancia: number;
  margenPercent: number;
  ticketPromedio: number;
  previo: { ventasCount: number; total: number; ticketPromedio: number };
  cambioPercent: number | null;
  porUsuario: { userId: string; name: string; count: number; total: number }[];
  porDia: { dia: string; monto: number }[];
}

/**
 * Administración → Estadísticas del local. Equivale a la pestaña Estadísticas de restaurantes,
 * pero sobre las ventas del punto de venta (ShopSale) en vez de pedidos.
 *
 * Todo se muestra contra el período anterior de la misma duración: un total suelto no dice si
 * el negocio va bien o mal, la comparación sí.
 */
export default function ShopStatsPage({ restaurant }: { restaurant: AuthRestaurant }) {
  const { money, moneyBs } = shopMoneyFormatters(restaurant);
  const [range, setRange] = useState<'week' | 'month'>('week');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [data, setData] = useState<SalesStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params: Record<string, string> = { range };
    if (desde && hasta) {
      params.desde = desde;
      params.hasta = hasta;
    }
    setError(null);
    api
      .get('/shop/sales-stats', { params })
      .then((r) => setData(r.data.data))
      .catch(() => setError('No se pudieron cargar las estadísticas.'));
  }, [range, desde, hasta]);

  // Escala del gráfico: se toma el día más alto del propio período. Una escala fija haría que
  // una semana floja se viera plana contra el techo de otra semana.
  const maxDia = useMemo(() => Math.max(1, ...(data?.porDia ?? []).map((d) => d.monto)), [data]);

  const subio = (data?.cambioPercent ?? 0) >= 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-950">Estadísticas</h1>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex rounded-lg border border-brand-950/15 overflow-hidden">
            {(['week', 'month'] as const).map((r) => (
              <button
                key={r}
                onClick={() => {
                  setRange(r);
                  setDesde('');
                  setHasta('');
                }}
                className={`px-3 py-1.5 text-sm ${range === r && !desde ? 'bg-brand-500 text-white' : 'text-brand-950/60 hover:bg-brand-950/[0.04]'}`}
              >
                {r === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="border border-brand-950/15 rounded-lg px-2 py-1.5 text-sm"
          />
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="border border-brand-950/15 rounded-lg px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Vendido', value: money(data.total), sub: moneyBs(data.total) },
              { label: 'Ganancia', value: money(data.ganancia), sub: `Margen ${data.margenPercent.toFixed(1)}%` },
              { label: 'Ventas', value: String(data.ventasCount), sub: `Antes ${data.previo.ventasCount}` },
              { label: 'Ticket promedio', value: money(data.ticketPromedio), sub: `Antes ${money(data.previo.ticketPromedio)}` },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl border border-brand-950/10 bg-white p-4">
                <p className="text-[11px] font-bold uppercase text-brand-950/40">{c.label}</p>
                <p className="text-xl font-bold text-brand-950 mt-1">{c.value}</p>
                {c.sub && <p className="text-[12px] text-brand-950/40">{c.sub}</p>}
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-brand-950/10 bg-white p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="font-semibold text-brand-950">Ventas por día</p>
              {data.cambioPercent === null ? (
                <span className="text-[12px] text-brand-950/40">Sin ventas en el período anterior</span>
              ) : (
                <span className={`flex items-center gap-1 text-[13px] font-semibold ${subio ? 'text-emerald-600' : 'text-red-600'}`}>
                  {subio ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {subio ? '+' : ''}{data.cambioPercent.toFixed(1)}% vs. período anterior
                </span>
              )}
            </div>
            <div className="flex items-end gap-1 h-32">
              {data.porDia.map((d) => (
                <div key={d.dia} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${d.dia}: ${money(d.monto)}`}>
                  <div
                    className="w-full rounded-t bg-brand-500/80 min-h-[2px]"
                    style={{ height: `${(d.monto / maxDia) * 100}%` }}
                  />
                  <span className="text-[9px] text-brand-950/35 truncate w-full text-center">{d.dia.slice(8)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-brand-950/10 bg-white p-4">
            <p className="font-semibold text-brand-950 mb-3">Quién vendió</p>
            {data.porUsuario.length === 0 ? (
              <p className="text-sm text-brand-950/40">Sin ventas en el período.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.porUsuario.map((u) => (
                  <li key={u.userId} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-brand-950/70 min-w-0 truncate">{u.name}</span>
                    <span className="shrink-0 text-brand-950/50">
                      {u.count} {u.count === 1 ? 'venta' : 'ventas'} ·{' '}
                      <span className="font-semibold text-brand-950">{money(u.total)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <BreakEvenCard fetchUrl="/shop/breakeven" />
        </>
      )}
    </div>
  );
}
