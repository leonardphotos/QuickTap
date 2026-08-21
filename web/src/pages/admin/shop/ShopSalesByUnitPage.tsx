import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { shopMoneyFormatters } from './shopFormat';
import type { AuthRestaurant } from '@/context/AuthContext';

/**
 * Cuánto se vendió, en la unidad de cada producto.
 *
 * Responde de frente la pregunta de Monte Ranch: cuántos kilos (o metros) de cada categoría se
 * vendieron. Se agrupa por unidad además de por categoría porque sumar kilos con unidades daría
 * un número que no significa nada.
 */

interface Fila {
  categoria: string;
  producto: string;
  unidad: string;
  cantidad: number;
  ingreso: number;
  costo: number;
  ganancia: number;
}
interface Cat {
  categoria: string;
  unidad: string;
  cantidad: number;
  ingreso: number;
  ganancia: number;
}

const UNIDAD: Record<string, string> = { KG: 'Kg', MT: 'Mt', UND: 'und.' };

export default function ShopSalesByUnitPage({ restaurant }: { restaurant: AuthRestaurant }) {
  const { money, moneyBs } = shopMoneyFormatters(restaurant);
  const [data, setData] = useState<{ categorias: Cat[]; detalle: Fila[] } | null>(null);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  function cargar() {
    const q = new URLSearchParams();
    if (desde) q.set('desde', desde);
    if (hasta) q.set('hasta', hasta);
    api.get(`/shop/sales-by-unit?${q}`).then((r) => setData(r.data.data)).catch(() => setData({ categorias: [], detalle: [] }));
  }
  useEffect(cargar, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-brand-950">Ventas por unidad</h1>
        <p className="text-sm font-light text-brand-950/50">
          Cuánto se vendió de cada categoría, en kilos, metros o unidades según cómo se venda.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="block text-brand-950/60">Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="mt-1 rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm" />
        </label>
        <label className="text-xs">
          <span className="block text-brand-950/60">Hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="mt-1 rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm" />
        </label>
        <button onClick={cargar} className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white">
          Aplicar
        </button>
      </div>

      {!data && <p className="text-sm font-light text-brand-950/40">Cargando…</p>}

      {data && data.categorias.length === 0 && (
        <p className="rounded-2xl border border-brand-950/[0.06] bg-white px-4 py-6 text-center text-sm font-light text-brand-950/40">
          No hay ventas en ese período.
        </p>
      )}

      {data && data.categorias.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.categorias.map((c) => (
              <div key={`${c.categoria}-${c.unidad}`} className="rounded-2xl border border-brand-950/[0.06] bg-white p-4">
                <p className="text-sm font-semibold text-brand-950">{c.categoria}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-brand-950">
                  {c.cantidad.toLocaleString('es-VE')} <span className="text-base font-medium text-brand-950/50">{UNIDAD[c.unidad] ?? c.unidad}</span>
                </p>
                <p className="text-[12px] font-light text-brand-950/50">
                  Ingreso {money(c.ingreso)}
                  {moneyBs(c.ingreso) && ` · ${moneyBs(c.ingreso)}`}
                </p>
                <p className="text-[12px] font-medium text-emerald-600">Ganancia {money(c.ganancia)}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-brand-950/[0.06] bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-brand-950/[0.06] text-left text-[11px] uppercase tracking-wide text-brand-950/40">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Producto</th>
                  <th className="px-4 py-2.5 font-semibold">Categoría</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Vendido</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Ingreso</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Ganancia</th>
                </tr>
              </thead>
              <tbody>
                {data.detalle.map((f) => (
                  <tr key={`${f.categoria}-${f.producto}-${f.unidad}`} className="border-b border-brand-950/[0.04] last:border-0">
                    <td className="px-4 py-2.5 font-medium text-brand-950">{f.producto}</td>
                    <td className="px-4 py-2.5 font-light text-brand-950/60">{f.categoria}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {f.cantidad.toLocaleString('es-VE')} {UNIDAD[f.unidad] ?? f.unidad}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(f.ingreso)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{money(f.ganancia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
