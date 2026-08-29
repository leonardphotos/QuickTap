import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { FileSpreadsheet, Images, ListPlus, Pencil, Plus, Search, Tag, Trash2, Upload, X } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Category, Kitchen, Product } from '../../types';
import { CURRENCY_SYMBOLS, formatBase } from '../../utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard } from '@/components/ui/texture-card';
import { ProductFormDialog } from '@/components/admin/ProductFormDialog';
import { CategoryDialog } from '@/components/admin/CategoryDialog';
import { ModifierCategoriesDialog } from '@/components/admin/ModifierCategoriesDialog';

/** Minúsculas y sin acentos, para que el buscador no dependa de cómo se tipeó. */
function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export default function ProductsPage() {
  const { restaurant } = useAuth();
  const currencySymbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [kitchens, setKitchens] = useState<Kitchen[]>([]);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [modifiersDialogOpen, setModifiersDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: { row: number; message: string }[] } | null>(
    null,
  );
  const [importError, setImportError] = useState<string | null>(null);
  // Carga inicial del catálogo completo en un solo Excel (Productos + Insumos + Modificadores
  // + Recetas, con las fotos pegadas en la hoja). Ver catalog-import.service.ts.
  const [catalogBusy, setCatalogBusy] = useState<'plantilla' | 'subiendo' | null>(null);
  const [catalogResult, setCatalogResult] = useState<
    { hojas: { hoja: string; creados: number; actualizados: number; errores: { row: number; message: string }[] }[]; fotosSubidas: number } | null
  >(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photosResult, setPhotosResult] = useState<{
    matched: { fileName: string; productName: string }[];
    unmatched: string[];
  } | null>(null);
  const [photosError, setPhotosError] = useState<string | null>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);

  function load() {
    api.get('/products').then((res) => setProducts(res.data.data));
    api.get('/categories').then((res) => setCategories(res.data.data));
    api.get('/kitchens').then((res) => setKitchens(res.data.data));
  }

  useEffect(load, []);

  async function toggleAvailable(p: Product) {
    await api.patch(`/products/${p.id}`, { isAvailable: !p.isAvailable });
    load();
  }

  async function remove(id: string) {
    if (!confirm('¿Borrar este producto?')) return;
    await api.delete(`/products/${id}`);
    load();
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
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((p) => p.id))));
  }

  async function bulkRemove() {
    if (selected.size === 0) return;
    if (!confirm(`¿Borrar ${selected.size} producto${selected.size === 1 ? '' : 's'} seleccionado${selected.size === 1 ? '' : 's'}?`)) return;
    setBulkDeleting(true);
    try {
      await api.post('/products/bulk-delete', { ids: Array.from(selected) });
      setSelected(new Set());
      load();
    } finally {
      setBulkDeleting(false);
    }
  }

  function openCreate() {
    setEditingProduct(null);
    setProductDialogOpen(true);
  }

  async function downloadImportTemplate() {
    setDownloadingTemplate(true);
    try {
      const res = await api.get('/products/import-template', { responseType: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(res.data);
      link.download = 'plantilla-productos.xlsx';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      setImportError('No se pudo generar la plantilla. Intenta de nuevo.');
    } finally {
      setDownloadingTemplate(false);
    }
  }

  async function descargarPlantillaCatalogo() {
    setCatalogBusy('plantilla');
    try {
      const res = await api.get('/products/catalog-template', { responseType: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(res.data);
      link.download = 'catalogo-quicktap.xlsx';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      setImportError('No se pudo generar la plantilla. Intenta de nuevo.');
    } finally {
      setCatalogBusy(null);
    }
  }

  async function subirCatalogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCatalogBusy('subiendo');
    setCatalogResult(null);
    setImportError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/products/catalog-import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setCatalogResult(res.data.data);
      load();
    } catch (err: any) {
      setImportError(err.response?.data?.error ?? 'No se pudo cargar el catálogo.');
    } finally {
      setCatalogBusy(null);
    }
  }

  async function handleImportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/products/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data.data);
      load();
    } catch (err: any) {
      setImportError(err.response?.data?.error ?? 'No se pudo importar el archivo.');
    } finally {
      setImporting(false);
    }
  }

  async function handlePhotosFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setUploadingPhotos(true);
    setPhotosResult(null);
    setPhotosError(null);
    try {
      const form = new FormData();
      files.forEach((file) => form.append('photos', file));
      const res = await api.post('/products/bulk-photos', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPhotosResult(res.data.data);
      load();
    } catch (err: any) {
      setPhotosError(err.response?.data?.error ?? 'No se pudieron subir las fotos.');
    } finally {
      setUploadingPhotos(false);
    }
  }

  // El filtro corre en memoria porque GET /products ya trae el catálogo completo
  // (sin paginar); ignora acentos para que "cesar" encuentre "César".
  const filtered = useMemo(() => {
    const q = normalize(query);
    return products.filter((p) => {
      if (categoryFilter && p.categoryId !== categoryFilter) return false;
      if (!q) return true;
      return [p.name, p.category?.name, p.sku].some((field) => normalize(field).includes(q));
    });
  }, [products, query, categoryFilter]);

  // Solo categorías que tienen al menos un producto, en el mismo orden que ya
  // usa el catálogo — no tiene sentido ofrecer un chip que siempre vacía la lista.
  const categoriesWithProducts = useMemo(() => {
    const idsWithProducts = new Set(products.map((p) => p.categoryId));
    return categories.filter((c) => idsWithProducts.has(c.id));
  }, [products, categories]);

  function openEdit(p: Product) {
    setEditingProduct(p);
    setProductDialogOpen(true);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Productos</h1>

      <div className="flex flex-wrap gap-2">
        <TextureButton
          variant="brand"
          size="default"
          className="!w-auto flex items-center gap-1.5 whitespace-nowrap"
          onClick={openCreate}
        >
          <Plus className="h-4 w-4" /> Nuevo producto
        </TextureButton>
        <TextureButton
          variant="minimal"
          size="default"
          className="!w-auto flex items-center gap-1.5 whitespace-nowrap"
          onClick={() => setCategoryDialogOpen(true)}
        >
          <Tag className="h-4 w-4" /> Nueva categoría
        </TextureButton>
        <TextureButton
          variant="minimal"
          size="default"
          className="!w-auto flex items-center gap-1.5 whitespace-nowrap"
          onClick={() => setModifiersDialogOpen(true)}
        >
          <ListPlus className="h-4 w-4" /> Modificadores
        </TextureButton>
        <TextureButton
          variant="minimal"
          size="default"
          className="!w-auto flex items-center gap-1.5 whitespace-nowrap"
          disabled={downloadingTemplate}
          onClick={downloadImportTemplate}
        >
          <FileSpreadsheet className="h-4 w-4" /> {downloadingTemplate ? 'Generando…' : 'Descargar plantilla'}
        </TextureButton>
        <TextureButton
          variant="minimal"
          size="default"
          className="!w-auto flex items-center gap-1.5 whitespace-nowrap"
          disabled={importing}
          onClick={() => importInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" /> {importing ? 'Importando…' : 'Importar Excel'}
        </TextureButton>
        <input ref={importInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportFileChange} />
        <TextureButton
          variant="minimal"
          size="default"
          className="!w-auto flex items-center gap-1.5 whitespace-nowrap"
          disabled={uploadingPhotos}
          onClick={() => photosInputRef.current?.click()}
        >
          <Images className="h-4 w-4" /> {uploadingPhotos ? 'Subiendo…' : 'Subir fotos por nombre'}
        </TextureButton>
        <input
          ref={photosInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={handlePhotosFileChange}
        />
      </div>

      {importError && <p className="text-sm text-red-600">{importError}</p>}

      {photosError && <p className="text-sm text-red-600">{photosError}</p>}

      {photosResult && (
        <div className="rounded-xl border border-brand-950/10 bg-white p-4 text-sm">
          <p className="font-medium text-brand-950">
            {photosResult.matched.length} foto{photosResult.matched.length === 1 ? '' : 's'} vinculada
            {photosResult.matched.length === 1 ? '' : 's'}
            {photosResult.unmatched.length > 0 && (
              <span className="text-amber-600"> · {photosResult.unmatched.length} sin producto coincidente</span>
            )}
          </p>
          <p className="mt-1 text-xs font-light text-brand-950/50">
            Cada foto se vincula al producto cuyo nombre coincide con el nombre del archivo (sin la extensión, sin
            importar mayúsculas ni acentos). Ej: "Hamburguesa Clásica.jpg" → producto "Hamburguesa Clásica".
          </p>
          {photosResult.unmatched.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-amber-700">
              {photosResult.unmatched.map((name, i) => (
                <li key={i}>"{name}" no coincide con ningún producto.</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ---------- Carga inicial: TODO el catálogo en un solo Excel ---------- */}
      <div className="rounded-2xl border border-brand-500/25 bg-brand-500/[0.04] p-4">
        <p className="text-sm font-semibold text-brand-950">Cargar todo el catálogo con un Excel</p>
        <p className="mt-0.5 text-xs font-light text-brand-950/60">
          Una sola plantilla con cuatro hojas: productos (con la foto pegada en la celda), insumos, modificadores y
          recetas. Llena solo lo que necesites y súbela — puedes volver a subirla corregida sin duplicar nada.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <TextureButton
            variant="secondary"
            size="sm"
            className="!w-auto"
            disabled={catalogBusy !== null}
            onClick={descargarPlantillaCatalogo}
          >
            {catalogBusy === 'plantilla' ? 'Generando…' : 'Descargar plantilla completa'}
          </TextureButton>
          <label className="inline-flex">
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={subirCatalogo} disabled={catalogBusy !== null} />
            <TextureButton variant="brand" size="sm" className="!w-auto" asChild>
              <span>{catalogBusy === 'subiendo' ? 'Cargando…' : 'Subir catálogo'}</span>
            </TextureButton>
          </label>
        </div>
      </div>

      {catalogResult && (
        <div className="rounded-xl border border-brand-950/10 bg-white p-4 text-sm">
          <p className="font-medium text-brand-950">Catálogo cargado</p>
          <ul className="mt-2 space-y-1 text-xs">
            {catalogResult.hojas.map((h) => (
              <li key={h.hoja} className="text-brand-950/70">
                <span className="font-semibold text-brand-950">{h.hoja}:</span> {h.creados} creados · {h.actualizados} actualizados
                {h.errores.length > 0 && <span className="text-red-600"> · {h.errores.length} con error</span>}
              </li>
            ))}
            {catalogResult.fotosSubidas > 0 && (
              <li className="text-brand-950/70">
                <span className="font-semibold text-brand-950">Fotos:</span> {catalogResult.fotosSubidas} subidas desde el Excel
              </li>
            )}
          </ul>
          {catalogResult.hojas.some((h) => h.errores.length > 0) && (
            <ul className="mt-2 space-y-0.5 text-xs text-red-600">
              {catalogResult.hojas.flatMap((h) =>
                h.errores.map((e, i) => (
                  <li key={`${h.hoja}-${i}`}>
                    {h.hoja}, fila {e.row}: {e.message}
                  </li>
                )),
              )}
            </ul>
          )}
        </div>
      )}

      {importResult && (
        <div className="rounded-xl border border-brand-950/10 bg-white p-4 text-sm">
          <p className="font-medium text-brand-950">
            {importResult.created} creados · {importResult.updated} actualizados
            {importResult.errors.length > 0 && <span className="text-red-600"> · {importResult.errors.length} con error</span>}
          </p>
          <p className="mt-1 text-xs font-light text-brand-950/50">
            Solo se cargó lo que traía el archivo; el resto (foto, cocina, modificadores…) lo completas desde cada producto.
          </p>
          {importResult.errors.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-red-600">
              {importResult.errors.map((e, i) => (
                <li key={i}>
                  Fila {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-950/35" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, categoría o SKU…"
          aria-label="Buscar productos"
          className="w-full rounded-xl border border-brand-950/15 bg-white py-2.5 pl-10 pr-10 text-sm text-brand-950 placeholder:text-brand-950/35 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Limpiar búsqueda"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-brand-950/40 hover:bg-brand-950/5 hover:text-brand-950/70"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {categoriesWithProducts.length > 1 && (
        <div className="-mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategoryFilter(null)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              categoryFilter === null
                ? 'bg-brand-500 text-white'
                : 'bg-brand-950/5 text-brand-950/60 hover:bg-brand-950/10'
            }`}
          >
            Todas
          </button>
          {categoriesWithProducts.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryFilter(categoryFilter === c.id ? null : c.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                categoryFilter === c.id
                  ? 'bg-brand-500 text-white'
                  : 'bg-brand-950/5 text-brand-950/60 hover:bg-brand-950/10'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {(query || categoryFilter) && (
        <p className="-mt-5 text-xs font-light text-brand-950/50">
          {filtered.length === 0
            ? 'Ningún producto coincide.'
            : `${filtered.length} de ${products.length} producto${products.length === 1 ? '' : 's'}`}
        </p>
      )}

      {filtered.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-brand-950/60">
            <input
              type="checkbox"
              checked={selected.size > 0 && selected.size === filtered.length}
              ref={(el) => {
                if (el) el.indeterminate = selected.size > 0 && selected.size < filtered.length;
              }}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-brand-950/30 text-brand-500 focus:ring-brand-400"
            />
            Seleccionar todo
          </label>
          {selected.size > 0 && (
            <TextureButton
              variant="minimal"
              size="sm"
              className="!w-auto flex items-center gap-1.5 whitespace-nowrap !text-red-600"
              disabled={bulkDeleting}
              onClick={bulkRemove}
            >
              <Trash2 className="h-3.5 w-3.5" /> {bulkDeleting ? 'Borrando…' : `Borrar ${selected.size} seleccionado${selected.size === 1 ? '' : 's'}`}
            </TextureButton>
          )}
        </div>
      )}

      <TextureCard>
        <ul className="divide-y divide-brand-950/10">
          {filtered.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggleSelected(p.id)}
                  className="h-4 w-4 shrink-0 rounded border-brand-950/30 text-brand-500 focus:ring-brand-400"
                />
                {p.photoUrl ? (
                  <img src={p.photoUrl} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-brand-950/5 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-brand-950 truncate">
                    {p.name} <span className="text-brand-950/40 font-normal">· {p.category?.name}</span>
                  </p>
                  <p className="text-brand-950/60 font-light">
                    {formatBase(p.price, currencySymbol)}
                    {p.sku && <span className="text-brand-950/40"> · SKU {p.sku}</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {p.stockDepleted && p.isAvailable && (
                  <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-100 text-red-700">Agotado (stock)</span>
                )}
                <button
                  onClick={() => toggleAvailable(p)}
                  className={`text-xs px-2 py-1 rounded-full font-medium ${p.isAvailable ? 'bg-brand-400/15 text-brand-800' : 'bg-brand-950/10 text-brand-950/50'}`}
                >
                  {p.isAvailable ? 'Disponible' : 'Agotado'}
                </button>
                <button onClick={() => openEdit(p)} className="text-brand-500 hover:text-brand-600 flex items-center gap-1">
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                <button onClick={() => remove(p.id)} className="text-red-500 hover:text-red-600">
                  Borrar
                </button>
              </div>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-brand-950/40 text-sm font-light">
              {query || categoryFilter ? `Sin resultados${query ? ` para "${query}"` : ''}.` : 'Sin productos aún.'}
            </li>
          )}
        </ul>
      </TextureCard>

      <ProductFormDialog
        open={productDialogOpen}
        onOpenChange={setProductDialogOpen}
        categories={categories}
        kitchens={kitchens}
        product={editingProduct}
        currencySymbol={currencySymbol}
        onSaved={load}
        onCreated={setEditingProduct}
      />
      <CategoryDialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen} categories={categories} onChanged={load} />
      <ModifierCategoriesDialog open={modifiersDialogOpen} onOpenChange={setModifiersDialogOpen} />
    </div>
  );
}
