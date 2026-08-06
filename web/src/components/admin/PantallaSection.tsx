import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import type { Category, Product } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardHeader, TextureCardTitle, TextureCardContent } from '@/components/ui/texture-card';

type DisplayMode = 'ALL' | 'CATEGORIES' | 'PRODUCTS';

const MODE_OPTIONS: { value: DisplayMode; label: string; description: string }[] = [
  { value: 'ALL', label: 'Todo el menú', description: 'Muestra todos los productos disponibles del catálogo.' },
  { value: 'CATEGORIES', label: 'Solo categorías', description: 'Elige qué categorías del menú aparecen en la pantalla.' },
  { value: 'PRODUCTS', label: 'Productos puntuales', description: 'Elige productos específicos, sin importar la categoría.' },
];

const INTERVAL_OPTIONS = [3, 6, 10, 20];
const ITEMS_PER_PAGE_OPTIONS = [2, 4, 6];

/** Ajustes -> Pantalla: qué muestra el carrusel del rol SCREEN (ver ScreenPage.tsx) — todo el
 * menú, solo ciertas categorías, o productos puntuales — más cuánto dura cada pantalla y
 * cuántos productos entran por pantalla. */
export function PantallaSection() {
  const { restaurant, refresh } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [mode, setMode] = useState<DisplayMode>(restaurant?.screenDisplayMode ?? 'ALL');
  const [categoryIds, setCategoryIds] = useState<string[]>(restaurant?.screenCategoryIds ?? []);
  const [productIds, setProductIds] = useState<string[]>(restaurant?.screenProductIds ?? []);
  const [intervalSec, setIntervalSec] = useState(restaurant?.screenPageIntervalSec ?? 6);
  const [itemsPerPage, setItemsPerPage] = useState(restaurant?.screenItemsPerPage ?? 4);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/categories').then((res) => setCategories(res.data.data));
    api.get('/products').then((res) => setProducts(res.data.data));
  }, []);

  function toggleCategory(id: string) {
    setCategoryIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  function toggleProduct(id: string) {
    setProductIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.patch('/restaurant', {
        screenDisplayMode: mode,
        screenCategoryIds: categoryIds,
        screenProductIds: productIds,
        screenPageIntervalSec: intervalSec,
        screenItemsPerPage: itemsPerPage,
      });
      await refresh();
      setMessage('Configuración de Pantalla guardada.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  const productsByCategory = products.reduce<Record<string, Product[]>>((acc, p) => {
    const key = p.category?.id ?? 'sin-categoria';
    (acc[key] ??= []).push(p);
    return acc;
  }, {});

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Pantalla</TextureCardTitle>
        <p className="text-sm text-brand-950/60 font-light">
          Qué muestra el carrusel del monitor de la Pantalla (rol Pantalla), de cara al público afuera del local.
        </p>
      </TextureCardHeader>
      <TextureCardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm font-medium text-brand-950">Qué mostrar</p>
          <div className="grid sm:grid-cols-3 gap-2">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMode(opt.value)}
                className={`text-left rounded-xl border p-3 transition-colors ${
                  mode === opt.value ? 'border-brand-500 bg-brand-500/5' : 'border-brand-950/10 hover:border-brand-950/20'
                }`}
              >
                <p className="text-sm font-medium text-brand-950">{opt.label}</p>
                <p className="text-xs text-brand-950/50 font-light mt-0.5">{opt.description}</p>
              </button>
            ))}
          </div>
        </div>

        {mode === 'CATEGORIES' && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-brand-950">Categorías a mostrar</p>
            {categories.length === 0 ? (
              <p className="text-sm text-brand-950/40 font-light">Todavía no tienes categorías creadas.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {categories.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 rounded-lg border border-brand-950/10 px-3 py-2 text-sm cursor-pointer hover:bg-brand-950/[0.03]"
                  >
                    <input type="checkbox" checked={categoryIds.includes(c.id)} onChange={() => toggleCategory(c.id)} />
                    <span className="text-brand-950">{c.name}</span>
                    <span className="text-xs text-brand-950/40 ml-auto">{c._count?.products ?? 0} items</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {mode === 'PRODUCTS' && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-brand-950">Productos a mostrar</p>
            {products.length === 0 ? (
              <p className="text-sm text-brand-950/40 font-light">Todavía no tienes productos creados.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-4 pr-1">
                {categories
                  .filter((c) => productsByCategory[c.id]?.length)
                  .map((c) => (
                    <div key={c.id}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-950/40 mb-1.5">{c.name}</p>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {productsByCategory[c.id].map((p) => (
                          <label
                            key={p.id}
                            className="flex items-center gap-2 rounded-lg border border-brand-950/10 px-3 py-2 text-sm cursor-pointer hover:bg-brand-950/[0.03]"
                          >
                            <input type="checkbox" checked={productIds.includes(p.id)} onChange={() => toggleProduct(p.id)} />
                            <span className="text-brand-950 truncate">{p.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-brand-950">Duración de cada pantalla</p>
            <div className="flex gap-2">
              {INTERVAL_OPTIONS.map((sec) => (
                <button
                  key={sec}
                  onClick={() => setIntervalSec(sec)}
                  className={`flex-1 rounded-lg py-2 text-sm border transition-colors ${
                    intervalSec === sec ? 'bg-brand-950 text-white border-brand-950' : 'bg-white text-brand-950/70 border-brand-950/15'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-brand-950">Productos por pantalla</p>
            <div className="flex gap-2">
              {ITEMS_PER_PAGE_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setItemsPerPage(n)}
                  className={`flex-1 rounded-lg py-2 text-sm border transition-colors ${
                    itemsPerPage === n ? 'bg-brand-950 text-white border-brand-950' : 'bg-white text-brand-950/70 border-brand-950/15'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-brand-500">{message}</p>}

        <TextureButton variant="brand" size="default" disabled={saving} onClick={save} className="!w-auto disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </TextureButton>
      </TextureCardContent>
    </TextureCard>
  );
}
