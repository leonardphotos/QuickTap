export type TierDraft = { minQty: string; price: string };
export function parsePriceTiers(rows: TierDraft[]) {
  const tiers = rows.map(row => ({ minQty: Number(row.minQty.replace(',', '.')), price: Number(row.price.replace(',', '.')) }));
  if (tiers.length > 20 || tiers.some(t => !Number.isFinite(t.minQty) || t.minQty <= 0 || t.minQty > 1000000 || !Number.isFinite(t.price) || t.price <= 0 || t.price > 100000000) || new Set(tiers.map(t => t.minQty)).size !== tiers.length) return null;
  return tiers.sort((a,b) => a.minQty - b.minQty);
}
export function PriceTierFields({ rows, onChange, unit }: { rows: TierDraft[]; onChange: (rows: TierDraft[]) => void; unit: string }) {
  return <section className="space-y-3 rounded-xl border border-brand-950/10 p-3">
    <h3 className="text-sm font-bold">Precios por cantidad</h3>
    <p className="text-brand-950/60 text-xs">Al llegar a cada cantidad, ese precio se aplica a toda la línea del producto o variante. No se suman variantes diferentes. La promoción, si existe, tiene prioridad.</p>
    {rows.map((row,index) => <div key={index} className="flex items-end gap-2">
      <label className="min-w-0 flex-1 text-sm font-medium">Desde ({unit})<input aria-label={`Cantidad mínima del tramo ${index+1}`} inputMode="decimal" value={row.minQty} onChange={e => onChange(rows.map((r,i) => i === index ? { ...r, minQty: e.target.value } : r))} className="mt-1 w-full rounded-lg border p-2 text-base" /></label>
      <label className="min-w-0 flex-1 text-sm font-medium">Precio por {unit}<input aria-label={`Precio del tramo ${index+1}`} inputMode="decimal" value={row.price} onChange={e => onChange(rows.map((r,i) => i === index ? { ...r, price: e.target.value } : r))} className="mt-1 w-full rounded-lg border p-2 text-base" /></label>
      <button type="button" aria-label={`Eliminar tramo ${index+1}`} onClick={() => onChange(rows.filter((_,i) => i !== index))} className="min-h-11 px-2 text-sm text-red-600">Quitar</button>
    </div>)}
    <button type="button" disabled={rows.length >= 20} onClick={() => onChange([...rows, { minQty: '', price: '' }])} className="min-h-11 text-sm font-semibold text-brand-500 disabled:opacity-40">+ Agregar precio por cantidad</button>
    <p className="text-brand-950/50 text-xs">Sin un tramo aplicable, se conserva el precio habitual o mayorista existente.</p>
  </section>;
}
