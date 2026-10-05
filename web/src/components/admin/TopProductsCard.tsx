import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext.shared';
import { CURRENCY_SYMBOLS,formatBase } from '@/utils/format';
import { useEffect,useState } from 'react';

interface ProductRow {
  productId: string | null;
  name: string;
  quantity: number;
  revenueBase: string;
}

/** Rankings del mismo reporte diario, sin duplicar consultas ni alterar sus cálculos. */
export function TopProductsCard() {
  const { restaurant } = useAuth();
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setFailed(false);
    api.get('/orders/reports/products', { params: { range: 'day' } })
      .then((res) => { if (active) setProducts(res.data.data); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [retry]);

  if (!restaurant) return null;

  const symbol = CURRENCY_SYMBOLS[restaurant.baseCurrency];
  const rankings = [
    { title: 'Productos más vendidos', subtitle: 'Top 3 de hoy · por unidades', rows: [...(products ?? [])].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, 'es')).slice(0, 3) },
    { title: 'Productos menos vendidos', subtitle: 'Top 3 de hoy · entre los productos con ventas', rows: [...(products ?? [])].sort((a, b) => a.quantity - b.quantity || a.name.localeCompare(b.name, 'es')).slice(0, 3) },
  ];

  return (
    <>
    {rankings.map(({ title, subtitle, rows }) => (
    <section key={title} className="rounded-[26px] border border-brand-950/[0.06] bg-white/85 p-6 shadow-[0_16px_36px_-30px_rgba(0,27,67,0.32)] backdrop-blur-xl">
      <h3 className="text-[16px] font-bold tracking-[-0.02em] text-brand-950">{title}</h3>
      <p className="mb-5 mt-1 text-muted-foreground text-xs">{subtitle}</p>
      {failed ? <div role="alert" className="text-sm text-muted-foreground">No se pudo cargar el reporte. <button type="button" onClick={() => setRetry(value => value + 1)} className="text-brand-600 underline">Reintentar</button></div> : !products ? <p role="status" className="text-muted-foreground text-base">Cargando productos…</p> : rows.length === 0 ? (
        <p className="text-brand-950/40 font-light text-base">Sin ventas todavía hoy.</p>
      ) : (
        <div className="divide-y divide-brand-950/[0.06]">
          {rows.map((p, i) => (
            <div key={`${p.productId ?? ''}:${p.name}`} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="h-5 w-5 rounded-full bg-brand-500/10 text-brand-500 text-[11px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <p title={p.name} className="font-medium text-brand-950 truncate text-base">{p.name}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold text-brand-950 text-base">{p.quantity} und.</p>
                <p className="text-brand-950/40 font-light text-xs">{formatBase(p.revenueBase, symbol)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
    ))}
    </>
  );
}
