import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calculator, Check, Plus, Save, Search, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { formatBase } from '@/utils/format';
import { computeCostStructure, type CostStructureItem, type MaterialLine } from '@/utils/cost-structure';
import type { Product } from '@/types';
import type { CostStructureConfig } from './CostStructureConfigSection';

interface EditableLine extends MaterialLine {
  key: string;
  /** "Escribir" (texto libre) o "Insumo" (tomado del inventario / preparaciones). */
  mode: 'FREE' | 'INVENTORY';
}

interface MaterialOption {
  id: string;
  name: string;
  unit: string;
  unitCost: number;
  categoryName?: string | null;
}
interface MaterialsCatalog {
  items: MaterialOption[];
  preparations: MaterialOption[];
}

interface ProductSheet {
  product: { id: string; name: string; categoryName: string; price: number; costSource: 'MANUAL' | 'RECIPE'; costBase: number | null };
  materials: (MaterialLine & { totalCost: number })[];
  materialsSource: 'SAVED' | 'RECIPE' | 'MANUAL' | 'EMPTY';
  saved: {
    salePriceBase: number;
    materialsCostBase: number;
    variablePercent: number;
    fixedPercent: number;
    totalCostBase: number;
    netProfitBase: number;
    netMarginPercent: number;
    updatedAt: string;
  } | null;
}

const UNITS = ['und', 'g', 'kg', 'ml', 'l', 'oz', 'lb', 'porción'];
const SOURCE_LABEL: Record<ProductSheet['materialsSource'], string> = {
  SAVED: 'Cargado de la estructura guardada',
  RECIPE: 'Cargado desde la receta (Inventario)',
  MANUAL: 'Cargado del costo manual del producto',
  EMPTY: 'Este producto no tiene costo cargado: añade sus materiales',
};

let keySeq = 0;
const nextKey = () => `l${++keySeq}`;
const blankLine = (mode: EditableLine['mode'] = 'FREE'): EditableLine => ({ key: nextKey(), name: '', quantity: 1, unit: 'und', unitCost: 0, mode });

/**
 * Calculadora de estructura de costo por producto. Todo se recalcula en vivo en el cliente
 * (mismo cálculo que el servidor, ver utils/cost-structure.ts): eliges un producto (o
 * arrancas en blanco), cargas el material utilizado, ajustas el precio, y a la derecha ves
 * cómo se reparte cada bolívar del precio entre materia prima, variables, fijos y utilidad.
 * "Guardar en producto" congela ese cálculo como la ficha del producto (y las estadísticas
 * la leen); los % del restaurante se editan en la pestaña "Elementos".
 */
