import { useEffect, useState } from 'react';
import { ChefHat, Loader2, Timer, UtensilsCrossed } from 'lucide-react';
import { api } from '@/api/client';

type Rango = 'day' | 'week' | 'month';
const RANGOS: { id: Rango; label: string }[] = [
  { id: 'day', label: 'Hoy' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
];

interface Tramo {
  promedioMin: number | null;
  medianaMin: number | null;
  muestras: number;
}
interface Plato {
  productId: string | null;
  name: string;
  kitchenName: string | null;
  veces: number;
  cocina: Tramo;
  sala: Tramo;
}
interface Reporte {
  platos: Plato[];
  general: {
    cocina: Tramo;
    sala: Tramo;
    lineasTotales: number;
    coberturaCocina: number;
    coberturaSala: number;
  };
}

function min(v: number | null): string {
  return v == null ? '—' : `${v} min`;
}

/** Colorea según cuánto tarda. Los cortes son de sala de restaurante, no de laboratorio. */
function tono(v: number | null, aviso: number, malo: number): string {
  if (v == null) return 'text-brand-950/30';
  if (v >= malo) return 'text-red-600';
  if (v >= aviso) return 'text-amber-600';
  return 'text-emerald-600';
}

/**
 * Cuánto tarda cada plato, partido en los dos tramos que se atacan por separado:
 * cocina (entra la comanda → lo marcan listo) y sala (listo → entregado en la mesa).
 *
 * Se muestran separados porque el arreglo es distinto en cada caso: si el tiempo se va en
 * cocina, el problema es la receta o la estación; si se va en sala, el plato se está enfriando
 * en la ventana esperando que alguien lo lleve.
 */
export function DishTimesSection() {
  const [rango, setRango] = useState<Rango>('week');
  const [data, setData] = useState<Reporte | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCargando(true);
    api
      .get('/orders/reports/dish-times', { params: { range: rango } })
      .then((r) => {
        setData(r.data.data);
        setError(null);
      })
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudieron cargar los tiempos.'))
      .finally(() => setCargando(false));
  }, [rango]);

  const g = data?.general;
  // Con poca cobertura los promedios son de una muestra chica: hay que decirlo, no maquillarlo.
  const cobertura = g ? Math.max(g.coberturaCocina, g.coberturaSala) : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex w-max items-center gap-1 rounded-full bg-brand-950/[0.05] p-1">
          {RANGOS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRango(r.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                rango === r.id ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {cargando ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-brand-950/30" />
        </div>
      ) : !g ? null : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-brand-950/10 px-3.5 py-3">
              <p className="text-[11px] font-semibold text-brand-950/50 flex items-center gap-1.5">
                <ChefHat className="h-3.5 w-3.5" /> Cocina
              </p>
              <p className={`text-2xl font-bold tabular-nums ${tono(g.cocina.promedioMin, 15, 25)}`}>
                {min(g.cocina.promedioMin)}
              </p>
              <p className="text-[10px] font-light text-brand-950/40 leading-tight">
                mediana {min(g.cocina.medianaMin)} · {g.cocina.muestras} platos medidos
              </p>
            </div>
            <div className="rounded-2xl border border-brand-950/10 px-3.5 py-3">
              <p className="text-[11px] font-semibold text-brand-950/50 flex items-center gap-1.5">
                <UtensilsCrossed className="h-3.5 w-3.5" /> Sala
              </p>
              <p className={`text-2xl font-bold tabular-nums ${tono(g.sala.promedioMin, 5, 10)}`}>
                {min(g.sala.promedioMin)}
              </p>
              <p className="text-[10px] font-light text-brand-950/40 leading-tight">
                mediana {min(g.sala.medianaMin)} · {g.sala.muestras} platos medidos
              </p>
            </div>
          </div>

          <p className="text-[11px] font-light text-brand-950/45 leading-relaxed">
            <span className="font-medium">Cocina</span> = desde que entra la comanda hasta que la marcan lista.{' '}
            <span className="font-medium">Sala</span> = desde que está lista hasta que se entrega en la mesa. Solo se
            cuentan los platos que tienen esas marcas.
          </p>

          {cobertura < 40 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5">
              <p className="text-xs text-amber-900 leading-relaxed">
                Solo se midió el <span className="font-semibold">{cobertura}%</span> de los platos servidos. Los tiempos
                salen de marcar "listo" en cocina y "entregado" en la mesa: mientras el equipo no use esos botones, estos
                promedios son de una muestra chica.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-semibold text-brand-950 flex items-center gap-1.5">
              <Timer className="h-4 w-4" /> Por plato · del más lento al más rápido
            </p>
            {data.platos.length === 0 ? (
              <p className="text-sm text-brand-950/40 font-light">Sin pedidos en el período.</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-brand-950/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-brand-950/40 border-b border-brand-950/10">
                      <th className="px-3 py-2 font-semibold">Plato</th>
                      <th className="px-3 py-2 font-semibold text-right">Veces</th>
                      <th className="px-3 py-2 font-semibold text-right">Cocina</th>
                      <th className="px-3 py-2 font-semibold text-right">Sala</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-950/[0.07]">
                    {data.platos.map((p) => (
                      <tr key={p.productId ?? p.name}>
                        <td className="px-3 py-2">
                          <span className="block text-brand-950 truncate max-w-[16rem]">{p.name}</span>
                          {p.kitchenName && (
                            <span className="block text-[10px] text-brand-950/40">{p.kitchenName}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-brand-950/60">{p.veces}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${tono(p.cocina.promedioMin, 15, 25)}`}>
                          {min(p.cocina.promedioMin)}
                          <span className="block text-[10px] font-normal text-brand-950/30">
                            {p.cocina.muestras} med.
                          </span>
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${tono(p.sala.promedioMin, 5, 10)}`}>
                          {min(p.sala.promedioMin)}
                          <span className="block text-[10px] font-normal text-brand-950/30">{p.sala.muestras} med.</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
