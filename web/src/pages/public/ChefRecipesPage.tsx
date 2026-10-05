import axios from 'axios';
import { Check, ChefHat, ChevronRight, ClipboardList, Plus, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiOrigin } from '@/utils/apiOrigin';

interface ProductSummary { id: string; name: string; photoUrl: string | null; description: string | null; categoryName: string | null; ingredientCount: number }
interface InventoryItem { id: string; name: string; unit: string }
interface RecipeLine { id: string; inventoryItemId: string; name: string; unit: string; grams: number }
interface ProductDetail { product: { id: string; name: string; photoUrl: string | null; description: string | null }; inventoryItems: InventoryItem[]; ingredients: RecipeLine[] }
interface DraftLine { key: string; inventoryItemId: string; name: string; unit: string; grams: string }

const TOKEN_KEY = 'quicktap_chef_recipe_token';
const tokenFor = (slug: string) => sessionStorage.getItem(`${TOKEN_KEY}:${slug}`);
const headersFor = (slug: string) => ({ Authorization: `Bearer ${tokenFor(slug) ?? ''}` });
const normal = (text: string) => text.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function client() { return axios.create({ baseURL: `${apiOrigin()}/api/v1`, timeout: 12_000 }); }

export default function ChefRecipesPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [authenticated, setAuthenticated] = useState(Boolean(tokenFor(slug)));
  const [restaurantName, setRestaurantName] = useState('Recetario');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ProductDetail | null>(null);
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [ingredientQuery, setIngredientQuery] = useState('');
  const [newIngredient, setNewIngredient] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadProducts = useCallback(async () => {
    if (!slug) return;
    try {
      const result = await client().get(`/public/chef-recipes/${slug}/products`, { headers: headersFor(slug) });
      setProducts(result.data.data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        sessionStorage.removeItem(`${TOKEN_KEY}:${slug}`);
        setAuthenticated(false);
      }
      setError(err.response?.data?.error ?? 'No se pudo cargar el recetario.');
    }
  }, [slug]);

  useEffect(() => { if (authenticated) void loadProducts(); }, [authenticated, loadProducts]);

  const filteredProducts = useMemo(() => {
    const needle = normal(query);
    return products.filter((product) => !needle || normal(`${product.name} ${product.categoryName ?? ''}`).includes(needle));
  }, [products, query]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await client().post(`/public/chef-recipes/${slug}/authenticate`, { code });
      sessionStorage.setItem(`${TOKEN_KEY}:${slug}`, result.data.data.token);
      setRestaurantName(result.data.data.restaurantName);
      setAuthenticated(true);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo validar el código.');
    } finally { setBusy(false); }
  }

  async function openProduct(productId: string) {
    setBusy(true); setError(''); setSaved(false);
    try {
      const result = await client().get(`/public/chef-recipes/${slug}/products/${productId}`, { headers: headersFor(slug) });
      const detail: ProductDetail = result.data.data;
      setSelected(detail);
      setDraft(detail.ingredients.map((line) => ({ key: line.id, inventoryItemId: line.inventoryItemId, name: line.name, unit: line.unit, grams: line.grams > 0 ? String(Number(line.grams.toFixed(2))) : '' })));
      setIngredientQuery('');
    } catch (err: any) { setError(err.response?.data?.error ?? 'No se pudo abrir el producto.'); }
    finally { setBusy(false); }
  }

  const suggestions = useMemo(() => {
    if (!selected || !ingredientQuery.trim()) return [];
    const needle = normal(ingredientQuery);
    return selected.inventoryItems.filter((item) => normal(item.name).includes(needle)).slice(0, 6);
  }, [ingredientQuery, selected]);

  function addExisting(item: InventoryItem) {
    if (draft.some((line) => line.inventoryItemId === item.id)) { setIngredientQuery(''); return; }
    setDraft((lines) => [...lines, { key: crypto.randomUUID(), inventoryItemId: item.id, name: item.name, unit: item.unit, grams: '' }]);
    setIngredientQuery('');
  }

  async function confirmNewIngredient() {
    if (!newIngredient) return;
    setBusy(true);
    try {
      const result = await client().post(`/public/chef-recipes/${slug}/ingredients`, { name: newIngredient }, { headers: headersFor(slug) });
      const item: InventoryItem = result.data.data.item;
      if (selected) setSelected({ ...selected, inventoryItems: [...selected.inventoryItems, item].sort((a, b) => a.name.localeCompare(b.name)) });
      addExisting(item);
      setNewIngredient(null);
    } catch (err: any) { setError(err.response?.data?.error ?? 'No se pudo agregar el insumo.'); }
    finally { setBusy(false); }
  }

  async function updateUnit(line: DraftLine, unit: string) {
    if (!selected || unit === line.unit) return;
    setBusy(true); setError('');
    try {
      await client().patch(`/public/chef-recipes/${slug}/ingredients/${line.inventoryItemId}/unit`, { unit }, { headers: headersFor(slug) });
      setDraft((lines) => lines.map((current) => current.inventoryItemId === line.inventoryItemId ? { ...current, unit } : current));
      setSelected((current) => current ? { ...current, inventoryItems: current.inventoryItems.map((item) => item.id === line.inventoryItemId ? { ...item, unit } : item) } : current);
    } catch (err: any) { setError(err.response?.data?.error ?? 'No se pudo cambiar la unidad.'); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      await client().put(`/public/chef-recipes/${slug}/products/${selected.product.id}`, { ingredients: draft.map((line) => ({ inventoryItemId: line.inventoryItemId, grams: line.grams === '' ? 0 : Number(line.grams) })) }, { headers: headersFor(slug) });
      setSaved(true);
      void loadProducts();
      window.setTimeout(() => setSelected(null), 700);
    } catch (err: any) { setError(err.response?.data?.error ?? 'No se pudo guardar la receta.'); }
    finally { setBusy(false); }
  }

  if (!authenticated) return <main className="min-h-[100dvh] bg-[#f5f6f8] px-5 py-8 text-brand-950"><div className="mx-auto flex min-h-[85dvh] max-w-sm flex-col justify-center"><div className="mb-7 grid size-14 place-items-center rounded-[20px] bg-brand-500 text-white shadow-[0_18px_35px_-18px_rgba(5,108,242,.7)]"><ChefHat className="size-7" /></div><p className="font-medium text-brand-500 text-base">QuickTap · Cocina</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Recetario del chef</h1><p className="mt-3 leading-relaxed text-brand-950/55 text-base">Ingresa el código temporal que aparece en el panel del restaurante.</p><form onSubmit={login} className="mt-8 rounded-[26px] border border-brand-950/[.08] bg-white p-5 shadow-[0_22px_60px_-42px_rgba(8,34,74,.45)]"><label className="text-sm font-medium">Código de 6 dígitos</label><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoFocus placeholder="000000" className="mt-3 w-full rounded-2xl border border-brand-950/10 bg-brand-950/[.025] px-4 py-4 text-center font-mono text-3xl font-semibold tracking-[.35em] outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10" /><button disabled={busy || code.length !== 6} className="mt-4 w-full rounded-2xl bg-brand-500 py-3.5 font-semibold text-white transition active:scale-[.98] disabled:opacity-40">{busy ? 'Verificando…' : 'Entrar al recetario'}</button>{error && <p className="mt-3 text-red-600 text-base">{error}</p>}</form></div></main>;

  return <main className="min-h-[100dvh] bg-[#f6f7f9] pb-8 text-brand-950"><header className="sticky top-0 z-10 border-b border-brand-950/[.06] bg-[#f6f7f9]/90 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl"><div className="mx-auto flex max-w-lg items-center gap-3"><div className="grid size-10 place-items-center rounded-2xl bg-brand-500 text-white"><ChefHat className="size-5" /></div><div className="min-w-0 flex-1"><p className="font-semibold uppercase tracking-[.12em] text-brand-950/45 text-xs">Recetario</p><h1 className="truncate text-base font-semibold">{restaurantName}</h1></div><button onClick={() => { sessionStorage.removeItem(`${TOKEN_KEY}:${slug}`); setAuthenticated(false); setSelected(null); }} className="rounded-xl p-2 text-xs font-medium text-brand-950/55">Salir</button></div></header><div className="mx-auto max-w-lg px-4 pt-5"><div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-brand-950/40"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto" className="w-full rounded-2xl border border-brand-950/[.08] bg-white py-3 pl-11 pr-4 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 text-base"/></div>{error && <p className="mt-3 text-red-600 text-base">{error}</p>}<div className="mt-5 space-y-2">{filteredProducts.map((product) => <button key={product.id} onClick={() => void openProduct(product.id)} className="flex w-full items-center gap-3 rounded-2xl border border-brand-950/[.07] bg-white p-3 text-left shadow-[0_12px_24px_-22px_rgba(8,34,74,.45)] transition active:scale-[.99]"><div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand-950/[.045] text-brand-950/35">{product.photoUrl ? <img src={product.photoUrl} className="size-full object-cover"/> : <ClipboardList className="size-5"/>}</div><div className="min-w-0 flex-1"><p className="truncate font-semibold text-base">{product.name}</p><p className="mt-0.5 text-brand-950/50 text-xs">{product.ingredientCount ? `${product.ingredientCount} ingrediente${product.ingredientCount === 1 ? '' : 's'}` : 'Sin receta todavía'}</p></div><ChevronRight className="size-4 text-brand-950/35"/></button>)}{!filteredProducts.length && <p className="rounded-2xl bg-white p-6 text-center text-brand-950/50 text-base">No encontramos productos.</p>}</div></div>{selected && <div className="fixed inset-0 z-20 flex items-end bg-brand-950/25 backdrop-blur-[2px] sm:items-center sm:justify-center"><section className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[30px] bg-[#f6f7f9] px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl sm:rounded-[30px]"><div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-brand-950/15"/><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="font-semibold uppercase tracking-[.12em] text-brand-950/45 text-xs">Receta</p><h2 className="mt-1 text-xl font-semibold tracking-tight">{selected.product.name}</h2>{selected.product.description && <p className="mt-1 text-brand-950/55 text-base">{selected.product.description}</p>}</div><button onClick={() => setSelected(null)} className="rounded-xl bg-white p-2 text-brand-950/55"><X className="size-5"/></button></div><p className="mt-3 leading-relaxed text-brand-950/50 text-xs">Deja el peso vacío si aún no está definido. La unidad cambia el insumo en todas las recetas donde se usa.</p><div className="mt-4 space-y-2">{draft.map((line) => <div key={line.key} className="flex items-center gap-2 rounded-2xl border border-brand-950/[.07] bg-white p-3"><div className="min-w-0 flex-1"><p className="truncate font-medium text-base">{line.name}</p><select value={line.unit} onChange={(event) => void updateUnit(line, event.target.value)} className="mt-1 max-w-[105px] rounded-lg bg-brand-950/[.045] px-1.5 py-1 font-medium text-brand-950/55 outline-none text-base"><option value="kg">Kg · gramos</option><option value="lt">Lt · ml</option><option value="ml">Ml</option><option value="unidad">Unidades</option></select></div><input value={line.grams} onChange={(event) => setDraft((lines) => lines.map((current) => current.key === line.key ? { ...current, grams: event.target.value } : current))} inputMode="decimal" placeholder={line.unit === 'unidad' ? 'Und' : 'g'} className="w-20 rounded-xl bg-brand-950/[.045] px-2 py-2 text-right font-semibold outline-none focus:ring-2 focus:ring-brand-500/25 text-base"/><button onClick={() => setDraft((lines) => lines.filter((current) => current.key !== line.key))} className="rounded-xl p-2 text-brand-950/35"><X className="size-4"/></button></div>)}</div><div className="relative mt-4"><Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-brand-950/40"/><input value={ingredientQuery} onChange={(event) => setIngredientQuery(event.target.value)} placeholder="Agregar ingrediente" className="w-full rounded-2xl border border-brand-950/[.08] bg-white py-3 pl-11 pr-4 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 text-base"/>{ingredientQuery && <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl border border-brand-950/[.08] bg-white p-1 shadow-xl">{suggestions.map((item) => <button key={item.id} onClick={() => addExisting(item)} className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm hover:bg-brand-950/[.04]"><span>{item.name}</span><Plus className="size-4 text-brand-500"/></button>)}{!suggestions.length && <button onClick={() => setNewIngredient(ingredientQuery.trim())} className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm font-medium text-brand-500"><Plus className="size-4"/> Agregar “{ingredientQuery.trim()}” como insumo</button>}</div>}</div>{error && <p className="mt-3 text-red-600 text-base">{error}</p>}<button onClick={() => void save()} disabled={busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3.5 font-semibold text-white transition active:scale-[.98] disabled:opacity-50">{saved ? <><Check className="size-5"/> Receta guardada</> : busy ? 'Guardando…' : 'Guardar receta'}</button></section></div>}{newIngredient && <div className="fixed inset-0 z-30 grid place-items-center bg-brand-950/30 p-5 backdrop-blur-sm"><section className="w-full max-w-sm rounded-[26px] bg-white p-5 shadow-2xl"><h3 className="text-lg font-semibold">¿Deseas agregar el insumo?</h3><p className="mt-2 leading-relaxed text-brand-950/55 text-base">“{newIngredient}” no existe aún. Se creará como insumo medido en kg para usarlo en esta y próximas recetas.</p><div className="mt-5 flex gap-2"><button onClick={() => setNewIngredient(null)} className="flex-1 rounded-xl bg-brand-950/[.06] py-3 text-sm font-semibold">Cancelar</button><button onClick={() => void confirmNewIngredient()} disabled={busy} className="flex-1 rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white">Agregar</button></div></section></div>}</main>;
}
