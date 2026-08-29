import { Suspense, lazy, Fragment, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { PackagePlus, ChevronDown, ClipboardList, Eye, EyeOff, FileSpreadsheet, FlaskConical, FolderPlus, Package, Pencil, Plus, ScanLine, Search, Sparkles, Store, Tags, Trash2, TrendingUp, Truck, X } from 'lucide-react';
import type { AuthRestaurant } from '@/context/AuthContext';
import { ShopPriceLabelsDialog } from './ShopPriceLabelsDialog';
import { ShopImportProductsDialog } from './ShopImportProductsDialog';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PhotoUploadField } from '@/components/admin/PhotoUploadField';
import { getRubroFeatures, isServiceRubro, isTicketRubro, type ShopProductSeed, type ShopRubro, type ShopVariant } from '@/data/shopRubros';
import { formatStock, formatUnidad, shopMoneyFormatters, tienePreciosDistintos } from './shopFormat';
import { productStatus, productStock, type ShopProduct, type ShopSession } from './shopSession';
import { shopApi, fetchProductLots, type ProductLots } from './shopApi';
import { costPerM2FromRoll, formatRollWidths, parseRollWidths, rollWidthLabel } from './printPricing';
import { resolveVariantDims } from '@/data/variantDims';
// Carga diferida: mismo motivo que en el POS — @zxing solo baja al abrir el escáner.
const ShopSkuScanDialog = lazy(() => import('./ShopSkuScanDialog'));

interface Props {
  session: ShopSession;
  rubro: ShopRubro;
  restaurant: Pick<AuthRestaurant, 'name' | 'currencySymbol' | 'exchangeRate' | 'slug'>;
  /**
   * Qué parte del catálogo administra esta pantalla. Solo aplica a la Tickera, que vende dos
   * cosas distintas: entradas ('eventos') y mercancía de la tienda ('tienda'). En cualquier
   * otro rubro no se pasa y la pantalla administra el catálogo entero.
   */
  modo?: 'eventos' | 'tienda';
}

const STATUS_LABEL: Record<string, string> = { ok: 'Disponible', warn: 'Stock bajo', danger: 'Agotado' };
const STATUS_CLASS: Record<string, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  warn: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
};

