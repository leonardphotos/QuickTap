import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import type { Kitchen, Product } from '@/types';

export function MissingKitchenNotice({ products, kitchens, onSaved }: { products: (Product & { isCheckoutExtra?: boolean })[]; kitchens: Kitchen[]; onSaved: () => void }) {
  const missing = products.filter(product => !product.kitchenId && !product.isCheckoutExtra);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  async function assign(id: string, kitchenId: string) {
    if (!kitchenId || busy) return;
    setBusy(id); setError('');
    try {
      await api.post('/products/bulk-kitchen', { ids: [id], kitchenId });
      await onSaved();
    } catch (e: any) { setError(e.response?.data?.error ?? 'No se pudo asignar la cocina.'); }
    finally { setBusy(null); }
  }
  if (!missing.length) return null;
  return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
    <h2 className="text-sm font-semibold text-amber-950">{missing.length} producto{missing.length === 1 ? '' : 's'} sin cocina asignada</h2>
    <p className="mt-1 text-amber-900 text-xs">Asigna una cocina para dirigir las próximas comandas a la estación correcta. Los pedidos anteriores conservan su asignación.</p>
    {!kitchens.length ? <Link className="mt-2 inline-block text-sm font-semibold underline" to="/admin/kitchen">Ir a Cocina para crear una estación</Link> :
      <details className="mt-3" open={missing.length <= 3}><summary className="cursor-pointer text-sm font-medium">Asignar cocinas</summary>
        <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">{missing.map(product => <label key={product.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 text-sm font-medium">
          <span className="min-w-0 flex-1 break-words">{product.name}</span>
          <select aria-label={`Cocina de ${product.name}`} value="" disabled={!!busy} onChange={e => void assign(product.id, e.target.value)} className="max-w-full rounded-lg border border-amber-200 p-2 text-base">
            <option value="">{busy === product.id ? 'Asignando…' : 'Seleccionar cocina'}</option>
            {kitchens.map(kitchen => <option key={kitchen.id} value={kitchen.id}>{kitchen.name}</option>)}
          </select>
        </label>)}</div>
      </details>}
    {error && <p role="alert" className="mt-2 text-red-600 text-base">{error}</p>}
  </section>;
}
