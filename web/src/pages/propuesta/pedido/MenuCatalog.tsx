import { useMemo, useState } from 'react';
import { Plus, Search, SlidersHorizontal } from 'lucide-react';
import { formatUsd } from '../dashboard/format';
import { MENU, MENU_CATEGORIES, type MenuProduct } from './data';

interface MenuCatalogProps {
  quantityFor: (productId: string) => number;
  onAdd: (product: MenuProduct) => void;
}

export function MenuCatalog({ quantityFor, onAdd }: MenuCatalogProps) {
  const [category, setCategory] = useState<string>('Todos');
  const [query, setQuery] = useState('');

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MENU.filter(
      (p) => (category === 'Todos' || p.category === category) && (!q || p.name.toLowerCase().includes(q)),
    );
  }, [category, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <label className="relative block">
          <span className="sr-only">Buscar producto</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar producto"
            className="h-12 w-full rounded-2xl border border-border bg-card pl-11 pr-4 text-base text-brand-950 placeholder:text-muted-foreground"
          />
        </label>

        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div role="tablist" aria-label="Categorías del menú" className="flex w-max gap-2">
            {MENU_CATEGORIES.map((c) => {
              const active = c === category;
              const count = c === 'Todos' ? MENU.length : MENU.filter((p) => p.category === c).length;
              return (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setCategory(c)}
                  className={`flex h-10 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors ${
                    active
                      ? 'border-brand-950 bg-brand-950 text-white'
                      : 'border-border bg-card text-brand-950/70 hover:border-brand-950/25 hover:text-brand-950'
                  }`}
                >
                  {c}
                  <span className={`text-xs tabular-nums ${active ? 'text-white/60' : 'text-muted-foreground'}`}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {products.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {'No hay productos que coincidan con "'}{query}{'".'}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => {
            const qty = quantityFor(product.id);
            return (
              <li key={product.id}>
                <button
                  type="button"
                  disabled={product.soldOut}
                  onClick={() => onAdd(product)}
                  aria-label={`Agregar ${product.name}, ${formatUsd(product.price)}${qty ? `. ${qty} en el pedido` : ''}`}
                  className={`group relative flex h-full min-h-36 w-full flex-col rounded-2xl border bg-card p-4 text-left transition-[border-color,box-shadow,transform] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${
                    qty ? 'border-brand-500 shadow-[0_0_0_1px_#05a5f5]' : 'border-border hover:border-brand-950/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {product.soldOut ? 'Agotado' : product.tag ?? product.category}
                    </span>
                    {qty > 0 && (
                      <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-500 px-1.5 text-xs font-semibold tabular-nums text-white">
                        {qty}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-[15px] font-semibold leading-snug text-brand-950 text-pretty">{product.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{product.description}</p>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                    <span className="text-base font-semibold tabular-nums text-brand-950">{formatUsd(product.price)}</span>
                    <span className="flex items-center gap-1.5">
                      {product.hasOptions && (
                        <SlidersHorizontal aria-label="Tiene opciones" className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-brand-500 transition-colors group-hover:bg-brand-500 group-hover:text-white">
                        <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
                      </span>
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
