import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';

interface ProductRow {
  productId: string | null;
  name: string;
  quantity: number;
  revenueBase: string;
}

/** Top 5 productos más vendidos del día (Resumen, escritorio/iPad). */
export function TopProductsCard() {
  const { restaurant } = useAuth();
  const [products, setProducts] = useState<ProductRow[] | null>(null);

  useEffect(() => {
    api.get('/orders/reports/products', { params: { range: 'day' } }).then((res) => setProducts(res.data.data.slice(0, 5)));
  }, []);

  if (!products || !restaurant) return null;

  const symbol = CURRENCY_SYMBOLS[restaurant.baseCurrency];

  return (
    <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-6">
      <h3 className="text-[15px] font-semibold text-brand-950 mb-4">Productos más vendidos hoy</h3>
      {products.length === 0 ? (
        <p className="text-sm text-brand-950/40 font-light">Sin ventas todavía hoy.</p>
      ) : (
        <div className="divide-y divide-brand-950/[0.06]">
          {products.map((p, i) => (
            <div key={p.productId ?? p.name} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="h-5 w-5 rounded-full bg-brand-500/10 text-brand-500 text-[11px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <p className="text-sm font-medium text-brand-950 truncate">{p.name}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-brand-950">{p.quantity} und.</p>
                <p className="text-xs text-brand-950/40 font-light">{formatBase(p.revenueBase, symbol)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
