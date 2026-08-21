import { useMemo, useState } from 'react';
import { Search, Truck } from 'lucide-react';
import type { AuthRestaurant } from '@/context/AuthContext';
import { shopMoneyFormatters, formatUnidad } from './shopFormat';
import type { ShopSession } from './shopSession';

type Rango = 'week' | 'month' | 'all';

const RANGOS: { id: Rango; label: string; dias: number | null }[] = [
  { id: 'week', label: 'Semana', dias: 7 },
  { id: 'month', label: 'Mes', dias: 30 },
  { id: 'all', label: 'Todo', dias: null },
];

/**
 * Administración → Compras del local: todo lo que entró de proveedores, con lo que costó.
 *
 * El Inicio ya mostraba "compras recientes", pero son las últimas ocho: en un negocio que carga
 * lotes seguido eso se queda corto el mismo día. Acá está el listado completo, con filtro por
 * fecha y proveedor, para responder lo que se pregunta de verdad — cuánto le compré a este
 * proveedor este mes, a cómo me lo dejó la última vez.
 *
 * Sale de `session.purchases`, que ya trae todas las compras del local (ver getState): no hace
 * falta pedirlas de nuevo.
 */
export default function ShopPurchasesPage({
  session,
  restaurant,
}: {
  session: ShopSession;
  restaurant: AuthRestaurant;
}) {
  const { money, moneyBs } = shopMoneyFormatters(restaurant);
  const [rango, setRango] = useState<Rango>('month');
  const [proveedor, setProveedor] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const proveedores = useMemo(
    () => [...new Set(session.purchases.map((p) => p.supplier).filter(Boolean))].sort(),
    [session.purchases],
  );

  const filtradas = useMemo(() => {
    const dias = RANGOS.find((r) => r.id === rango)!.dias;
    const desde = dias == null ? null : Date.now() - dias * 24 * 60 * 60 * 1000;
    const q = busqueda.trim().toLowerCase();
    return session.purchases.filter((p) => {
      if (desde != null && new Date(p.time).getTime() < desde) return false;
      if (proveedor && p.supplier !== proveedor) return false;
      if (q && !`${p.productName} ${p.v1} ${p.v2} ${p.supplier}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [session.purchases, rango, proveedor, busqueda]);

  const total = filtradas.reduce((a, p) => a + p.cost * p.qty, 0);
  const pesoTotal = filtradas.reduce((a, p) => a + (p.weightKg ?? 0), 0);

  // Cuánto se le compró a cada proveedor en el período: es lo que decide con quién negociar.
  const porProveedor = useMemo(() => {
    const m = new Map<string, { monto: number; compras: number }>();
    for (const p of filtradas) {
      const f = m.get(p.supplier) ?? { monto: 0, compras: 0 };
      f.monto += p.cost * p.qty;
      f.compras += 1;
      m.set(p.supplier, f);
    }
    return [...m.entries()].map(([nombre, v]) => ({ nombre, ...v })).sort((a, b) => b.monto - a.monto);
  }, [filtradas]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-950">Compras a proveedores</h1>
        <div className="flex rounded-lg border border-brand-950/15 overflow-hidden">
          {RANGOS.map((r) => (
            <button
              key={r.id}
              onClick={() => setRango(r.id)}
              className={`px-3 py-1.5 text-sm ${rango === r.id ? 'bg-brand-500 text-white' : 'text-brand-950/60 hover:bg-brand-950/[0.04]'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { label: 'Comprado', value: money(total), sub: moneyBs(total) },
          { label: 'Cargas', value: String(filtradas.length), sub: `${proveedores.length} proveedores` },
          // El peso solo tiene sentido si se anotó en alguna carga; en un local que vende ropa
          // no aplica y una tarjeta en cero sería ruido.
          ...(pesoTotal > 0 ? [{ label: 'Peso recibido', value: formatUnidad(pesoTotal, 'KG'), sub: '' }] : []),
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-brand-950/10 bg-white p-4">
            <p className="text-[11px] font-bold uppercase text-brand-950/40">{c.label}</p>
            <p className="text-xl font-bold text-brand-950 mt-1">{c.value}</p>
            {c.sub && <p className="text-[12px] text-brand-950/40">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[12rem]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-950/30" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto o proveedor…"
              className="w-full border border-brand-950/15 rounded-lg pl-9 pr-3 py-2 text-sm"
            />
          </div>
          <select
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Todos los proveedores</option>
            {proveedores.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {filtradas.length === 0 ? (
          <p className="text-sm text-brand-950/40 font-light py-4 text-center">
            Sin compras en este período. Cada lote que cargues desde Inventario aparece acá.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase text-brand-950/40">
                  <th className="pb-2 pr-3">Producto</th>
                  <th className="pb-2 pr-3">Proveedor</th>
                  <th className="pb-2 pr-3">Cantidad</th>
                  <th className="pb-2 pr-3">Costo c/u</th>
                  <th className="pb-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((p) => (
                  <tr key={p.id} className="border-t border-brand-950/[0.05]">
                    <td className="py-2.5 pr-3">
                      <span className="font-medium text-brand-950">{p.productName}</span>
                      {(p.v1 || p.v2) && (
                        <span className="block text-[11px] text-brand-950/45">{[p.v1, p.v2].filter(Boolean).join(' · ')}</span>
                      )}
                      <span className="block text-[11px] text-brand-950/35">
                        {new Date(p.time).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-brand-950/60">
                      <span className="inline-flex items-center gap-1.5">
                        <Truck className="h-3 w-3 text-brand-950/25 shrink-0" />
                        {p.supplier}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-brand-950/70">
                      {p.qty}
                      {/* El peso es lo que distingue una carga de otra cuando se compra por kilo
                          y se vende por rollo. */}
                      {p.weightKg != null && p.weightKg > 0 && (
                        <span className="block text-[11px] text-brand-950/40">pesó {formatUnidad(p.weightKg, 'KG')}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-brand-950/70">{money(p.cost)}</td>
                    <td className="py-2.5 font-semibold text-brand-950">{money(p.cost * p.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {porProveedor.length > 1 && (
        <div className="rounded-2xl border border-brand-950/10 bg-white p-4">
          <p className="font-semibold text-brand-950 mb-3">Cuánto le compraste a cada uno</p>
          <ul className="space-y-1.5">
            {porProveedor.map((p) => (
              <li key={p.nombre} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-brand-950/70 min-w-0 truncate">{p.nombre}</span>
                <span className="shrink-0 text-brand-950/50">
                  {p.compras} {p.compras === 1 ? 'carga' : 'cargas'} ·{' '}
                  <span className="font-semibold text-brand-950">{money(p.monto)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
