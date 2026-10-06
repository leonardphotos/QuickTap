import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { RecipePanel } from './RecipeEditor';
import { RecipeMatrix } from './RecipeMatrix';
import { Box, Check, Loader2 } from 'lucide-react';

interface PackagingItem {
  id: string;
  name: string;
  packagingType: 'ENVASE' | 'CAJA' | 'BOLSA' | null;
  salePriceBase: string | null;
  unit: string;
}

export function InventoryRecipeWorkspace({
  initialItem,
}: {
  initialItem?: { id: string; name: string; unit: string };
}) {
  const [products, setProducts] = useState<{ productId: string; name: string; hasRecipe: boolean }[]>([]);
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [advanced, setAdvanced] = useState(false);

  // Empaques disponibles y estado del plato actual
  const [packagingList, setPackagingList] = useState<PackagingItem[]>([]);
  const [currentPackagingId, setCurrentPackagingId] = useState<string | null>(null);
  const [loadingPackaging, setLoadingPackaging] = useState(false);
  const [savingPackaging, setSavingPackaging] = useState(false);
  const [packagingSaved, setPackagingSaved] = useState(false);

  useEffect(() => {
    api
      .get('/inventory/recipes')
      .then((r) => setProducts(r.data.data))
      .catch((e) => setError(e.response?.data?.error ?? 'No se pudo cargar el recetario.'));

    api
      .get('/inventory/packaging')
      .then((r) => setPackagingList(r.data.data ?? []))
      .catch(() => {});
  }, []);

  // Cargar empaque del producto seleccionado
  useEffect(() => {
    if (!selected) {
      setCurrentPackagingId(null);
      return;
    }
    setLoadingPackaging(true);
    setPackagingSaved(false);
    api
      .get(`/products/${selected}`)
      .then((res) => {
        const prod = res.data.data;
        if (prod.packagingMode === 'INVENTORY' && prod.packagingItemId) {
          setCurrentPackagingId(prod.packagingItemId);
        } else {
          setCurrentPackagingId(null);
        }
      })
      .catch(() => setCurrentPackagingId(null))
      .finally(() => setLoadingPackaging(false));
  }, [selected]);

  async function handlePackagingChange(itemId: string) {
    if (!selected) return;
    setSavingPackaging(true);
    try {
      if (itemId) {
        await api.patch(`/products/${selected}`, {
          packagingMode: 'INVENTORY',
          packagingItemId: itemId,
        });
        setCurrentPackagingId(itemId);
      } else {
        await api.patch(`/products/${selected}`, {
          packagingMode: 'NONE',
          packagingItemId: null,
        });
        setCurrentPackagingId(null);
      }
      setPackagingSaved(true);
      setTimeout(() => setPackagingSaved(false), 2500);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar el empaque del plato.');
    } finally {
      setSavingPackaging(false);
    }
  }

  const selectedProduct = products.find((p) => p.productId === selected);

  return (
    <div className="space-y-4">
      {initialItem && (
        <p className="rounded-xl bg-brand-500/10 p-3 text-sm text-brand-950 font-medium">
          Vincular <strong>{initialItem.name}</strong>: elige un plato y completa las cantidades.
        </p>
      )}

      {error && <p role="alert" className="text-sm font-medium text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100">{error}</p>}

      {/* Selector de Plato */}
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          aria-label="Buscar plato"
          placeholder="Buscar plato por nombre…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-11 rounded-xl border border-brand-950/15 bg-white px-3.5 text-base text-brand-950 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
        />
        <select
          aria-label="Elegir receta"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setAdvanced(false);
          }}
          className="min-h-11 min-w-0 rounded-xl border border-brand-950/15 bg-white px-3.5 text-base font-medium text-brand-950 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
        >
          <option value="">Elige un plato para costear…</option>
          {products
            .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) || p.productId === selected)
            .map((p) => (
              <option key={p.productId} value={p.productId}>
                {p.name}
                {p.hasRecipe ? '' : ' · Sin receta aún'}
              </option>
            ))}
        </select>
      </div>

      {selected ? (
        <>
          {/* Tarjeta de Asignación de Empaque / Envase de Delivery */}
          <div className="rounded-2xl border border-brand-950/10 bg-white p-4 space-y-2.5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 shrink-0">
                  <Box className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-brand-950">
                    Empaque de Delivery asignado a este plato
                  </h3>
                  <p className="text-[11px] text-brand-950/50">
                    Se descontará de stock automáticamente solo cuando este plato se venda por Delivery o Pickup.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {savingPackaging && (
                  <span className="text-xs text-brand-500 font-medium flex items-center gap-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…
                  </span>
                )}
                {packagingSaved && (
                  <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> Empaque actualizado
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
              <select
                value={currentPackagingId || ''}
                onChange={(e) => handlePackagingChange(e.target.value)}
                disabled={loadingPackaging || savingPackaging}
                className="w-full sm:max-w-md rounded-xl border border-brand-950/15 bg-white px-3.5 py-2 text-sm font-medium text-brand-950 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              >
                <option value="">Sin empaque asignado (Ninguno)</option>
                {packagingList.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name} ({pkg.packagingType ? pkg.packagingType.charAt(0) + pkg.packagingType.slice(1).toLowerCase() : 'Envase'})
                    {pkg.salePriceBase ? ` · Cobro al comensal: $${pkg.salePriceBase}` : ''}
                  </option>
                ))}
              </select>

              {currentPackagingId ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-500/10 text-xs font-semibold text-brand-600 shrink-0">
                  <Check className="h-3.5 w-3.5" /> Vinculado a {selectedProduct?.name || 'este plato'}
                </span>
              ) : (
                <span className="text-xs text-brand-950/40 italic">
                  No descuenta caja ni bolsa en delivery.
                </span>
              )}
            </div>
          </div>

          {/* Selector de modo de receta */}
          <div className="flex flex-wrap gap-2">
            <button
              className={`min-h-11 rounded-xl px-4 text-sm font-semibold transition-all ${
                !advanced ? 'bg-brand-500 text-white shadow-xs' : 'bg-brand-950/5 text-brand-950/70 hover:bg-brand-950/10'
              }`}
              onClick={() => setAdvanced(false)}
            >
              Cantidades por variante
            </button>
            <button
              className={`min-h-11 rounded-xl px-4 text-sm font-semibold transition-all ${
                advanced ? 'bg-brand-500 text-white shadow-xs' : 'bg-brand-950/5 text-brand-950/70 hover:bg-brand-950/10'
              }`}
              onClick={() => setAdvanced(true)}
            >
              Detalle avanzado
            </button>
          </div>

          {advanced ? (
            <RecipePanel key={selected} productId={selected} onSaved={() => {}} />
          ) : (
            <RecipeMatrix key={selected} productId={selected} initialItem={initialItem} />
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-brand-950/20 p-6 text-sm text-brand-950/60 bg-white">
          Selecciona un plato para ver sus tamaños, vincular insumos, asignar su empaque de delivery y ajustar cantidades desde aquí.
        </div>
      )}
    </div>
  );
}
