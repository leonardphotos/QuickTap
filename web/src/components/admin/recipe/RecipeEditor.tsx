import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Copy, FileSpreadsheet, Plus, Upload, X } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS } from '@/utils/format';
import { UNIT_LABELS, SUB_UNITS } from '@/utils/inventoryUnits';
import { TextureButton } from '@/components/ui/texture-button';
import { FilterPill } from '@/components/ui/filter-pill';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Insumo de inventario, tal como lo devuelve GET /inventory. */
export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  quantity: string;
  minQuantity: string;
  pricePerUnitBase: string | null;
  yieldPercent: string;
  correctionPercent: string;
  photoUrl?: string | null;
}

export interface RecipeOverviewRow {
  productId: string;
  name: string;
  photoUrl: string | null;
  categoryName: string | null;
  hasRecipe: boolean;
  ingredientCount: number;
  totalCostBase: string;
}

export interface PreparationOverviewRow {
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

function CopiarATamanoDialog({
  productId,
  desdeId,
  desdeNombre,
  cantidad,
  variantes,
  conteoPorTamano,
  onClose,
  onDone,
}: {
  productId: string;
  desdeId: string | null;
  desdeNombre: string;
  cantidad: number;
  variantes: { id: string; name: string }[];
  conteoPorTamano: (id: string | null) => number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [hasta, setHasta] = useState<string | null | undefined>(undefined);
  const [reemplazar, setReemplazar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Todos los tamaños" es un destino más: son las líneas compartidas del plato.
  const destinos: { id: string | null; nombre: string }[] = [
    { id: null, nombre: 'Todos los tamaños' },
    ...variantes.map((v) => ({ id: v.id as string | null, nombre: v.name })),
  ].filter((d) => d.id !== desdeId);

  const ocupados = hasta !== undefined ? conteoPorTamano(hasta ?? null) : 0;

  async function copiar() {
    if (hasta === undefined) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post(`/inventory/recipes/${productId}/duplicate-variant`, {
        fromVariantId: desdeId,
        toVariantId: hasta,
        replace: reemplazar,
      });
      const d = res.data.data;
      alert(`Se copiaron ${d.copiados} ingrediente(s) de "${d.desde}" a "${d.hasta}".`);
      onDone();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo copiar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copiar a otro tamaño</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-brand-950/60 -mt-1">
          Los {cantidad} ingrediente{cantidad === 1 ? '' : 's'} de{' '}
          <span className="font-medium text-brand-950">{desdeNombre}</span> se copian a:
        </p>

        <div className="rounded-xl border border-brand-950/10 divide-y divide-brand-950/[0.06]">
          {destinos.map((d) => {
            const n = conteoPorTamano(d.id);
            return (
              <button
                key={d.id ?? 'compartidos'}
                type="button"
                onClick={() => {
                  setHasta(d.id);
                  setReemplazar(false);
                }}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm ${
                  hasta !== undefined && (hasta ?? null) === d.id ? 'bg-brand-500/10' : 'hover:bg-brand-950/[0.03]'
                }`}
              >
                <span className="text-brand-950">{d.nombre}</span>
                <span className={`shrink-0 text-[11px] ${n > 0 ? 'text-amber-600' : 'text-brand-950/35'}`}>
                  {n > 0 ? `ya tiene ${n}` : 'vacío'}
                </span>
              </button>
            );
          })}
        </div>

        {ocupados > 0 && (
          <label className="flex items-start gap-2 rounded-xl bg-amber-50/70 p-3 text-[13px] text-amber-900">
            <input
              type="checkbox"
              checked={reemplazar}
              onChange={(e) => setReemplazar(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-amber-300 accent-amber-600"
            />
            <span>
              Ese tamaño ya tiene {ocupados} ingrediente(s). Marca esto para sustituirlos — se borran y no se puede
              deshacer.
            </span>
          </label>
        )}

        <p className="text-[12px] text-brand-950/40 font-light">
          Las cantidades se copian iguales. Si el tamaño lleva más, ajústalas después en su pestaña.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <DialogFooter>
          <TextureButton type="button" variant="minimal" size="default" className="!w-auto" onClick={onClose}>
            Cancelar
          </TextureButton>
          <TextureButton
            type="button"
            variant="brand"
            size="default"
            className="!w-auto disabled:opacity-40"
            disabled={busy || hasta === undefined || (ocupados > 0 && !reemplazar)}
            onClick={copiar}
          >
            {busy ? 'Copiando…' : 'Copiar'}
          </TextureButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Traer la receta de OTRO plato a este — el atajo para los platos que se parecen: la misma
 * hamburguesa con otro término, la pizza que solo cambia un topping. Rearmar quince ingredientes
 * a mano para cambiar uno es donde se cometen los errores.
 *
 * Es la misma llamada que usaba la pantalla de Recetas (POST /inventory/recipes/:origen/duplicate),
 * pero al revés: allá se elegía a dónde mandar la receta abierta, y acá de dónde traerla, porque
 * el usuario ya está parado dentro del plato que quiere llenar.
 */
function CopiarDesdeOtroPlatoDialog({
  destinoId,
  destinoNombre,
  tieneReceta,
  candidatos,
  onClose,
  onDone,
}: {
  destinoId: string;
  destinoNombre: string;
  tieneReceta: boolean;
  candidatos: RecipeOverviewRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [origen, setOrigen] = useState('');
  const [reemplazar, setReemplazar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [resultado, setResultado] = useState<string | null>(null);

  const elegido = candidatos.find((c) => c.productId === origen);
  const visibles = candidatos.filter((c) =>
    busqueda.trim() ? c.name.toLowerCase().includes(busqueda.trim().toLowerCase()) : true,
  );

  async function copiar() {
    if (!origen) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post(`/inventory/recipes/${origen}/duplicate`, {
        targetProductId: destinoId,
        replace: reemplazar,
      });
      const d = res.data.data;
      const avisos = (d.avisos ?? []) as string[];
      setResultado(
        `Se copiaron ${d.copiados} ingrediente(s) de "${d.origen}".` +
          (d.omitidos ? ` Se omitieron ${d.omitidos}.` : '') +
          (avisos.length ? ` ${avisos.join(' ')}` : ''),
      );
      onDone();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo copiar la receta.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copiar receta de otro plato</DialogTitle>
        </DialogHeader>

        {resultado ? (
          <>
            <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">{resultado}</p>
            <DialogFooter>
              <TextureButton type="button" variant="brand" size="default" className="!w-auto" onClick={onClose}>
                Listo
              </TextureButton>
            </DialogFooter>
          </>
        ) : (
          <>
            <p className="-mt-1 text-sm text-brand-950/60">
              Los ingredientes se copian a <span className="font-medium text-brand-950">{destinoNombre}</span>. Elige de
              dónde traerlos:
            </p>

            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar plato…"
              className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
            />

            <div className="max-h-56 overflow-y-auto rounded-xl border border-brand-950/10 divide-y divide-brand-950/[0.06]">
              {visibles.length === 0 && <p className="p-3 text-sm text-brand-950/40">Ningún plato con ese nombre.</p>}
              {visibles.map((c) => (
                <button
                  key={c.productId}
                  type="button"
                  onClick={() => setOrigen(c.productId)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm ${
                    origen === c.productId ? 'bg-brand-500/10' : 'hover:bg-brand-950/[0.03]'
                  }`}
                >
                  <span className="min-w-0 truncate text-brand-950">{c.name}</span>
                  <span className="shrink-0 text-[11px] text-brand-950/35">
                    {c.ingredientCount} ingrediente{c.ingredientCount === 1 ? '' : 's'} · ${c.totalCostBase}
                  </span>
                </button>
              ))}
            </div>

            {/* El aviso mira la receta de ESTE plato, no la del origen: lo que se puede perder
                es lo que ya está armado acá. */}
            {tieneReceta && (
              <label className="flex items-start gap-2 rounded-xl bg-amber-50/70 p-3 text-[13px] text-amber-900">
                <input
                  type="checkbox"
                  checked={reemplazar}
                  onChange={(e) => setReemplazar(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-amber-300 accent-amber-600"
                />
                <span>
                  <strong className="font-semibold">{destinoNombre}</strong> ya tiene ingredientes cargados. Marca esto
                  para sustituirlos — se borran y no se puede deshacer. Sin marcarlo, los de{' '}
                  {elegido ? `"${elegido.name}"` : 'el otro plato'} se suman a los que ya hay.
                </span>
              </label>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <DialogFooter>
              <TextureButton type="button" variant="minimal" size="default" className="!w-auto" onClick={onClose}>
                Cancelar
              </TextureButton>
              <TextureButton
                type="button"
                variant="brand"
                size="default"
                className="!w-auto disabled:opacity-40"
                disabled={busy || !origen}
                onClick={copiar}
              >
                {busy ? 'Copiando…' : 'Copiar receta'}
              </TextureButton>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface RecipeLine {
  id: string;
  type: 'insumo' | 'preparacion' | 'cliente';
  inventoryItemId: string | null;
  preparationId: string | null;
  // "A elección del cliente": se resuelve al servir según el modificador de esta categoría
  // que el cliente eligió (ver order.service.ts#computeRecipeStockDeltas).
  customerChoiceModifierCategoryId: string | null;
  customerChoiceCategoryName: string | null;
  // Topping concreto con porción propia (null = "cualquiera de la categoría").
  customerChoiceModifierId: string | null;
  customerChoiceModifierName: string | null;
  customerChoiceInventoryItemName: string | null;
  // Tamaño al que aplica esta línea — null = todos los tamaños.
  productVariantId: string | null;
  variantName: string | null;
  name: string;
  unit: string;
  stockQuantity: string | null;
  quantity: string;
  costBase: string;
}

/**
 * Editor de la receta de UN plato, embebido en la ventana del producto.
 *
 * Trae sus propios catálogos (insumos, preparaciones, platos con receta) en vez de recibirlos
 * por props: la receta ya no vive en una pantalla que los tenía cargados de antes, sino dentro
 * del formulario del producto, y pedirle a ese formulario que precargue tres listas que casi
 * nadie mira sería cobrarle esa espera a quien solo entra a corregir un precio. Se piden al
 * abrir la pestaña de receta y no antes.
 */
export function RecipePanel({ productId, onSaved }: { productId: string; onSaved: () => void }) {
  const [insumos, setInsumos] = useState<InventoryItem[]>([]);
  const [preparations, setPreparations] = useState<PreparationOverviewRow[]>([]);
  const [platosConReceta, setPlatosConReceta] = useState<RecipeOverviewRow[]>([]);
  const [productName, setProductName] = useState('');
  const [lines, setLines] = useState<RecipeLine[] | null>(null);
  const [totalCostBase, setTotalCostBase] = useState('0.00');
  // Tamaños (variantes de precio) y categorías de modificadores del producto — para el
  // selector de "tamaño" de cada línea y el picker de "A elección del cliente".
  const [variants, setVariants] = useState<{ id: string; name: string }[]>([]);
  const [modifierCategories, setModifierCategories] = useState<
    { id: string; name: string; modifiers: { id: string; name: string; inventoryItemName: string | null; inventoryItemUnit: string | null }[] }[]
  >([]);
  // Pestaña de tamaño activa: '' = "Todos los tamaños" (líneas compartidas). Solo se muestra
  // si el producto tiene variantes — cada receta puede tener sus propias porciones por tamaño.
  const [activeVariantId, setActiveVariantId] = useState('');
  // Diálogo para copiar los ingredientes del tamaño abierto a otro del mismo plato.
  const [copiarTamano, setCopiarTamano] = useState(false);
  // Diálogo para traer la receta completa de OTRO plato a este.
  const [copiarDesde, setCopiarDesde] = useState(false);
  // Nombre tecleado que no existe como insumo y se está por crear. null = no se está creando nada.
  const [crearInsumo, setCrearInsumo] = useState<string | null>(null);
  // Observaciones de la receta (técnica, emplatado, alérgenos): se guardan aparte de los
  // ingredientes, con su propio botón, para no disparar un PATCH por cada tecla.
  const [notes, setNotes] = useState('');
  const [savedNotes, setSavedNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [adding, setAdding] = useState(false);
  // modifierId: solo con ref "cliente:<categoría>" — '' = "cualquier topping" de esa categoría.
  const [newItem, setNewItem] = useState({ ref: '', quantity: '', subUnit: '', modifierId: '' });
  const [error, setError] = useState<string | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: { row: number; message: string }[] } | null>(
    null,
  );
  const importInputRef = useRef<HTMLInputElement>(null);

  const [refType, refId] = newItem.ref.split(':');
  const selectedInsumo = refType === 'insumo' ? insumos.find((i) => i.id === refId) : undefined;
  const selectedPrep = refType === 'prep' ? preparations.find((p) => p.id === refId) : undefined;
  // "A elección del cliente": la porción genérica ("cualquiera") va siempre en gramos (kg/gr),
  // porque no se sabe qué insumo será; un topping concreto se mide en la unidad de SU insumo
  // (un huevo va en "unidad", el queso en kg).
  const selectedCategory = refType === 'cliente' ? modifierCategories.find((c) => c.id === refId) : undefined;
  const selectedTopping = selectedCategory?.modifiers.find((m) => m.id === newItem.modifierId);
  const selectedUnit =
    refType === 'cliente'
      ? (selectedTopping?.inventoryItemUnit ?? 'kg')
      // Un plato incluido en un combo se cuenta en piezas enteras: "2 hamburguesas", no gramos.
      : refType === 'plato'
        ? 'unidad'
        : (selectedInsumo?.unit ?? selectedPrep?.unit ?? '');
  const subUnitOptions = selectedUnit ? SUB_UNITS[selectedUnit] ?? SUB_UNITS.unidad : [];
  const visibleLines = (lines ?? []).filter((l) => (l.productVariantId ?? '') === activeVariantId);
  // Un plato no puede incluirse a sí mismo; los ciclos indirectos los rechaza el servidor.
  const platosParaCombo = platosConReceta.filter((x) => x.productId !== productId && x.hasRecipe);
  // Copiar la receta DE otro plato: cualquiera que ya tenga una, menos este.
  const platosParaCopiar = platosParaCombo;

  function cargarCatalogos() {
    api.get('/inventory', { params: { locationScope: 'LOCAL' } }).then((res) => setInsumos(res.data.data)).catch(() => {});
    api.get('/inventory/preparations').then((res) => setPreparations(res.data.data)).catch(() => {});
    api.get('/inventory/recipes').then((res) => setPlatosConReceta(res.data.data)).catch(() => {});
  }

  useEffect(cargarCatalogos, []);

  function load() {
    api.get(`/inventory/recipes/${productId}`).then((res) => {
      setProductName(res.data.data.productName);
      setLines(res.data.data.ingredients);
      setTotalCostBase(res.data.data.totalCostBase);
      setVariants(res.data.data.variants ?? []);
      setModifierCategories(res.data.data.modifierCategories ?? []);
      const n = res.data.data.recipeNotes ?? '';
      setNotes(n);
      setSavedNotes(n);
    });
  }

  async function saveNotes() {
    setSavingNotes(true);
    setError(null);
    try {
      await api.patch(`/inventory/recipes/${productId}/cascade`, { recipeNotes: notes.trim() || null });
      setSavedNotes(notes.trim());
      setNotes(notes.trim());
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'No se pudieron guardar las observaciones.');
    } finally {
      setSavingNotes(false);
    }
  }

  useEffect(load, [productId]);

  /**
   * Elegir qué se va a agregar. `reciente` deja pasar un insumo que se acaba de crear y que
   * todavía no está en `insumos` (el setState del padre no se ve dentro de este mismo tick).
   */
  function elegirRef(value: string, reciente?: InventoryItem) {
    const [t, rid] = value.split(':');
    if (t === 'cliente') {
      setNewItem({ ref: value, quantity: '', subUnit: 'gr', modifierId: '' });
      return;
    }
    const u =
      t === 'plato'
        ? 'unidad'
        : t === 'insumo'
          ? (reciente?.id === rid ? reciente.unit : insumos.find((i) => i.id === rid)?.unit)
          : preparations.find((p) => p.id === rid)?.unit;
    const defaultSubUnit = u ? (SUB_UNITS[u] ?? SUB_UNITS.unidad)[0]?.value ?? '' : '';
    setNewItem({ ref: value, quantity: '', subUnit: defaultSubUnit, modifierId: '' });
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
      await api.post(`/inventory/recipes/${productId}`, {
        inventoryItemId: refType === 'insumo' ? refId : undefined,
        preparationId: refType === 'prep' ? refId : undefined,
        componentProductId: refType === 'plato' ? refId : undefined,
        customerChoiceModifierCategoryId: refType === 'cliente' ? refId : undefined,
        customerChoiceModifierId: refType === 'cliente' && newItem.modifierId ? newItem.modifierId : undefined,
        productVariantId: activeVariantId || null,
        quantity: quantityInBaseUnit,
      });
      setNewItem({ ref: '', quantity: '', subUnit: '', modifierId: '' });
      setAdding(false);
      load();
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo agregar el ingrediente.');
    }
  }

  async function removeIngredient(id: string) {
    await api.delete(`/inventory/recipes/ingredient/${id}`);
    load();
    onSaved();
  }

  async function downloadImportTemplate() {
    setDownloadingTemplate(true);
    try {
      const res = await api.get(`/inventory/recipes/${productId}/import-template`, { responseType: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(res.data);
      link.download = `receta-${productName || productId}.xlsx`;
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
      const res = await api.post(`/inventory/recipes/${productId}/import`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(res.data.data);
      load();
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo importar el archivo.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Traer la receta de otro plato: el camino más rápido para una carta donde media
                docena de platos comparten la misma base. Se copia HACIA este producto — es la
                dirección que tiene sentido estando parado dentro de él. */}
            <TextureButton
              type="button"
              variant="secondary"
              size="sm"
              className="!w-auto"
              onClick={() => setCopiarDesde(true)}
              disabled={platosParaCopiar.length === 0}
            >
              <Copy className="h-3.5 w-3.5" /> Copiar de otro plato
            </TextureButton>
            <TextureButton type="button" variant="secondary" size="sm" className="!w-auto" disabled={downloadingTemplate} onClick={downloadImportTemplate}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> {downloadingTemplate ? 'Generando…' : 'Descargar plantilla'}
            </TextureButton>
            <TextureButton
              type="button"
              variant="secondary"
              size="sm"
              className="!w-auto"
              disabled={importing}
              onClick={() => importInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" /> {importing ? 'Importando…' : 'Importar Excel'}
            </TextureButton>
            <input ref={importInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportFileChange} />
          </div>

          {copiarDesde && (
            <CopiarDesdeOtroPlatoDialog
              destinoId={productId}
              destinoNombre={productName}
              tieneReceta={(lines ?? []).length > 0}
              candidatos={platosParaCopiar}
              onClose={() => setCopiarDesde(false)}
              onDone={() => {
                load();
                onSaved();
              }}
            />
          )}

          {importResult && (
            <div className="rounded-xl border border-brand-950/10 bg-brand-950/[0.03] p-3 text-xs space-y-1">
              <p className="text-brand-950">
                {importResult.created} creados · {importResult.updated} actualizados
                {importResult.errors.length > 0 && <span className="text-red-600"> · {importResult.errors.length} con error</span>}
              </p>
              {importResult.errors.length > 0 && (
                <ul className="text-red-600 space-y-0.5">
                  {importResult.errors.map((e, i) => (
                    <li key={i}>
                      Fila {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {variants.length > 0 && (
            <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max items-center gap-1.5">
                <FilterPill active={activeVariantId === ''} onClick={() => setActiveVariantId('')}>
                  Todos los tamaños
                </FilterPill>
                {variants.map((v) => (
                  <FilterPill key={v.id} active={activeVariantId === v.id} onClick={() => setActiveVariantId(v.id)}>
                    {v.name}
                  </FilterPill>
                ))}
              </div>
            </div>
          )}
          {variants.length > 0 && (
            <div className="flex items-start justify-between gap-3 -mt-1">
              <p className="text-xs text-brand-950/40 font-light">
                {activeVariantId === ''
                  ? 'Ingredientes compartidos: se usan sin importar el tamaño que se venda.'
                  : `Ingredientes solo de "${variants.find((v) => v.id === activeVariantId)?.name}" — además de los compartidos.`}
              </p>
              {/* Copiar a otro tamaño: solo tiene sentido si el tamaño abierto ya tiene líneas
                  propias y hay a dónde copiarlas. */}
              {visibleLines.length > 0 && variants.length > (activeVariantId === '' ? 0 : 1) && (
                <button
                  type="button"
                  onClick={() => setCopiarTamano(true)}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-brand-950/10 px-2 py-1 text-[11px] font-medium text-brand-950/50 hover:text-brand-500 hover:border-brand-500/30"
                >
                  <Copy className="h-3 w-3" /> Copiar a otro tamaño
                </button>
              )}
            </div>
          )}

          {copiarTamano && (
            <CopiarATamanoDialog
              productId={productId}
              desdeId={activeVariantId || null}
              desdeNombre={activeVariantId ? (variants.find((v) => v.id === activeVariantId)?.name ?? '') : 'Todos los tamaños'}
              cantidad={visibleLines.length}
              variantes={variants}
              conteoPorTamano={(id: string | null) => (lines ?? []).filter((l) => (l.productVariantId ?? '') === (id ?? '')).length}
              onClose={() => setCopiarTamano(false)}
              onDone={load}
            />
          )}

          {visibleLines.length === 0 && !adding && (
            <p className="text-sm text-brand-950/40 font-light">
              {variants.length > 0 && activeVariantId !== ''
                ? 'Este tamaño todavía no tiene ingredientes propios.'
                : 'Este producto todavía no tiene ingredientes.'}
            </p>
          )}

          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {visibleLines.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 border-b border-brand-950/10 pb-2">
                <div className="text-sm">
                  <p className="font-medium text-brand-950 flex items-center gap-1.5">
                    {l.type === 'preparacion' && <span title="Preparación">🍯</span>}
                    {l.type === 'cliente' && (
                      <span className="text-[10px] font-medium uppercase tracking-wide text-brand-500 bg-brand-500/10 rounded-full px-2 py-0.5">
                        {l.customerChoiceModifierId ? 'Topping' : 'A elección del cliente'}
                      </span>
                    )}
                    {l.name}
                    {l.customerChoiceInventoryItemName && (
                      <span className="text-xs font-light text-brand-950/40">→ {l.customerChoiceInventoryItemName}</span>
                    )}
                  </p>
                  <p className="text-xs text-brand-950/50 font-light">
                    {l.quantity} {UNIT_LABELS[l.unit] ?? l.unit} · $
                    {l.costBase}
                  </p>
                </div>
                <button type="button" onClick={() => removeIngredient(l.id)} className="text-brand-950/30 hover:text-red-600">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>

          {adding ? (
            <div className="rounded-xl bg-brand-950/[0.04] p-3 space-y-2">
              <IngredientePicker
                value={newItem.ref}
                insumos={insumos}
                preparations={preparations}
                platos={platosParaCombo}
                modifierCategories={modifierCategories}
                onPick={elegirRef}
                onCrearInsumo={setCrearInsumo}
              />
              {crearInsumo !== null && (
                <CrearInsumoDialog
                  nombre={crearInsumo}
                  onClose={() => setCrearInsumo(null)}
                  onCreated={(item) => {
                    // Recién creado: entra al catálogo y queda elegido, para que armar la receta
                    // no se interrumpa por haber tenido que crear el insumo a mitad de camino.
                    setInsumos((prev) => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)));
                    setCrearInsumo(null);
                    elegirRef(`insumo:${item.id}`, item);
                  }}
                />
              )}
              {refType === 'cliente' && selectedCategory && (
                <>
                  <select
                    value={newItem.modifierId}
                    onChange={(e) => {
                      const mod = selectedCategory.modifiers.find((m) => m.id === e.target.value);
                      const unit = mod?.inventoryItemUnit ?? 'kg';
                      const first = (SUB_UNITS[unit] ?? SUB_UNITS.unidad)[0]?.value ?? '';
                      // Genérico y toppings en kg/lt: por defecto la sub-unidad chica (gr/ml).
                      const small = (SUB_UNITS[unit] ?? []).find((u) => u.toBase < 1)?.value;
                      setNewItem({ ...newItem, modifierId: e.target.value, quantity: '', subUnit: small ?? first });
                    }}
                    className="w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm"
                  >
                    <option value="">Cualquier topping de "{selectedCategory.name}" (misma porción para todos)</option>
                    {selectedCategory.modifiers.map((m) => (
                      <option key={m.id} value={m.id} disabled={!m.inventoryItemName}>
                        {m.name}
                        {m.inventoryItemName ? ` → ${m.inventoryItemName}` : ' (sin insumo vinculado — no descuenta stock)'}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-brand-950/50 font-light">
                    {selectedTopping
                      ? `Si el cliente elige "${selectedTopping.name}", al servir se descuenta esta porción de ${selectedTopping.inventoryItemName}. Le gana a la porción genérica de "${selectedCategory.name}".`
                      : `Porción por defecto: al servir se descuentan estos gramos del insumo del topping que el cliente eligió en "${selectedCategory.name}" — salvo los toppings que tengan porción propia.`}
                  </p>
                </>
              )}
              {modifierCategories.length === 0 && (
                <p className="text-xs text-brand-950/40 font-light">
                  Para agregar "A elección del cliente" primero asocia una categoría de modificadores a este producto
                  (Productos → Modificadores → Asociar / Desasociar).
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={newItem.quantity}
                  onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value.replace(/[^0-9.]/g, '') })}
                  placeholder="Cantidad usada"
                  className="border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm"
                />
                <select
                  value={newItem.subUnit}
                  onChange={(e) => setNewItem({ ...newItem, subUnit: e.target.value })}
                  disabled={!selectedUnit}
                  className="border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm disabled:opacity-50"
                >
                  {subUnitOptions.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-brand-950/40">El costo se calcula automáticamente según el precio/rendimiento del ingrediente.</p>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <TextureButton type="button" variant="brand" size="sm" className="!w-auto" onClick={addIngredient}>
                  Guardar ingrediente
                </TextureButton>
                <TextureButton type="button" variant="minimal" size="sm" className="!w-auto" onClick={() => setAdding(false)}>
                  Cancelar
                </TextureButton>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:underline"
            >
              <Plus className="h-4 w-4" /> Añadir ingrediente
            </button>
          )}

          <div className="pt-3 border-t border-brand-950/10 flex items-center justify-between">
            <span className="text-sm text-brand-950/60">Costo total del producto</span>
            <span className="text-lg font-semibold text-brand-950">${totalCostBase}</span>
          </div>

          {/* Observaciones: técnica de preparación, emplatado, alérgenos, notas para cocina. */}
          <div className="pt-3 border-t border-brand-950/10">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor={`recipe-notes-${productId}`} className="text-sm font-medium text-brand-950">
                Observaciones
              </label>
              <span className="text-[11px] text-brand-950/40">{notes.length}/3000</span>
            </div>
            <textarea
              id={`recipe-notes-${productId}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 3000))}
              rows={3}
              placeholder="Ej: Sellar la carne 2 min por lado; el pan va tostado con mantequilla; contiene gluten y lácteos."
              className="w-full resize-y rounded-xl border border-brand-950/15 px-3 py-2 text-sm text-brand-950 placeholder:text-brand-950/30"
            />
            {notes.trim() !== savedNotes && (
              <div className="mt-2 flex items-center gap-2">
                <TextureButton type="button" variant="brand" size="sm" className="!w-auto" onClick={saveNotes} disabled={savingNotes}>
                  {savingNotes ? 'Guardando…' : 'Guardar observaciones'}
                </TextureButton>
                <TextureButton type="button" variant="minimal" size="sm" className="!w-auto" onClick={() => setNotes(savedNotes)} disabled={savingNotes}>
                  Descartar
                </TextureButton>
              </div>
            )}
          </div>

          <PriceCascadeSection productId={productId} />
        </div>
    </>
  );
}

interface CascadeData {
  costoMP: string;
  resguardoPercent: string;
  resguardo: string;
  costoReceta: string;
  targetFoodCostPercent: string;
  baseSugerida: string;
  servicioPercent: number;
  servicioInfo: string;
  /** El restaurante cobra servicio (si no, el interruptor va en gris). */
  servicioDisponible: boolean;
  aplicaServicio: boolean;
  ivaPercent: number;
  ivaInfo: string;
  ivaDisponible: boolean;
  aplicaIva: boolean;
  pvpSugeridoConImpuestos: string;
  precioActual: string;
  foodCostReal: string;
  margen: string;
}

/** Cascada de precio sugerido: costo -> resguardo -> food cost objetivo -> PVP sugerido,
 * comparado contra el precio actual del producto. Colapsable para no saturar el diálogo de
 * receta cuando el usuario solo quiere agregar ingredientes. */
function PriceCascadeSection({ productId }: { productId: string }) {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CascadeData | null>(null);
  const [resguardo, setResguardo] = useState('');
  const [targetFoodCost, setTargetFoodCost] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    api.get(`/inventory/recipes/${productId}/cascade`).then((res) => {
      setData(res.data.data);
      setResguardo(res.data.data.resguardoPercent);
      setTargetFoodCost(res.data.data.targetFoodCostPercent);
    });
  }

  useEffect(() => {
    if (open && !data) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save(extra?: { recipeApplyService?: boolean; recipeApplyIva?: boolean }) {
    setSaving(true);
    try {
      const res = await api.patch(`/inventory/recipes/${productId}/cascade`, {
        recipeBufferPercent: Number(resguardo) || 0,
        recipeTargetFoodCostPercent: Number(targetFoodCost) || 40,
        ...extra,
      });
      setData(res.data.data);
    } finally {
      setSaving(false);
    }
  }

  const foodCostNum = data ? Number(data.foodCostReal) : 0;
  const targetNum = data ? Number(data.targetFoodCostPercent) : 40;
  const foodCostColor = foodCostNum <= targetNum ? 'text-emerald-600' : foodCostNum <= targetNum + 10 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="pt-3 border-t border-brand-950/10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:underline"
      >
        Precio sugerido {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs">
              <span className="text-brand-950/60">Resguardo % (fallas al emplatar)</span>
              <input
                value={resguardo}
                onChange={(e) => setResguardo(e.target.value.replace(/[^0-9.]/g, ''))}
                className="mt-1 w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="text-brand-950/60">Food cost objetivo %</span>
              <input
                value={targetFoodCost}
                onChange={(e) => setTargetFoodCost(e.target.value.replace(/[^0-9.]/g, ''))}
                className="mt-1 w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm"
              />
            </label>
          </div>
          {/* Interruptores de Servicio e IVA: deciden si el PVP sugerido los suma. No tocan
              lo que se le cobra al cliente — eso lo manda Ajustes del restaurante. */}
          {data && (
            <div className="flex flex-wrap gap-2">
              <CascadeToggle
                label={`Servicio ${data.servicioDisponible ? `${data.servicioPercent || 10}%` : ''}`.trim()}
                checked={data.aplicaServicio}
                disabled={!data.servicioDisponible || saving}
                disabledHint="Tu restaurante no cobra servicio"
                onChange={(v) => save({ recipeApplyService: v })}
              />
              <CascadeToggle
                label={`IVA ${data.ivaDisponible ? `${data.ivaPercent || 16}%` : ''}`.trim()}
                checked={data.aplicaIva}
                disabled={!data.ivaDisponible || saving}
                disabledHint="Tu restaurante no cobra IVA"
                onChange={(v) => save({ recipeApplyIva: v })}
              />
            </div>
          )}

          <TextureButton type="button" variant="minimal" size="sm" className="!w-auto" disabled={saving} onClick={() => save()}>
            {saving ? 'Guardando…' : 'Recalcular'}
          </TextureButton>

          {data && (
            <div className="rounded-xl bg-brand-950/[0.04] p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-brand-950/60">Costo materia prima</span>
                <span className="font-medium text-brand-950">
                  {symbol}
                  {data.costoMP}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-950/60">Resguardo {data.resguardoPercent}%</span>
                <span className="font-medium text-brand-950">
                  {symbol}
                  {data.resguardo}
                </span>
              </div>
              <div className="flex justify-between font-semibold">
                <span className="text-brand-950">Costo de la receta</span>
                <span className="text-brand-950">
                  {symbol}
                  {data.costoReceta}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-950/60">Base sugerida (FC {data.targetFoodCostPercent}%)</span>
                <span className="font-medium text-brand-950">
                  {symbol}
                  {data.baseSugerida}
                </span>
              </div>
              {data.servicioPercent > 0 && (
                <div className="flex justify-between">
                  <span className="text-brand-950/60">+ Servicio {data.servicioPercent}%</span>
                  <span className="font-medium text-brand-950">
                    {symbol}
                    {data.servicioInfo}
                  </span>
                </div>
              )}
              {data.ivaPercent > 0 && (
                <div className="flex justify-between">
                  <span className="text-brand-950/60">+ IVA {data.ivaPercent}%</span>
                  <span className="font-medium text-brand-950">
                    {symbol}
                    {data.ivaInfo}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-semibold pt-1 border-t border-brand-950/10">
                <span className="text-brand-500">PVP sugerido</span>
                <span className="text-brand-500">
                  {symbol}
                  {data.baseSugerida}
                  {(data.servicioPercent > 0 || data.ivaPercent > 0) && ` (${symbol}${data.pvpSugeridoConImpuestos} con imp.)`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-950/60">Precio actual del producto</span>
                <span className="font-medium text-brand-950">
                  {symbol}
                  {data.precioActual}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-950/60">Food cost teórico real</span>
                <span className={`font-semibold ${foodCostColor}`}>{data.foodCostReal}%</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span className="text-brand-950">Margen de contribución</span>
                <span className={Number(data.margen) >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                  {symbol}
                  {data.margen}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Interruptor de la cascada (Servicio / IVA): se guarda al tocarlo y recalcula el PVP. */
function CascadeToggle({
  label,
  checked,
  disabled,
  disabledHint,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  disabledHint?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? disabledHint : undefined}
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-45 ${
        checked && !disabled
          ? 'border-brand-500/30 bg-brand-500/10 text-brand-700'
          : 'border-brand-950/10 bg-brand-950/[0.04] text-brand-950/50'
      }`}
    >
      <span
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
          checked && !disabled ? 'bg-brand-500' : 'bg-brand-950/20'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${checked && !disabled ? 'left-[14px]' : 'left-0.5'}`}
        />
      </span>
      {label}
    </button>
  );
}

// -----------------------------------------------------------------------------
//  Transferencia de insumos: mueve cantidad de un insumo de una sede a otra dentro
//  del mismo grupo (sede principal + sucursales), o hacia/desde Casa Matriz.
// -----------------------------------------------------------------------------


/** Una opción del buscador de ingrediente, ya aplanada para poder filtrarla por nombre. */
interface OpcionIngrediente {
  ref: string;
  grupo: string;
  nombre: string;
  detalle: string;
}

/**
 * Buscador de ingrediente que además CREA el insumo si no existe.
 *
 * Antes era un <select> con todo el inventario adentro: con cien insumos, encontrar "cebolla
 * morada" era bajar una lista, y si no estaba, había que abandonar la receta, irse a Inventario,
 * crearlo y volver a empezar. Acá se escribe el nombre: si ya existe se elige y queda vinculado,
 * y si no, la última fila del desplegable ofrece crearlo sin salir de la receta.
 */
function IngredientePicker({
  value,
  insumos,
  preparations,
  platos,
  modifierCategories,
  onPick,
  onCrearInsumo,
}: {
  value: string;
  insumos: InventoryItem[];
  preparations: PreparationOverviewRow[];
  platos: RecipeOverviewRow[];
  modifierCategories: { id: string; name: string }[];
  onPick: (ref: string) => void;
  onCrearInsumo: (nombre: string) => void;
}) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);

  const opciones: OpcionIngrediente[] = [
    ...insumos.map((i) => ({
      ref: `insumo:${i.id}`,
      grupo: 'Insumos',
      nombre: i.name,
      detalle: UNIT_LABELS[i.unit] ?? i.unit,
    })),
    ...preparations.map((p) => ({ ref: `prep:${p.id}`, grupo: 'Preparaciones', nombre: `🍯 ${p.name}`, detalle: '' })),
    // Combos: incluir otro plato entero con su receta. El que se está editando ya viene
    // excluido de la lista; los ciclos indirectos los rechaza el servidor.
    ...platos.map((pl) => ({
      ref: `plato:${pl.productId}`,
      grupo: 'Otro plato (combo)',
      nombre: `🍽️ ${pl.name}`,
      detalle: `$${pl.totalCostBase}`,
    })),
    ...modifierCategories.map((c) => ({
      ref: `cliente:${c.id}`,
      grupo: 'A elección del cliente',
      nombre: c.name,
      detalle: '',
    })),
  ];

  const elegido = opciones.find((o) => o.ref === value);
  const busca = texto.trim().toLowerCase();
  const visibles = busca ? opciones.filter((o) => o.nombre.toLowerCase().includes(busca)) : opciones;
  const grupos = [...new Set(visibles.map((o) => o.grupo))];
  // Solo se ofrece crear cuando no hay un insumo que ya se llame exactamente así: escribir el
  // nombre de algo que existe tiene que vincularlo, no duplicarlo.
  const yaExiste = insumos.some((i) => i.name.trim().toLowerCase() === busca);
  const puedeCrear = busca.length >= 2 && !yaExiste;

  if (elegido && !abierto) {
    return (
      <button
        type="button"
        onClick={() => {
          setTexto('');
          setAbierto(true);
        }}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-brand-950/15 bg-white px-2.5 py-1.5 text-left text-sm"
      >
        <span className="min-w-0 truncate text-brand-950">{elegido.nombre}</span>
        <span className="shrink-0 text-xs text-brand-950/40">{elegido.detalle || 'Cambiar'}</span>
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <input
        autoFocus
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        placeholder="Escribe el ingrediente…"
        className="w-full rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
      />
      {abierto && (
        <div className="max-h-52 overflow-y-auto rounded-lg border border-brand-950/10 bg-white">
          {grupos.map((g) => (
            <div key={g}>
              <p className="sticky top-0 bg-brand-950/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-brand-950/40">
                {g}
              </p>
              {visibles
                .filter((o) => o.grupo === g)
                .map((o) => (
                  <button
                    key={o.ref}
                    type="button"
                    onClick={() => {
                      onPick(o.ref);
                      setAbierto(false);
                      setTexto('');
                    }}
                    className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-brand-500/10"
                  >
                    <span className="min-w-0 truncate text-brand-950">{o.nombre}</span>
                    {o.detalle && <span className="shrink-0 text-xs text-brand-950/40">{o.detalle}</span>}
                  </button>
                ))}
            </div>
          ))}
          {puedeCrear && (
            <button
              type="button"
              onClick={() => {
                onCrearInsumo(texto.trim());
                setAbierto(false);
              }}
              className="flex w-full items-center gap-1.5 border-t border-brand-950/10 px-2.5 py-2 text-left text-sm font-medium text-brand-500 hover:bg-brand-500/10"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">Crear el insumo “{texto.trim()}”</span>
            </button>
          )}
          {visibles.length === 0 && !puedeCrear && (
            <p className="px-2.5 py-3 text-sm text-brand-950/40">Escribe al menos dos letras para crear un insumo nuevo.</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Alta rápida de un insumo sin salir de la receta. Pide lo mínimo que el inventario necesita
 * para poder costear: cuánto se compró, qué costó y cuándo vence. El resto (foto, categoría,
 * rendimiento, envase) se ajusta después desde Inventario y no bloquea armar la receta.
 */
function CrearInsumoDialog({
  nombre,
  onClose,
  onCreated,
}: {
  nombre: string;
  onClose: () => void;
  onCreated: (item: InventoryItem) => void;
}) {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [form, setForm] = useState({ name: nombre, unit: 'kg', quantity: '', price: '', minQuantity: '', expiryDate: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    if (!form.name.trim()) return setError('Ponle un nombre al insumo.');
    if (!form.expiryDate) return setError('La fecha de caducidad es obligatoria.');
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/inventory', {
        name: form.name.trim(),
        unit: form.unit,
        quantity: Number(form.quantity) || 0,
        minQuantity: Number(form.minQuantity) || 0,
        price: form.price ? Number(form.price) : undefined,
        expiryDate: form.expiryDate,
      });
      onCreated(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo crear el insumo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear insumo</DialogTitle>
        </DialogHeader>
        <p className="-mt-1 text-sm text-brand-950/60">
          Este insumo todavía no existe en tu inventario. Créalo acá y queda vinculado a la receta al instante.
        </p>

        <label className="block text-sm">
          <span className="text-xs text-brand-950/60">Nombre</span>
          <input
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
          />
        </label>

        <label className="block text-sm">
          <span className="text-xs text-brand-950/60">¿Cómo se mide?</span>
          <select
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
          >
            <option value="kg">Kilos (para pesar: carnes, harinas, verduras)</option>
            <option value="lt">Litros (para líquidos: aceite, leche, salsas)</option>
            <option value="unidad">Unidades (para contar: huevos, panes, latas)</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="text-xs text-brand-950/60">Cantidad que compraste</span>
            <input
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value.replace(/[^0-9.]/g, '') })}
              placeholder="0"
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-brand-950/60">Lo que costó ({symbol})</span>
            <input
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^0-9.]/g, '') })}
              placeholder="0"
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <p className="-mt-1 text-xs font-light text-brand-950/40">
          El costo de la receta sale de acá: si compraste 5 {form.unit === 'unidad' ? 'unidades' : form.unit} por{' '}
          {symbol}15, cada {form.unit === 'unidad' ? 'unidad' : form.unit} cuesta {symbol}3.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="text-xs text-brand-950/60">Avisar al quedar</span>
            <input
              value={form.minQuantity}
              onChange={(e) => setForm({ ...form, minQuantity: e.target.value.replace(/[^0-9.]/g, '') })}
              placeholder="0"
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-brand-950/60">Se vence el</span>
            <input
              value={form.expiryDate}
              onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
              type="date"
              className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
            />
          </label>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <DialogFooter>
          <TextureButton type="button" variant="minimal" size="default" className="!w-auto" onClick={onClose}>
            Cancelar
          </TextureButton>
          <TextureButton type="button" variant="brand" size="default" className="!w-auto disabled:opacity-40" disabled={busy} onClick={crear}>
            {busy ? 'Creando…' : 'Crear y vincular'}
          </TextureButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