export default function ShopInventoryPage({ session, rubro, restaurant, modo }: Props) {
  const { money, moneyBs } = shopMoneyFormatters(restaurant);
  const { products, sales, purchases, adjustments, registerPurchase, adjustStock, addProduct, updateProduct, deleteProduct, categories, addCategory, subcategories, serviceSupplies, setServiceSupplies, setProductsPublished } = session;
  const { user } = useAuth();
  // Depurar el catálogo es de administración: el cajero cobra, no borra productos.
  const canDeleteProducts = user?.role === 'OWNER' || user?.role === 'ADMIN';
  // Salones de estética/belleza y barbería venden servicios, no mercancía: sin SKU, sin
  // stock por presentación, sin vencimiento y sin venta por m² (eso es de agencias de publicidad).
  const isServiceShop = isServiceRubro(rubro.id);
  // Tickera: cada producto nuevo ES un evento, sin depender de que exista una categoría
  // llamada "Tickets" — es el rubro entero el que cambia la interfaz.
  // En la pestaña Tienda de la Tickera se cargan artículos normales, no entradas: ahí el rubro
  // NO fuerza el modo evento, o el local no podría vender nada que no sea un boleto.
  const isTicketShop = isTicketRubro(rubro.id) && modo !== 'tienda';
  // Qué funciones ve este rubro (venta por Kg, vencimiento, mayorista, impresión por m²) —
  // el "||" con el valor ya guardado en cada condición de abajo cubre productos viejos que
  // usan una función que el rubro hoy no muestra: se siguen pudiendo ver y editar.
  const features = getRubroFeatures(rubro.id);
  const [productToDelete, setProductToDelete] = useState<ShopProduct | null>(null);

  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Lotes del producto abierto: cada entrada con lo que queda y lo que costó. Se pide al abrir
  // la fila y no con el listado — son varias consultas y casi siempre se mira un producto a la vez.
  const [lots, setLots] = useState<ProductLots | null>(null);
  const [lotsLoading, setLotsLoading] = useState(false);

  const loadLots = (productId: string) => {
    setLots(null);
    setLotsLoading(true);
    fetchProductLots(productId)
      .then(setLots)
      .catch(() => setLots(null))
      .finally(() => setLotsLoading(false));
  };

  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [puSupplier, setPuSupplier] = useState('');
  const [puProductId, setPuProductId] = useState('');
  const [puVariantIndex, setPuVariantIndex] = useState(0);
  const [puQty, setPuQty] = useState('');
  const [puCost, setPuCost] = useState('');
  const [puCostoTotal, setPuCostoTotal] = useState(false);

  // "Agregar lote" desde la fila del producto: el camino corto para cargar mercancía sin pasar
  // por Registrar compra y buscar el producto en una lista de 300.
  const [lotProduct, setLotProduct] = useState<ShopProduct | null>(null);
  const [lotVariantIndex, setLotVariantIndex] = useState(0);
  const [lotKg, setLotKg] = useState('');
  const [lotCost, setLotCost] = useState('');
  const [lotUnits, setLotUnits] = useState('1');
  const [lotSupplier, setLotSupplier] = useState('');
  const [lotBusy, setLotBusy] = useState(false);

  // "Sumar a inventario": entra mercancía comprada por peso, con el precio por Kg que cobró el
  // proveedor. Es el camino corto de la ferretería, donde la factura dice "$1,20 el kilo" y no
  // el monto del rollo.
  const [sumarOpen, setSumarOpen] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [npName, setNpName] = useState('');
  const [npCategory, setNpCategory] = useState(categories[0] ?? '');
  // Variantes correctas para la categoría elegida en el formulario (ver variantDims.ts): una
  // joyería que también vende carteras no las mide en "Material", las mide en Talla/Color.
  const variantDims = resolveVariantDims(rubro, npCategory);
  // La categoría "Tickets" convierte al producto en un evento. Se sigue aceptando "Eventos"
  // porque los locales que ya la crearon con ese nombre tienen productos dentro y renombrarla
  // por detrás los dejaría sin fecha ni cupo.
  // La categoría "Tickets"/"Eventos" convierte UN producto en evento (cualquier rubro puede
  // vender la entrada suelta de algo puntual); el rubro Tickera hace que TODO producto nuevo
  // lo sea, sin necesidad de esa categoría.
  const esEvento = isTicketShop || ['tickets', 'eventos'].includes(npCategory.trim().toLowerCase());
  const usaUnidades = ['ferreteria', 'carniceria', 'fruteria', 'panaderia'].includes(rubro?.id ?? '');
  const [npSubcategory, setNpSubcategory] = useState('');
  // Eventos: la categoría "Eventos" convierte el producto en una entrada con fecha y cupo.
  // El nombre de la categoría solo dispara el formulario; lo que manda es la bandera isEvent,
  // así el local puede renombrarla sin romper nada.
  // Unidad de venta: por unidad, por kilo o por metro. Se ofrece en ferretería y en los rubros
  // que venden a granel; el resto no necesita la decisión y no se le muestra.
  const [npSaleUnit, setNpSaleUnit] = useState<'UND' | 'KG' | 'MT'>('UND');
  // Plan de consumo: metros/kilos comprados por adelantado a tarifa rebajada (ver
  // ShopProduct.consumptionPlanEnabled). npPlanSizes es texto separado por comas ("50, 100,
  // 500") — se parsea a números recién al guardar, así el cajero puede escribir con espacios
  // sin que el campo le rechace cada tecla.
  const [labelProduct, setLabelProduct] = useState<ShopProduct | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [npPlanEnabled, setNpPlanEnabled] = useState(false);
  const [npPlanRate, setNpPlanRate] = useState('');
  const [npPlanSizes, setNpPlanSizes] = useState('');
  // Aumento general de precios: mueve el precio de venta de todo el catálogo de una vez.
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [raisePercent, setRaisePercent] = useState('');
  const [raiseBusy, setRaiseBusy] = useState(false);
  const [raiseError, setRaiseError] = useState<string | null>(null);
  const [npEventDate, setNpEventDate] = useState('');
  const [npEventTime, setNpEventTime] = useState('');
  const [npEventSeats, setNpEventSeats] = useState('');
  const [npEventDescription, setNpEventDescription] = useState('');
  const [npEventImages, setNpEventImages] = useState<string[]>([]);
  const [npEventTerms, setNpEventTerms] = useState('');
  const [npFinancing, setNpFinancing] = useState(false);
  const [npDownPercent, setNpDownPercent] = useState('30');
  const [npInstallments, setNpInstallments] = useState('4');
  const [npFrequency, setNpFrequency] = useState('MENSUAL');
  // Días de la frecuencia personalizada ("CADA_n"). Solo aplica con npFrequency === 'CUSTOM'.
  const [npFreqDays, setNpFreqDays] = useState('10');
  const [npFinDeadline, setNpFinDeadline] = useState('');
  const [npBrand, setNpBrand] = useState('');
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
  // Impresión de gran formato: se cobra por m² saliendo de un rollo de ancho fijo.
  const [npAreaRoll, setNpAreaRoll] = useState(false);
  const [npRollWidths, setNpRollWidths] = useState('');
  const [npRollLength, setNpRollLength] = useState('50');
  // Auxiliar para derivar el costo por m²: lo que costó el rollo entero y de qué ancho era.
  const [npRollPrice, setNpRollPrice] = useState('');
  const [npRollPriceWidth, setNpRollPriceWidth] = useState('');
  // Metros lineales disponibles por ancho de rollo, indexado por su etiqueta ("1,37").
  const [npRollMeters, setNpRollMeters] = useState<Record<string, string>>({});
  // Editor de insumos que consume un servicio (barbería/salón): producto+variante y cuánto gasta.
  const [suppliesFor, setSuppliesFor] = useState<ShopProduct | null>(null);
  const [supplyDraft, setSupplyDraft] = useState<{ supplyProductId: string; supplyV1: string; supplyV2: string; quantity: string }[]>([]);
  const [savingSupplies, setSavingSupplies] = useState(false);
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

  // Los totales de arriba cuentan solo lo que administra esta pestaña: mezclar el cupo de los
  // eventos con el stock de la mercancía daría un "stock valorizado" que no significa nada.
  const delModo = products.filter(
    (p) => (modo === 'eventos' ? p.isEvent : modo === 'tienda' ? !p.isEvent : true),
  );
  const totalSkus = delModo.reduce((a, p) => a + p.variants.length, 0);
  const valued = delModo.reduce((a, p) => a + productStock(p) * p.cost, 0);
  const low = delModo.filter((p) => productStatus(p) === 'warn').length;
  const out = delModo.filter((p) => productStatus(p) === 'danger').length;

  // Marcas ya cargadas en el catálogo, para autocompletar el campo del formulario sin tener
  // que escribirlas siempre iguales a mano (ej. no mezclar "Coca-Cola" con "coca cola").
  const brandOptions = Array.from(new Set(products.map((p) => p.brand).filter((b): b is string => !!b))).sort();

  const filtered = products.filter((p) => {
    // Eventos y mercancía viven en el mismo catálogo pero se administran por separado: sin
    // esto, la pestaña Tienda mostraría los boletos y Eventos mostraría las camisetas.
    if (modo === 'eventos' && !p.isEvent) return false;
    if (modo === 'tienda' && p.isEvent) return false;
    if (category && p.category !== category) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.brand ?? '').toLowerCase().includes(q);
  });

  const puProduct = products.find((p) => p.id === puProductId);
  // "Fraccionable" = se compra y se vende en cantidades con decimales (Kg, Mt). soldByWeight es
  // la marca vieja y solo cubre peso; saleUnit es la que usa el POS, así que se miran las dos.
  const puFraccionable =
    puProduct?.saleUnit === 'KG' || puProduct?.saleUnit === 'MT' || !!puProduct?.variants[puVariantIndex]?.soldByWeight;
  const puCostoUnitarioCalculado = (() => {
    const qty = Number(puQty.replace(',', '.'));
    const costo = Number(puCost.replace(',', '.'));
    if (!puCostoTotal || !puFraccionable || !(qty > 0) || !(costo > 0)) return null;
    return Math.round((costo / qty) * 10000) / 10000;
  })();

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
    const qty = Number(puQty.replace(',', '.')) || 0;
    // El backend guarda el lote con costo POR UNIDAD; si se escribió el monto del lote completo
    // se divide acá, que es la misma cuenta que muestra el "Sale a $X por kilo" del formulario.
    const cost = puCostoUnitarioCalculado ?? (Number(puCost.replace(',', '.')) || 0);
    if (!puSupplier.trim() || !puProduct || qty <= 0) return;
    const productId = puProduct.id;
    // Los lotes se releen cuando el servidor confirmó la compra: si se pidieran de una, la
    // respuesta llegaría sin el lote recién creado y el panel mostraría el total viejo.
    void registerPurchase(puSupplier.trim(), productId, puVariantIndex, qty, cost)?.then(() => {
      if (expandedId === productId) loadLots(productId);
    });
    // El diálogo queda abierto con proveedor y producto puestos: cargar un rollo tras otro
    // (40 Kg, 43 Kg, 68 Kg) es un solo trámite, no tres veces el mismo formulario.
    setPuQty('');
    setPuCost('');
  }

  function openLotDialog(p: ShopProduct) {
    setLotProduct(p);
    setLotVariantIndex(0);
    setLotKg('');
    setLotCost('');
    setLotUnits('1');
    setLotSupplier(purchases[0]?.supplier ?? '');
  }

  function confirmLot() {
    if (!lotProduct) return;
    const kg = Number(lotKg.replace(',', '.')) || 0;
    const costoLote = Number(lotCost.replace(',', '.')) || 0;
    // Cuánto entra al stock: en un producto que se vende por peso, los Kg SON la cantidad; en uno
    // que se vende por rollo o por unidad, entran las unidades y el peso queda como dato del lote.
    const porPeso = lotProduct.saleUnit === 'KG' || lotProduct.saleUnit === 'MT';
    const cantidad = porPeso ? kg : Number(lotUnits.replace(',', '.')) || 0;
    if (cantidad <= 0) return;
    // El backend guarda el costo POR UNIDAD; acá siempre se escribe lo que costó el lote entero,
    // que es lo que dice la factura del proveedor.
    const costoUnitario = Math.round((costoLote / cantidad) * 10000) / 10000;

    const productId = lotProduct.id;
    setLotBusy(true);
    void registerPurchase(lotSupplier.trim() || 'Sin proveedor', productId, lotVariantIndex, cantidad, costoUnitario, kg || undefined)
      ?.then(() => {
        if (expandedId === productId) loadLots(productId);
      })
      .finally(() => {
        setLotBusy(false);
        setLotProduct(null);
      });
  }

  function openNewProductDialog(initialSku?: string) {
    setEditingProductId(null);
    setNpName('');
    setNpCategory(categories[0] ?? '');
    setNpSubcategory('');
    setNpBrand('');
    setNpSku(initialSku ?? '');
    setNpLocation('');
    setNpPrice('');
    setNpCost('');
    setNpMinStock('');
    setNpEventDate('');
    setNpEventTime('');
    setNpEventSeats('');
    setNpEventDescription('');
    setNpEventImages([]);
    setNpEventTerms('');
    setNpFinancing(false);
    setNpDownPercent('30');
    setNpInstallments('4');
    setNpFrequency('MENSUAL');
    setNpVariants([]);
    setNpV1('');
    setNpV2('');
    setNpStock('');
    setNpBasicStock('');
    // Carnicerías/fruterías viven de la balanza: el producto nuevo arranca en Kg.
    setNpSoldByWeight(features.weight === 'default');
    setNpAreaRoll(false);
    setNpRollWidths('');
    setNpRollLength('50');
    setNpRollPrice('');
    setNpRollPriceWidth('');
    setNpRollMeters({});
    setNpWholesalePrice('');
    setNpWholesaleMinQty('');
    setNpPromoPrice('');
    setNpExpiryDate('');
    setNpPhotoUrl(null);
    setNpSaleUnit('UND');
    setNpPlanEnabled(false);
    setNpPlanRate('');
    setNpPlanSizes('');
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
    setNpBrand(p.brand ?? '');
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
    // Fecha/hora/cupo del evento: sin esto, abrir un evento y guardarlo los mandaba vacíos y
    // el producto perdía cuándo era y cuántos puestos tenía.
    setNpEventDate(p.eventDate ?? '');
    setNpEventTime(p.eventTime ?? '');
    setNpEventSeats(p.eventSeats != null ? String(p.eventSeats) : '');
    setNpEventDescription(p.eventDescription ?? '');
    setNpEventImages(p.eventImages ?? []);
    setNpEventTerms(p.eventTerms ?? '');
    setNpFinancing(!!p.eventFinancingEnabled);
    setNpDownPercent(p.eventDownPercent != null ? String(p.eventDownPercent) : '30');
    setNpInstallments(p.eventInstallments != null ? String(p.eventInstallments) : '4');
    {
      // Una frecuencia CADA_n se abre como "Personalizado" con sus días cargados.
      const custom = /^CADA_(\d{1,3})$/.exec(p.eventFrequency ?? '');
      setNpFrequency(custom ? 'CUSTOM' : (p.eventFrequency ?? 'MENSUAL'));
      setNpFreqDays(custom ? custom[1] : '10');
    }
    setNpFinDeadline(p.eventFinancingDeadline ?? '');
    setNpAreaRoll(p.pricingMode === 'AREA_ROLL');
    setNpRollWidths(p.rollWidths ? formatRollWidths(p.rollWidths) : '');
    setNpRollLength(p.rollLengthM != null ? String(p.rollLengthM) : '50');
    setNpRollMeters(Object.fromEntries(p.variants.map((v) => [v.v1, String(v.stock)])));
    setNpV1('');
    setNpV2('');
    setNpStock('');
    setNpWholesalePrice(p.wholesalePrice != null ? String(p.wholesalePrice) : '');
    setNpWholesaleMinQty(p.wholesaleMinQty != null ? String(p.wholesaleMinQty) : '');
    setNpPromoPrice(p.promoPrice != null ? String(p.promoPrice) : '');
    setNpExpiryDate(p.expiryDate ?? '');
    setNpPhotoUrl(p.photoUrl ?? null);
    // Se restaura la unidad de venta y el plan de consumo del producto real — antes esta
    // pantalla no los traía de vuelta al editar, así que guardar sin tocarlos silenciosamente
    // los reseteaba (una tela por metro podía volver a "por unidad" sin que nadie lo pidiera).
    setNpSaleUnit((p.saleUnit as 'UND' | 'KG' | 'MT' | undefined) ?? 'UND');
    setNpPlanEnabled(p.consumptionPlanEnabled ?? false);
    setNpPlanRate(p.consumptionPlanRate != null ? String(p.consumptionPlanRate) : '');
    setNpPlanSizes(p.consumptionPlanSizes?.length ? p.consumptionPlanSizes.join(', ') : '');
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
    setNpBrand('');
    setNpSku(seed.sku);
    setNpLocation(seed.location);
    setNpPrice(String(seed.price));
    setNpCost(String(seed.cost));
    setNpMinStock(String(seed.minStock));
    setNpSaleUnit((seed.saleUnit as 'UND' | 'KG' | 'MT' | undefined) ?? 'UND');
    setNpPlanEnabled(false);
    setNpPlanRate('');
    setNpPlanSizes('');
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
    if (!npV1.trim() || (variantDims.dim2 && !npV2.trim())) return;
    setNpVariants((prev) => [
      ...prev,
      { v1: npV1.trim(), v2: variantDims.dim2 ? npV2.trim() : '', stock: Number(npStock) || 0, soldByWeight: npSoldByWeight },
    ]);
    setNpV1('');
    setNpV2('');
    setNpStock('');
  }

  /** Antes esto fallaba en silencio: si faltaba algo (más comúnmente, no haber tocado el botón +
   * para agregar la variante) el clic en "Guardar producto" simplemente no hacía nada, sin avisar
   * qué faltaba. Ahora cada condición deja un mensaje concreto arriba del botón. */
  function openSupplies(p: ShopProduct) {
    setSuppliesFor(p);
    setSupplyDraft(
      serviceSupplies
        .filter((x) => x.serviceProductId === p.id)
        .map((x) => ({ supplyProductId: x.supplyProductId, supplyV1: x.supplyV1, supplyV2: x.supplyV2, quantity: String(x.quantity) })),
    );
  }

  async function saveSupplies() {
    if (!suppliesFor) return;
    setSavingSupplies(true);
    try {
      const payload = supplyDraft
        .filter((x) => x.supplyProductId && Number(x.quantity.replace(',', '.')) > 0)
        .map((x) => ({
          supplyProductId: x.supplyProductId,
          supplyV1: x.supplyV1,
          supplyV2: x.supplyV2,
          quantity: Number(x.quantity.replace(',', '.')),
        }));
      const saved = await shopApi.setServiceSupplies(suppliesFor.id, payload);
      // Se reemplaza solo la receta de ESTE servicio; las de los demás quedan como estaban.
      setServiceSupplies([...serviceSupplies.filter((x) => x.serviceProductId !== suppliesFor.id), ...saved]);
      setSuppliesFor(null);
    } catch (err) {
      console.error('No se pudieron guardar los insumos', err);
    } finally {
      setSavingSupplies(false);
    }
  }

  function saveNewProduct() {
    const price = Number(npPrice) || 0;
    if (!npName.trim()) return setSaveError('Falta el nombre del producto.');
    if (!esEvento && !isServiceShop && !npSku.trim()) return setSaveError('Falta el SKU / código de barras.');
    if (!price) return setSaveError('El precio de venta debe ser mayor a 0.');
    const rollWidths = npAreaRoll ? parseRollWidths(npRollWidths) : [];
    if (npAreaRoll && rollWidths.length === 0) {
      return setSaveError('Ingresa al menos un ancho de rollo (ej. 1,06 1,37 1,60).');
    }
    // Un producto por m² no lleva stock por unidades: el material se controla por rollo, así que
    // no se le pide stock ni variantes como al resto del catálogo. Un servicio (estética/barbería)
    // tampoco: no hay nada que contar.
    if (esEvento && !npEventDate) return setSaveError('Ponle fecha al evento.');
    if (esEvento && !npEventTime) return setSaveError('Ponle hora de inicio al evento.');
    if (esEvento && npFinancing && (Number(npInstallments) || 0) < 2) {
      return setSaveError('Un financiamiento necesita al menos 2 cuotas.');
    }
    if (esEvento && (!npEventSeats || Number(npEventSeats) < 1)) {
      return setSaveError('Indica cuántos puestos tiene el evento.');
    }
    // Un evento no lleva stock por unidades: el cupo son los puestos, y de ahí sale su
    // disponibilidad. Pedirle stock además sería llevar la misma cuenta dos veces.
    if (!esEvento && !npAreaRoll && !isServiceShop && npVariants.length === 0 && npBasicStock.trim() === '') {
      return setSaveError('Ingresa el stock del producto, o agrega al menos una variante (talla/color) si aplica.');
    }
    if (!esEvento && !editingProductId && !npPhotoUrl) return setSaveError('Agrega una foto del producto.');
    setSaveError(null);
    // El esquema exige al menos una variante; en impresión por m² se crea una sola, nominal,
    // con stock alto para que nunca dispare alertas de agotado (el stock real es el rollo). En
    // servicios se crea igual una sola, nominal, sin stock — productStatus() la exime de "Agotado".
    // Una variante por ancho de rollo, cuyo stock son los METROS LINEALES que quedan de ese
    // rollo — es de donde el POS descuenta el material al vender (ver printPricing.rollWidthLabel).
    const variants: ShopVariant[] = esEvento
      ? [{ v1: 'Entrada', v2: '', stock: Number(npEventSeats) || 0, soldByWeight: false }]
      : npAreaRoll
      ? rollWidths.map((w) => ({
          v1: rollWidthLabel(w),
          v2: '',
          stock: Number((npRollMeters[rollWidthLabel(w)] ?? '').replace(',', '.')) || 0,
          soldByWeight: false,
        }))
      : isServiceShop
        ? [{ v1: 'Único', v2: '', stock: 0, soldByWeight: false }]
        : npVariants.length > 0
          ? npVariants
          : [{ v1: 'Único', v2: '', stock: Number(npBasicStock) || 0, soldByWeight: npSoldByWeight }];
    const input = {
      name: npName.trim(),
      category: npCategory,
      subcategory: npSubcategory.trim(),
      brand: npBrand.trim(),
      sku: isServiceShop ? '' : npSku.trim(),
      location: npLocation.trim(),
      price,
      cost: Number(npCost) || 0,
      minStock: Number(npMinStock) || 0,
      variants,
      wholesalePrice: !isServiceShop && npWholesalePrice !== '' ? Number(npWholesalePrice) || 0 : undefined,
      wholesaleMinQty: !isServiceShop && npWholesaleMinQty !== '' ? Number(npWholesaleMinQty) || 0 : undefined,
      promoPrice: !isServiceShop && npPromoPrice !== '' ? Number(npPromoPrice) || 0 : undefined,
      expiryDate: !isServiceShop && npExpiryDate ? npExpiryDate : undefined,
      photoUrl: npPhotoUrl ?? undefined,
      pricingMode: (npAreaRoll ? 'AREA_ROLL' : isServiceShop ? 'SERVICE' : 'UNIT') as 'UNIT' | 'AREA_ROLL' | 'SERVICE',
      rollWidths: npAreaRoll ? rollWidths : undefined,
      rollLengthM: npAreaRoll ? Number(npRollLength.replace(',', '.')) || 50 : undefined,
      saleUnit: usaUnidades ? npSaleUnit : undefined,
      isEvent: esEvento,
      // Un evento se crea para venderse: nace visible en la taquilla.
      isPublished: esEvento ? true : undefined,
      eventDate: esEvento ? npEventDate : undefined,
      eventTime: esEvento ? npEventTime : undefined,
      eventSeats: esEvento ? Number(npEventSeats) || undefined : undefined,
      eventDescription: esEvento ? npEventDescription.trim() || undefined : undefined,
      eventImages: esEvento ? npEventImages : undefined,
      eventTerms: esEvento ? npEventTerms.trim() || undefined : undefined,
      eventFinancingEnabled: esEvento ? npFinancing : undefined,
      eventDownPercent: esEvento && npFinancing ? Number(npDownPercent) || 0 : undefined,
      eventInstallments: esEvento && npFinancing ? Number(npInstallments) || undefined : undefined,
      eventFrequency:
        esEvento && npFinancing
          ? npFrequency === 'CUSTOM'
            ? `CADA_${Math.max(1, Math.min(365, Number(npFreqDays) || 10))}`
            : npFrequency
          : undefined,
      eventFinancingDeadline: esEvento && npFinancing ? npFinDeadline || null : undefined,
      // Plan de consumo: solo tiene sentido con Kg/Mt, y con tarifa cargada.
      consumptionPlanEnabled: npSaleUnit !== 'UND' && npPlanEnabled && Number(npPlanRate) > 0,
      consumptionPlanRate: npSaleUnit !== 'UND' && npPlanEnabled && Number(npPlanRate) > 0 ? Number(npPlanRate) : undefined,
      consumptionPlanSizes:
        npSaleUnit !== 'UND' && npPlanEnabled
          ? npPlanSizes
              .split(',')
              .map((n) => Number(n.trim().replace(',', '.')))
              .filter((n) => n > 0)
          : undefined,
    };
    if (editingProductId) updateProduct(editingProductId, input);
    else addProduct(input);
    setNewOpen(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-brand-950">
          {modo === 'tienda'
            ? 'Tienda'
            : isTicketShop
              ? 'Eventos'
              : rubro.id === 'agencia_publicidad' || isServiceShop
                ? 'Servicios'
                : 'Inventario'}
        </h1>
        <div className="flex gap-2 flex-wrap">
          {/* Escanear código de barras, recuento físico, sumar stock y registrar compra son
              todo operaciones de MERCANCÍA. Una tickera no tiene nada físico que contar,
              escanear o reponer: el cupo de un evento se fija al crearlo y solo baja cuando se
              vende (ver ShopProduct.eventSeats). */}
          {!isTicketShop && (
            <>
              <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => openCameraScan('toolbar')}>
                <ScanLine className="h-4 w-4" /> Escanear
              </TextureButton>
              <TextureButton variant="minimal" size="default" className="!w-auto" onClick={openRecountDialog}>
                <ClipboardList className="h-4 w-4" /> Recuento físico
              </TextureButton>
              <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setSumarOpen(true)}>
                <PackagePlus className="h-4 w-4" /> Sumar a inventario
              </TextureButton>
              <TextureButton variant="minimal" size="default" className="!w-auto" onClick={openPurchaseDialog}>
                <Truck className="h-4 w-4" /> Registrar compra
              </TextureButton>
              <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setImportOpen(true)}>
                <FileSpreadsheet className="h-4 w-4" /> Cargar Excel
              </TextureButton>
            </>
          )}
          {/* Ir a la tienda pública tal como la ve el cliente: es donde se compran las entradas
              de los eventos. Solo lo que esté publicado aparece ahí. */}
          <TextureButton
            variant="minimal"
            size="default"
            className="!w-auto"
            onClick={() => window.open(`${window.location.origin}/tienda/${restaurant.slug}`, '_blank', 'noopener')}
          >
            <Store className="h-4 w-4" /> Abrir tienda
          </TextureButton>
          <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => { setRaisePercent(''); setRaiseError(null); setRaiseOpen(true); }}>
            <TrendingUp className="h-4 w-4" /> Aumentar precios
          </TextureButton>
          <TextureButton variant="brand" size="default" className="!w-auto" onClick={() => openNewProductDialog()}>
            <Plus className="h-4 w-4" /> {isTicketShop ? 'Nuevo evento' : isServiceShop ? 'Nuevo servicio' : 'Nuevo producto'}
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
                        onClick={() => { const abrir = !expanded; setExpandedId(abrir ? p.id : null); if (abrir) loadLots(p.id); }}
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
                          {/* Evento: cuándo es, cuánto cupo queda y cuánto lleva costando. El
                              cupo y el costo NO viven en el producto (se cuentan sobre ventas y
                              gastos), así que solo se pueden mostrar acá. */}
                          {p.isEvent && (() => {
                            const vendidos = session.eventSeatsSold[p.id] ?? 0;
                            const cupo = p.eventSeats ?? 0;
                            const quedan = Math.max(0, cupo - vendidos);
                            const costo = session.eventCost[p.id] ?? 0;
                            const ingreso = vendidos * p.price;
                            return (
                              <div className="mt-1 ml-[52px] flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                                <span className="text-brand-950/50">
                                  {p.eventDate?.split('-').reverse().join('/')}
                                  {p.eventTime && ` · ${p.eventTime}`}
                                </span>
                                <span className={quedan === 0 ? 'font-semibold text-red-600' : 'text-brand-950/60'}>
                                  {quedan === 0 ? 'Agotado' : `Quedan ${quedan} de ${cupo}`}
                                </span>
                                {costo > 0 && (
                                  <span className="text-brand-950/50">
                                    Costo {money(costo)} · {ingreso >= costo ? 'gana ' : 'pierde '}
                                    <span className={ingreso >= costo ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>
                                      {money(Math.abs(ingreso - costo))}
                                    </span>
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-3 pr-3 text-brand-950/60">{p.sku}</td>
                        <td className="py-3 pr-3">
                          <span className="text-brand-950/70">{p.category}</span>
                          {p.subcategory && <span className="block text-[11px] text-brand-950/40">{p.subcategory}</span>}
                          {p.brand && <span className="block text-[11px] font-medium text-brand-500">{p.brand}</span>}
                        </td>
                        <td className="py-3 pr-3 text-brand-950/60">{p.location || '—'}</td>
                        <td className="py-3 pr-3">
                          {/* Rango cuando las variantes valen distinto (ej. 60/90/150 PSI): un solo
                              número sería mentira en las otras dos. */}
                          {tienePreciosDistintos(p) ? (
                            (() => {
                              const precios = p.variants.map((v) => v.price ?? p.price);
                              return <span className="whitespace-nowrap">{money(Math.min(...precios))} – {money(Math.max(...precios))}</span>;
                            })()
                          ) : (
                            <>
                              {money(p.price)}
                              {moneyBs(p.price) && <span className="block text-[11px] text-brand-950/40">{moneyBs(p.price)}</span>}
                            </>
                          )}
                        </td>
                        <td className="py-3 pr-3 text-brand-950/70">
                          {p.pricingMode === 'AREA_ROLL'
                            ? `${productStock(p).toFixed(1)} m²`
                            : isWeight
                              ? `${productStock(p).toFixed(1)} Kg`
                              : formatStock(productStock(p))}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
                            {/* Publicar/ocultar de la tienda pública, uno por uno. Antes esto
                                solo existía como un interruptor global en Ajustes, así que
                                bajar un evento agotado obligaba a esconder el catálogo entero. */}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setProductsPublished([p.id], !p.isPublished); }}
                              title={p.isPublished ? 'Visible en tu tienda — toca para ocultarlo' : 'Oculto — toca para publicarlo'}
                              className={p.isPublished ? 'text-emerald-500 hover:text-emerald-600' : 'text-brand-950/25 hover:text-brand-500'}
                            >
                              {p.isPublished ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openLotDialog(p); }}
                              title="Agregar lote (peso y costo de esta carga)"
                              className="text-brand-950/30 hover:text-brand-500"
                            >
                              <PackagePlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setLabelProduct(p); }}
                              title="Imprimir etiqueta de precio"
                              className="text-brand-950/30 hover:text-brand-500"
                            >
                              <Tags className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openEditProductDialog(p); }}
                              title="Editar producto"
                              className="text-brand-950/30 hover:text-brand-500"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openSupplies(p); }}
                              title="Insumos que consume este servicio"
                              className={
                                serviceSupplies.some((x) => x.serviceProductId === p.id)
                                  ? 'text-brand-500 hover:text-brand-400'
                                  : 'text-brand-950/30 hover:text-brand-500'
                              }
                            >
                              <FlaskConical className="h-3.5 w-3.5" />
                            </button>
                            {canDeleteProducts && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setProductToDelete(p); }}
                                title="Eliminar producto"
                                className="text-brand-950/30 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
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
                                  {(() => {
                                    if (isBasicVariant) return `${p.sku} · Stock ${v.stock}${v.soldByWeight ? ' Kg' : ''}`;
                                    // Dimensiones de ESTE producto, no las del formulario — un producto ya guardado
                                    // puede tener otra categoría que la que esté abierta ahora en "Nuevo producto".
                                    const dims = resolveVariantDims(rubro, p.category);
                                    return `${p.sku}-${v.v1}${v.v2 ? `-${v.v2}` : ''} · ${dims.dim1} ${v.v1}${v.v2 ? ` · ${dims.dim2} ${v.v2}` : ''} · Stock ${v.stock}${v.soldByWeight ? ' Kg' : ''}`;
                                  })()}
                                </div>
                              );
                            })}
                            <div className="mt-2.5 pt-2.5 border-t border-brand-950/[0.06]">
                              <p className="text-[11px] font-bold uppercase text-brand-950/40 mb-1.5">Lotes en existencia</p>
                              {lotsLoading ? (
                                <p className="text-[12px] text-brand-950/40">Cargando…</p>
                              ) : !lots || lots.variantes.every((g) => g.lotes.length === 0) ? (
                                <p className="text-[12px] text-brand-950/40">
                                  Sin lotes registrados. Cada compra que cargues desde “Registrar compra” entra como un lote con su propio costo.
                                </p>
                              ) : (
                                <div className="flex flex-col gap-2.5">
                                  {lots.variantes
                                    .filter((g) => g.lotes.length > 0 || g.stock > 0)
                                    .map((g) => (
                                      <div key={g.variante}>
                                        {/* El encabezado por variante solo tiene sentido si hay más de una:
                                            en un producto simple sería una línea que dice "Único". */}
                                        {lots.variantes.length > 1 && (
                                          <p className="text-[12px] font-semibold text-brand-950 mb-0.5">
                                            {g.variante}
                                            <span className="ml-1.5 font-normal text-brand-950/40">
                                              {money(g.precio)} · costo {money(g.costoActual)}
                                            </span>
                                          </p>
                                        )}
                                        {g.lotes.length === 0 ? (
                                          <p className="text-[12px] text-brand-950/35 pl-2">
                                            {formatUnidad(g.stock, lots.producto.unidad)} sin lote registrado.
                                          </p>
                                        ) : (
                                          <div className="flex flex-col gap-1 pl-2">
                                            {g.lotes.map((l, i) => (
                                              <div key={`${l.costo}-${l.pesoKg ?? 'x'}-${i}`} className="flex items-center justify-between gap-2 text-[12.5px]">
                                                <span className="text-brand-950/70">
                                                  <span className="font-semibold text-brand-950">
                                                    {formatUnidad(l.queda, lots.producto.unidad)}
                                                  </span>
                                                  {' a '}{money(l.costo)}
                                                  {/* El peso es lo que distingue una carga de otra cuando se
                                                      compra por kilo y se vende por rollo. */}
                                                  {l.pesoKg != null && l.pesoKg > 0 && (
                                                    <span className="text-brand-950/45"> · peso {formatUnidad(l.pesoKg, 'KG')}</span>
                                                  )}
                                                  <span className="block text-[11px] text-brand-950/40">
                                                    {l.proveedor} · {new Date(l.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: '2-digit' })}
                                                    {l.cargas > 1 && ` · ${l.cargas} entradas`}
                                                  </span>
                                                </span>
                                                <span className="font-semibold text-brand-950/70 shrink-0">{money(l.valor)}</span>
                                              </div>
                                            ))}
                                            {g.sinLote > 0.001 && (
                                              <p className="text-[11px] text-brand-950/35">
                                                {formatUnidad(g.sinLote, lots.producto.unidad)} en stock sin lote que lo respalde.
                                              </p>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  <div className="flex items-center justify-between gap-2 text-[12.5px] pt-1.5 border-t border-brand-950/[0.06]">
                                    <span className="text-brand-950/70">
                                      Total {formatUnidad(lots.totales.enLotes, lots.producto.unidad)}
                                      <span className="block text-[11px] text-brand-950/40">
                                        Costo promedio {money(lots.totales.costoActual)} por{' '}
                                        {lots.producto.unidad === 'MT' ? 'Mt' : lots.producto.unidad === 'KG' ? 'Kg' : 'unidad'}
                                      </span>
                                    </span>
                                    <span className="font-bold text-brand-950 shrink-0">{money(lots.totales.valor)}</span>
                                  </div>
                                </div>
                              )}
                            </div>
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

      {cameraScanOpen && (
        <Suspense fallback={null}>
          <ShopSkuScanDialog
            open
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
        </Suspense>
      )}

      {/* ---------- Registrar compra ---------- */}
      {sumarOpen && (
        <SumarAInventarioDialog
          productos={products}
          rubro={rubro}
          money={money}
          onClose={() => setSumarOpen(false)}
          onSubmit={(productoId, variantIndex, qty, costoUnitario, kg, proveedor) =>
            registerPurchase(proveedor, productoId, variantIndex, qty, costoUnitario, kg)?.then(() => {
              if (expandedId === productoId) loadLots(productoId);
            })
          }
        />
      )}

      {/* ---------- Agregar lote (desde la fila del producto) ---------- */}
      <Dialog open={!!lotProduct} onOpenChange={(open) => !open && setLotProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar lote</DialogTitle>
          </DialogHeader>
          {lotProduct && (() => {
            const porPeso = lotProduct.saleUnit === 'KG' || lotProduct.saleUnit === 'MT';
            const unidad = lotProduct.saleUnit === 'MT' ? 'Mt' : 'Kg';
            const kg = Number(lotKg.replace(',', '.')) || 0;
            const costoLote = Number(lotCost.replace(',', '.')) || 0;
            const cantidad = porPeso ? kg : Number(lotUnits.replace(',', '.')) || 0;
            const costoUnit = cantidad > 0 ? costoLote / cantidad : 0;
            const costoPorKg = kg > 0 ? costoLote / kg : 0;
            const variante = lotProduct.variants[lotVariantIndex];
            const precio = variante?.price ?? lotProduct.price;

            return (
              <>
                <p className="text-sm text-brand-950/60 -mt-1">{lotProduct.name}</p>

                {lotProduct.variants.length > 1 && (
                  <label className="block text-sm">
                    <span className="text-brand-950/70">Variante</span>
                    <select
                      value={lotVariantIndex}
                      onChange={(e) => setLotVariantIndex(Number(e.target.value))}
                      className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2"
                    >
                      {lotProduct.variants.map((v, i) => (
                        <option key={i} value={i}>
                          {v.v1}{v.v2 ? ` · ${v.v2}` : ''} — {money(v.price ?? lotProduct.price)} (stock {formatStock(v.stock)})
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <div className="flex gap-3">
                  {/* En un producto por rollo/unidad hace falta saber cuántos entran; el peso es
                      del lote completo. En uno que se vende por Kg, los Kg ya son la cantidad. */}
                  {!porPeso && (
                    <label className="block text-sm w-28 shrink-0">
                      <span className="text-brand-950/70">Cantidad</span>
                      <input
                        type="number"
                        step="1"
                        value={lotUnits}
                        onChange={(e) => setLotUnits(e.target.value)}
                        className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2"
                      />
                    </label>
                  )}
                  <label className="block text-sm flex-1">
                    <span className="text-brand-950/70">Peso ({unidad})</span>
                    <input
                      type="number"
                      step="0.001"
                      value={lotKg}
                      onChange={(e) => setLotKg(e.target.value)}
                      placeholder="43.000"
                      className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm flex-1">
                    <span className="text-brand-950/70">Costo del lote</span>
                    <input
                      type="number"
                      step="0.01"
                      value={lotCost}
                      onChange={(e) => setLotCost(e.target.value)}
                      placeholder="150.00"
                      className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2"
                    />
                  </label>
                </div>

                <label className="block text-sm">
                  <span className="text-brand-950/70">Proveedor</span>
                  <input
                    value={lotSupplier}
                    onChange={(e) => setLotSupplier(e.target.value)}
                    placeholder="Nombre del proveedor"
                    className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2"
                  />
                </label>

                {/* A cuánto sale, antes de guardar: es lo que decide si el precio de venta
                    todavía deja margen con este lote. */}
                {costoLote > 0 && cantidad > 0 && (
                  <p className="text-[12.5px] text-brand-950/55">
                    Sale a <span className="font-semibold text-brand-950">{money(costoUnit)}</span>
                    {porPeso ? ` por ${unidad}` : ' cada uno'}
                    {!porPeso && kg > 0 && <> · {money(costoPorKg)} por {unidad}</>}
                    {' · se vende a '}{money(precio)}
                    {precio > 0 && (
                      <span className={costoUnit < precio ? ' text-emerald-600 font-medium' : ' text-red-600 font-medium'}>
                        {' '}({(((precio - costoUnit) / precio) * 100).toFixed(1)}% de margen)
                      </span>
                    )}
                  </p>
                )}

                <DialogFooter>
                  <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setLotProduct(null)}>
                    Cancelar
                  </TextureButton>
                  <TextureButton
                    variant="brand"
                    size="default"
                    className="!w-auto disabled:opacity-40"
                    disabled={lotBusy || cantidad <= 0}
                    onClick={confirmLot}
                  >
                    {lotBusy ? 'Guardando…' : 'Agregar lote'}
                  </TextureButton>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

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
                <option key={i} value={i}>
                  {puProduct.pricingMode === 'AREA_ROLL' ? `Rollo ${v.v1} m` : `${v.v1}${v.v2 ? ` · ${v.v2}` : ''}`} (stock actual:{' '}
                  {formatStock(v.stock)}{puProduct.pricingMode === 'AREA_ROLL' ? ' m²' : ''})
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-3">
            <label className="block text-sm flex-1">
              <span className="text-brand-950/70">
                Cantidad
                {puProduct?.pricingMode === 'AREA_ROLL'
                  ? ' (m² del rollo)'
                  : puFraccionable
                    ? ` (${puProduct?.saleUnit === 'MT' ? 'Mt' : 'Kg'})`
                    : ''}
              </span>
              <input
                type="number"
                step={puProduct?.pricingMode === 'AREA_ROLL' || puFraccionable ? '0.001' : '1'}
                value={puQty}
                onChange={(e) => setPuQty(e.target.value)}
                placeholder={
                  puProduct?.pricingMode === 'AREA_ROLL'
                    ? // Un rollo entero = ancho × largo m², que es lo que se repone al comprarlo.
                      String(
                        Math.round(
                          (Number((puProduct.variants[puVariantIndex]?.v1 ?? '').replace(',', '.')) * (puProduct.rollLengthM ?? 50) +
                            Number.EPSILON) * 100,
                        ) / 100 || puProduct.rollLengthM || 50,
                      )
                    : puFraccionable
                      ? '10.000'
                      : '10'
                }
                className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
            </label>
            <label className="block text-sm flex-1">
              <span className="text-brand-950/70">{puCostoTotal ? 'Costo del lote' : 'Costo unitario'}</span>
              <input type="number" value={puCost} onChange={(e) => setPuCost(e.target.value)} placeholder="0.00" className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500" />
            </label>
          </div>
          {/*
            Un rollo de manguera se compra por rollo, no por kilo: lo que se sabe es "este rollo
            de 43 Kg me costó $150", no cuánto salió el kilo. Con este interruptor se escribe el
            monto del lote completo y el costo por unidad lo saca el sistema, en vez de obligar a
            dividir a mano y arrastrar el error de redondeo al margen.
          */}
          {puFraccionable && (
            <label className="flex items-center gap-2 text-[13px] text-brand-950/70">
              <input
                type="checkbox"
                checked={puCostoTotal}
                onChange={(e) => setPuCostoTotal(e.target.checked)}
                className="h-4 w-4 rounded border-brand-950/25 accent-brand-500"
              />
              Escribí el costo del lote completo, no el de cada {puProduct?.saleUnit === 'MT' ? 'metro' : 'kilo'}
            </label>
          )}
          {puCostoUnitarioCalculado !== null && (
            <p className="text-[12px] text-brand-950/50">
              Sale a <span className="font-semibold text-brand-950/70">{money(puCostoUnitarioCalculado)}</span> por{' '}
              {puProduct?.saleUnit === 'MT' ? 'metro' : 'kilo'} · se vende a {money(puProduct?.price ?? 0)}
            </p>
          )}
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
                <option key={i} value={i}>
                  {rcProduct?.pricingMode === 'AREA_ROLL' ? `Rollo ${v.v1} m` : `${v.v1}${v.v2 ? ` · ${v.v2}` : ''}`} (sistema: {formatStock(v.stock)}
                  {rcProduct?.pricingMode === 'AREA_ROLL' ? ' m²' : v.soldByWeight ? ' Kg' : ''})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-brand-950/70">
              Cantidad contada
              {rcProduct?.pricingMode === 'AREA_ROLL'
                ? ' (m² que quedan)'
                : rcProduct?.variants[rcVariantIndex]?.soldByWeight
                  ? ' (Kg)'
                  : ''}
            </span>
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
          <Dialog open={!!suppliesFor} onOpenChange={(o) => !o && setSuppliesFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Insumos de "{suppliesFor?.name}"</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-brand-950/50">
            Qué gasta este servicio del inventario cada vez que se vende. Se descuenta solo al cobrar — el
            barbero no registra nada aparte.
          </p>

          <div className="space-y-2 max-h-[46vh] overflow-y-auto">
            {supplyDraft.length === 0 && (
              <p className="text-sm text-brand-950/40 py-3 text-center">Este servicio todavía no consume insumos.</p>
            )}
            {supplyDraft.map((row, i) => {
              const supply = products.find((x) => x.id === row.supplyProductId);
              const perUse = Number(row.quantity.replace(',', '.'));
              return (
                <div key={i} className="rounded-xl border border-brand-950/10 p-2.5 space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={row.supplyProductId}
                      onChange={(e) => {
                        const next = [...supplyDraft];
                        const chosen = products.find((x) => x.id === e.target.value);
                        next[i] = {
                          ...next[i],
                          supplyProductId: e.target.value,
                          // Al cambiar de insumo, la variante anterior ya no aplica.
                          supplyV1: chosen?.variants[0]?.v1 ?? '',
                          supplyV2: chosen?.variants[0]?.v2 ?? '',
                        };
                        setSupplyDraft(next);
                      }}
                      className="flex-1 min-w-0 border border-brand-950/15 rounded-lg px-2 py-1.5 text-sm"
                    >
                      <option value="">— Elegir insumo —</option>
                      {products
                        .filter((x) => x.id !== suppliesFor?.id)
                        .map((x) => (
                          <option key={x.id} value={x.id}>{x.name}</option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setSupplyDraft(supplyDraft.filter((_, idx) => idx !== i))}
                      className="text-brand-950/40 hover:text-red-500 shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {supply && supply.variants.length > 1 && (
                    <select
                      value={`${row.supplyV1}|${row.supplyV2}`}
                      onChange={(e) => {
                        const [v1, v2] = e.target.value.split('|');
                        const next = [...supplyDraft];
                        next[i] = { ...next[i], supplyV1: v1, supplyV2: v2 };
                        setSupplyDraft(next);
                      }}
                      className="w-full border border-brand-950/15 rounded-lg px-2 py-1.5 text-sm"
                    >
                      {supply.variants.map((v, vi) => (
                        <option key={vi} value={`${v.v1}|${v.v2}`}>
                          {v.v1}{v.v2 ? ` · ${v.v2}` : ''} (quedan {formatStock(v.stock)})
                        </option>
                      ))}
                    </select>
                  )}

                  <label className="flex items-center gap-2 text-xs">
                    <span className="text-brand-950/60 shrink-0">Consume por servicio</span>
                    <input
                      value={row.quantity}
                      onChange={(e) => {
                        const next = [...supplyDraft];
                        next[i] = { ...next[i], quantity: e.target.value };
                        setSupplyDraft(next);
                      }}
                      placeholder="0,025"
                      inputMode="decimal"
                      className="w-24 border border-brand-950/15 rounded-lg px-2 py-1.5 text-sm"
                    />
                    {perUse > 0 && (
                      <span className="text-brand-950/40">
                        ≈ rinde {Math.round(1 / perUse)} servicios por unidad
                      </span>
                    )}
                  </label>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setSupplyDraft([...supplyDraft, { supplyProductId: '', supplyV1: '', supplyV2: '', quantity: '' }])}
            className="text-sm font-semibold text-brand-500 hover:underline self-start"
          >
            + Agregar insumo
          </button>

          <DialogFooter>
            <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setSuppliesFor(null)}>
              Cancelar
            </TextureButton>
            <TextureButton variant="brand" size="default" className="!w-auto disabled:opacity-50" disabled={savingSupplies} onClick={saveSupplies}>
              {savingSupplies ? 'Guardando…' : 'Guardar insumos'}
            </TextureButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DialogHeader>
            <DialogTitle>
              {editingProductId
                ? isTicketShop ? 'Editar evento' : isServiceShop ? 'Editar servicio' : 'Editar producto'
                : isTicketShop ? 'Nuevo evento' : isServiceShop ? 'Nuevo servicio' : 'Nuevo producto'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              {/* En un evento esta imagen NO es una foto de catálogo: es el arte del boleto
                  digital, lo que el comprador ve a pantalla completa en su Wallet (ver
                  WalletEntradasPage). Por eso cambia de nombre y de forma — vertical, como el
                  boleto. */}
              <PhotoUploadField
                value={npPhotoUrl}
                onChange={setNpPhotoUrl}
                label={
                  esEvento
                    ? 'Imagen del boleto digital'
                    : editingProductId
                      ? 'Foto del producto'
                      : 'Foto del producto (obligatoria)'
                }
                uploadUrl="/shop/products/upload-photo"
                shape="square"
                aiEnabled
              />
              {esEvento && (
                <p className="mt-1 text-[11px] font-light text-brand-950/45">
                  Es el arte que el comprador ve en su entrada, a pantalla completa. Se ve mejor
                  vertical. Si no cargas ninguna, la entrada usa un fondo con el degradado de
                  QuickTap.
                </p>
              )}
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
            {/* Unidad de venta: cambia qué significa el precio (por unidad, por kilo o por metro)
                y cómo se pide la cantidad al vender. */}
            {usaUnidades && !esEvento && (
              <label className="block text-sm">
                <span className="text-brand-950/70">Se vende por</span>
                <div className="mt-1 flex gap-1.5">
                  {([
                    ['UND', 'Unidad'],
                    ['KG', 'Kilo'],
                    ['MT', 'Metro'],
                  ] as const).map(([valor, etiqueta]) => (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => setNpSaleUnit(valor)}
                      className={`flex-1 rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                        npSaleUnit === valor
                          ? 'border-brand-500 bg-brand-500 text-white'
                          : 'border-brand-950/15 text-brand-950/60 hover:bg-brand-950/5'
                      }`}
                    >
                      {etiqueta}
                    </button>
                  ))}
                </div>
                <span className="mt-1 block text-[11px] font-light text-brand-950/45">
                  {npSaleUnit === 'UND'
                    ? 'El precio es por pieza.'
                    : `El precio es por ${npSaleUnit === 'KG' ? 'kilo' : 'metro'}; al vender se escribe la cantidad exacta.`}
                </span>
              </label>
            )}

            {/* Plan de consumo: solo con Kg/Mt — un plan de "unidades" no tiene el sentido de
                "metros que se van gastando" que pidió el negocio. */}
            {usaUnidades && !esEvento && npSaleUnit !== 'UND' && (
              <div className="rounded-xl border border-brand-950/10 p-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={npPlanEnabled} onChange={(e) => setNpPlanEnabled(e.target.checked)} />
                  <span className="font-medium text-brand-950">Ofrecer plan de consumo</span>
                </label>
                <p className="mt-0.5 text-[11px] font-light text-brand-950/45">
                  El cliente paga un paquete por adelantado a una tarifa más baja y lo retira con el tiempo.
                </p>
                {npPlanEnabled && (
                  <div className="mt-2.5 space-y-2.5">
                    <label className="block text-sm">
                      <span className="text-brand-950/70">Tarifa del plan (por {npSaleUnit === 'KG' ? 'kilo' : 'metro'})</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={npPlanRate}
                        onChange={(e) => setNpPlanRate(e.target.value)}
                        placeholder={`normal ${npPrice || '0'}`}
                        className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-brand-950/70">Tamaños de paquete que se ofrecen</span>
                      <input
                        value={npPlanSizes}
                        onChange={(e) => setNpPlanSizes(e.target.value)}
                        placeholder="50, 100, 500"
                        className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                      />
                      <span className="mt-1 block text-[11px] font-light text-brand-950/45">Separados por coma.</span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Eventos: fecha, hora y cupo. Aparecen solo en la categoría "Tickets" para no
                cargar el formulario del resto del catálogo con campos que no aplican. */}
            {esEvento && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="text-brand-950/70">Fecha del evento</span>
                    <input
                      type="date"
                      value={npEventDate}
                      onChange={(e) => setNpEventDate(e.target.value)}
                      className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-brand-950/70">Hora de inicio</span>
                    <input
                      type="time"
                      value={npEventTime}
                      onChange={(e) => setNpEventTime(e.target.value)}
                      className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                    />
                  </label>
                </div>
                <label className="block text-sm">
                  <span className="text-brand-950/70">Puestos disponibles</span>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={npEventSeats}
                    onChange={(e) => setNpEventSeats(e.target.value)}
                    placeholder="Ej: 120"
                    className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                  />
                  <span className="mt-1 block text-[11px] font-light text-brand-950/45">
                    El cupo hace de stock: cada entrada vendida descuenta un puesto.
                  </span>
                </label>

                {/* Lo que ve el comprador al tocar "Más información" en la taquilla. */}
                <label className="block text-sm sm:col-span-2">
                  <span className="text-brand-950/70">Descripción del evento</span>
                  <textarea
                    value={npEventDescription}
                    onChange={(e) => setNpEventDescription(e.target.value)}
                    rows={4}
                    placeholder="De qué se trata, qué incluye, cómo llegar, qué llevar…"
                    className="mt-1 w-full resize-none rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
                  />
                </label>

                <div className="sm:col-span-2">
                  <span className="text-sm text-brand-950/70">Galería del evento</span>
                  <span className="mt-0.5 block text-[11px] font-light text-brand-950/45">
                    Hasta 5 imágenes, en el carrusel de "Más información". Van aparte de la
                    imagen del boleto.
                  </span>
                  <div className="mt-2 grid grid-cols-5 gap-2">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <PhotoUploadField
                        key={i}
                        value={npEventImages[i] ?? null}
                        onChange={(url) =>
                          setNpEventImages((prev) => {
                            const next = [...prev];
                            // Se compacta al quitar una: sin esto quedarían huecos y la
                            // siguiente foto entraría en la posición equivocada.
                            if (url) next[i] = url;
                            else next.splice(i, 1);
                            return next.filter(Boolean).slice(0, 5);
                          })
                        }
                        label=""
                        uploadUrl="/shop/products/upload-photo"
                        shape="square"
                      />
                    ))}
                  </div>
                </div>

                <label className="block text-sm sm:col-span-2">
                  <span className="text-brand-950/70">Cláusulas / términos</span>
                  <textarea
                    value={npEventTerms}
                    onChange={(e) => setNpEventTerms(e.target.value)}
                    rows={4}
                    placeholder="Condiciones de la entrada: reembolsos, edad mínima, qué pasa si se suspende…"
                    className="mt-1 w-full resize-none rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
                  />
                  <span className="mt-1 block text-[11px] font-light text-brand-950/45">
                    El comprador tiene que aceptarlas antes de ver el precio y pagar.
                  </span>
                </label>

                {/* Financiamiento: la plantilla que se copia al plan de cuotas de cada venta. */}
                <div className="rounded-xl border border-brand-950/[0.08] p-3 sm:col-span-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" checked={npFinancing} onChange={(e) => setNpFinancing(e.target.checked)} />
                    <span className="font-medium text-brand-950">Permitir pago financiado</span>
                  </label>
                  {npFinancing && (
                    <>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <label className="block text-sm">
                          <span className="text-brand-950/70">Inicial (%)</span>
                          <input
                            type="number" min={0} max={99} value={npDownPercent}
                            onChange={(e) => setNpDownPercent(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="text-brand-950/70">Cuotas</span>
                          <input
                            type="number" min={2} max={60} value={npInstallments}
                            onChange={(e) => setNpInstallments(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="text-brand-950/70">Cada</span>
                          <select
                            value={npFrequency}
                            onChange={(e) => setNpFrequency(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm"
                          >
                            <option value="SEMANAL">Semana</option>
                            <option value="QUINCENAL">15 días</option>
                            <option value="MENSUAL">Mes</option>
                            <option value="CUSTOM">Personalizado…</option>
                          </select>
                        </label>
                      </div>
                      {npFrequency === 'CUSTOM' && (
                        <label className="mt-2 block text-sm">
                          <span className="text-brand-950/70">Cada cuántos días</span>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-sm text-brand-950/60">Cada</span>
                            <input
                              type="number" min={1} max={365} value={npFreqDays}
                              onChange={(e) => setNpFreqDays(e.target.value)}
                              className="w-24 rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm"
                            />
                            <span className="text-sm text-brand-950/60">días</span>
                          </div>
                        </label>
                      )}
                      <label className="mt-2 block text-sm">
                        <span className="text-brand-950/70">Aceptar financiamiento hasta</span>
                        <input
                          type="date"
                          value={npFinDeadline}
                          onChange={(e) => setNpFinDeadline(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm"
                        />
                        <span className="mt-1 block text-[11px] font-light text-brand-950/50">
                          Pasada la fecha solo se vende de contado, y antes de ella se ofrecen únicamente las
                          cuotas que alcanzan a pagarse hasta ese día. Vacío = sin límite.
                        </span>
                      </label>
                      {/* La cuenta hecha, con el precio que se está cargando: el local ve lo
                          mismo que le va a aparecer al comprador. */}
                      {(() => {
                        const precio = Number(npPrice) || 0;
                        const inicial = Math.round(precio * ((Number(npDownPercent) || 0) / 100) * 100) / 100;
                        const n = Math.max(1, Number(npInstallments) || 1);
                        const cuota = Math.round(((precio - inicial) / n) * 100) / 100;
                        return precio > 0 ? (
                          <p className="mt-2 text-[11.5px] font-light text-brand-950/55">
                            Inicial de {money(inicial)} y {n} cuota{n === 1 ? '' : 's'} de {money(cuota)}.
                          </p>
                        ) : null;
                      })()}
                    </>
                  )}
                </div>
              </>
            )}
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
              <span className="text-brand-950/70">Marca</span>
              <input
                value={npBrand}
                onChange={(e) => setNpBrand(e.target.value)}
                list="shop-brand-suggestions"
                placeholder="Ej: Coca-Cola"
                className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
              <datalist id="shop-brand-suggestions">
                {brandOptions.map((b) => <option key={b} value={b} />)}
              </datalist>
            </label>
            {!isServiceShop && (
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
            )}
            <label className="block text-sm">
              <span className="text-brand-950/70">Ubicación</span>
              <input value={npLocation} onChange={(e) => setNpLocation(e.target.value)} className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500" />
            </label>
            <label className="block text-sm">
              <span className="text-brand-950/70">Precio de venta{npAreaRoll ? ' (por m²)' : ''}</span>
              <input type="number" value={npPrice} onChange={(e) => setNpPrice(e.target.value)} className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500" />
            </label>
            <label className="block text-sm">
              <span className="text-brand-950/70">Costo{npAreaRoll ? ' (por m²)' : ''}</span>
              <input type="number" value={npCost} onChange={(e) => setNpCost(e.target.value)} className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500" />
            </label>
            {!npAreaRoll && !isServiceShop && (
              <label className="block text-sm">
                <span className="text-brand-950/70">Stock mínimo</span>
                <input type="number" value={npMinStock} onChange={(e) => setNpMinStock(e.target.value)} className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500" />
              </label>
            )}
          </div>

          {/* ---------- Impresión de gran formato (vinil / banner) — solo agencias de publicidad ---------- */}
          {(features.areaRoll || npAreaRoll) && (
          <div className="border-t border-brand-950/[0.06] pt-3.5">
            <label className="flex items-center gap-2 text-sm font-medium text-brand-950">
              <input type="checkbox" checked={npAreaRoll} onChange={(e) => setNpAreaRoll(e.target.checked)} />
              Se vende por metro cuadrado (impresión en vinil / banner)
            </label>
            <p className="text-xs text-brand-950/50 mt-1">
              El material sale de rollos de ancho fijo y el sobrante a lo ancho no se reaprovecha, así que
              al cliente se le cobra el ancho completo del rollo por el largo impreso.
            </p>

            {npAreaRoll && (
              <div className="mt-3 space-y-3">
                <label className="block text-sm">
                  <span className="text-brand-950/70">Anchos de rollo disponibles (m)</span>
                  <input
                    value={npRollWidths}
                    onChange={(e) => setNpRollWidths(e.target.value)}
                    placeholder="Banner: 1,06 1,37 1,60 1,84 · Vinil: 1,22 1,40 1,52"
                    className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                  />
                  {parseRollWidths(npRollWidths).length > 0 && (
                    <span className="mt-1 block text-[11px] text-brand-950/50">
                      Se usarán: {formatRollWidths(parseRollWidths(npRollWidths))} m
                    </span>
                  )}
                </label>

                <label className="block text-sm">
                  <span className="text-brand-950/70">Largo del rollo (m)</span>
                  <input
                    value={npRollLength}
                    onChange={(e) => setNpRollLength(e.target.value)}
                    placeholder="50"
                    className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                  />
                </label>

                {parseRollWidths(npRollWidths).length > 0 && (() => {
                  const rollLen = Number(npRollLength.replace(',', '.')) || 50;
                  // Un rollo entero rinde ancho × largo m² (1,22 × 50 = 61 m²) — ese es el número
                  // que se lleva como existencia, no los metros lineales.
                  const fullRollM2 = (w: number) => Math.round((w * rollLen + Number.EPSILON) * 100) / 100;
                  return (
                    <div>
                      <p className="text-sm text-brand-950/70">Metros cuadrados disponibles de cada rollo</p>
                      <p className="text-xs text-brand-950/45 mt-0.5 mb-2">
                        Los m² que te quedan hoy. Se descuentan solos con cada impresión y se reponen desde
                        "Registrar compra" al comprar un rollo nuevo.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {parseRollWidths(npRollWidths).map((w) => {
                          const label = rollWidthLabel(w);
                          return (
                            <label key={label} className="flex items-center gap-1.5 text-sm">
                              <span className="text-brand-950/60 w-12 shrink-0">{label} m</span>
                              <input
                                value={npRollMeters[label] ?? ''}
                                onChange={(e) => setNpRollMeters((prev) => ({ ...prev, [label]: e.target.value }))}
                                placeholder={String(fullRollM2(w))}
                                inputMode="decimal"
                                className="w-20 border border-brand-950/15 rounded-lg px-2 py-1.5 text-sm"
                              />
                              <span className="text-brand-950/40 text-xs">m²</span>
                            </label>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setNpRollMeters(
                            Object.fromEntries(parseRollWidths(npRollWidths).map((w) => [rollWidthLabel(w), String(fullRollM2(w))])),
                          )
                        }
                        className="mt-2 text-xs font-semibold text-brand-500 hover:underline"
                      >
                        Llenar con un rollo completo de cada ancho ({rollLen} m de largo)
                      </button>
                    </div>
                  );
                })()}

                <div className="rounded-xl bg-brand-950/[0.03] border border-brand-950/10 p-3">
                  <p className="text-xs font-semibold text-brand-950 mb-2">Calcular el costo por m² desde el rollo</p>
                  <div className="flex gap-2">
                    <label className="block text-xs flex-1">
                      <span className="text-brand-950/60">Precio del rollo</span>
                      <input
                        value={npRollPrice}
                        onChange={(e) => setNpRollPrice(e.target.value)}
                        placeholder="180"
                        className="mt-1 w-full border border-brand-950/15 rounded-lg px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="block text-xs flex-1">
                      <span className="text-brand-950/60">Ancho de ese rollo</span>
                      <input
                        value={npRollPriceWidth}
                        onChange={(e) => setNpRollPriceWidth(e.target.value)}
                        placeholder="1,37"
                        className="mt-1 w-full border border-brand-950/15 rounded-lg px-2 py-1.5 text-sm"
                      />
                    </label>
                  </div>
                  {(() => {
                    const perM2 = costPerM2FromRoll(
                      Number(npRollPrice.replace(',', '.')),
                      Number(npRollPriceWidth.replace(',', '.')),
                      Number(npRollLength.replace(',', '.')),
                    );
                    if (perM2 == null) return null;
                    return (
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <span className="text-xs text-brand-950/60">Costo por m²: <strong className="text-brand-950">{perM2}</strong></span>
                        <button
                          type="button"
                          onClick={() => setNpCost(String(perM2))}
                          className="text-xs font-semibold text-brand-500 hover:underline"
                        >
                          Usar como costo
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
          )}

          <div className={`border-t border-brand-950/[0.06] pt-3.5 ${npAreaRoll || isServiceShop || esEvento ? 'hidden' : ''}`}>
            <p className="text-sm font-bold text-brand-950 mb-1">
              Stock por {variantDims.dim1}{variantDims.dim2 ? ` y ${variantDims.dim2}` : ''}
            </p>
            <p className="text-xs text-brand-950/50 mb-3">
              Si es un producto básico (no maneja {variantDims.dim1.toLowerCase()}
              {variantDims.dim2 ? `/${variantDims.dim2.toLowerCase()}` : ''}), ingresa su stock directamente. Si
              maneja variantes, agrégalas abajo en vez de llenar el stock básico.
            </p>
            {(features.weight !== 'none' || npSoldByWeight) && (
              <label className="flex items-center gap-2 mb-3 text-sm cursor-pointer">
                <input type="checkbox" checked={npSoldByWeight} onChange={(e) => setNpSoldByWeight(e.target.checked)} />
                <span className="text-brand-950/70">
                  Se vende por peso (Kg)
                  {features.weight === 'default'
                    ? ' — desmárcalo solo si este producto se cobra por unidad/paquete'
                    : ' — para productos a granel que se pesan al cobrar'}
                </span>
              </label>
            )}

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
              Variantes ({variantDims.dim1}{variantDims.dim2 ? ` × ${variantDims.dim2}` : ''}) — opcional
            </p>
            <div className="flex items-end gap-2 mb-3">
              <label className="block text-xs flex-1">
                <span className="text-brand-950/60">{variantDims.dim1}</span>
                <input value={npV1} onChange={(e) => setNpV1(e.target.value)} placeholder={variantDims.dim1Example} className="mt-1 w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm" />
              </label>
              {variantDims.dim2 && (
                <label className="block text-xs flex-1">
                  <span className="text-brand-950/60">{variantDims.dim2}</span>
                  <input value={npV2} onChange={(e) => setNpV2(e.target.value)} placeholder={variantDims.dim2Example} className="mt-1 w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm" />
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
                  <div key={i} className="bg-brand-950/[0.04] rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <span className="flex-1 text-[13px] font-semibold text-brand-950">{v.v1}{v.v2 ? ` · ${v.v2}` : ''}</span>
                      <span className="text-xs text-brand-950/50 w-20">Stock: {v.soldByWeight ? `${formatStock(v.stock)} Kg` : formatStock(v.stock)}</span>
                      <button type="button" onClick={() => setNpVariants((prev) => prev.filter((_, idx) => idx !== i))} className="text-brand-950/40 hover:text-red-500">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {/* Descripción propia: para cuando entre una variante y otra cambia algo más
                        que el nombre. Vacía = se muestra la del producto. */}
                    <input
                      value={v.description ?? ''}
                      onChange={(e) =>
                        setNpVariants((prev) =>
                          prev.map((x, idx) => (idx === i ? { ...x, description: e.target.value } : x)),
                        )
                      }
                      placeholder="Descripción de esta variante (opcional)"
                      className="mt-1.5 w-full rounded-md border border-brand-950/10 bg-white px-2 py-1 text-[12px]"
                    />
                    {/* Precio y costo propios: para catálogos donde la variante no es una talla
                        sino otro producto en precio (ej. 60/90/150 PSI de la misma manguera).
                        Vacíos = usa los del producto, que es el caso de siempre. */}
                    <div className="flex gap-1.5 mt-1.5">
                      <label className="block text-[11px] flex-1">
                        <span className="text-brand-950/45">Precio propio</span>
                        <input
                          type="number"
                          step="0.01"
                          value={v.price ?? ''}
                          onChange={(e) =>
                            setNpVariants((prev) =>
                              prev.map((x, idx) =>
                                idx === i ? { ...x, price: e.target.value === '' ? undefined : Number(e.target.value) } : x,
                              ),
                            )
                          }
                          placeholder={npPrice || 'del producto'}
                          className="mt-0.5 w-full rounded-md border border-brand-950/10 bg-white px-2 py-1 text-[12px]"
                        />
                      </label>
                      <label className="block text-[11px] flex-1">
                        <span className="text-brand-950/45">Costo propio</span>
                        <input
                          type="number"
                          step="0.01"
                          value={v.cost ?? ''}
                          onChange={(e) =>
                            setNpVariants((prev) =>
                              prev.map((x, idx) =>
                                idx === i ? { ...x, cost: e.target.value === '' ? undefined : Number(e.target.value) } : x,
                              ),
                            )
                          }
                          placeholder={npCost || 'del producto'}
                          className="mt-0.5 w-full rounded-md border border-brand-950/10 bg-white px-2 py-1 text-[12px]"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!isServiceShop && (() => {
            const showWholesale = features.wholesale || npWholesalePrice !== '' || npWholesaleMinQty !== '';
            const showExpiry = features.expiry || npExpiryDate !== '';
            return (
              <div className="border-t border-brand-950/[0.06] pt-3.5">
                <p className="text-sm font-bold text-brand-950 mb-2.5">
                  Precios especiales{showExpiry ? ' y vencimiento' : ''} (opcional)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {showWholesale && (
                    <>
                      <label className="block text-xs">
                        <span className="text-brand-950/60">Precio mayorista</span>
                        <input type="number" value={npWholesalePrice} onChange={(e) => setNpWholesalePrice(e.target.value)} placeholder="0.00" className="mt-1 w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm" />
                      </label>
                      <label className="block text-xs">
                        <span className="text-brand-950/60">Desde (uds.)</span>
                        <input type="number" value={npWholesaleMinQty} onChange={(e) => setNpWholesaleMinQty(e.target.value)} placeholder="12" className="mt-1 w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm" />
                      </label>
                    </>
                  )}
                  <label className="block text-xs">
                    <span className="text-brand-950/60">Precio promocional</span>
                    <input type="number" value={npPromoPrice} onChange={(e) => setNpPromoPrice(e.target.value)} placeholder="0.00" className="mt-1 w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm" />
                  </label>
                  {showExpiry && (
                    <label className="block text-xs">
                      <span className="text-brand-950/60">Vence el</span>
                      <input type="date" value={npExpiryDate} onChange={(e) => setNpExpiryDate(e.target.value)} className="mt-1 w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm" />
                    </label>
                  )}
                </div>
                <p className="text-[11px] text-brand-950/40 mt-1.5">
                  {showWholesale
                    ? 'Si activas el precio mayorista, se aplica solo en Venta cuando la cantidad de esa línea del carrito llega al mínimo. El precio promocional siempre gana sobre los demás.'
                    : 'El precio promocional, si lo cargas, gana sobre el precio de lista mientras esté activo.'}
                </p>
              </div>
            );
          })()}

          {saveError && (
            <p className="text-[13px] font-medium text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveError}</p>
          )}

          <DialogFooter>
            <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setNewOpen(false)}>
              Cancelar
            </TextureButton>
            <TextureButton variant="brand" size="default" className="!w-auto" onClick={saveNewProduct}>
              {editingProductId ? 'Guardar cambios' : isTicketShop ? 'Guardar evento' : isServiceShop ? 'Guardar servicio' : 'Guardar producto'}
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

      {/* ---------- Eliminar producto ---------- */}
      <Dialog open={!!productToDelete} onOpenChange={(o) => !o && setProductToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar producto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-brand-950">
              ¿Sacar <span className="font-semibold">{productToDelete?.name}</span> del inventario?
            </p>
            {/* La duda típica al borrar: "¿se me borran las ventas?". No. */}
            <p className="rounded-xl bg-brand-950/[0.03] px-3 py-2.5 text-xs font-light text-brand-950/60">
              Las ventas y compras que ya lo incluyen no se tocan: guardan su propio nombre y precio, así que los informes
              siguen cuadrando. Solo desaparece del catálogo y deja de poder venderse.
            </p>
          </div>
          <DialogFooter>
            <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setProductToDelete(null)}>
              Cancelar
            </TextureButton>
            <TextureButton
              variant="destructive"
              size="default"
              className="!w-auto"
              onClick={() => {
                if (productToDelete) deleteProduct(productToDelete.id);
                setProductToDelete(null);
              }}
            >
              Eliminar
            </TextureButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Aumento general: mueve solo el precio de venta. El costo y los precios especiales
          (mayorista/promoción) no se tocan — son acuerdos que el dueño fijó a mano. */}
      <Dialog open={raiseOpen} onOpenChange={setRaiseOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Aumentar precios</DialogTitle>
          </DialogHeader>
          {raiseError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{raiseError}</p>}
          <label className="block text-sm">
            <span className="text-brand-950/70">Porcentaje</span>
            <input
              type="number"
              step="0.5"
              autoFocus
              value={raisePercent}
              onChange={(e) => setRaisePercent(e.target.value)}
              placeholder="Ej: 10"
              className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2"
            />
            <span className="mt-1 block text-[11px] font-light text-brand-950/50">
              Se aplica al precio de venta de los {totalSkus} productos. Un valor negativo los baja.
              El costo y los precios mayorista/promocional no se tocan.
            </span>
          </label>
          <DialogFooter>
            <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setRaiseOpen(false)}>
              Cancelar
            </TextureButton>
            <TextureButton
              variant="brand"
              size="default"
              className="!w-auto"
              disabled={raiseBusy || !raisePercent}
              onClick={async () => {
                const pct = Number(raisePercent);
                if (!pct) return setRaiseError('Escribe un porcentaje distinto de 0.');
                if (!window.confirm(`Se van a ${pct > 0 ? 'subir' : 'bajar'} TODOS los precios de venta un ${Math.abs(pct)}%. ¿Confirmas?`)) return;
                setRaiseBusy(true);
                setRaiseError(null);
                try {
                  const res = await api.post('/shop/products/raise-prices', { percent: pct });
                  setRaiseOpen(false);
                  await session.reload();
                  window.alert(`${res.data.data.updated} precios actualizados.`);
                } catch (e: any) {
                  setRaiseError(e.response?.data?.error ?? 'No se pudieron actualizar los precios.');
                } finally {
                  setRaiseBusy(false);
                }
              }}
            >
              {raiseBusy ? 'Aplicando…' : 'Aplicar'}
            </TextureButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {importOpen && (
        <ShopImportProductsDialog onClose={() => setImportOpen(false)} onImported={() => session.reload()} />
      )}
      {labelProduct && (
        <ShopPriceLabelsDialog product={labelProduct} restaurant={restaurant} onClose={() => setLabelProduct(null)} />
      )}
    </div>
  );
}


/**
 * "Sumar a inventario": entra mercancía comprada por peso.
 *
 * Existe porque la factura de la ferretería dice "$1,20 el kilo", no lo que costó el rollo. Los
 * otros dos caminos —Registrar compra y Agregar lote— piden el costo del lote entero o el unitario, y
 * obligan a sacar la cuenta a mano cada vez.
 *
 * El peso se pide POR UNIDAD, no como total de la carga, y de ahí sale todo lo demás. Así se
 * pueden meter tres mangueras de 60 Kg de un tirón sin perder información: pesan lo mismo de
 * verdad, no es un promedio inventado. Y cuando cada pieza pesa distinto —40, 43 y 68— se cargan
 * de a una, que es lo correcto porque son cargas distintas.
 *
 * Fue un total de kilos repartido entre las piezas en una versión anterior; se cambió porque
 * escondía justamente lo que el control por lotes viene a mostrar.
 *
 * En un producto que se vende por Kg o por metro no hay pieza que contar: los kilos SON la
 * cantidad que entra al stock.
 */
function SumarAInventarioDialog({
  productos,
  rubro,
  money,
  onClose,
  onSubmit,
}: {
  productos: ShopProduct[];
  rubro: ShopRubro;
  money: (n: number) => string;
  onClose: () => void;
  onSubmit: (
    productId: string,
    variantIndex: number,
    qty: number,
    costoUnitario: number,
    kg: number,
    proveedor: string,
  ) => Promise<void> | undefined;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [productId, setProductId] = useState('');
  const [variantIndex, setVariantIndex] = useState(0);
  const [unidades, setUnidades] = useState('1');
  const [kg, setKg] = useState('');
  const [costoKg, setCostoKg] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const producto = productos.find((p) => p.id === productId);
  const porPeso = producto?.saleUnit === 'KG' || producto?.saleUnit === 'MT';
  const unidadPeso = producto?.saleUnit === 'MT' ? 'Mt' : 'Kg';

  const nKg = Number(kg.replace(',', '.')) || 0; // peso de CADA unidad
  const nCostoKg = Number(costoKg.replace(',', '.')) || 0;
  const nUnidades = Number(unidades.replace(',', '.')) || 0;
  // Por peso, los kilos son la cantidad y no hay piezas que contar.
  const qty = porPeso ? nKg : nUnidades;
  const kgTotal = porPeso ? nKg : Math.round(nKg * nUnidades * 1000) / 1000;
  const totalLote = Math.round(kgTotal * nCostoKg * 100) / 100;
  const costoUnitario = qty > 0 ? Math.round((totalLote / qty) * 10000) / 10000 : 0;

  const variante = producto?.variants[variantIndex];
  const precio = variante?.price ?? producto?.price ?? 0;
  const margen = precio > 0 ? ((precio - costoUnitario) / precio) * 100 : null;

  const visibles = productos.filter((p) =>
    busqueda.trim() ? `${p.name} ${p.sku}`.toLowerCase().includes(busqueda.trim().toLowerCase()) : true,
  );

  async function guardar() {
    if (!producto || qty <= 0 || nKg <= 0 || nCostoKg <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(producto.id, variantIndex, qty, costoUnitario, kgTotal, proveedor.trim() || 'Sin proveedor');
      onClose();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'No se pudo sumar al inventario.');
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sumar a inventario</DialogTitle>
        </DialogHeader>

        {!producto ? (
          <>
            <p className="text-sm text-brand-950/60 -mt-1">Elige el producto al que entra la mercancía.</p>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o SKU…"
              className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
              autoFocus
            />
            <div className="max-h-64 overflow-y-auto rounded-xl border border-brand-950/10 divide-y divide-brand-950/[0.06]">
              {visibles.length === 0 && <p className="p-3 text-sm text-brand-950/40">Ningún producto con ese nombre.</p>}
              {visibles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setProductId(p.id); setVariantIndex(0); }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-brand-950/[0.03]"
                >
                  <span className="min-w-0">
                    <span className="block text-brand-950 truncate">{p.name}</span>
                    {p.sku && <span className="block text-[11px] text-brand-950/35">{p.sku}</span>}
                  </span>
                  <span className="shrink-0 text-[11px] text-brand-950/40">{formatStock(productStock(p))} en stock</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3 -mt-1">
              <p className="text-sm font-medium text-brand-950 min-w-0 truncate">{producto.name}</p>
              <button type="button" onClick={() => setProductId('')} className="shrink-0 text-[12px] text-brand-500 hover:underline">
                Cambiar
              </button>
            </div>

            {producto.variants.length > 1 && (
              <label className="block text-sm">
                <span className="text-brand-950/70">{resolveVariantDims(rubro, producto.category).dim1}</span>
                <select
                  value={variantIndex}
                  onChange={(e) => setVariantIndex(Number(e.target.value))}
                  className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2"
                >
                  {producto.variants.map((v, i) => (
                    <option key={i} value={i}>
                      {v.v1}{v.v2 ? ` · ${v.v2}` : ''} — {money(v.price ?? producto.price)} (stock {formatStock(v.stock)})
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="flex gap-3">
              {/* Con venta por peso los kilos ya son la cantidad: no hay unidades que contar. */}
              {!porPeso && (
                <label className="block text-sm w-24 shrink-0">
                  <span className="text-brand-950/70">Unidades</span>
                  <input
                    type="number" step="1" min="1" value={unidades} onChange={(e) => setUnidades(e.target.value)}
                    className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2"
                  />
                </label>
              )}
              <label className="block text-sm flex-1">
                <span className="text-brand-950/70">{porPeso ? `${unidadPeso} que entran` : `${unidadPeso} de cada una`}</span>
                <input
                  type="number" step="0.001" value={kg} onChange={(e) => setKg(e.target.value)}
                  placeholder="120.000" autoFocus
                  className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2"
                />
              </label>
              <label className="block text-sm flex-1">
                <span className="text-brand-950/70">Costo por {unidadPeso}</span>
                <input
                  type="number" step="0.01" value={costoKg} onChange={(e) => setCostoKg(e.target.value)}
                  placeholder="1.20"
                  className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2"
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="text-brand-950/70">Proveedor</span>
              <input
                value={proveedor} onChange={(e) => setProveedor(e.target.value)}
                placeholder="Nombre del proveedor"
                className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2"
              />
            </label>

            {/* Qué va a quedar guardado, antes de guardarlo. */}
            {totalLote > 0 && qty > 0 && (
              <div className="rounded-xl bg-brand-950/[0.04] p-3 text-[13px] text-brand-950/70 flex flex-col gap-0.5">
                <span>
                  Total <strong className="text-brand-950">{money(totalLote)}</strong>
                  {!porPeso && (
                    <> · {qty} {qty === 1 ? 'unidad' : 'unidades'} de {nKg} {unidadPeso} ({kgTotal} {unidadPeso} en total) a {money(costoUnitario)} cada una</>
                  )}
                </span>
                {precio > 0 && (
                  <span>
                    Se vende a {money(precio)}
                    {margen !== null && (
                      <span className={margen >= 0 ? ' text-emerald-600 font-medium' : ' text-red-600 font-medium'}>
                        {' '}({margen.toFixed(1)}% de margen)
                      </span>
                    )}
                  </span>
                )}
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
          </>
        )}

        <DialogFooter>
          <TextureButton variant="minimal" size="default" className="!w-auto" onClick={onClose}>
            Cancelar
          </TextureButton>
          <TextureButton
            variant="brand" size="default" className="!w-auto disabled:opacity-40"
            disabled={busy || !producto || nKg <= 0 || nCostoKg <= 0 || qty <= 0}
            onClick={guardar}
          >
            {busy ? 'Sumando…' : 'Sumar a inventario'}
          </TextureButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
