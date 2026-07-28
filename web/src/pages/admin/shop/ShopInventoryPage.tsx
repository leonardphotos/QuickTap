import { Fragment, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ChevronDown, ClipboardList, FolderPlus, Package, Pencil, Plus, ScanLine, Search, Sparkles, Truck, X } from 'lucide-react';
import type { AuthRestaurant } from '@/context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PhotoUploadField } from '@/components/admin/PhotoUploadField';
import type { ShopProductSeed, ShopRubro, ShopVariant } from '@/data/shopRubros';
import { shopMoneyFormatters } from './shopFormat';
import { productStatus, productStock, type ShopProduct, type ShopSession } from './shopSession';
import ShopSkuScanDialog from './ShopSkuScanDialog';

interface Props {
  session: ShopSession;
  rubro: ShopRubro;
  restaurant: Pick<AuthRestaurant, 'currencySymbol' | 'exchangeRate'>;
}

const STATUS_LABEL: Record<string, string> = { ok: 'Disponible', warn: 'Stock bajo', danger: 'Agotado' };
const STATUS_CLASS: Record<string, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  warn: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
};

export default function ShopInventoryPage({ session, rubro, restaurant }: Props) {
  const { money, moneyBs } = shopMoneyFormatters(restaurant);
  const { products, sales, purchases, adjustments, registerPurchase, adjustStock, addProduct, updateProduct, categories, addCategory, subcategories } = session;

  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [puSupplier, setPuSupplier] = useState('');
  const [puProductId, setPuProductId] = useState('');
  const [puVariantIndex, setPuVariantIndex] = useState(0);
  const [puQty, setPuQty] = useState('');
  const [puCost, setPuCost] = useState('');

  const [newOpen, setNewOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [npName, setNpName] = useState('');
  const [npCategory, setNpCategory] = useState(categories[0] ?? '');
  const [npSubcategory, setNpSubcategory] = useState('');
  const [npSku, setNpSku] = useState('');
  const [npLocation, setNpLocation] = useState('');
  const [npPrice, setNpPrice] = useState('');
  const [npCost, setNpCost] = useState('');
  const [npMinStock, setNpMinStock] = useState('');
  const [npVariants, setNpVariants] = useState<ShopVariant[]>([]);
  const [npV1, setNpV1] = useState('');
  const [npV2, setNpV2] = useState('');
  const [npStock, setNpStock] = useState('');
  /** Stock de un producto básico (sin talla/color) — se usa solo mientras npVariants está
   * vacío. Al guardar, si no se agregó ninguna variante explícita, esto se convierte en una
   * única variante interna "Único" para reusar el mismo modelo de stock por variante. */
  const [npBasicStock, setNpBasicStock] = useState('');
  const [npSoldByWeight, setNpSoldByWeight] = useState(false);
  const [npWholesalePrice, setNpWholesalePrice] = useState('');
  const [npWholesaleMinQty, setNpWholesaleMinQty] = useState('');
  const [npPromoPrice, setNpPromoPrice] = useState('');
  const [npExpiryDate, setNpExpiryDate] = useState('');
  const [npPhotoUrl, setNpPhotoUrl] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const npSkuInputRef = useRef<HTMLInputElement>(null);
  const npNameInputRef = useRef<HTMLInputElement>(null);

  /** Lectores de código de barras USB/Bluetooth escriben el código y mandan Enter — igual que en
   * Venta (ver ShopPosPage), acá el Enter en el campo de SKU no agrega al carrito sino que salta
   * directo al Nombre para seguir completando el producto sin tocar el mouse. */
  function handleSkuKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    npNameInputRef.current?.focus();
  }

  const npSkuDuplicate =
    npSku.trim() !== '' && products.some((p) => p.id !== editingProductId && p.sku.toLowerCase() === npSku.trim().toLowerCase());

  const [scanOpen, setScanOpen] = useState(false);
  const [scanCode, setScanCode] = useState('');
  const scanInputRef = useRef<HTMLInputElement>(null);
  // Cámara del celular para leer el código de barras (misma que en Venta) — cameraScanFor
  // distingue si el código detectado va al diálogo de "Escanear" del toolbar (busca en el
  // catálogo) o directo al campo SKU del formulario de Nuevo/Editar producto que ya está abierto.
  const [cameraScanOpen, setCameraScanOpen] = useState(false);
  const [cameraScanFor, setCameraScanFor] = useState<'toolbar' | 'form'>('toolbar');

  function openScanDialog() {
    setScanCode('');
    setScanOpen(true);
    requestAnimationFrame(() => scanInputRef.current?.focus());
  }

  /** Busca el código contra el catálogo — si ya existe un producto con ese SKU abre su edición
   * (para sumar stock/corregir datos), si no abre Nuevo producto con el código ya cargado como
   * SKU, listo para completar el resto. Usado tanto por el input de texto (lector USB/Bluetooth
   * o tipeo manual) como por la cámara. */
  function resolveScannedCode(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    const match = products.find((p) => p.sku.toLowerCase() === trimmed.toLowerCase());
    setScanOpen(false);
    if (match) openEditProductDialog(match);
    else openNewProductDialog(trimmed);
  }

  function submitScan() {
    resolveScannedCode(scanCode);
  }

  function handleScanKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    submitScan();
  }

  function openCameraScan(target: 'toolbar' | 'form') {
    setCameraScanFor(target);
    setCameraScanOpen(true);
  }

  function handleCameraScan(code: string) {
    if (cameraScanFor === 'form') setNpSku(code);
    else resolveScannedCode(code);
  }

  const [recountOpen, setRecountOpen] = useState(false);
  const [rcProductId, setRcProductId] = useState('');
  const [rcVariantIndex, setRcVariantIndex] = useState(0);
  const [rcCounted, setRcCounted] = useState('');
  const [rcReason, setRcReason] = useState('');

  const rcProduct = products.find((p) => p.id === rcProductId);

  function openRecountDialog() {
    const first = products[0];
    setRcProductId(first?.id ?? '');
    setRcVariantIndex(0);
    setRcCounted('');
    setRcReason('');
    setRecountOpen(true);
  }

  function onRcProductChange(id: string) {
    setRcProductId(id);
    setRcVariantIndex(0);
  }

  function confirmRecount() {
    if (!rcProduct || rcCounted === '') return;
    adjustStock(rcProduct.id, rcVariantIndex, Number(rcCounted) || 0, rcReason);
    setRecountOpen(false);
  }

  /** Historial de movimientos de un producto: compras, ventas, devoluciones y ajustes por
   * recuento, todos mezclados y ordenados por fecha — no había ninguna vista consolidada de
   * "por qué cambió el stock de este producto" hasta ahora. */
  function productMovements(p: ShopProduct) {
    const purchaseMoves = purchases
      .filter((pu) => pu.productName === p.name)
      .map((pu) => ({ time: pu.time, label: `Compra a ${pu.supplier}`, qty: pu.qty, detail: `${pu.v1}${pu.v2 ? ' · ' + pu.v2 : ''}` }));
    const saleMoves = sales.flatMap((s) =>
      s.items
        .filter((it) => it.productId === p.id)
        .map((it) => ({
          time: s.time,
          label: s.returned ? 'Venta devuelta' : 'Venta',
          qty: s.returned ? it.qty : -it.qty,
          detail: `${it.v1}${it.v2 ? ' · ' + it.v2 : ''}`,
        })),
    );
    const adjustMoves = adjustments
      .filter((a) => a.productId === p.id)
      .map((a) => ({ time: a.time, label: a.reason, qty: a.diff, detail: `${a.v1}${a.v2 ? ' · ' + a.v2 : ''} · contado ${a.after}` }));
    return [...purchaseMoves, ...saleMoves, ...adjustMoves].sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 10);
  }

  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatApplyToForm, setNewCatApplyToForm] = useState(false);

  function openNewCategoryDialog(applyToForm: boolean) {
    setNewCatName('');
    setNewCatApplyToForm(applyToForm);
    setNewCatOpen(true);
  }

  function confirmNewCategory() {
    const name = newCatName.trim();
    if (!name) return;
    addCategory(name);
    if (newCatApplyToForm) setNpCategory(name);
    else setCategory(name);
    setNewCatOpen(false);
  }

  const totalSkus = products.reduce((a, p) => a + p.variants.length, 0);
  const valued = products.reduce((a, p) => a + productStock(p) * p.cost, 0);
  const low = products.filter((p) => productStatus(p) === 'warn').length;
  const out = products.filter((p) => productStatus(p) === 'danger').length;

  const filtered = products.filter(
    (p) =>
      (!category || p.category === category) &&
      (!search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()) || p.sku.toLowerCase().includes(search.trim().toLowerCase())),
  );

  const puProduct = products.find((p) => p.id === puProductId);

  function openPurchaseDialog() {
    setPuSupplier('');
    setPuQty('');
    const first = products[0];
    setPuProductId(first?.id ?? '');
    setPuVariantIndex(0);
    setPuCost(first ? String(first.cost) : '');
    setPurchaseOpen(true);
  }

  function onPuProductChange(id: string) {
    setPuProductId(id);
    setPuVariantIndex(0);
    const p = products.find((x) => x.id === id);
    setPuCost(p ? String(p.cost) : '');
  }

  function confirmPurchase() {
    const qty = Number(puQty) || 0;
    const cost = Number(puCost) || 0;
    if (!puSupplier.trim() || !puProduct || qty <= 0) return;
    registerPurchase(puSupplier.trim(), puProduct.id, puVariantIndex, qty, cost);
    setPurchaseOpen(false);
  }

  function openNewProductDialog(initialSku?: string) {
    setEditingProductId(null);
    setNpName('');
    setNpCategory(categories[0] ?? '');
    setNpSubcategory('');
    setNpSku(initialSku ?? '');
    setNpLocation('');
    setNpPrice('');
    setNpCost('');
    setNpMinStock('');
    setNpVariants([]);
    setNpV1('');
    setNpV2('');
    setNpStock('');
    setNpBasicStock('');
    setNpSoldByWeight(false);
    setNpWholesalePrice('');
    setNpWholesaleMinQty('');
    setNpPromoPrice('');
    setNpExpiryDate('');
    setNpPhotoUrl(null);
    setSaveError(null);
    setNewOpen(true);
    // El diálogo recién se monta en este mismo tick — hay que esperar al siguiente frame para
    // que el input del SKU (o el de Nombre, si el SKU ya viene de un escaneo) exista en el DOM
    // antes de enfocarlo.
    requestAnimationFrame(() => (initialSku ? npNameInputRef : npSkuInputRef).current?.focus());
  }

  /** Precarga el formulario con los datos actuales de un producto guardado para poder corregir
   * precio/costo/categoría/ubicación/variantes — antes Inventario solo permitía crear, no editar. */
  function openEditProductDialog(p: ShopProduct) {
    setEditingProductId(p.id);
    setNpName(p.name);
    setNpCategory(p.category);
    setNpSubcategory(p.subcategory);
    setNpSku(p.sku);
    setNpLocation(p.location);
    setNpPrice(String(p.price));
    setNpCost(String(p.cost));
    setNpMinStock(String(p.minStock));
    const isBasic = p.variants.length === 1 && p.variants[0].v1 === 'Único' && !p.variants[0].v2;
    if (isBasic) {
      setNpVariants([]);
      setNpBasicStock(String(p.variants[0].stock));
    } else {
      setNpVariants(p.variants.map((v) => ({ ...v })));
      setNpBasicStock('');
    }
    setNpSoldByWeight(p.variants.some((v) => v.soldByWeight));
    setNpV1('');
    setNpV2('');
    setNpStock('');
    setNpWholesalePrice(p.wholesalePrice != null ? String(p.wholesalePrice) : '');
    setNpWholesaleMinQty(p.wholesaleMinQty != null ? String(p.wholesaleMinQty) : '');
    setNpPromoPrice(p.promoPrice != null ? String(p.promoPrice) : '');
    setNpExpiryDate(p.expiryDate ?? '');
    setNpPhotoUrl(p.photoUrl ?? null);
    setSaveError(null);
    setNewOpen(true);
  }

  /** Precarga el formulario de Nuevo producto con un ejemplo del catálogo del rubro (incluye si
   * se vende por peso) — el dueño solo tiene que revisar y guardar en vez de tipear todo desde cero. */
  function applyTemplate(seed: ShopProductSeed) {
    setEditingProductId(null);
    setNpName(seed.name);
    setNpCategory(seed.category);
    setNpSubcategory(seed.subcategory);
    setNpSku(seed.sku);
    setNpLocation(seed.location);
    setNpPrice(String(seed.price));
    setNpCost(String(seed.cost));
    setNpMinStock(String(seed.minStock));
    setNpVariants(seed.variants.map((v) => ({ ...v })));
    setNpBasicStock('');
    setNpSoldByWeight(seed.variants.some((v) => v.soldByWeight));
    setNpV1('');
    setNpV2('');
    setNpStock('');
    setNpWholesalePrice('');
    setNpWholesaleMinQty('');
    setNpPromoPrice('');
    setNpExpiryDate('');
    setNpPhotoUrl(seed.photoUrl ?? null);
    setSaveError(null);
    setNewOpen(true);
  }

  function addVariant() {
    if (!npV1.trim() || (rubro.dim2 && !npV2.trim())) return;
    setNpVariants((prev) => [
      ...prev,
      { v1: npV1.trim(), v2: rubro.dim2 ? npV2.trim() : '', stock: Number(npStock) || 0, soldByWeight: npSoldByWeight },
    ]);
    setNpV1('');
    setNpV2('');
    setNpStock('');
  }

  /** Antes esto fallaba en silencio: si faltaba algo (más comúnmente, no haber tocado el botón +
   * para agregar la variante) el clic en "Guardar producto" simplemente no hacía nada, sin avisar
   * qué faltaba. Ahora cada condición deja un mensaje concreto arriba del botón. */
  function saveNewProduct() {
    const price = Number(npPrice) || 0;
    if (!npName.trim()) return setSaveError('Falta el nombre del producto.');
    if (!npSku.trim()) return setSaveError('Falta el SKU / código de barras.');
    if (!price) return setSaveError('El precio de venta debe ser mayor a 0.');
    if (npVariants.length === 0 && npBasicStock.trim() === '') {
      return setSaveError('Ingresa el stock del producto, o agrega al menos una variante (talla/color) si aplica.');
    }
    if (!editingProductId && !npPhotoUrl) return setSaveError('Agrega una foto del producto.');
    setSaveError(null);
    const variants: ShopVariant[] =
      npVariants.length > 0 ? npVariants : [{ v1: 'Único', v2: '', stock: Number(npBasicStock) || 0, soldByWeight: npSoldByWeight }];
    const input = {
      name: npName.trim(),
      category: npCategory,
      subcategory: npSubcategory.trim(),
      sku: npSku.trim(),
      location: npLocation.trim(),
      price,
      cost: Number(npCost) || 0,
      minStock: Number(npMinStock) || 0,
      variants,
      wholesalePrice: npWholesalePrice !== '' ? Number(npWholesalePrice) || 0 : undefined,
      wholesaleMinQty: npWholesaleMinQty !== '' ? Number(npWholesaleMinQty) || 0 : undefined,
      promoPrice: npPromoPrice !== '' ? Number(npPromoPrice) || 0 : undefined,
      expiryDate: npExpiryDate || undefined,
      photoUrl: npPhotoUrl ?? undefined,
    };
    if (editingProductId) updateProduct(editingProductId, input);
    else addProduct(input);
    setNewOpen(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-brand-950">Inventario</h1>
        <div className="flex gap-2 flex-wrap">
          <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => openCameraScan('toolbar')}>
            <ScanLine className="h-4 w-4" /> Escanear
          </TextureButton>
          <TextureButton variant="minimal" size="default" className="!w-auto" onClick={openRecountDialog}>
            <ClipboardList className="h-4 w-4" /> Recuento físico
          </TextureButton>
          <TextureButton variant="minimal" size="default" className="!w-auto" onClick={openPurchaseDialog}>
            <Truck className="h-4 w-4" /> Registrar compra
          </TextureButton>
          <TextureButton variant="brand" size="default" className="!w-auto" onClick={() => openNewProductDialog()}>
            <Plus className="h-4 w-4" /> Nuevo producto
          </TextureButton>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'SKUs activos', value: String(totalSkus) },
          { label: 'Stock valorizado', value: money(valued), sub: moneyBs(valued) },
          { label: 'Productos con stock bajo', value: String(low) },
          { label: 'Productos sin stock', value: String(out) },
        ].map((m) => (
          <div key={m.label} className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-5">
            <p className="text-sm font-medium text-brand-950/50">{m.label}</p>
            <p className="text-[24px] font-bold text-brand-950 tracking-tight mt-1.5">{m.value}</p>
            {m.sub && <p className="text-xs font-medium text-brand-950/40 mt-1">{m.sub}</p>}
          </div>
        ))}
      </div>

      {products.length === 0 && (
        <div className="rounded-2xl border border-dashed border-brand-500/30 bg-brand-500/[0.03] p-5">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-brand-500" />
            <h3 className="text-[15px] font-bold text-brand-950">Productos sugeridos para tu rubro</h3>
          </div>
          <p className="text-sm text-brand-950/50 mb-3.5">
            Toca uno para precargar el formulario de "Nuevo producto" (categoría, precio y variantes incluidas —
            los que se venden por peso ya vienen marcados) y ajústalo antes de guardar.
          </p>
          <div className="flex gap-2 flex-wrap">
            {rubro.products.map((seed) => (
              <button
                key={seed.id}
                type="button"
                onClick={() => applyTemplate(seed)}
                className="flex items-center gap-2 rounded-full border border-brand-950/10 bg-white px-3.5 py-2 text-[13px] font-medium text-brand-950 hover:border-brand-400 hover:bg-brand-500/5 transition-colors"
              >
                {seed.name}
                <span className="text-brand-950/40">{money(seed.price)}{seed.variants.some((v) => v.soldByWeight) ? '/Kg' : ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setCategory(null)}
              className={`text-[13px] font-semibold px-3.5 py-1.5 rounded-full border transition-colors ${
                !category ? 'bg-brand-500 border-brand-500 text-white' : 'border-brand-950/15 text-brand-950/60 hover:bg-brand-950/5'
              }`}
            >
              Todas
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`text-[13px] font-semibold px-3.5 py-1.5 rounded-full border transition-colors ${
                  category === c ? 'bg-brand-500 border-brand-500 text-white' : 'border-brand-950/15 text-brand-950/60 hover:bg-brand-950/5'
                }`}
              >
                {c}
              </button>
            ))}
            <button
              type="button"
              onClick={() => openNewCategoryDialog(false)}
              className="flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-1.5 rounded-full border border-dashed border-brand-500/40 text-brand-500 hover:bg-brand-500/5 transition-colors"
            >
              <FolderPlus className="h-3.5 w-3.5" /> Nueva categoría
            </button>
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-950/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar SKU o producto…"
              className="w-full border border-brand-950/15 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-bold uppercase text-brand-950/40 text-left">
                <th className="pb-2 pr-3">Producto</th>
                <th className="pb-2 pr-3">SKU</th>
                <th className="pb-2 pr-3">Categoría</th>
                <th className="pb-2 pr-3">Ubicación</th>
                <th className="pb-2 pr-3">Precio</th>
                <th className="pb-2 pr-3">Stock</th>
                <th className="pb-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-brand-950/40 py-8">Sin resultados.</td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const status = productStatus(p);
                  const expanded = expandedId === p.id;
                  const isWeight = p.variants.some((v) => v.soldByWeight);
                  return (
                    <Fragment key={p.id}>
                      <tr
                        onClick={() => setExpandedId(expanded ? null : p.id)}
                        className="cursor-pointer hover:bg-brand-950/[0.03] border-t border-brand-950/[0.05]"
                      >
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2.5">
                            <ChevronDown className={`h-3.5 w-3.5 text-brand-950/30 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
                              <Package className="h-4 w-4" />
                            </span>
                            <span className="font-medium text-brand-950">{p.name}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-brand-950/60">{p.sku}</td>
                        <td className="py-3 pr-3">
                          <span className="text-brand-950/70">{p.category}</span>
                          {p.subcategory && <span className="block text-[11px] text-brand-950/40">{p.subcategory}</span>}
                        </td>
                        <td className="py-3 pr-3 text-brand-950/60">{p.location || '—'}</td>
                        <td className="py-3 pr-3">
                          {money(p.price)}
                          {moneyBs(p.price) && <span className="block text-[11px] text-brand-950/40">{moneyBs(p.price)}</span>}
                        </td>
                        <td className="py-3 pr-3 text-brand-950/70">{isWeight ? `${productStock(p).toFixed(1)} Kg` : productStock(p)}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openEditProductDialog(p); }}
                              title="Editar producto"
                              className="text-brand-950/30 hover:text-brand-500"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-brand-950/[0.02]">
                          <td colSpan={7} className="py-2.5 pl-12 pr-3">
                            {p.variants.map((v, i) => {
                              const isBasicVariant = v.v1 === 'Único' && !v.v2;
                              return (
                                <div key={i} className="text-[12.5px] text-brand-950/60 py-0.5">
                                  {isBasicVariant
                                    ? `${p.sku} · Stock ${v.stock}${v.soldByWeight ? ' Kg' : ''}`
                                    : `${p.sku}-${v.v1}${v.v2 ? `-${v.v2}` : ''} · ${rubro.dim1} ${v.v1}${v.v2 ? ` · ${rubro.dim2} ${v.v2}` : ''} · Stock ${v.stock}${v.soldByWeight ? ' Kg' : ''}`}
                                </div>
                              );
                            })}
                            <div className="mt-2.5 pt-2.5 border-t border-brand-950/[0.06]">
                              <p className="text-[11px] font-bold uppercase text-brand-950/40 mb-1.5">Historial de movimientos</p>
                              {productMovements(p).length === 0 ? (
                                <p className="text-[12px] text-brand-950/40">Sin movimientos todavía.</p>
                              ) : (
                                <div className="flex flex-col gap-1">
                                  {productMovements(p).map((m, i) => (
                                    <div key={i} className="flex items-center justify-between gap-2 text-[12.5px]">
                                      <span className="text-brand-950/70">
                                        {m.label}{m.detail ? ` · ${m.detail}` : ''} · {m.time.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}
                                      </span>
                                      <span className={`font-semibold ${m.qty > 0 ? 'text-emerald-600' : m.qty < 0 ? 'text-red-600' : 'text-brand-950/50'}`}>
                                        {m.qty > 0 ? '+' : ''}{m.qty}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- Escanear ---------- */}
      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escanear producto</DialogTitle>
          </DialogHeader>
          <label className="block text-sm">
            <span className="text-brand-950/70">Código de barras / SKU</span>
            <input
              ref={scanInputRef}
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              onKeyDown={handleScanKeyDown}
              placeholder="Escanea o tipea el código y Enter"
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            />
          </label>
          <p className="text-[12px] text-brand-950/40">
            Si el código ya pertenece a un producto se abre para editarlo (sumar stock, corregir precio, etc.); si no existe, se abre Nuevo producto con el código ya cargado.
          </p>
          <DialogFooter className="sm:justify-between">
            <TextureButton
              variant="minimal"
              size="default"
              className="!w-auto"
              onClick={() => {
                setScanOpen(false);
                openCameraScan('toolbar');
              }}
            >
              <ScanLine className="h-4 w-4" /> Usar cámara
            </TextureButton>
            <div className="flex gap-2">
              <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setScanOpen(false)}>
                Cancelar
              </TextureButton>
              <TextureButton variant="brand" size="default" className="!w-auto" disabled={!scanCode.trim()} onClick={submitScan}>
                Buscar
              </TextureButton>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ShopSkuScanDialog
        open={cameraScanOpen}
        onOpenChange={setCameraScanOpen}
        onScan={handleCameraScan}
        onManualEntry={
          cameraScanFor === 'toolbar'
            ? () => {
                setCameraScanOpen(false);
                openScanDialog();
              }
            : undefined
        }
      />

      {/* ---------- Registrar compra ---------- */}
      <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar compra a proveedor</DialogTitle>
          </DialogHeader>
          <label className="block text-sm">
            <span className="text-brand-950/70">Proveedor</span>
            <input
              value={puSupplier}
              onChange={(e) => setPuSupplier(e.target.value)}
              placeholder={rubro.suppliers[0] ?? 'Nombre del proveedor'}
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            />
          </label>
          <label className="block text-sm">
            <span className="text-brand-950/70">Producto</span>
            <select
              value={puProductId}
              onChange={(e) => onPuProductChange(e.target.value)}
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-brand-950/70">Variante</span>
            <select
              value={puVariantIndex}
              onChange={(e) => setPuVariantIndex(Number(e.target.value))}
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            >
              {puProduct?.variants.map((v, i) => (
                <option key={i} value={i}>{v.v1}{v.v2 ? ` · ${v.v2}` : ''} (stock actual: {v.stock})</option>
              ))}
            </select>
          </label>
          <div className="flex gap-3">
            <label className="block text-sm flex-1">
              <span className="text-brand-950/70">Cantidad{puProduct?.variants[puVariantIndex]?.soldByWeight ? ' (Kg)' : ''}</span>
              <input
                type="number"
                step={puProduct?.variants[puVariantIndex]?.soldByWeight ? '0.001' : '1'}
                value={puQty}
                onChange={(e) => setPuQty(e.target.value)}
                placeholder={puProduct?.variants[puVariantIndex]?.soldByWeight ? '10.000' : '10'}
                className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
            </label>
            <label className="block text-sm flex-1">
              <span className="text-brand-950/70">Costo unitario</span>
              <input type="number" value={puCost} onChange={(e) => setPuCost(e.target.value)} placeholder="0.00" className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500" />
            </label>
          </div>
          <DialogFooter>
            <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setPurchaseOpen(false)}>
              Cancelar
            </TextureButton>
            <TextureButton variant="brand" size="default" className="!w-auto" onClick={confirmPurchase}>
              Registrar compra
            </TextureButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Recuento físico ---------- */}
      <Dialog open={recountOpen} onOpenChange={setRecountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recuento físico</DialogTitle>
          </DialogHeader>
          <label className="block text-sm">
            <span className="text-brand-950/70">Producto</span>
            <select
              value={rcProductId}
              onChange={(e) => onRcProductChange(e.target.value)}
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-brand-950/70">Variante</span>
            <select
              value={rcVariantIndex}
              onChange={(e) => setRcVariantIndex(Number(e.target.value))}
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            >
              {rcProduct?.variants.map((v, i) => (
                <option key={i} value={i}>{v.v1}{v.v2 ? ` · ${v.v2}` : ''} (sistema: {v.stock}{v.soldByWeight ? ' Kg' : ''})</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-brand-950/70">Cantidad contada{rcProduct?.variants[rcVariantIndex]?.soldByWeight ? ' (Kg)' : ''}</span>
            <input
              type="number"
              step={rcProduct?.variants[rcVariantIndex]?.soldByWeight ? '0.001' : '1'}
              value={rcCounted}
              onChange={(e) => setRcCounted(e.target.value)}
              placeholder="0"
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            />
          </label>
          {rcProduct && rcCounted !== '' && (
            <p className="text-[12.5px] font-medium text-brand-950/60">
              Diferencia: {(Number(rcCounted) || 0) - (rcProduct.variants[rcVariantIndex]?.stock ?? 0)}
            </p>
          )}
          <label className="block text-sm">
            <span className="text-brand-950/70">Motivo (opcional)</span>
            <input
              value={rcReason}
              onChange={(e) => setRcReason(e.target.value)}
              placeholder="Ej: Auditoría mensual"
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            />
          </label>
          <DialogFooter>
            <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setRecountOpen(false)}>
              Cancelar
            </TextureButton>
            <TextureButton variant="brand" size="default" className="!w-auto" disabled={!rcProduct || rcCounted === ''} onClick={confirmRecount}>
              Ajustar stock
            </TextureButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Nuevo producto ---------- */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingProductId ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <PhotoUploadField
                value={npPhotoUrl}
                onChange={setNpPhotoUrl}
                label={editingProductId ? 'Foto del producto' : 'Foto del producto (obligatoria)'}
                uploadUrl="/shop/products/upload-photo"
                shape="square"
              />
            </div>
            <label className="block text-sm sm:col-span-2">
              <span className="text-brand-950/70">Nombre</span>
              <input
                ref={npNameInputRef}
                value={npName}
                onChange={(e) => setNpName(e.target.value)}
                className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
            </label>
            <label className="block text-sm">
              <span className="text-brand-950/70 flex items-center justify-between gap-2">
                Categoría
                <button type="button" onClick={() => openNewCategoryDialog(true)} className="text-[11px] font-semibold text-brand-500 hover:text-brand-600 flex items-center gap-1">
                  <FolderPlus className="h-3 w-3" /> Nueva
                </button>
              </span>
              <select value={npCategory} onChange={(e) => setNpCategory(e.target.value)} className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500">
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-brand-950/70">Subcategoría</span>
              <input
                value={npSubcategory}
                onChange={(e) => setNpSubcategory(e.target.value)}
                list="shop-subcategory-suggestions"
                placeholder="Ej: Bebidas frías"
                className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
              <datalist id="shop-subcategory-suggestions">
                {(subcategories[npCategory] ?? []).map((s) => <option key={s} value={s} />)}
              </datalist>
            </label>
            <label className="block text-sm">
              <span className="text-brand-950/70 flex items-center justify-between gap-2">
                SKU / código de barras
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openCameraScan('form')}
                    title="Leer el código con la cámara del celular"
                    className="text-[11px] font-semibold text-brand-500 hover:text-brand-600 flex items-center gap-1"
                  >
                    <ScanLine className="h-3 w-3" /> Usar cámara
                  </button>
                  <button
                    type="button"
                    onClick={() => npSkuInputRef.current?.focus()}
                    title="Enfoca el campo — listo para leer un lector de código de barras USB/Bluetooth"
                    className="text-[11px] font-semibold text-brand-950/40 hover:text-brand-950/70"
                  >
                    Lector USB
                  </button>
                </span>
              </span>
              <input
                ref={npSkuInputRef}
                value={npSku}
                onChange={(e) => setNpSku(e.target.value)}
                onKeyDown={handleSkuKeyDown}
                placeholder="Escanea o tipea el código y Enter"
                className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
              {npSkuDuplicate && (
                <span className="mt-1 block text-[11px] font-medium text-amber-600">
                  Ya existe un producto con este SKU — si es el mismo producto, mejor editalo en vez de crear uno nuevo.
                </span>
              )}
            </label>
            <label className="block text-sm">
              <span className="text-brand-950/70">Ubicación</span>
              <input value={npLocation} onChange={(e) => setNpLocation(e.target.value)} className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500" />
            </label>
            <label className="block text-sm">
              <span className="text-brand-950/70">Precio de venta</span>
              <input type="number" value={npPrice} onChange={(e) => setNpPrice(e.target.value)} className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500" />
            </label>
            <label className="block text-sm">
              <span className="text-brand-950/70">Costo</span>
              <input type="number" value={npCost} onChange={(e) => setNpCost(e.target.value)} className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500" />
            </label>
            <label className="block text-sm">
              <span className="text-brand-950/70">Stock mínimo</span>
              <input type="number" value={npMinStock} onChange={(e) => setNpMinStock(e.target.value)} className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500" />
            </label>
          </div>

          <div className="border-t border-brand-950/[0.06] pt-3.5">
            <p className="text-sm font-bold text-brand-950 mb-1">Stock y variantes</p>
            <p className="text-xs text-brand-950/50 mb-3">
              Si es un producto básico (no maneja talla/color), ingresa su stock directamente. Si maneja variantes, agrégalas abajo en vez de llenar el stock básico.
            </p>
            <label className="flex items-center gap-2 mb-3 text-sm cursor-pointer">
              <input type="checkbox" checked={npSoldByWeight} onChange={(e) => setNpSoldByWeight(e.target.checked)} />
              <span className="text-brand-950/70">Se vende por peso (Kg) — para verduras, carnes u otros productos a granel</span>
            </label>

            {npVariants.length === 0 && (
              <label className="block text-xs mb-3.5 max-w-[160px]">
                <span className="text-brand-950/60">Stock{npSoldByWeight ? ' (Kg)' : ''} — producto sin variantes</span>
                <input
                  type="number"
                  step={npSoldByWeight ? '0.001' : '1'}
                  value={npBasicStock}
                  onChange={(e) => setNpBasicStock(e.target.value)}
                  placeholder={npSoldByWeight ? '10.000' : '10'}
                  className="mt-1 w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm"
                />
              </label>
            )}

            <p className="text-[11px] font-bold uppercase text-brand-950/40 mb-2">
              Variantes ({rubro.dim1}{rubro.dim2 ? ` × ${rubro.dim2}` : ''}) — opcional
            </p>
            <div className="flex items-end gap-2 mb-3">
              <label className="block text-xs flex-1">
                <span className="text-brand-950/60">{rubro.dim1}</span>
                <input value={npV1} onChange={(e) => setNpV1(e.target.value)} placeholder={rubro.dim1Example} className="mt-1 w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm" />
              </label>
              {rubro.dim2 && (
                <label className="block text-xs flex-1">
                  <span className="text-brand-950/60">{rubro.dim2}</span>
                  <input value={npV2} onChange={(e) => setNpV2(e.target.value)} placeholder={rubro.dim2Example} className="mt-1 w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm" />
                </label>
              )}
              <label className="block text-xs w-24 shrink-0">
                <span className="text-brand-950/60">Stock{npSoldByWeight ? ' (Kg)' : ''}</span>
                <input
                  type="number"
                  step={npSoldByWeight ? '0.001' : '1'}
                  value={npStock}
                  onChange={(e) => setNpStock(e.target.value)}
                  placeholder={npSoldByWeight ? '10.000' : '10'}
                  className="mt-1 w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm"
                />
              </label>
              <button type="button" onClick={addVariant} className="h-[34px] w-[34px] shrink-0 flex items-center justify-center rounded-lg border border-brand-950/15 hover:bg-brand-950/5">
                <Plus className="h-4 w-4 text-brand-950" />
              </button>
            </div>
            {npVariants.length === 0 ? (
              <p className="text-xs text-brand-950/40">Sin variantes — se usará el stock básico de arriba.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {npVariants.map((v, i) => (
                  <div key={i} className="flex items-center gap-2.5 bg-brand-950/[0.04] rounded-lg px-3 py-2">
                    <span className="flex-1 text-[13px] font-semibold text-brand-950">{v.v1}{v.v2 ? ` · ${v.v2}` : ''}</span>
                    <span className="text-xs text-brand-950/50 w-20">Stock: {v.soldByWeight ? `${v.stock} Kg` : v.stock}</span>
                    <button type="button" onClick={() => setNpVariants((prev) => prev.filter((_, idx) => idx !== i))} className="text-brand-950/40 hover:text-red-500">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-brand-950/[0.06] pt-3.5">
            <p className="text-sm font-bold text-brand-950 mb-2.5">Precios especiales y vencimiento (opcional)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="block text-xs">
                <span className="text-brand-950/60">Precio mayorista</span>
                <input type="number" value={npWholesalePrice} onChange={(e) => setNpWholesalePrice(e.target.value)} placeholder="0.00" className="mt-1 w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm" />
              </label>
              <label className="block text-xs">
                <span className="text-brand-950/60">Desde (uds.)</span>
                <input type="number" value={npWholesaleMinQty} onChange={(e) => setNpWholesaleMinQty(e.target.value)} placeholder="12" className="mt-1 w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm" />
              </label>
              <label className="block text-xs">
                <span className="text-brand-950/60">Precio promocional</span>
                <input type="number" value={npPromoPrice} onChange={(e) => setNpPromoPrice(e.target.value)} placeholder="0.00" className="mt-1 w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm" />
              </label>
              <label className="block text-xs">
                <span className="text-brand-950/60">Vence el</span>
                <input type="date" value={npExpiryDate} onChange={(e) => setNpExpiryDate(e.target.value)} className="mt-1 w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm" />
              </label>
            </div>
            <p className="text-[11px] text-brand-950/40 mt-1.5">
              Si activas el precio mayorista, se aplica solo en Venta cuando la cantidad de esa línea del carrito llega al mínimo. El precio promocional siempre gana sobre los demás.
            </p>
          </div>

          {saveError && (
            <p className="text-[13px] font-medium text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveError}</p>
          )}

          <DialogFooter>
            <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setNewOpen(false)}>
              Cancelar
            </TextureButton>
            <TextureButton variant="brand" size="default" className="!w-auto" onClick={saveNewProduct}>
              {editingProductId ? 'Guardar cambios' : 'Guardar producto'}
            </TextureButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Nueva categoría ---------- */}
      <Dialog open={newCatOpen} onOpenChange={setNewCatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva categoría</DialogTitle>
          </DialogHeader>
          <label className="block text-sm">
            <span className="text-brand-950/70">Nombre</span>
            <input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Ej: Bebidas"
              autoFocus
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            />
          </label>
          <DialogFooter>
            <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setNewCatOpen(false)}>
              Cancelar
            </TextureButton>
            <TextureButton variant="brand" size="default" className="!w-auto" disabled={!newCatName.trim()} onClick={confirmNewCategory}>
              Crear categoría
            </TextureButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
