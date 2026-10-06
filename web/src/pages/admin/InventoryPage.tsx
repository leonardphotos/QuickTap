import { InventoryRecipeWorkspace } from '@/components/admin/recipe/InventoryRecipeWorkspace';
import { IngredientUsageDialog } from '@/components/admin/IngredientUsageDialog';
import { api } from '@/api/client';
import { AddStockDialog } from '@/components/admin/AddStockDialog';
import { InventoryAlertsTab } from '@/components/admin/InventoryAlertsTab';
import { PhotoUploadField } from '@/components/admin/PhotoUploadField';
import { WasteSection } from '@/components/admin/waste/WasteSection';
import { ChefRecipeAccessCard } from '@/components/admin/ChefRecipeAccessCard';
import { Dialog,DialogContent,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { useAuth } from '@/context/AuthContext.shared';
import type { Product } from '@/types';
import { EXPIRY_CLASS,expiryLabel,expiryStatus } from '@/utils/expiry';
import { CURRENCY_SYMBOLS,formatBase } from '@/utils/format';
import { formatBaseQuantity,SUB_UNITS,UNIT_LABELS } from '@/utils/inventoryUnits';
import { hasFeature } from '@/utils/subscription';
import { AlertTriangle,Box,Boxes,Calendar,ChefHat,ChevronDown,DollarSign,FileSpreadsheet,Layers,Package,Plus,Printer,Scale,Search,Sparkles,Trash2,Upload,X } from 'lucide-react';
import type { ChangeEvent,FormEvent } from 'react';
import { useEffect,useRef,useState } from 'react';

interface InventoryCategory {
  id: string;
  name: string;
  priority: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  quantity: string;
  minQuantity: string;
  pricePerUnitBase: string | null;
  // % aprovechable tras merma/limpieza y % de colchón por fluctuación de precio —
  // ajustan el costo real que usan recetas y preparaciones.
  yieldPercent: string;
  correctionPercent: string;
  photoUrl?: string | null;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
  // Envase: no nulo = este insumo se puede vincular como envase de un producto.
  packagingType?: 'ENVASE' | 'CAJA' | 'BOLSA' | null;
  salePriceBase?: string | null;
  /** "YYYY-MM-DD" o null. Ver web/src/utils/expiry.ts. */
  expiryDate?: string | null;
  // Disponible en el picker curado de "Toppings" al crear un modificador (ver
  // ModifierCategoriesDialog.tsx) — sigue siendo un insumo normal en todo lo demás.
  isTopping?: boolean;
  /** Producto terminado o sabor administrado dentro de Stock de productos. */
  isProductStock?: boolean;
}

const PACKAGING_TYPE_LABELS: Record<string, string> = { ENVASE: 'Envase', CAJA: 'Caja', BOLSA: 'Bolsa' };

/** Minúsculas y sin acentos, para que el buscador no dependa de cómo se tipeó. */
function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Costo real por unidad tras aplicar rendimiento/factor de corrección — mismo cálculo
 * que src/modules/inventory/costing.ts#resolveCostPerBaseUnit, aquí solo para mostrar. */
function adjustedCost(item: InventoryItem): string {
  const price = Number(item.pricePerUnitBase ?? 0);
  const yieldFraction = Number(item.yieldPercent || 100) / 100;
  const correction = Number(item.correctionPercent || 0) / 100;
  if (yieldFraction <= 0) return '0.00';
  return ((price * (1 + correction)) / yieldFraction).toFixed(2);
}

const emptyForm = {
  name: '',
  unit: '',
  subUnit: '',
  quantity: '',
  minQuantity: '',
  price: '',
  priceCurrency: 'BASE' as 'BASE' | 'BS',
  photoUrl: null as string | null,
  categoryId: '',
  isPackaging: false,
  packagingType: 'ENVASE' as 'ENVASE' | 'CAJA' | 'BOLSA',
  salePrice: '',
  expiryDate: '',
  // Solo del formulario: no se guarda. "No perecedero" = insumo sin fecha de caducidad.
  noPerecedero: false,
  yieldPercent: '100',
  correctionPercent: '0',
  isTopping: false,
  isProductStock: false,
};

/** Inventario: insumos con stock directo ("normal", Pro+), o por receta vinculada al producto (solo Premium). */
export default function InventoryPage() {
  const { restaurant } = useAuth();
  const canRecipes = hasFeature(restaurant, 'inventoryRecipe');
  // Casa Matriz y Transferencias son de Plan Sucursales — solo aparecen desde la sede
  // principal (una sucursal no puede activar Casa Matriz ni ver la pestaña).
  const isMain = !restaurant?.parentRestaurantId;
  const limitedOperations = restaurant?.subscriptionPlan === 'OPERATIONS';
  const showCasaMatriz = !limitedOperations && isMain && !!restaurant?.casaMatrizEnabled;
  const [tab, setTab] = useState<string>('insumos');
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [casaMatrizItems, setCasaMatrizItems] = useState<InventoryItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState('all');
  const [linkItem, setLinkItem] = useState<InventoryItem | null>(null);

  function loadItems() {
    api.get('/inventory', { params: { locationScope: 'LOCAL' } }).then((res) => setItems(res.data.data)).catch(() => setLoadError('No se pudo cargar el inventario del local. Intenta nuevamente.'));
  }

  function loadCasaMatrizItems() {
    api.get('/inventory', { params: { locationScope: 'CASA_MATRIZ' } }).then((res) => setCasaMatrizItems(res.data.data)).catch(() => setLoadError('No se pudo cargar el inventario de Casa Matriz. Intenta nuevamente.'));
  }

  function loadCategories() {
    api.get('/inventory/categories').then((res) => setCategories(res.data.data)).catch(() => setLoadError('No se pudieron cargar las categorías. Intenta nuevamente.'));
  }

  useEffect(loadItems, []);
  useEffect(loadCategories, []);
  useEffect(() => {
    if (showCasaMatriz) loadCasaMatrizItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCasaMatriz]);

  const showingCasaMatriz = tab === 'casa-matriz';
  const valuationItems = showingCasaMatriz ? casaMatrizItems : items;
  const showValuation = tab === 'insumos' || tab === 'stock' || showingCasaMatriz;

  return (
    <div className="space-y-5 min-w-0">
      <header className="flex flex-wrap items-center justify-between gap-5 rounded-[28px] border border-brand-950/10 bg-white p-5 sm:p-7">
        <div className="max-w-2xl">
        <p className="mb-2 font-semibold uppercase tracking-widest text-brand-600 text-xs">Cada insumo bajo control</p>
        <h1 className="text-2xl font-semibold tracking-tight text-brand-950">Inventario</h1>
        <p className="text-brand-950/60 mt-2 leading-relaxed text-base">
          {canRecipes
            ? 'Organiza tus insumos, preparaciones y productos. Revisa existencias y anticipa lo que necesitas reponer.'
            : 'Organiza tus insumos y productos, revisa existencias y mantén al día el stock de tu local.'}
        </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-500/10 px-4 py-3 text-sm font-medium text-brand-600"><Boxes className="h-5 w-5" />{restaurant?.name ?? 'Mi restaurante'}</span>
      </header>

      {canRecipes && <details className="group rounded-2xl border border-brand-950/10 bg-white p-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 text-sm font-semibold text-brand-950 [&::-webkit-details-marker]:hidden"><ChefHat className="h-5 w-5 text-brand-500" /><span className="flex-1">Acceso al recetario para chef<span className="mt-0.5 block text-xs font-normal text-brand-950/60">Comparte el enlace y el código para cargar recetas.</span></span><ChevronDown className="h-4 w-4 group-open:rotate-180" /></summary>
        <div className="mt-3 max-w-xl"><ChefRecipeAccessCard /></div>
      </details>}

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 border-b border-brand-950/10 pb-3">
          {[
            { label: 'Existencias', id: 'insumos', active: ['insumos', 'stock', 'alertas', 'casa-matriz'].includes(tab) },
            ...(canRecipes ? [{ label: 'Recetas y preparaciones', id: 'recetas', active: ['recetas', 'preparaciones'].includes(tab) }] : []),
            ...(!limitedOperations ? [{ label: 'Movimientos', id: 'merma', active: ['merma', 'transferencias', 'entradas'].includes(tab) }] : []),
          ].map(t => <button key={t.id} onClick={() => setTab(t.id)} className={`min-h-11 rounded-xl px-4 py-2 text-sm font-medium ${t.active ? 'bg-brand-500 text-white' : 'bg-white text-brand-950/65'}`}>{t.label}</button>)}
        </div>
        {['insumos', 'stock', 'alertas', 'casa-matriz'].includes(tab) && <div className="flex flex-wrap gap-2">
          {[['all', 'Todos'], ['raw', 'Materia prima'], ['portions', 'Porciones y preparados'], ['packaging', 'Envases y empaques']].map(([id, label]) => <button key={id} onClick={() => { setTab('insumos'); setStockFilter(id); }} className={`min-h-11 rounded-xl px-3 py-2 text-sm ${tab === 'insumos' && stockFilter === id ? 'bg-brand-500/10 text-brand-600' : 'bg-white text-brand-950/60'}`}>{label}</button>)}
          <button onClick={() => setTab('stock')} className={`min-h-11 rounded-xl px-3 text-sm ${tab === 'stock' ? 'bg-brand-500/10 text-brand-600' : 'bg-white'}`}>Productos del menú</button>
          <button onClick={() => setTab('alertas')} className={`min-h-11 rounded-xl px-3 text-sm ${tab === 'alertas' ? 'bg-brand-500/10 text-brand-600' : 'bg-white'}`}>Alertas</button>
        </div>}
        {['recetas', 'preparaciones'].includes(tab) && <div className="flex flex-wrap gap-2"><button onClick={() => setTab('recetas')} className={`min-h-11 rounded-xl px-3 text-sm ${tab === 'recetas' ? 'bg-brand-500/10 text-brand-600' : 'bg-white'}`}>Recetas de platos</button><button onClick={() => setTab('preparaciones')} className={`min-h-11 rounded-xl px-3 text-sm ${tab === 'preparaciones' ? 'bg-brand-500/10 text-brand-600' : 'bg-white'}`}>Preparaciones reutilizables</button></div>}
        {['merma', 'transferencias', 'entradas'].includes(tab) && <div className="flex flex-wrap gap-2"><button onClick={() => setTab('entradas')} className="min-h-11 rounded-xl bg-white px-3 text-sm">Entradas y compras</button><button onClick={() => setTab('merma')} className={`min-h-11 rounded-xl px-3 text-sm ${tab === 'merma' ? 'bg-brand-500/10 text-brand-600' : 'bg-white'}`}>Mermas</button><button onClick={() => setTab('transferencias')} className={`min-h-11 rounded-xl px-3 text-sm ${tab === 'transferencias' ? 'bg-brand-500/10 text-brand-600' : 'bg-white'}`}>Transferencias</button></div>}
      </div>
      {tab === 'entradas' && <div className="rounded-2xl bg-white p-5"><h2 className="text-lg font-semibold">Entradas de inventario</h2><p className="mt-2 text-sm text-brand-950/60">Registra la factura y selecciona los insumos recibidos para reponer existencias sin duplicar la compra.</p><a href="/admin/purchases" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand-500 px-4 text-sm font-medium text-white">Registrar compra</a></div>}
      {tab === 'recetas' && canRecipes && <InventoryRecipeWorkspace />}
      {linkItem && <Dialog open onOpenChange={open => { if (!open) setLinkItem(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Vincular insumo a receta</DialogTitle></DialogHeader><InventoryRecipeWorkspace initialItem={linkItem} /></DialogContent></Dialog>}

      {loadError && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{loadError} <button type="button" className="underline" onClick={() => { setLoadError(null); loadItems(); loadCategories(); if (showCasaMatriz) loadCasaMatrizItems(); }}>Reintentar</button></div>}

      {showCasaMatriz && (tab === 'insumos' || showingCasaMatriz) && <label className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-950/10 bg-white p-4 text-brand-950 text-sm font-medium">
        Ubicación de materia prima
        <select value={showingCasaMatriz ? 'casa-matriz' : 'insumos'} onChange={(event) => setTab(event.target.value)} className="rounded-xl border border-brand-950/15 bg-white px-4 py-2 text-base">
          <option value="insumos">{restaurant?.name ?? 'Local'}</option>
          <option value="casa-matriz">Casa Matriz</option>
        </select>
      </label>}

      {showValuation && (
        <InventoryValuationSummary
          items={valuationItems}
          currencySymbol={restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$'}
          label={showingCasaMatriz ? 'Valor total · Casa Matriz' : 'Valor total del inventario'}
        />
      )}

      {tab === 'insumos' && (
        <InsumosTab
          locationScope="LOCAL"
          items={items?.filter(item => {
            if (stockFilter === 'all') return true;
            if (stockFilter === 'packaging') return !!item.packagingType;
            if (stockFilter === 'portions') return !item.packagingType && (item.isProductStock || item.unit === 'porcion');
            return !item.packagingType && !item.isProductStock && item.unit !== 'porcion';
          }) ?? null}
          categories={categories}
          onChanged={loadItems}
          onCategoriesChanged={loadCategories}
          canRecipes={canRecipes}
          onLinkRecipe={setLinkItem}
        />
      )}
      {tab === 'preparaciones' && canRecipes && <PreparacionesTab insumos={items ?? []} />}
      {tab === 'stock' && <StockTab inventoryItems={[]} onInventoryChanged={loadItems} />}
      {tab === 'merma' && <WasteSection />}
      {tab === 'alertas' && <InventoryAlertsTab />}
      {tab === 'casa-matriz' && (
        <InsumosTab
          locationScope="CASA_MATRIZ"
          items={casaMatrizItems?.filter(item => {
            if (stockFilter === 'all') return true;
            if (stockFilter === 'packaging') return !!item.packagingType;
            if (stockFilter === 'portions') return !item.packagingType && (item.isProductStock || item.unit === 'porcion');
            return !item.packagingType && !item.isProductStock && item.unit !== 'porcion';
          }) ?? null}
          categories={categories}
          onChanged={loadCasaMatrizItems}
          onCategoriesChanged={loadCategories}
          showModifierLinkToggle={false}
          canRecipes={canRecipes}
        />
      )}
      {tab === 'transferencias' && <TransferenciasTab />}
    </div>
  );
}

/** Valor real del inventario: existencia física × costo unitario registrado.
 * No usa mínimos, ventas ni precio de venta, para que el monto sea auditable. */
function InventoryValuationSummary({
  items,
  currencySymbol,
  label,
}: {
  items: InventoryItem[] | null;
  currencySymbol: string;
  label: string;
}) {
  const rows = items ?? [];
  const total = rows.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.pricePerUnitBase) || 0), 0);
  const withoutCost = rows.filter((item) => item.pricePerUnitBase == null || Number(item.pricePerUnitBase) <= 0).length;

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <div className="rounded-2xl bg-brand-950 p-4 text-white sm:p-5">
        <p className="font-medium text-white/70 text-xs">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{items === null ? '—' : formatBase(total, currencySymbol)}</p>
        <p className="mt-2 text-white/70 text-xs">Existencia actual × costo por unidad</p>
      </div>
      {[
        { label: 'Ítems registrados', value: rows.length, hint: 'En esta ubicación' },
        { label: 'Necesitan reposición', value: rows.filter((item) => Number(item.quantity) <= 0 || (Number(item.minQuantity) > 0 && Number(item.quantity) <= Number(item.minQuantity))).length, hint: 'Agotados o en el mínimo registrado' },
        { label: 'Sin costo cargado', value: withoutCost, hint: 'Completa sus costos para valorar el stock' },
      ].map((stat) => <div key={stat.label} className="rounded-2xl border border-brand-950/10 bg-white p-5 text-brand-950"><p className="font-medium text-brand-950/60 text-xs">{stat.label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{items === null ? '—' : stat.value}</p><p className="mt-2 text-brand-950/55 text-xs">{stat.hint}</p></div>)}
    </div>
  );
}

// -----------------------------------------------------------------------------
//  Stock de productos: contador simple por producto (independiente de insumos/receta),
//  disponible para todos los planes.
// -----------------------------------------------------------------------------


/** Tres estados, iguales a los de Inventario → Alertas: sin existencias, por
 * agotarse (por debajo del mínimo cargado) o con stock sano. */
function stockLabel(p: Product): string {
  const qty = p.stockQuantity ?? 0;
  const min = p.stockMinQuantity ?? 0;
  if (qty <= 0) return 'Agotado';
  if (min > 0 && qty <= min) return 'Por agotarse';
  return 'En stock';
}

function stockClass(p: Product): string {
  const qty = p.stockQuantity ?? 0;
  const min = p.stockMinQuantity ?? 0;
  if (qty <= 0) return 'bg-red-100 text-red-700';
  if (min > 0 && qty <= min) return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

function StockTab({ inventoryItems, onInventoryChanged }: { inventoryItems: InventoryItem[]; onInventoryChanged: () => void }) {
  const { restaurant, refresh } = useAuth();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const bloquea = !!restaurant?.blockOrdersWithoutStock;
  const [guardandoBloqueo, setGuardandoBloqueo] = useState(false);
  const [errorBloqueo, setErrorBloqueo] = useState<string | null>(null);

  async function alternarBloqueo() {
    setGuardandoBloqueo(true);
    setErrorBloqueo(null);
    try {
      await api.patch('/inventory/settings', { blockOrdersWithoutStock: !bloquea });
      await refresh();
    } catch (err: any) {
      setErrorBloqueo(err.response?.data?.error ?? 'No se pudo cambiar el bloqueo.');
    } finally {
      setGuardandoBloqueo(false);
    }
  }

  useEffect(() => {
    api.get('/products').then((res) => setProducts(res.data.data));
  }, []);

  async function patchProduct(id: string, patch: Record<string, unknown>) {
    setSavingId(id);
    try {
      const res = await api.patch(`/inventory/product-stock/${id}`, patch);
      setProducts((prev) => prev?.map((p) => (p.id === id ? { ...p, ...res.data.data } : p)) ?? null);
    } finally {
      setSavingId(null);
    }
  }

  async function patchProductStockItem(id: string, quantity: number) {
    setSavingId(id);
    try {
      await api.patch(`/inventory/${id}`, { quantity: Math.max(0, quantity) });
      onInventoryChanged();
    } finally {
      setSavingId(null);
    }
  }

  if (!products) return <p className="text-brand-950/50 font-light text-base">Cargando…</p>;

  // Agrupa por la categoría del menú del producto (Category, no InventoryCategory) — ya
  // existe en cada Product, no hace falta un concepto nuevo para esta pestaña.
  const groups = new Map<string, Product[]>();
  for (const p of products) {
    const key = p.category?.name ?? 'Sin categoría';
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }

  return (
    <div className="space-y-5">
      {/* Qué pasa cuando se acaba: bloquear la venta, o dejar vender y contar de más en rojo.
          Va acá arriba porque cambia el significado de todos los números de esta pantalla. */}
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-brand-950/10 bg-white p-4">
        <div className="min-w-0">
          <p className="font-semibold text-brand-950 text-base">Bloquear cuando no queda stock</p>
          <p className="mt-0.5 font-light text-brand-950/50 text-xs">
            {bloquea
              ? 'Activo: si quedan 3 unidades, nadie puede comandar más de 3. Cuenta también lo ya pedido y sin servir, para que dos mesas no se lleven las mismas últimas unidades.'
              : 'Apagado: se puede seguir vendiendo aunque no quede nada, y el stock entra en negativo (−1, −2…) para que veas cuánto se vendió de más.'}
          </p>
          {errorBloqueo && <p className="mt-1 text-red-600 text-xs">{errorBloqueo}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={bloquea}
          aria-label="Bloquear cuando no queda stock"
          onClick={alternarBloqueo}
          disabled={guardandoBloqueo}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            bloquea ? 'bg-brand-500' : 'bg-brand-950/20'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-200 ease-out-strong motion-reduce:transition-none ${
              bloquea ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      {inventoryItems.length > 0 && (
        <div className="space-y-2">
          <div className="px-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-950/50">Porciones, preparados y sabores</h3>
            <p className="mt-1 font-light text-brand-950/50 text-xs">
              Este es el stock ya procesado y listo para vender. Es independiente de la materia prima en kilos o litros.
            </p>
          </div>
          <ul className="divide-y divide-brand-950/10 rounded-2xl border border-brand-950/10 bg-white">
            {inventoryItems.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-brand-950 text-base">{item.name}</p>
                  <p className="font-light text-brand-950/45 text-xs">Existencia lista para usar o vender</p>
                </div>
                <label className="flex shrink-0 items-center gap-2 text-brand-950/55 text-sm font-medium">
                  Quedan
                  <input
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={Number(item.quantity)}
                    disabled={savingId === item.id}
                    onBlur={(event) => patchProductStockItem(item.id, Number(event.target.value) || 0)}
                    className="w-20 rounded-lg border border-brand-950/15 px-2 py-1.5 text-right text-brand-950 text-base"
                    aria-label={`Existencia de ${item.name}`}
                  />
                  <span>Und</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-brand-950/60 font-light text-base">
          Activa el control de stock por producto: al llegar a 0 se marca como agotado en el menú público.
        </p>
        <AddStockDialog
          items={products.map((p) => ({
            id: p.id,
            name: p.name,
            currentQuantity: p.stockControlEnabled ? (p.stockQuantity ?? 0) : 0,
            unitLabel: 'unid.',
          }))}
          onAdd={async (id, delta) => {
            const p = products.find((x) => x.id === id);
            if (!p) return;
            const current = p.stockControlEnabled ? (p.stockQuantity ?? 0) : 0;
            await patchProduct(id, { stockControlEnabled: true, stockQuantity: current + delta });
          }}
        />
      </div>
      {[...groups.entries()].map(([categoryName, group]) => (
        <div key={categoryName} className="space-y-2">
          <h3 className="text-xs font-semibold text-brand-950/50 uppercase tracking-wide px-1">{categoryName}</h3>
          <ul className="divide-y divide-brand-950/10 rounded-2xl border border-brand-950/10 bg-white">
            {group.map((p) => {
              const linkedIds = new Set(
                (p.modifierCategories ?? []).flatMap((category) =>
                  category.modifiers.map((modifier) => modifier.inventoryItemId).filter((id): id is string => Boolean(id)),
                ),
              );
              const optionStock = inventoryItems.filter((item) => linkedIds.has(item.id));
              return (
              <li key={p.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                  {p.photoUrl ? (
                    <img src={p.photoUrl} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="h-9 w-9 rounded-lg bg-brand-950/[0.06] shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-brand-950 truncate text-base">{p.name}</p>
                    <label className="flex items-center gap-1.5 text-brand-950/60 mt-0.5 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={p.stockControlEnabled ?? false}
                        onChange={(e) =>
                          patchProduct(p.id, {
                            stockControlEnabled: e.target.checked,
                            stockQuantity: e.target.checked ? p.stockQuantity ?? 0 : null,
                          })
                        }
                      />
                      Controlar stock
                    </label>
                  </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                  {/* La caducidad no depende del control de stock: un producto puede
                      caducar aunque no se lleve la cuenta de cuántos quedan. */}
                  <label className="flex flex-col items-end text-brand-950/45 text-sm font-medium">
                    Caduca
                    <input
                      type="date"
                      defaultValue={p.expiryDate ?? ''}
                      disabled={savingId === p.id}
                      onChange={(e) => patchProduct(p.id, { expiryDate: e.target.value })}
                      className="mt-0.5 border border-brand-950/15 rounded-lg px-2 py-1 text-brand-950 text-base"
                    />
                  </label>

                  {p.stockControlEnabled && (
                    <>
                      <label className="flex flex-col items-end text-brand-950/45 text-sm font-medium">
                        Quedan
                        <input
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={p.stockQuantity ?? 0}
                          disabled={savingId === p.id}
                          onBlur={(e) => patchProduct(p.id, { stockControlEnabled: true, stockQuantity: Number(e.target.value) || 0 })}
                          className="mt-0.5 w-20 border border-brand-950/15 rounded-lg px-2 py-1 text-right text-base"
                        />
                      </label>
                      <label className="flex flex-col items-end text-brand-950/45 text-sm font-medium">
                        Mínimo
                        <input
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={p.stockMinQuantity ?? 0}
                          disabled={savingId === p.id}
                          onBlur={(e) => patchProduct(p.id, { stockMinQuantity: Number(e.target.value) || 0 })}
                          className="mt-0.5 w-16 border border-brand-950/15 rounded-lg px-2 py-1 text-right text-base"
                        />
                      </label>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${stockClass(p)}`}>
                        {stockLabel(p)}
                      </span>
                    </>
                  )}
                  </div>
                </div>
                {optionStock.length > 0 && (
                  <div className="mt-3 ml-12 rounded-xl bg-brand-950/[0.035] px-3 py-2">
                    <p className="mb-1.5 font-semibold uppercase tracking-wide text-brand-950/45 text-xs">Stock por sabor o modificador</p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {optionStock.map((item) => (
                        <label key={item.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-brand-950 text-sm font-medium">
                          <span className="min-w-0 truncate">{item.name}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            {item.pricePerUnitBase != null && <span className="text-brand-950/40">Costo {Number(item.pricePerUnitBase).toFixed(4)}</span>}
                            <input
                              type="number"
                              min="0"
                              step="1"
                              defaultValue={Number(item.quantity)}
                              disabled={savingId === item.id}
                              onBlur={(event) => patchProductStockItem(item.id, Number(event.target.value) || 0)}
                              className="w-16 rounded-md border border-brand-950/15 px-2 py-1 text-right text-base"
                              aria-label={`Existencia de ${item.name}`}
                            />
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
//  Insumos (normal): stock directo, tal cual estaba antes.
// -----------------------------------------------------------------------------

function InsumosTab({
  locationScope,
  items,
  categories,
  onChanged,
  onCategoriesChanged,
  showModifierLinkToggle = true,
  canRecipes = false,
  onLinkRecipe,
  toppingsOnly = false,
}: {
  /** "LOCAL" (Insumos de siempre) o "CASA_MATRIZ" (ventana aparte, ver InventoryPage). */
  locationScope: 'LOCAL' | 'CASA_MATRIZ';
  items: InventoryItem[] | null;
  categories: InventoryCategory[];
  onChanged: () => void;
  onCategoriesChanged: () => void;
  /** El interruptor de "Descontar insumos por modificador" es un ajuste único del
   * restaurante — solo tiene sentido mostrarlo una vez, en la pestaña Insumos normal. */
  showModifierLinkToggle?: boolean;
  /** Rendimiento/factor de corrección solo tienen efecto con Recetas (Premium) — se
   * ocultan del formulario si el plan no las incluye. */
  canRecipes?: boolean;
  onLinkRecipe?: (item: InventoryItem) => void;
  /** Pestaña "Toppings": misma tabla de insumos, filtrada a los marcados como topping, con el
   * formulario listo para crear el siguiente ya marcado (ver InventoryPage#toppings). */
  toppingsOnly?: boolean;
}) {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const initialForm = toppingsOnly ? { ...emptyForm, isTopping: true } : emptyForm;
  const [form, setForm] = useState(initialForm);
  const [formOpen, setFormOpen] = useState(false);
  const [usageItem, setUsageItem] = useState<InventoryItem | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const nombreRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printingList, setPrintingList] = useState(false);
  const [printSent, setPrintSent] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: { row: number; message: string }[] } | null>(
    null,
  );
  const importInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Interruptor del vínculo modificador -> insumo.
  const { refresh } = useAuth();
  const linkEnabled = !!restaurant?.modifierInventoryLinkEnabled;
  const [savingLink, setSavingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  async function toggleModifierLink() {
    setSavingLink(true);
    setLinkError(null);
    try {
      await api.patch('/inventory/settings', { modifierInventoryLinkEnabled: !linkEnabled });
      // Recarga /auth/me para que el nuevo valor llegue a todas las pantallas
      // (el editor de modificadores lo lee del mismo contexto).
      await refresh();
    } catch {
      setLinkError('No se pudo cambiar el ajuste. Intenta de nuevo.');
    } finally {
      setSavingLink(false);
    }
  }

  async function addCategory() {
    if (!newCategoryName.trim()) return;
    const res = await api.post('/inventory/categories', { name: newCategoryName.trim() });
    onCategoriesChanged();
    setForm((f) => ({ ...f, categoryId: res.data.data.id }));
    setNewCategoryName('');
    setAddingCategory(false);
  }

  async function printInsumosList() {
    setPrintingList(true);
    try {
      await api.post('/inventory/print-list');
      setPrintSent(true);
      setTimeout(() => setPrintSent(false), 2500);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo enviar la lista a la estación de impresión.');
    } finally {
      setPrintingList(false);
    }
  }

  async function downloadImportTemplate() {
    setDownloadingTemplate(true);
    try {
      const res = await api.get('/inventory/import-template', { responseType: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(res.data);
      link.download = 'plantilla-insumos.xlsx';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      setError('No se pudo generar la plantilla. Intenta de nuevo.');
    } finally {
      setDownloadingTemplate(false);
    }
  }

  async function handleImportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/inventory/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data.data);
      onChanged();
      onCategoriesChanged();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo importar el archivo.');
    } finally {
      setImporting(false);
    }
  }

  function startEdit(item: InventoryItem) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      unit: item.unit,
      subUnit: item.unit,
      quantity: item.quantity,
      minQuantity: item.minQuantity,
      price: '',
      priceCurrency: 'BASE',
      photoUrl: item.photoUrl ?? null,
      categoryId: item.categoryId ?? '',
      isPackaging: !!item.packagingType,
      packagingType: item.packagingType ?? 'ENVASE',
      salePrice: item.salePriceBase ?? '',
      expiryDate: item.expiryDate ?? '',
      noPerecedero: !item.expiryDate,
      yieldPercent: item.yieldPercent ?? '100',
      correctionPercent: item.correctionPercent ?? '0',
      isTopping: !!item.isTopping,
      isProductStock: !!item.isProductStock,
    });
    setFormOpen(true);
  }

  const subUnitOptions = SUB_UNITS[form.unit] ?? [];

  /**
   * Al empezar a editar, llevar la vista al formulario.
   *
   * El formulario vive ARRIBA de la lista: tocar "Editar" en un insumo del final llenaba los
   * campos a mil píxeles de donde estaba mirando el usuario, así que el botón parecía no hacer
   * nada — y peor, se podía seguir escribiendo creyendo que se cargaba uno nuevo cuando en
   * realidad se estaba pisando el que quedó abierto.
   *
   * Va en un efecto y no en el manejador del clic porque ahí haría falta esperar al render con
   * requestAnimationFrame, que NO se ejecuta mientras la pestaña está en segundo plano. El
   * salto es instantáneo a propósito: `behavior: 'smooth'` depende del navegador y de los
   * ajustes de movimiento del sistema, y acá no es un adorno sino la señal de que pasó algo.
   */
  useEffect(() => {
    if (!formOpen) return;
    nombreRef.current?.focus({ preventScroll: true });
  }, [formOpen, editingId]);

  function cancelEdit() {
    setEditingId(null);
    setForm(initialForm);
    setAddingCategory(false);
    setNewCategoryName('');
    setError(null);
    setFormOpen(false);
  }

  function startCreate() {
    setEditingId(null);
    setForm(initialForm);
    setAddingCategory(false);
    setNewCategoryName('');
    setError(null);
    setFormOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const subUnit = subUnitOptions.find((u) => u.value === form.subUnit);
      const toBase = subUnit?.toBase ?? 1;
      const payload = {
        name: form.name,
        unit: form.unit,
        quantity: (Number(form.quantity) || 0) * toBase,
        minQuantity: (Number(form.minQuantity) || 0) * toBase,
        unitCost: form.price ? Number(form.price) : undefined,
        priceCurrency: form.priceCurrency,
        photoUrl: form.photoUrl,
        categoryId: form.categoryId || null,
        packagingType: form.isPackaging ? form.packagingType : null,
        salePrice: form.isPackaging ? Number(form.salePrice) || 0 : null,
        // Cadena vacía = el backend la interpreta como "borrar la fecha", que es justo lo que
        // significa "No perecedero".
        expiryDate: form.noPerecedero ? '' : form.expiryDate,
        locationScope,
        isTopping: form.isTopping,
        isProductStock: form.isProductStock,
        ...(canRecipes
          ? { yieldPercent: Number(form.yieldPercent) || 100, correctionPercent: Number(form.correctionPercent) || 0 }
          : {}),
      };
      if (editingId) {
        await api.patch(`/inventory/${editingId}`, payload);
      } else {
        await api.post('/inventory', payload);
      }
      cancelEdit();
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar el insumo.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: InventoryItem) {
    if (!window.confirm(`¿Eliminar "${item.name}" del inventario?`)) return;
    await api.delete(`/inventory/${item.id}`);
    if (editingId === item.id) cancelEdit();
    onChanged();
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const allIds = filteredItems.map((i) => i.id);
    setSelected((prev) => (prev.size === allIds.length ? new Set() : new Set(allIds)));
  }

  // El buscador filtra por nombre y categoría, ignorando acentos — mismo criterio que
  // Productos. Se aplica antes de agrupar por categoría, así que una búsqueda puede dejar
  // secciones vacías fuera de la vista en vez de mostrarlas con "0 insumos".
  const filteredItems = (items ?? []).filter((i) => {
    const q = normalize(search);
    if (!q) return true;
    return normalize(i.name).includes(q) || normalize(i.category?.name).includes(q);
  });

  // Mover los insumos seleccionados a una categoría de un solo golpe ('' = "Sin categoría").
  const [bulkMoving, setBulkMoving] = useState(false);
  async function bulkMove(categoryId: string) {
    if (selected.size === 0) return;
    setBulkMoving(true);
    try {
      await api.post('/inventory/categories/assign', { itemIds: Array.from(selected), categoryId: categoryId || null });
      setSelected(new Set());
      onChanged();
    } finally {
      setBulkMoving(false);
    }
  }
  // Gestor de categorías (crear fuera del insumo, renombrar, eliminar).
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  async function bulkRemove() {
    if (selected.size === 0) return;
    if (!confirm(`¿Eliminar ${selected.size} insumo${selected.size === 1 ? '' : 's'} seleccionado${selected.size === 1 ? '' : 's'}?`)) return;
    setBulkDeleting(true);
    try {
      await api.post('/inventory/bulk-delete', { ids: Array.from(selected) });
      setSelected(new Set());
      onChanged();
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div className="space-y-8">
      {!toppingsOnly && (
        <div className="rounded-2xl border border-brand-500/15 bg-brand-500/[0.05] px-4 py-3">
          <p className="font-semibold text-brand-950 text-base">
            {locationScope === 'CASA_MATRIZ' ? 'Existencia de Casa Matriz' : 'Existencias e insumos vinculados'}
          </p>
          <p className="mt-1 font-light leading-relaxed text-brand-950/55 text-xs">
            Carga materia prima o porciones listas, añade stock y vincula cada ítem a una receta. La unidad «Porción» no convierte kilos automáticamente.
          </p>
        </div>
      )}
      {toppingsOnly && (
        <p className="text-brand-950/60 font-light -mt-2 text-base">
          Insumos marcados como Topping: aparecen en un picker aparte al crear un modificador (Productos → Modificadores),
          para vincularlo a inventario sin buscarlo entre todos los insumos.
        </p>
      )}
      {/* Interruptor del vínculo modificador -> insumo. Se deja arriba de todo
          porque cambia el comportamiento de TODA la venta: con esto apagado, los
          modificadores no tocan el stock aunque tengan el insumo configurado. Ajuste único
          del restaurante — no se repite en la ventana de Casa Matriz. */}
      {showModifierLinkToggle && (
        <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold text-brand-950 text-base">Descontar insumos por modificador</p>
            <p className="text-brand-950/50 font-light mt-0.5 text-xs">
              Cuando está activo, cada modificador que tenga un insumo vinculado (ej. "Extra queso" → 30 gr de Queso)
              descuenta del inventario al servirse el pedido. Apagado, la configuración se conserva pero no toca el stock.
            </p>
            {linkError && <p className="text-red-600 mt-1 text-xs">{linkError}</p>}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={linkEnabled}
            onClick={toggleModifierLink}
            disabled={savingLink}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
              linkEnabled ? 'bg-brand-500' : 'bg-brand-950/20'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-200 ease-out-strong motion-reduce:transition-none ${
                linkEnabled ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={(open) => (open ? setFormOpen(true) : cancelEdit())}>
        <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto p-0 rounded-[28px] border border-brand-950/10 shadow-2xl">
          {/* Header compacto */}
          <div className="flex items-center justify-between border-b border-brand-950/10 px-6 py-4 bg-brand-950/[0.02]">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 shrink-0">
                <Package className="h-4.5 w-4.5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-brand-950">
                  {editingId ? 'Editar insumo' : locationScope === 'CASA_MATRIZ' ? 'Nuevo insumo · Casa Matriz' : 'Nuevo insumo'}
                </DialogTitle>
                <p className="text-xs text-brand-950/50 font-normal">
                  {editingId ? `Modificando existencias y costos de "${form.name || 'insumo'}"` : 'Registra materia prima o porciones para costeo y existencias'}
                </p>
              </div>
            </div>
            {editingId && (
              <span className="rounded-full bg-brand-500/10 px-2.5 py-0.5 text-xs font-semibold text-brand-600">
                Editando
              </span>
            )}
          </div>

          <form ref={formRef} onSubmit={onSubmit} className="p-5 space-y-3.5">
            {/* 1. Tipo de existencia en 3 opciones */}
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-brand-950/[0.04] p-1 border border-brand-950/10">
              <button
                type="button"
                onClick={() => setForm({ ...form, isProductStock: false, isPackaging: false })}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                  !form.isProductStock && !form.isPackaging
                    ? 'bg-white text-brand-950 shadow-xs'
                    : 'text-brand-950/60 hover:text-brand-950'
                }`}
              >
                <Layers className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Materia prima</span>
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, isProductStock: true, isPackaging: false })}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                  form.isProductStock && !form.isPackaging
                    ? 'bg-white text-brand-950 shadow-xs'
                    : 'text-brand-950/60 hover:text-brand-950'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-brand-500 shrink-0" />
                <span className="truncate">Porción / Listo</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    isProductStock: false,
                    isPackaging: true,
                    unit: form.unit || 'unidad',
                    noPerecedero: true,
                    expiryDate: '',
                  })
                }
                className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                  form.isPackaging
                    ? 'bg-white text-brand-950 shadow-xs'
                    : 'text-brand-950/60 hover:text-brand-950'
                }`}
              >
                <Box className="h-3.5 w-3.5 text-brand-500 shrink-0" />
                <span className="truncate">Envase / Empaque</span>
              </button>
            </div>

            {/* 2. Identificación: Foto + Nombre + Categoría */}
            <div className="rounded-2xl border border-brand-950/10 bg-white p-3.5">
              <div className="flex flex-col sm:flex-row items-start gap-3.5">
                <PhotoUploadField
                  value={form.photoUrl}
                  onChange={(url) => setForm({ ...form, photoUrl: url })}
                  uploadUrl="/inventory/upload-photo"
                  label="Foto"
                  className="shrink-0"
                />
                <div className="w-full flex-1 min-w-0 space-y-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-brand-950/70 mb-1">
                      Nombre del insumo *
                    </label>
                    <input
                      ref={nombreRef}
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Ej: Queso Gouda, Pechuga de pollo, Salsa tártara..."
                      required
                      className="w-full rounded-xl border border-brand-950/15 bg-white px-3 py-2 text-sm font-medium text-brand-950 placeholder:text-brand-950/30 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-brand-950/70 mb-1">
                      Categoría de inventario
                    </label>
                    {addingCategory ? (
                      <div className="flex gap-1.5">
                        <input
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          placeholder="Nombre de la nueva categoría..."
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCategory())}
                          className="w-full rounded-xl border border-brand-950/15 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                        />
                        <TextureButton variant="brand" size="sm" type="button" onClick={addCategory} className="!w-auto">
                          Crear
                        </TextureButton>
                        <button
                          type="button"
                          onClick={() => setAddingCategory(false)}
                          className="p-1.5 text-brand-950/40 hover:text-brand-950 rounded-lg hover:bg-brand-950/5"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <select
                        value={form.categoryId}
                        onChange={(e) => {
                          if (e.target.value === '__new__') setAddingCategory(true);
                          else setForm({ ...form, categoryId: e.target.value });
                        }}
                        className="w-full rounded-xl border border-brand-950/15 bg-white px-3 py-2 text-sm font-medium text-brand-950 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                      >
                        <option value="">Sin categoría asignada</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                        <option value="__new__">+ Crear nueva categoría…</option>
                      </select>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Existencias y Unidad */}
            <div className="rounded-2xl border border-brand-950/10 bg-brand-950/[0.02] p-3.5 space-y-3">
              <div className="flex items-center gap-2 pb-1.5 border-b border-brand-950/10">
                <Scale className="h-4 w-4 text-brand-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-brand-950/70">Unidad y Existencias</h3>
              </div>
              
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-brand-950/70 mb-1">
                    Unidad *
                  </label>
                  <select
                    value={form.unit}
                    onChange={(e) => {
                      const unit = e.target.value;
                      setForm({ ...form, unit, subUnit: (SUB_UNITS[unit] ?? [])[0]?.value ?? '' });
                    }}
                    required
                    className="w-full rounded-xl border border-brand-950/15 bg-white px-2.5 py-2 text-sm font-medium text-brand-950 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  >
                    <option value="">Elegir unidad…</option>
                    <option value="kg">{UNIT_LABELS.kg}</option>
                    <option value="lt">{UNIT_LABELS.lt}</option>
                    <option value="ml">{UNIT_LABELS.ml}</option>
                    <option value="unidad">{UNIT_LABELS.unidad}</option>
                    <option value="porcion">Porción</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-brand-950/70 mb-1">
                    Cantidad actual
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      value={form.quantity}
                      onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                      placeholder="0.00"
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-full rounded-xl border border-brand-950/15 bg-white px-3 py-2 text-sm font-semibold text-brand-950 text-right focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                    {subUnitOptions.length > 1 ? (
                      <select
                        value={form.subUnit}
                        onChange={(e) => setForm({ ...form, subUnit: e.target.value })}
                        className="shrink-0 rounded-xl border border-brand-950/15 bg-white px-2 py-2 text-xs font-semibold text-brand-950 focus:outline-none"
                      >
                        {subUnitOptions.map((u) => (
                          <option key={u.value} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="flex items-center justify-center px-2.5 rounded-xl border border-brand-950/10 bg-brand-950/5 text-xs font-semibold text-brand-950/60 shrink-0">
                        {(UNIT_LABELS[form.unit] ?? form.unit) || '—'}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-brand-950/70 mb-1">
                    Stock mínimo
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      value={form.minQuantity}
                      onChange={(e) => setForm({ ...form, minQuantity: e.target.value })}
                      placeholder="0.00"
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-full rounded-xl border border-brand-950/15 bg-white px-3 py-2 text-sm font-semibold text-brand-950 text-right focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                    <span className="flex items-center justify-center px-2.5 rounded-xl border border-brand-950/10 bg-brand-950/5 text-xs font-semibold text-brand-950/60 shrink-0">
                      {(subUnitOptions.find((u) => u.value === form.subUnit)?.label ?? UNIT_LABELS[form.unit] ?? form.unit) || '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Costo y Caducidad en 2 Columnas */}
            <div className="grid sm:grid-cols-2 gap-3">
              {/* Costo */}
              <div className="rounded-2xl border border-brand-950/10 bg-brand-950/[0.02] p-3.5 space-y-2">
                <div className="flex items-center gap-2 pb-1 border-b border-brand-950/10">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-brand-950/70">Costo Unitario</h3>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[11px] font-semibold text-brand-950/60 mb-0.5">
                      Costo por 1 {UNIT_LABELS[form.unit] ?? 'unidad'}
                    </label>
                    <input
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value.replace(',', '.') })}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      placeholder="0.00"
                      className="w-full rounded-xl border border-brand-950/15 bg-white px-3 py-1.5 text-sm font-semibold text-brand-950 text-right focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-brand-950/60 mb-0.5">
                      Moneda
                    </label>
                    <select
                      value={form.priceCurrency}
                      onChange={(e) => setForm({ ...form, priceCurrency: e.target.value as 'BASE' | 'BS' })}
                      className="w-full rounded-xl border border-brand-950/15 bg-white px-2 py-1.5 text-sm font-medium text-brand-950 focus:outline-none"
                    >
                      <option value="BASE">{symbol}</option>
                      <option value="BS">Bs</option>
                    </select>
                  </div>
                </div>
                <p className="text-[11px] text-brand-950/45 font-light leading-snug">
                  Costo de 1 unidad. Actualiza automáticamente las recetas vinculadas.
                </p>
              </div>

              {/* Caducidad */}
              <div className="rounded-2xl border border-brand-950/10 bg-brand-950/[0.02] p-3.5 space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-brand-950/10">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-brand-600" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-brand-950/70">Caducidad</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, noPerecedero: !form.noPerecedero, expiryDate: '' })}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                      form.noPerecedero
                        ? 'bg-brand-500 text-white shadow-xs'
                        : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
                    }`}
                  >
                    {form.noPerecedero ? '✓ No perecedero' : 'No perecedero'}
                  </button>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-brand-950/60 mb-0.5">
                    Fecha de vencimiento
                  </label>
                  <input
                    value={form.expiryDate}
                    onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                    type="date"
                    disabled={form.noPerecedero}
                    className="w-full rounded-xl border border-brand-950/15 bg-white px-3 py-1.5 text-sm font-medium text-brand-950 focus:outline-none disabled:bg-brand-950/[0.04] disabled:text-brand-950/30"
                  />
                </div>
                <p className="text-[11px] text-brand-950/45 font-light leading-snug">
                  {form.noPerecedero
                    ? 'Insumo sin vencimiento. No emite alertas de caducidad.'
                    : 'Avisa con anticipación en el Dashboard cuando el lote esté por vencer.'}
                </p>
              </div>
            </div>

            {/* 5. Si es Envase: Configuración directa de empaque */}
            {form.isPackaging && (
              <div className="rounded-2xl border border-brand-500/20 bg-brand-500/[0.03] p-3.5 space-y-2.5">
                <div className="flex items-center gap-2 pb-1 border-b border-brand-500/15">
                  <Box className="h-4 w-4 text-brand-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-brand-950/70">
                    Configuración del Envase / Empaque
                  </h3>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-brand-950/70 mb-0.5">Tipo de empaque *</label>
                    <select
                      value={form.packagingType}
                      onChange={(e) => setForm({ ...form, packagingType: e.target.value as 'ENVASE' | 'CAJA' | 'BOLSA' })}
                      className="w-full rounded-xl border border-brand-950/15 bg-white px-3 py-1.5 text-sm font-medium text-brand-950 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    >
                      <option value="ENVASE">Envase (recipiente, pote, vaso)</option>
                      <option value="CAJA">Caja (pizza, burger, combo)</option>
                      <option value="BOLSA">Bolsa (kraft, térmica, plástico)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-brand-950/70 mb-0.5">
                      Precio cobrado al comensal ({symbol})
                    </label>
                    <input
                      value={form.salePrice}
                      onChange={(e) => setForm({ ...form, salePrice: e.target.value.replace(/[^0-9.]/g, '') })}
                      placeholder="0.00 (Opcional)"
                      className="w-full rounded-xl border border-brand-950/15 bg-white px-3 py-1.5 text-sm font-medium text-brand-950 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                    <span className="text-[10px] text-brand-950/45 font-light">
                      Deja en 0 si el empaque no se cobra extra en el pedido.
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 6. Si NO es Envase: Opciones avanzadas de cocina/recetas */}
            {!form.isPackaging && (
              <details className="group rounded-2xl border border-brand-950/10 bg-white overflow-hidden">
                <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none select-none bg-brand-950/[0.01] hover:bg-brand-950/[0.03] transition-colors [&::-webkit-details-marker]:hidden">
                  <span className="text-xs font-semibold text-brand-950/75">
                    Opciones avanzadas (Mermas, Rendimiento y Toppings)
                  </span>
                  <ChevronDown className="h-4 w-4 text-brand-950/40 transition-transform group-open:rotate-180" />
                </summary>
                <div className="p-4 border-t border-brand-950/10 space-y-3 bg-brand-950/[0.01]">
                  {canRecipes && (
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-brand-950/70 mb-1">
                          Rendimiento % (merma de limpieza/cocción)
                        </label>
                        <input
                          value={form.yieldPercent}
                          onChange={(e) => setForm({ ...form, yieldPercent: e.target.value.replace(/[^0-9.]/g, '') })}
                          placeholder="100"
                          type="number"
                          step="1"
                          min="1"
                          max="100"
                          className="w-full rounded-xl border border-brand-950/15 bg-white px-3 py-1.5 text-sm focus:outline-none"
                        />
                        <p className="text-[11px] text-brand-950/40 mt-0.5">
                          Ej: 90 = de 1 {UNIT_LABELS[form.unit] ?? form.unit} comprado solo 90% rinde.
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-brand-950/70 mb-1">
                          Factor de corrección % (colchón de precio)
                        </label>
                        <input
                          value={form.correctionPercent}
                          onChange={(e) => setForm({ ...form, correctionPercent: e.target.value.replace(/[^0-9.]/g, '') })}
                          placeholder="0"
                          type="number"
                          step="1"
                          min="0"
                          className="w-full rounded-xl border border-brand-950/15 bg-white px-3 py-1.5 text-sm focus:outline-none"
                        />
                        <p className="text-[11px] text-brand-950/40 mt-0.5">
                          Margen de seguridad por fluctuación de precios.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="pt-1">
                    <label className="flex items-center gap-2 text-xs font-medium text-brand-950/80 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.isTopping}
                        onChange={(e) => setForm({ ...form, isTopping: e.target.checked })}
                        className="h-4 w-4 rounded border-brand-950/30 text-brand-500 focus:ring-brand-400"
                      />
                      Disponible como Topping en el selector de modificadores
                    </label>
                  </div>
                </div>
              </details>
            )}

            {error && <p className="text-sm font-medium text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100">{error}</p>}

            {/* Footer con botones compactos y bien alineados */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-brand-950/10">
              <TextureButton variant="minimal" size="default" type="button" className="!w-auto" onClick={cancelEdit}>
                Cancelar
              </TextureButton>
              <TextureButton variant="brand" size="default" disabled={saving} className="!w-auto">
                {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Agregar insumo'}
              </TextureButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-950/10 bg-white p-4 [&_button>div]:min-h-11">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-brand-950">Insumos</h2>
          {filteredItems.length > 0 && (
            <label className="flex items-center gap-1.5 text-brand-950/60 text-sm font-medium">
              <input
                type="checkbox"
                checked={selected.size > 0 && selected.size === filteredItems.length}
                ref={(el) => {
                  if (el) el.indeterminate = selected.size > 0 && selected.size < filteredItems.length;
                }}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-brand-950/30 text-brand-500 focus:ring-brand-400"
              />
              Seleccionar todo
            </label>
          )}
          {selected.size > 0 && (
            <>
              <select
                value=""
                disabled={bulkMoving}
                onChange={(e) => {
                  if (e.target.value === '__none__') bulkMove('');
                  else if (e.target.value) bulkMove(e.target.value);
                }}
                className="rounded-full border border-brand-950/15 bg-white px-2.5 py-1 font-medium text-brand-950/70 disabled:opacity-50 text-base"
              >
                <option value="">{bulkMoving ? 'Moviendo…' : `Mover ${selected.size} a categoría…`}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__none__">Sin categoría</option>
              </select>
              <TextureButton
                variant="minimal"
                size="sm"
                className="!w-auto flex items-center gap-1.5 whitespace-nowrap !text-red-600"
                disabled={bulkDeleting}
                onClick={bulkRemove}
              >
                <Trash2 className="h-3.5 w-3.5" /> {bulkDeleting ? 'Borrando…' : `Eliminar ${selected.size}`}
              </TextureButton>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowCategoryManager((v) => !v)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              showCategoryManager ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
            }`}
          >
            Categorías {categories.length > 0 && <span className="opacity-70">{categories.length}</span>}
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <TextureButton variant="brand" size="sm" className="!w-auto" onClick={startCreate}>
            <Plus className="h-3.5 w-3.5" /> Nuevo ítem
          </TextureButton>
          {printSent && <span className="text-xs text-emerald-600 font-medium">Enviado a la estación de impresión</span>}
          <AddStockDialog
            items={(items ?? []).map((i) => ({
              id: i.id,
              name: i.name,
              currentQuantity: Number(i.quantity),
              unitLabel: UNIT_LABELS[i.unit] ?? i.unit,
            }))}
            onAdd={async (id, delta) => {
              const item = items?.find((i) => i.id === id);
              if (!item) return;
              await api.patch(`/inventory/${id}`, { quantity: Number(item.quantity) + delta, locationScope });
              onChanged();
            }}
          />
          <TextureButton variant="secondary" size="sm" className="!w-auto" disabled={downloadingTemplate} onClick={downloadImportTemplate}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> {downloadingTemplate ? 'Generando…' : 'Descargar plantilla'}
          </TextureButton>
          <TextureButton
            variant="secondary"
            size="sm"
            className="!w-auto"
            disabled={importing}
            onClick={() => importInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" /> {importing ? 'Importando…' : 'Importar Excel'}
          </TextureButton>
          <input ref={importInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportFileChange} />
          <TextureButton
            variant="secondary"
            size="sm"
            className="!w-auto"
            disabled={printingList || !items?.length}
            onClick={printInsumosList}
          >
            <Printer className="h-3.5 w-3.5" /> {printingList ? 'Enviando…' : 'Imprimir lista de insumos'}
          </TextureButton>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-950/35" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar insumo por nombre o categoría…"
          aria-label="Buscar insumos"
          className="w-full rounded-xl border border-brand-950/15 bg-white py-2 pl-10 pr-10 text-brand-950 placeholder:text-brand-950/35 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40 text-base"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Limpiar búsqueda"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-brand-950/40 hover:bg-brand-950/5 hover:text-brand-950/70"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showCategoryManager && (
        <CategoryManager
          categories={categories}
          items={items ?? []}
          onChanged={() => {
            onCategoriesChanged();
            onChanged();
          }}
        />
      )}

      {importResult && (
        <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-4 text-sm space-y-1">
          <p className="text-brand-950 text-base">
            {importResult.created} creados · {importResult.updated} actualizados
            {importResult.errors.length > 0 && <span className="text-red-600"> · {importResult.errors.length} con error</span>}
          </p>
          {importResult.errors.length > 0 && (
            <ul className="text-xs text-red-600 space-y-0.5">
              {importResult.errors.map((e, i) => (
                <li key={i}>
                  Fila {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {items?.length === 0 && (
        <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-5">
          <p className="text-brand-950/40 font-light text-base">
            {toppingsOnly ? 'Sin toppings todavía — marca "Es un Topping" al crear el primero.' : 'Sin insumos todavía.'}
          </p>
        </div>
      )}

      {!!items?.length && filteredItems.length === 0 && (
        <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-5">
          <p className="text-brand-950/40 font-light text-base">Ningún insumo coincide con "{search}".</p>
        </div>
      )}

      {usageItem && <IngredientUsageDialog item={usageItem} scope={locationScope} onClose={() => setUsageItem(null)} />}
      {groupByCategory(filteredItems, categories).map(([groupName, groupItems]) => (
        <div key={groupName} className="space-y-2">
          <h3 className="text-xs font-semibold text-brand-950/50 uppercase tracking-wide px-1">{groupName}</h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {groupItems.map((item) => {
              const qty = Number(item.quantity);
              const minQty = Number(item.minQuantity);
              const low = minQty > 0 && qty <= minQty;
              // Barra: se llena hasta el doble del mínimo ("stock sano"); se acorta y cambia de
              // color mientras se acerca al punto de aviso, para que se note antes de llegar a cero.
              const ratio = minQty > 0 ? Math.max(0, Math.min(1, qty / (minQty * 2))) : 1;
              const barColor = low ? 'bg-red-500' : ratio < 0.75 ? 'bg-amber-500' : 'bg-emerald-500';
              return (
                <div key={item.id} className="flex flex-wrap items-start gap-3 rounded-2xl border border-brand-950/10 bg-white p-4 sm:p-5">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    aria-label={`Seleccionar ${item.name}`}
                    onChange={() => toggleSelected(item.id)}
                    className="h-4 w-4 shrink-0 rounded border-brand-950/30 text-brand-500 focus:ring-brand-400"
                  />
                  {item.photoUrl ? (
                    <img src={item.photoUrl} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-brand-950/[0.06] shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-brand-950 flex flex-wrap items-center gap-1.5 break-words text-base">
                      {item.name}
                      {low && (
                        <span title="Por debajo del stock mínimo">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        </span>
                      )}
                      {item.packagingType && (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-brand-500 bg-brand-500/10 rounded-full px-2 py-0.5">
                          {PACKAGING_TYPE_LABELS[item.packagingType]}
                        </span>
                      )}
                      {!toppingsOnly && item.isTopping && (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-amber-600 bg-amber-500/10 rounded-full px-2 py-0.5">
                          Topping
                        </span>
                      )}
                      {/* Solo se muestra cuando ya importa: un lote que vence dentro de meses no aporta ruido. */}
                      {item.expiryDate && expiryStatus(item.expiryDate) !== 'OK' && (
                        <span
                          className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${EXPIRY_CLASS[expiryStatus(item.expiryDate)]}`}
                        >
                          {expiryLabel(item.expiryDate)}
                        </span>
                      )}
                    </p>
                    <p className={`text-xs font-light mt-0.5 ${low ? 'text-amber-600' : 'text-brand-950/40'}`}>
                      Existencia {formatBaseQuantity(qty, item.unit)} · mínimo {formatBaseQuantity(minQty, item.unit)}
                      {item.pricePerUnitBase && ` · costo ${symbol}${item.pricePerUnitBase}/${UNIT_LABELS[item.unit] ?? item.unit}`}
                      {canRecipes &&
                        item.pricePerUnitBase &&
                        (Number(item.yieldPercent) !== 100 || Number(item.correctionPercent) !== 0) &&
                        ` · ajustado ${symbol}${adjustedCost(item)}/${UNIT_LABELS[item.unit] ?? item.unit} (rend. ${item.yieldPercent}%, corr. ${item.correctionPercent}%)`}
                      {item.salePriceBase && ` · venta ${symbol}${item.salePriceBase}`}
                    </p>
                    {minQty > 0 && (
                      <div className="h-1.5 w-full max-w-48 rounded-full bg-brand-950/[0.08] overflow-hidden mt-1.5">
                        <div
                          className={`h-full rounded-full transition-[width] duration-200 ease-out-strong motion-reduce:transition-none ${barColor}`}
                          style={{ width: `${ratio * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex w-full flex-wrap items-center justify-end gap-2 border-t border-brand-950/[0.06] pt-3">
                    <span className={`mr-auto rounded-full px-2.5 py-1 text-xs font-medium ${qty <= 0 ? 'bg-red-50 text-red-700' : low ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{qty <= 0 ? 'Agotado' : low ? 'Por reponer' : 'En stock'}</span>
                    {canRecipes && onLinkRecipe && <button onClick={() => onLinkRecipe(item)} className="min-h-11 rounded-xl bg-brand-500/10 px-3 text-sm font-medium text-brand-600">Vincular</button>}
                    {canRecipes && <button onClick={() => setUsageItem(item)} className="min-h-11 rounded-xl px-3 text-xs font-medium text-brand-600">Ver recetas</button>}
                    <button onClick={() => startEdit(item)} className="min-h-11 rounded-xl bg-brand-500/10 px-3 text-xs font-medium text-brand-600">
                      Editar
                    </button>
                    <button onClick={() => remove(item)} className="min-h-11 px-2 text-xs text-red-600 hover:text-red-700">
                      Eliminar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Gestor de categorías de insumos, fuera del formulario del insumo: crear, renombrar y
 * eliminar. Al eliminar, sus insumos quedan "Sin categoría" (no se borran — el FK es SetNull).
 */
function CategoryManager({
  categories,
  items,
  onChanged,
}: {
  categories: InventoryCategory[];
  items: InventoryItem[];
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const countFor = (id: string) => items.filter((i) => i.categoryId === id).length;

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.post('/inventory/categories', { name: name.trim() });
      setName('');
      onChanged();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo crear la categoría.');
    } finally {
      setSaving(false);
    }
  }

  async function rename(id: string) {
    if (!editName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/inventory/categories/${id}`, { name: editName.trim() });
      setEditingId(null);
      onChanged();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo renombrar.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId((c) => (c === id ? null : c)), 3000);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.delete(`/inventory/categories/${id}`);
      setConfirmDeleteId(null);
      onChanged();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo eliminar.');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'rounded-lg border border-brand-950/15 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40';

  return (
    <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-4 space-y-3">
      <div>
        <p className="font-semibold text-brand-950 text-base">Categorías de insumos</p>
        <p className="text-brand-950/45 font-light text-xs">
          Crea categorías acá y luego marca varios insumos y usa "Mover a categoría…". Al eliminar una, sus insumos quedan sin
          categoría (no se borran).
        </p>
      </div>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              create();
            }
          }}
          placeholder="Nueva categoría (ej. Carnes, Lácteos, Empaques)"
          className={`${inputCls} flex-1`}
        />
        <TextureButton variant="brand" size="sm" className="!w-auto" disabled={saving || !name.trim()} onClick={create}>
          Crear
        </TextureButton>
      </div>
      {error && <p className="text-red-600 text-xs">{error}</p>}
      <div className="divide-y divide-brand-950/[0.06]">
        {categories.length === 0 && <p className="py-2 text-brand-950/40 font-light text-xs">Todavía no hay categorías.</p>}
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-2 py-2">
            {editingId === c.id ? (
              <>
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') rename(c.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className={`${inputCls} flex-1`}
                />
                <TextureButton variant="brand" size="sm" className="!w-auto" disabled={saving} onClick={() => rename(c.id)}>
                  Guardar
                </TextureButton>
                <button type="button" onClick={() => setEditingId(null)} className="text-xs text-brand-950/50 hover:text-brand-950">
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-brand-950">{c.name}</span>
                <span className="shrink-0 text-xs text-brand-950/40">
                  {countFor(c.id)} insumo{countFor(c.id) === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(c.id);
                    setEditName(c.name);
                  }}
                  className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-brand-950/60 hover:bg-brand-950/[0.05]"
                >
                  Renombrar
                </button>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  disabled={saving}
                  className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                    confirmDeleteId === c.id ? 'bg-red-600 text-white' : 'text-red-600 hover:bg-red-50'
                  }`}
                >
                  <Trash2 className="h-3 w-3" /> {confirmDeleteId === c.id ? '¿Seguro?' : 'Eliminar'}
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Agrupa insumos por categoría (en el orden de las categorías), dejando "Sin categoría" al final. */
function groupByCategory(items: InventoryItem[], categories: InventoryCategory[]): [string, InventoryItem[]][] {
  const byCategoryId = new Map<string, InventoryItem[]>();
  const uncategorized: InventoryItem[] = [];
  for (const item of items) {
    if (item.categoryId) {
      const list = byCategoryId.get(item.categoryId) ?? [];
      list.push(item);
      byCategoryId.set(item.categoryId, list);
    } else {
      uncategorized.push(item);
    }
  }
  const groups: [string, InventoryItem[]][] = [];
  for (const c of categories) {
    const list = byCategoryId.get(c.id);
    if (list?.length) groups.push([c.name, list]);
    byCategoryId.delete(c.id);
  }
  // Insumo con una categoría que esta sede no tiene (llegó por transferencia desde otra sede):
  // antes no entraba en ningún grupo y desaparecía de la lista aunque existiera de verdad.
  for (const list of byCategoryId.values()) uncategorized.push(...list);
  if (uncategorized.length) groups.push(['Sin categoría', uncategorized]);
  return groups;
}

// -----------------------------------------------------------------------------
//  Recetas: vincula productos del menú con insumos.
// -----------------------------------------------------------------------------

interface PreparationOverviewRow {
  id: string;
  name: string;
  unit: string;
  unitLabel: string;
  yieldQuantity: string;
  isTopping: boolean;
  ingredientCount: number;
  totalCostBase: string;
  costPerBaseUnit: string;
}

interface PreparationLine {
  id: string;
  type: 'insumo' | 'preparacion';
  inventoryItemId: string | null;
  componentPreparationId: string | null;
  name: string;
  unit: string;
  quantity: string;
  costBase: string;
}

/** Preparaciones (sub-recetas): bases intermedias reutilizables entre platos (fondo, salsa
 * madre, masa), armadas a partir de insumos y/o de otras preparaciones. No tienen stock
 * propio — su costo se calcula en vivo y queda disponible como ingrediente en Recetas. */
function PreparacionesTab({ insumos, toppingsOnly = false }: { insumos: InventoryItem[]; toppingsOnly?: boolean }) {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [allRows, setAllRows] = useState<PreparationOverviewRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newPrep, setNewPrep] = useState({ name: '', unit: 'kg' as 'kg' | 'lt', yieldQuantity: '' });
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get('/inventory/preparations').then((res) => setAllRows(res.data.data));
  }

  useEffect(load, []);

  // En la pestaña Toppings esto solo lista/crea las preparaciones curadas isTopping — el resto
  // de Preparaciones (fondos, salsas madre que no son un topping) no aparece acá.
  const rows = toppingsOnly ? allRows?.filter((r) => r.isTopping) : allRows;

  async function createPreparation() {
    setError(null);
    if (!newPrep.name.trim() || !newPrep.yieldQuantity) {
      setError('Completa el nombre y cuánto rinde.');
      return;
    }
    try {
      // Igual criterio que las cantidades de ingredientes: se escribe en gr/ml (natural para
      // una preparación) y se convierte a la unidad declarada (kg/lt) antes de guardar.
      const toBase = (SUB_UNITS[newPrep.unit] ?? [])[1]?.toBase ?? 0.001;
      const res = await api.post('/inventory/preparations', {
        name: newPrep.name.trim(),
        unit: newPrep.unit,
        yieldQuantity: Number(newPrep.yieldQuantity) * toBase,
        isTopping: toppingsOnly ? true : undefined,
      });
      setNewPrep({ name: '', unit: 'kg', yieldQuantity: '' });
      setCreating(false);
      load();
      setOpenId(res.data.data.id);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo crear la preparación.');
    }
  }

  return (
    <div className="space-y-5">
      {insumos.length === 0 && (
        <p className="text-amber-600 bg-amber-50 rounded-xl p-3 text-base">
          Primero agrega insumos en la pestaña "Insumos (normal)": las preparaciones se arman a partir de ellos.
        </p>
      )}

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm divide-y divide-brand-950/[0.06]">
        {rows?.length === 0 && !creating && (
          <p className="p-5 text-brand-950/40 font-light text-base">
            {toppingsOnly ? 'Sin toppings de varios insumos todavía.' : 'Sin preparaciones todavía.'}
          </p>
        )}
        {rows?.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="font-medium text-brand-950 truncate text-base">
                {r.name}
                {!toppingsOnly && r.isTopping && (
                  <span className="ml-2 inline-block rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold px-2 py-0.5 align-middle">
                    Topping
                  </span>
                )}
              </p>
              <p className="text-brand-950/40 font-light text-xs">
                {r.ingredientCount} ingrediente(s) · Rinde {(Number(r.yieldQuantity) * 1000).toFixed(0)} {r.unit === 'kg' ? 'gr' : 'ml'} ·
                Costo:{' '}
                {symbol}
                {r.totalCostBase} · {symbol}
                {r.costPerBaseUnit}/{r.unitLabel}
              </p>
            </div>
            <TextureButton variant="minimal" size="sm" className="!w-auto shrink-0" onClick={() => setOpenId(r.id)}>
              Editar
            </TextureButton>
          </div>
        ))}

        {creating ? (
          <div className="p-5 space-y-2">
            <div className="grid sm:grid-cols-3 gap-2">
              <input
                value={newPrep.name}
                onChange={(e) => setNewPrep({ ...newPrep, name: e.target.value })}
                placeholder={toppingsOnly ? 'Nombre (ej: Pico de gallo)' : 'Nombre (ej: Pasta de ajo)'}
                autoFocus
                className="sm:col-span-2 border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-base"
              />
              <select
                value={newPrep.unit}
                onChange={(e) => setNewPrep({ ...newPrep, unit: e.target.value as 'kg' | 'lt' })}
                className="border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-base"
              >
                <option value="kg">Kg</option>
                <option value="lt">Lt</option>
              </select>
            </div>
            <input
              value={newPrep.yieldQuantity}
              onChange={(e) => setNewPrep({ ...newPrep, yieldQuantity: e.target.value.replace(/[^0-9.]/g, '') })}
              placeholder={`Cuánto rinde, en ${newPrep.unit === 'kg' ? 'gramos' : 'mililitros'}`}
              className="w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-base"
            />
            {error && <p className="text-red-600 text-xs">{error}</p>}
            <div className="flex gap-2">
              <TextureButton variant="brand" size="sm" className="!w-auto" onClick={createPreparation}>
                Crear
              </TextureButton>
              <TextureButton variant="minimal" size="sm" className="!w-auto" onClick={() => setCreating(false)}>
                Cancelar
              </TextureButton>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:underline p-5"
          >
            <Plus className="h-4 w-4" /> {toppingsOnly ? 'Nuevo topping (varios insumos)' : 'Nueva preparación'}
          </button>
        )}
      </div>

      {openId && (
        <PreparationDialog
          id={openId}
          insumos={insumos}
          preparations={allRows ?? []}
          hideToppingToggle={toppingsOnly}
          onClose={() => setOpenId(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function PreparationDialog({
  id,
  insumos,
  preparations,
  hideToppingToggle = false,
  onClose,
  onSaved,
}: {
  id: string;
  insumos: InventoryItem[];
  preparations: PreparationOverviewRow[];
  /** Se abre desde la pestaña Toppings: ya se sabe que es un topping, no hace falta el interruptor. */
  hideToppingToggle?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [yieldQuantity, setYieldQuantity] = useState('');
  const [unit, setUnit] = useState<'kg' | 'lt'>('kg');
  const [isTopping, setIsTopping] = useState(false);
  const [savingTopping, setSavingTopping] = useState(false);
  const [lines, setLines] = useState<PreparationLine[] | null>(null);
  const [totalCostBase, setTotalCostBase] = useState('0.00');
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ ref: '', quantity: '', subUnit: '' });
  const [error, setError] = useState<string | null>(null);
  const [savingYield, setSavingYield] = useState(false);

  // No puede referenciarse a sí misma como ingrediente (evita el ciclo más obvio; el resto
  // los bloquea el backend).
  const otherPreparations = preparations.filter((p) => p.id !== id);

  const [refType, refId] = newItem.ref.split(':');
  const selectedInsumo = refType === 'insumo' ? insumos.find((i) => i.id === refId) : undefined;
  const selectedPrep = refType === 'prep' ? otherPreparations.find((p) => p.id === refId) : undefined;
  const selectedUnit = selectedInsumo?.unit ?? selectedPrep?.unit ?? '';
  const subUnitOptions = selectedUnit ? SUB_UNITS[selectedUnit] ?? [] : [];

  function load() {
    api.get(`/inventory/preparations/${id}`).then((res) => {
      setName(res.data.data.name);
      setUnit(res.data.data.unit);
      // El backend guarda en la unidad declarada (kg/lt) — se muestra en gr/ml, más natural
      // para escribir cuánto rinde una preparación.
      setYieldQuantity((Number(res.data.data.yieldQuantity) * 1000).toString());
      setIsTopping(!!res.data.data.isTopping);
      setLines(res.data.data.ingredients);
      setTotalCostBase(res.data.data.totalCostBase);
    });
  }

  useEffect(load, [id]);

  async function saveYield() {
    setSavingYield(true);
    setError(null);
    try {
      const toBase = (SUB_UNITS[unit] ?? [])[1]?.toBase ?? 0.001;
      await api.patch(`/inventory/preparations/${id}`, { yieldQuantity: (Number(yieldQuantity) || 1) * toBase });
      load();
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar el rendimiento.');
    } finally {
      setSavingYield(false);
    }
  }

  async function addIngredient() {
    setError(null);
    if (!newItem.ref || !newItem.quantity || !newItem.subUnit) {
      setError('Completa ingrediente y cantidad.');
      return;
    }
    const subUnit = subUnitOptions.find((u) => u.value === newItem.subUnit);
    const quantityInBaseUnit = Number(newItem.quantity) * (subUnit?.toBase ?? 1);
    try {
      await api.post(`/inventory/preparations/${id}/ingredients`, {
        inventoryItemId: refType === 'insumo' ? refId : undefined,
        componentPreparationId: refType === 'prep' ? refId : undefined,
        quantity: quantityInBaseUnit,
      });
      setNewItem({ ref: '', quantity: '', subUnit: '' });
      setAdding(false);
      load();
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo agregar el ingrediente.');
    }
  }

  async function removeIngredient(lineId: string) {
    await api.delete(`/inventory/preparations/ingredient/${lineId}`);
    load();
    onSaved();
  }

  async function toggleTopping(next: boolean) {
    setIsTopping(next);
    setSavingTopping(true);
    try {
      await api.patch(`/inventory/preparations/${id}`, { isTopping: next });
      onSaved();
    } catch {
      setIsTopping(!next);
    } finally {
      setSavingTopping(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Preparación: {name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {lines?.length === 0 && !adding && (
            <p className="text-brand-950/40 font-light text-base">Esta preparación todavía no tiene ingredientes.</p>
          )}

          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {lines?.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 border-b border-brand-950/10 pb-2">
                <div className="text-sm">
                  <p className="font-medium text-brand-950 flex items-center gap-1.5 text-base">
                    {l.type === 'preparacion' && <span title="Preparación">🍯</span>}
                    {l.name}
                  </p>
                  <p className="text-brand-950/50 font-light text-xs">
                    {l.quantity} {UNIT_LABELS[l.unit] ?? l.unit} · $
                    {l.costBase}
                  </p>
                </div>
                <button onClick={() => removeIngredient(l.id)} className="text-brand-950/30 hover:text-red-600">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>

          {adding ? (
            <div className="rounded-xl bg-brand-950/[0.04] p-3 space-y-2">
              <select
                value={newItem.ref}
                onChange={(e) => {
                  const [t, rid] = e.target.value.split(':');
                  const item = t === 'insumo' ? insumos.find((i) => i.id === rid) : otherPreparations.find((p) => p.id === rid);
                  const u = t === 'insumo' ? (item as InventoryItem | undefined)?.unit : (item as PreparationOverviewRow | undefined)?.unit;
                  const defaultSubUnit = u ? (SUB_UNITS[u] ?? [])[0]?.value ?? '' : '';
                  setNewItem({ ref: e.target.value, quantity: '', subUnit: defaultSubUnit });
                }}
                className="w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-base"
              >
                <option value="">Ingrediente…</option>
                <optgroup label="Insumos">
                  {insumos.map((i) => (
                    <option key={i.id} value={`insumo:${i.id}`}>
                      {i.name} ({UNIT_LABELS[i.unit] ?? i.unit})
                    </option>
                  ))}
                </optgroup>
                {otherPreparations.length > 0 && (
                  <optgroup label="Preparaciones">
                    {otherPreparations.map((p) => (
                      <option key={p.id} value={`prep:${p.id}`}>
                        🍯 {p.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={newItem.quantity}
                  onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value.replace(/[^0-9.]/g, '') })}
                  placeholder="Cantidad usada"
                  className="border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-base"
                />
                <select
                  value={newItem.subUnit}
                  onChange={(e) => setNewItem({ ...newItem, subUnit: e.target.value })}
                  disabled={!selectedUnit}
                  className="border border-brand-950/15 rounded-lg px-2.5 py-1.5 disabled:opacity-50 text-base"
                >
                  {subUnitOptions.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-brand-950/40 text-xs">El costo se calcula automáticamente según el precio/rendimiento del ingrediente.</p>
              {error && <p className="text-red-600 text-xs">{error}</p>}
              <div className="flex gap-2">
                <TextureButton variant="brand" size="sm" className="!w-auto" onClick={addIngredient}>
                  Guardar ingrediente
                </TextureButton>
                <TextureButton variant="minimal" size="sm" className="!w-auto" onClick={() => setAdding(false)}>
                  Cancelar
                </TextureButton>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:underline"
            >
              <Plus className="h-4 w-4" /> Añadir ingrediente
            </button>
          )}

          <div className="pt-3 border-t border-brand-950/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-brand-950/60">Costo total de ingredientes</span>
              <span className="text-lg font-semibold text-brand-950">${totalCostBase}</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-brand-950/70 shrink-0 text-sm font-medium">
                Esta preparación rinde ({unit === 'kg' ? 'gr' : 'ml'})
              </label>
              <input
                value={yieldQuantity}
                onChange={(e) => setYieldQuantity(e.target.value.replace(/[^0-9.]/g, ''))}
                className="w-24 border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-base"
              />
              <TextureButton variant="minimal" size="sm" className="!w-auto" disabled={savingYield} onClick={saveYield}>
                Guardar
              </TextureButton>
            </div>
            <p className="text-brand-950/40 font-light text-xs">
              Si entraron más gramos de insumos de los que rinde (merma al cocinar), el costo se reparte entre lo que realmente
              queda.
            </p>
            {!hideToppingToggle && (
              <label className="flex items-center gap-2 text-brand-950/70 pt-1 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={isTopping}
                  disabled={savingTopping}
                  onChange={(e) => toggleTopping(e.target.checked)}
                />
                Es un Topping (aparece en el picker de Inventario → Toppings al crear un modificador)
              </label>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Recetario completo. Vive acá (pestaña Recetas de Inventario) pero se exporta porque también
 * se abre desde Productos: la receta es del PLATO, así que tenerla solo dentro de Inventario
 * obligaba a salir del catálogo para armarla. Se carga sus propios datos, así que el que la
 * abre solo tiene que pasarle la lista de insumos.
 */
interface TransferLocation {
  restaurantId: string;
  scope: 'LOCAL' | 'CASA_MATRIZ';
  name: string;
  isMain: boolean;
}

interface TransferItem {
  id: string;
  name: string;
  unit: string;
  quantity: string;
}

interface TransferRecord {
  id: string;
  fromLocationName: string;
  toLocationName: string;
  itemName: string;
  unit: string;
  quantity: string;
  createdAt: string;
}

function locationKey(restaurantId: string, scope: string) {
  return `${restaurantId}:${scope}`;
}

function TransferenciasTab() {
  const [locations, setLocations] = useState<TransferLocation[] | null>(null);
  const [history, setHistory] = useState<TransferRecord[]>([]);
  const [fromKey, setFromKey] = useState('');
  const [toKey, setToKey] = useState('');
  const [fromItems, setFromItems] = useState<TransferItem[]>([]);
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadHistory() {
    api.get('/inventory/transfers').then((res) => setHistory(res.data.data));
  }

  useEffect(() => {
    api.get('/inventory/transfer-locations').then((res) => setLocations(res.data.data));
    loadHistory();
  }, []);

  useEffect(() => {
    if (!fromKey) {
      setFromItems([]);
      setItemId('');
      return;
    }
    const [restaurantId, scope] = fromKey.split(':');
    api
      .get('/inventory/transfer-locations/items', { params: { restaurantId, scope } })
      .then((res) => setFromItems(res.data.data));
    setItemId('');
  }, [fromKey]);

  const selectedItem = fromItems.find((i) => i.id === itemId);
  const toOptions = (locations ?? []).filter((l) => locationKey(l.restaurantId, l.scope) !== fromKey);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fromKey || !toKey || !itemId) return;
    const [fromRestaurantId, fromScope] = fromKey.split(':');
    const [toRestaurantId, toScope] = toKey.split(':');
    setSaving(true);
    try {
      await api.post('/inventory/transfers', {
        fromRestaurantId,
        fromScope,
        toRestaurantId,
        toScope,
        itemId,
        quantity: Number(quantity) || 0,
      });
      setItemId('');
      setQuantity('');
      // Recarga los insumos del origen (la cantidad disponible cambió) y el historial.
      const res = await api.get('/inventory/transfer-locations/items', { params: { restaurantId: fromRestaurantId, scope: fromScope } });
      setFromItems(res.data.data);
      loadHistory();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo registrar la transferencia.');
    } finally {
      setSaving(false);
    }
  }

  if (!locations) return <p className="text-brand-950/50 font-light text-base">Cargando…</p>;

  if (locations.length < 2) {
    return (
      <p className="text-brand-950/50 font-light text-base">
        Todavía no tienes otras sedes ni Casa Matriz activada para transferir insumos. Crea una sucursal en
        Administración → Sucursales, o activa Casa Matriz, para usar esta pestaña.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <form onSubmit={onSubmit} className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-sm font-medium">
            <span className="text-brand-950/70">Origen</span>
            <select
              value={fromKey}
              onChange={(e) => {
                setFromKey(e.target.value);
                if (e.target.value === toKey) setToKey('');
              }}
              required
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 text-base"
            >
              <option value="">Elige el origen…</option>
              {locations.map((l) => (
                <option key={locationKey(l.restaurantId, l.scope)} value={locationKey(l.restaurantId, l.scope)}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            <span className="text-brand-950/70">Destino</span>
            <select
              value={toKey}
              onChange={(e) => setToKey(e.target.value)}
              required
              disabled={!fromKey}
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 disabled:opacity-50 text-base"
            >
              <option value="">Elige el destino…</option>
              {toOptions.map((l) => (
                <option key={locationKey(l.restaurantId, l.scope)} value={locationKey(l.restaurantId, l.scope)}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-sm font-medium">
            <span className="text-brand-950/70">Insumo</span>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              required
              disabled={!fromKey || fromItems.length === 0}
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 disabled:opacity-50 text-base"
            >
              <option value="">{fromKey && fromItems.length === 0 ? 'Sin insumos en esa sede' : 'Elige el insumo…'}</option>
              {fromItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.quantity} {i.unit} disponibles)
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            <span className="text-brand-950/70">Cantidad{selectedItem ? ` (${selectedItem.unit})` : ''}</span>
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              disabled={!itemId}
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 disabled:opacity-50 text-base"
            />
          </label>
        </div>

        {error && <p className="text-red-600 text-base">{error}</p>}
        <TextureButton variant="brand" size="default" disabled={saving || !fromKey || !toKey || !itemId} className="!w-auto disabled:opacity-50">
          {saving ? 'Transfiriendo…' : 'Transferir'}
        </TextureButton>
      </form>

      <div>
        <h2 className="text-sm font-semibold text-brand-950 mb-2">Historial</h2>
        {history.length === 0 ? (
          <p className="text-brand-950/50 font-light text-base">Todavía no se ha hecho ninguna transferencia.</p>
        ) : (
          <ul className="divide-y divide-brand-950/10 rounded-2xl border border-brand-950/10 bg-white">
            {history.map((h) => (
              <li key={h.id} className="px-4 py-3 text-sm">
                <p className="text-brand-950 text-base">
                  <span className="font-medium">
                    {h.quantity} {h.unit} de {h.itemName}
                  </span>{' '}
                  — {h.fromLocationName} → {h.toLocationName}
                </p>
                <p className="text-brand-950/40 font-light mt-0.5 text-xs">{new Date(h.createdAt).toLocaleString('es-VE')}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