export function CostStructureCalculator({
  config,
  symbol,
  onItemsPreview,
}: {
  config: CostStructureConfig;
  symbol: string;
  /** La calculadora permite apagar/prender elementos SOLO para este cálculo, sin tocar la config. */
  onItemsPreview?: (items: CostStructureItem[]) => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ProductSheet | null>(null);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [lines, setLines] = useState<EditableLine[]>([blankLine()]);
  const [catalog, setCatalog] = useState<MaterialsCatalog | null>(null);
  const [price, setPrice] = useState('');
  const [items, setItems] = useState<CostStructureItem[]>(config.items);
  const [syncCost, setSyncCost] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/products').then((res) => setProducts(res.data.data as Product[])).catch(() => setProducts([]));
    // Insumos y preparaciones para "Tomar de insumo" (con su costo por unidad, el mismo de las recetas).
    api.get('/cost-structure/materials').then((res) => setCatalog(res.data.data as MaterialsCatalog)).catch(() => setCatalog({ items: [], preparations: [] }));
  }, []);

  // Si cambian los % en "Elementos", la calculadora arranca desde los nuevos.
  useEffect(() => setItems(config.items), [config.items]);
  useEffect(() => onItemsPreview?.(items), [items, onItemsPreview]);

  useEffect(() => {
    if (!selectedId) {
      setSheet(null);
      return;
    }
    let cancelled = false;
    setLoadingSheet(true);
    setError(null);
    api
      .get(`/cost-structure/products/${selectedId}`)
      .then((res) => {
        if (cancelled) return;
        const data = res.data.data as ProductSheet;
        setSheet(data);
        setPrice(String(data.product.price));
        setLines(
          data.materials.length > 0
            ? data.materials.map((m) => ({ ...m, key: nextKey(), mode: m.inventoryItemId || m.preparationId ? 'INVENTORY' : 'FREE' }))
            : [blankLine()],
        );
      })
      .catch((err) => !cancelled && setError(err.response?.data?.error ?? 'No se pudo cargar el producto.'))
      .finally(() => !cancelled && setLoadingSheet(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const result = useMemo(
    () =>
      computeCostStructure({
        salePrice: Number(price) || 0,
        materials: lines,
        items,
        targetNetMarginPercent: config.targetNetMarginPercent,
      }),
    [price, lines, items, config.targetNetMarginPercent],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products).slice(0, 40);
  }, [products, search]);

  function patchLine(key: string, changes: Partial<EditableLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...changes } : l)));
  }
  /** Al elegir un insumo/preparación: nombre, unidad y costo unitario salen del inventario. */
  function pickMaterial(key: string, value: string) {
    if (!value) {
      patchLine(key, { name: '', inventoryItemId: null, preparationId: null });
      return;
    }
    const [kind, id] = value.split(':');
    const opt = (kind === 'prep' ? catalog?.preparations : catalog?.items)?.find((o) => o.id === id);
    if (!opt) return;
    patchLine(key, {
      name: opt.name,
      unit: opt.unit,
      unitCost: opt.unitCost,
      inventoryItemId: kind === 'item' ? opt.id : null,
      preparationId: kind === 'prep' ? opt.id : null,
    });
  }
  function setLineMode(key: string, mode: EditableLine['mode']) {
    // Al pasar a "Escribir" se conserva lo cargado (queda editable) pero se suelta el vínculo.
    patchLine(key, mode === 'FREE' ? { mode, inventoryItemId: null, preparationId: null } : { mode });
  }
  function toggleItem(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, enabled: !i.enabled } : i)));
  }

  async function save() {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.put(`/cost-structure/products/${selectedId}`, {
        salePriceBase: Number(price) || 0,
        syncProductCost: syncCost,
        materials: lines
          .filter((l) => l.name.trim().length > 0)
          .map(({ name, quantity, unit, unitCost, inventoryItemId, preparationId }) => ({
            name,
            quantity,
            unit,
            unitCost,
            inventoryItemId: inventoryItemId ?? null,
            preparationId: preparationId ?? null,
          })),
      });
      setSheet(res.data.data as ProductSheet);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  const priceNum = Number(price) || 0;
  const share = (v: number) => (priceNum > 0 ? Math.max(0, (v / priceNum) * 100) : 0);
  const shares = {
    materials: share(result.materialsCost),
    variable: share(result.variableCost),
    fixed: share(result.fixedCost),
    profit: share(Math.max(0, result.netProfit)),
  };
  const belowTarget = priceNum > 0 && result.netMarginPercent < config.targetNetMarginPercent;
  const stale =
    sheet?.saved &&
    (sheet.saved.salePriceBase !== sheet.product.price ||
      sheet.saved.variablePercent !== result.variablePercent ||
      sheet.saved.fixedPercent !== result.fixedPercent);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* ------------------------------------------------ Entradas ------------------------ */}
      <div className="space-y-5">
        {/* Producto */}
        <section className="rounded-2xl border border-brand-950/10 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-brand-950">1 · Producto</p>
            {selectedId && (
              <button type="button" onClick={() => { setSelectedId(null); setLines([blankLine()]); setPrice(''); }} className="text-xs font-medium text-brand-950/50 underline">
                Cálculo en blanco
              </button>
            )}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-950/30" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto del menú…"
              className="w-full rounded-full border border-brand-950/15 py-2 pl-9 pr-4 text-sm"
            />
          </div>
          <div className="mt-3 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selectedId === p.id ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.05] text-brand-950/70 hover:bg-brand-950/[0.09]'
                }`}
              >
                {p.name} · {formatBase(p.price, symbol)}
              </button>
            ))}
            {filtered.length === 0 && <p className="text-xs font-light text-brand-950/40">Ningún producto coincide.</p>}
          </div>
          {sheet && (
            <p className="mt-3 text-xs text-brand-950/50">
              <span className="font-semibold text-brand-950">{sheet.product.name}</span> · {sheet.product.categoryName} ·{' '}
              {SOURCE_LABEL[sheet.materialsSource]}
              {sheet.saved && (
                <>
                  {' '}
                  · guardado el {new Date(sheet.saved.updatedAt).toLocaleDateString('es-VE')}
                </>
              )}
            </p>
          )}
          {loadingSheet && <p className="mt-2 text-xs text-brand-950/40">Cargando…</p>}
        </section>

        {/* Materiales */}
        <section className="rounded-2xl border border-brand-950/10 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-brand-950">2 · Material utilizado</p>
            <p className="text-xs text-brand-950/50">
              Materia prima: <span className="font-semibold text-brand-950">{formatBase(result.materialsCost, symbol)}</span>
            </p>
          </div>
          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.key} className="rounded-xl border border-brand-950/[0.08] p-2.5">
                <div className="flex items-center gap-2">
                  {/* Escribir / Insumo: texto libre o tomado del inventario (nombre, unidad y costo). */}
                  <div className="flex shrink-0 rounded-lg bg-brand-950/[0.05] p-0.5 text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setLineMode(l.key, 'FREE')}
                      className={`rounded-md px-2 py-1 ${l.mode === 'FREE' ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50'}`}
                    >
                      Escribir
                    </button>
                    <button
                      type="button"
                      onClick={() => setLineMode(l.key, 'INVENTORY')}
                      className={`rounded-md px-2 py-1 ${l.mode === 'INVENTORY' ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50'}`}
                    >
                      Insumo
                    </button>
                  </div>
                  {l.mode === 'FREE' ? (
                    <input
                      value={l.name}
                      onChange={(e) => patchLine(l.key, { name: e.target.value })}
                      placeholder="Ej: Carne 150 g"
                      className="min-w-0 flex-1 rounded-lg border border-brand-950/15 px-3 py-1.5 text-sm"
                    />
                  ) : (
                    <select
                      value={l.preparationId ? `prep:${l.preparationId}` : l.inventoryItemId ? `item:${l.inventoryItemId}` : ''}
                      onChange={(e) => pickMaterial(l.key, e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm text-brand-950"
                    >
                      <option value="">{catalog ? 'Elige un insumo…' : 'Cargando insumos…'}</option>
                      {catalog && catalog.items.length > 0 && (
                        <optgroup label="Insumos">
                          {catalog.items.map((o) => (
                            <option key={o.id} value={`item:${o.id}`}>
                              {o.name} · {formatBase(o.unitCost, symbol)}/{o.unit}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {catalog && catalog.preparations.length > 0 && (
                        <optgroup label="Preparaciones">
                          {catalog.preparations.map((o) => (
                            <option key={o.id} value={`prep:${o.id}`}>
                              {o.name} · {formatBase(o.unitCost, symbol)}/{o.unit}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {catalog && catalog.items.length === 0 && catalog.preparations.length === 0 && (
                        <option value="" disabled>
                          No hay insumos cargados en Inventario
                        </option>
                      )}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => setLines((prev) => (prev.length > 1 ? prev.filter((x) => x.key !== l.key) : [blankLine()]))}
                    aria-label="Quitar material"
                    className="shrink-0 text-brand-950/30 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto] items-end gap-2">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-brand-950/40">
                    Cant.
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={l.quantity}
                      onChange={(e) => patchLine(l.key, { quantity: Number(e.target.value) })}
                      className="mt-0.5 w-full rounded-lg border border-brand-950/15 px-2 py-1.5 text-right text-sm normal-case tracking-normal text-brand-950"
                    />
                  </label>
                  <label className="text-[10px] font-medium uppercase tracking-wide text-brand-950/40">
                    Unidad
                    <select
                      value={l.unit}
                      onChange={(e) => patchLine(l.key, { unit: e.target.value })}
                      disabled={l.mode === 'INVENTORY'}
                      title={l.mode === 'INVENTORY' ? 'La unidad la define el insumo en Inventario' : undefined}
                      className="mt-0.5 w-full rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm normal-case tracking-normal text-brand-950 disabled:bg-brand-950/[0.04] disabled:text-brand-950/60"
                    >
                      {!UNITS.includes(l.unit) && <option value={l.unit}>{l.unit}</option>}
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[10px] font-medium uppercase tracking-wide text-brand-950/40">
                    Costo unit.
                    <div className="relative mt-0.5">
                      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-brand-950/40">{symbol}</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={l.unitCost}
                        onChange={(e) => patchLine(l.key, { unitCost: Number(e.target.value) })}
                        className="w-full rounded-lg border border-brand-950/15 py-1.5 pl-5 pr-2 text-right text-sm normal-case tracking-normal text-brand-950"
                      />
                    </div>
                  </label>
                  <div className="min-w-[72px] text-right">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-brand-950/40">Total</p>
                    <p className="py-1.5 text-sm font-semibold text-brand-950 tabular-nums">
                      {formatBase((Number(l.quantity) || 0) * (Number(l.unitCost) || 0), symbol)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, blankLine('FREE')])}
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-500 hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Escribir material
            </button>
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, blankLine('INVENTORY')])}
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-500 hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Tomar de insumo
            </button>
          </div>
        </section>

        {/* Porcentajes del restaurante */}
        <section className="rounded-2xl border border-brand-950/10 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-brand-950">3 · Costos fijos y variables</p>
            <p className="text-xs text-brand-950/50">
              Fijos {result.fixedPercent.toFixed(2)}% · Variables {result.variablePercent.toFixed(2)}%
            </p>
          </div>
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {(['FIXED', 'VARIABLE'] as const).map((kind) => (
              <div key={kind}>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-brand-950/40">
                  {kind === 'FIXED' ? 'Fijos (prorrateados)' : 'Variables'}
                </p>
                {items
                  .filter((i) => i.kind === kind)
                  .map((i) => (
                    <label key={i.id} className={`flex cursor-pointer items-center justify-between gap-2 py-1 text-sm ${i.enabled ? 'text-brand-950' : 'text-brand-950/40'}`}>
                      <span className="flex items-center gap-2 truncate">
                        <input type="checkbox" checked={i.enabled} onChange={() => toggleItem(i.id)} className="h-4 w-4 accent-brand-500" />
                        <span className="truncate">{i.label}</span>
                      </span>
                      <span className="shrink-0 font-semibold">{Number(i.percent).toFixed(2)}%</span>
                    </label>
                  ))}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] font-light text-brand-950/45">
            Apagar un elemento aquí solo afecta este cálculo. Para cambiar los % del restaurante usa la pestaña "Elementos".
          </p>
        </section>

        {/* Precio */}
        <section className="rounded-2xl border border-brand-950/10 bg-white p-5 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-brand-950">4 · Precio de venta</p>
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-xs text-brand-950/60">
              Precio (base, sin servicio/IVA)
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-brand-950/40">{symbol}</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-40 rounded-xl border border-brand-950/15 py-2 pl-7 pr-3 text-lg font-bold text-brand-950"
                />
              </div>
            </label>
            {result.suggestedPrice != null && (
              <button
                type="button"
                onClick={() => setPrice(String(result.suggestedPrice))}
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-left hover:bg-emerald-100"
              >
                <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">Sugerido para {config.targetNetMarginPercent}% de utilidad</p>
                <p className="text-base font-bold text-emerald-700">{formatBase(result.suggestedPrice, symbol)}</p>
              </button>
            )}
            {result.breakEvenPrice != null && (
              <div className="rounded-xl border border-brand-950/10 px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-brand-950/40">Precio de equilibrio</p>
                <p className="text-base font-bold text-brand-950">{formatBase(result.breakEvenPrice, symbol)}</p>
              </div>
            )}
            {result.suggestedPrice == null && result.materialsCost > 0 && (
              <p className="text-xs text-red-600">Los % fijos + variables + utilidad objetivo llegan al 100 %: no hay precio que cierre.</p>
            )}
          </div>
        </section>
      </div>

      {/* ------------------------------------------------ Resultado ------------------------ */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-3xl bg-brand-950 p-5 text-white shadow-lg shadow-brand-950/20">
          <div className="mb-4 flex items-center gap-2">
            <Calculator className="h-4 w-4 text-sky-300" />
            <p className="text-sm font-semibold">Estructura de costo</p>
          </div>

          <p className="text-[11px] uppercase tracking-wide text-white/50">Utilidad neta por unidad</p>
          <p className={`text-3xl font-extrabold tracking-tight ${result.netProfit < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
            {formatBase(result.netProfit, symbol)}
          </p>
          <p className="mt-0.5 text-sm text-white/70">
            {result.netMarginPercent.toFixed(1)}% del precio · objetivo {config.targetNetMarginPercent}%
          </p>
          {belowTarget && (
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-medium text-amber-200">
              <AlertTriangle className="h-3 w-3" /> Por debajo del objetivo
            </p>
          )}

          {/* Barra de composición */}
          <div className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-white/10">
            <div className="bg-sky-400" style={{ width: `${shares.materials}%` }} title="Materia prima" />
            <div className="bg-amber-400" style={{ width: `${shares.variable}%` }} title="Variables" />
            <div className="bg-rose-400" style={{ width: `${shares.fixed}%` }} title="Fijos" />
            <div className="bg-emerald-400" style={{ width: `${shares.profit}%` }} title="Utilidad" />
          </div>

          <dl className="mt-4 space-y-2 text-sm">
            <Row dot="bg-sky-400" label="Materia prima" value={formatBase(result.materialsCost, symbol)} pct={result.foodCostPercent} />
            <Row dot="bg-amber-400" label={`Variables (${result.variablePercent.toFixed(1)}%)`} value={formatBase(result.variableCost, symbol)} pct={shares.variable} />
            <Row dot="bg-rose-400" label={`Fijos (${result.fixedPercent.toFixed(1)}%)`} value={formatBase(result.fixedCost, symbol)} pct={shares.fixed} />
            <div className="border-t border-white/10 pt-2">
              <Row label="Costo total" value={formatBase(result.totalCost, symbol)} pct={share(result.totalCost)} strong />
            </div>
            <Row dot="bg-emerald-400" label="Utilidad neta" value={formatBase(result.netProfit, symbol)} pct={result.netMarginPercent} strong />
            <div className="border-t border-white/10 pt-2">
              <Row label="Precio de venta" value={formatBase(priceNum, symbol)} pct={priceNum > 0 ? 100 : 0} strong />
            </div>
          </dl>

          <p className="mt-4 text-[11px] text-white/45">
            Food cost {result.foodCostPercent.toFixed(1)}% · Margen bruto{' '}
            {priceNum > 0 ? (((priceNum - result.materialsCost) / priceNum) * 100).toFixed(1) : '0.0'}%
          </p>
        </div>

        {/* Guardar */}
        <div className="mt-3 rounded-2xl border border-brand-950/10 bg-white p-4 shadow-sm">
          {selectedId ? (
            <>
              {stale && (
                <p className="mb-2 flex items-start gap-1.5 text-[11px] text-amber-700">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  La ficha guardada usó otro precio o % — vuelve a guardar para actualizarla.
                </p>
              )}
              {sheet?.product.costSource === 'MANUAL' && (
                <label className="mb-3 flex cursor-pointer items-start gap-2 text-xs text-brand-950/70">
                  <input type="checkbox" checked={syncCost} onChange={(e) => setSyncCost(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-500" />
                  <span>
                    Actualizar el <b>costo del producto</b> con la materia prima ({formatBase(result.materialsCost, symbol)}) — así Margen de utilidad y KPI usan este número.
                  </span>
                </label>
              )}
              {sheet?.product.costSource === 'RECIPE' && (
                <p className="mb-3 text-[11px] font-light text-brand-950/50">
                  Este producto usa receta: su costo lo manda Inventario. Acá solo se guarda la ficha de estructura.
                </p>
              )}
              {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
              <TextureButton variant="primary" size="sm" className="!w-full" onClick={save} disabled={saving || priceNum <= 0}>
                {savedFlash ? (
                  <>
                    <Check className="h-4 w-4" /> Guardado
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" /> {saving ? 'Guardando…' : 'Guardar en producto'}
                  </>
                )}
              </TextureButton>
            </>
          ) : (
            <p className="text-xs font-light text-brand-950/50">Elige un producto arriba para poder guardar esta estructura como su ficha.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function Row({ dot, label, value, pct, strong }: { dot?: string; label: string; value: string; pct: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className={`flex items-center gap-2 ${strong ? 'font-semibold' : 'text-white/80'}`}>
        {dot ? <span className={`h-2 w-2 rounded-full ${dot}`} /> : <span className="h-2 w-2" />}
        {label}
      </dt>
      <dd className="flex items-baseline gap-2 tabular-nums">
        <span className={strong ? 'font-bold' : ''}>{value}</span>
        <span className="w-12 text-right text-[11px] text-white/45">{pct.toFixed(1)}%</span>
      </dd>
    </div>
  );
}
