interface Props {
  enabled: boolean;
  onEnabled: (enabled: boolean) => void;
  stock: string;
  onStock: (value: string) => void;
  price: string;
  onPrice: (value: string) => void;
  currency: string;
  hasVariants: boolean;
}

/** Metros lineales: ancho fijo, sin confundirlos con la impresión por m². */
export function MeterSaleFields({ enabled, onEnabled, stock, onStock, price, onPrice, currency, hasVariants }: Props) {
  const inputClass = 'mt-1.5 w-full rounded-xl border border-brand-950/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-400/30';
  return <section className="sm:col-span-2 rounded-2xl border border-brand-500/20 bg-brand-500/[0.04] p-4">
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-brand-950 text-sm font-medium">
      <input type="checkbox" checked={enabled} onChange={e => onEnabled(e.target.checked)} className="h-5 w-5 accent-brand-500" />
      Vender por metro
    </label>
    <p className="leading-relaxed text-brand-950/60 text-xs">Para telas, vinil, cintas y otros materiales que cortas a medida. Se cobra el largo en metros, no el área en m².</p>
    {enabled && <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-brand-950/80 text-sm font-medium">{hasVariants ? 'Metros por variante' : 'Metros disponibles'}
        {hasVariants ? <p className="mt-2 text-brand-950/60 text-xs">Indica los metros de cada color o presentación en la sección de variantes.</p> : <input aria-label="Metros disponibles" type="text" inputMode="decimal" value={stock} onChange={e => onStock(e.target.value)} placeholder="Ej. 50 o 12,5" className={inputClass} />}
      </label>
      <label className="text-brand-950/80 text-sm font-medium">Precio por metro ({currency})
        <input aria-label="Precio por metro" type="text" inputMode="decimal" value={price} onChange={e => onPrice(e.target.value)} placeholder="Ej. 10,00" className={inputClass} />
      </label>
      <p className="sm:col-span-2 leading-relaxed text-brand-950/60 text-xs">Al vender 1,5 m, se cobra el precio por metro × 1,5 y se descuentan 1,5 m del inventario. El costo también debe indicarse por metro.</p>
    </div>}
  </section>;
}
