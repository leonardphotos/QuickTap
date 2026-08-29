import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { prisma } from '../../config/prisma';
import { UPLOADS_DIR } from '../../middlewares/upload.middleware';
import { resolveInventoryScopeById } from '../inventory/inventory-scope';
import { buildCostGraph, resolveCostPerBaseUnit } from '../inventory/costing';
import { round2 } from '../../utils/money';
import {
  cellBoolean,
  cellNumber,
  cellText,
  detectHeaderRow,
  resolveColumns,
  styleTemplateHeader,
  type ImportRowError,
} from '../../utils/excel-import';

/**
 * ============================================================================
 *  Carga inicial del catálogo en UN SOLO Excel.
 * ============================================================================
 *
 * Ya existían importadores sueltos (productos, insumos, recetas), pero montar un menú desde
 * cero obligaba a bajar tres plantillas, cargarlas en el orden correcto y encima subir las
 * fotos una por una desde el panel. Esto es lo mismo en un archivo: cuatro hojas que se
 * procesan en el orden en que dependen entre sí.
 *
 * ORDEN, y por qué importa:
 *   1. Insumos        — no dependen de nada.
 *   2. Productos      — crean sus categorías al vuelo; acá se extraen las fotos pegadas.
 *   3. Modificadores  — cuelgan de un producto que ya tiene que existir.
 *   4. Recetas        — enlazan un producto con un insumo, así que van al final.
 *
 * Todo es "crear o actualizar" por NOMBRE dentro del restaurante: volver a subir el mismo
 * archivo corregido no duplica el menú, lo actualiza. Es lo que permite usar el Excel como
 * fuente de verdad mientras se arma la carta.
 *
 * Ninguna hoja es obligatoria: un local que solo quiere cargar su carta llena "Productos" y
 * borra el resto. Las hojas que falten se saltan sin error.
 */

/** Fila de cabecera de cada hoja + los sinónimos que se aceptan al leer. */
const PRODUCTOS_HEADERS = [
  'Nombre',
  'Categoría',
  'Precio',
  'Descripción',
  'Costo',
  'Disponible (sí/no)',
  'Foto',
] as const;

const PRODUCTOS_SPEC = {
  name: ['nombre', 'producto', 'plato', 'item', 'articulo', 'artículo'],
  category: ['categoría', 'categoria', 'grupo', 'rubro'],
  price: ['precio', 'precio de venta', 'pvp'],
  description: ['descripción', 'descripcion', 'detalle'],
  cost: ['costo', 'costo unitario'],
  isAvailable: ['disponible (sí/no)', 'disponible', 'activo'],
  photo: ['foto', 'imagen', 'fotografía', 'fotografia'],
};

const INSUMOS_HEADERS = ['Nombre', 'Unidad (kg/lt/ml/unidad)', 'Cantidad', 'Cantidad mínima', 'Costo'] as const;

const INSUMOS_SPEC = {
  name: ['nombre', 'insumo', 'ingrediente', 'producto', 'item'],
  unit: ['unidad (kg/lt/ml/unidad)', 'unidad', 'unidad de medida', 'medida', 'um'],
  quantity: ['cantidad', 'stock', 'existencia'],
  minQuantity: ['cantidad mínima', 'cantidad minima', 'mínimo', 'minimo', 'stock mínimo'],
  cost: ['costo', 'precio', 'costo unitario'],
};

const MODIFICADORES_HEADERS = [
  'Producto',
  'Grupo (ej: Término, Extras)',
  'Opción',
  'Precio extra',
  'Obligatorio (sí/no)',
  'Permite varias (sí/no)',
] as const;

const MODIFICADORES_SPEC = {
  product: ['producto', 'plato', 'nombre del producto'],
  group: ['grupo (ej: término, extras)', 'grupo', 'categoría', 'categoria', 'tipo'],
  option: ['opción', 'opcion', 'modificador', 'nombre'],
  price: ['precio extra', 'precio', 'adicional', 'costo extra'],
  required: ['obligatorio (sí/no)', 'obligatorio', 'requerido'],
  multiple: ['permite varias (sí/no)', 'permite varias', 'múltiple', 'multiple'],
};

const RECETAS_HEADERS = ['Plato', 'Insumo', 'Cantidad'] as const;

const RECETAS_SPEC = {
  product: ['plato', 'producto', 'nombre del plato'],
  ingredient: ['insumo', 'ingrediente', 'materia prima'],
  quantity: ['cantidad', 'cant', 'cantidad por plato'],
};

/** Unidades que entiende el inventario, con los sinónimos que la gente escribe de verdad. */
const UNIDADES: Record<string, string> = {
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogramo: 'kg', kgs: 'kg',
  g: 'kg', gr: 'kg', gramo: 'kg', gramos: 'kg', // se normalizan a kg más abajo
  lt: 'lt', l: 'lt', litro: 'lt', litros: 'lt',
  ml: 'ml', mililitro: 'ml', mililitros: 'ml', cc: 'ml',
  unidad: 'unidad', und: 'unidad', un: 'unidad', u: 'unidad', pieza: 'unidad', piezas: 'unidad',
};
/** Los que hay que convertir además de renombrar (se guardan en la unidad mayor). */
const FACTOR_A_UNIDAD_BASE: Record<string, number> = { g: 0.001, gr: 0.001, gramo: 0.001, gramos: 0.001 };

export interface CatalogSheetResult {
  hoja: string;
  creados: number;
  actualizados: number;
  errores: ImportRowError[];
}

export interface CatalogImportResult {
  hojas: CatalogSheetResult[];
  fotosSubidas: number;
}

/** Normaliza para comparar nombres: sin acentos, sin espacios de más, en minúscula. */
function clave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Guarda una imagen que venía pegada en el Excel y devuelve su ruta pública.
 *
 * Se escribe con el mismo esquema de nombre que las subidas normales del panel
 * (randomBytes, ver upload.middleware) porque /uploads se sirve estático: el nombre es lo
 * único que hace que un archivo no sea adivinable.
 */
function guardarFoto(buffer: Buffer, extension: string): string {
  const dir = path.join(UPLOADS_DIR, 'products');
  fs.mkdirSync(dir, { recursive: true });
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  const nombre = `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(dir, nombre), buffer);
  return `/uploads/products/${nombre}`;
}

/**
 * Fotos pegadas en la hoja, indexadas por la FILA donde están ancladas.
 *
 * ExcelJS ancla cada imagen a una celda con índice base 0, mientras que las filas que
 * recorremos abajo son base 1 — de ahí el +1. Una imagen que el usuario pegó "a caballo"
 * entre dos filas se cuenta en la de arriba, que es donde Excel la ancla.
 */
function fotosPorFila(sheet: ExcelJS.Worksheet, workbook: ExcelJS.Workbook): Map<number, { buffer: Buffer; ext: string }> {
  const porFila = new Map<number, { buffer: Buffer; ext: string }>();
  for (const img of sheet.getImages()) {
    const media = workbook.model.media?.find((m) => String((m as unknown as { index?: number }).index) === String(img.imageId));
    const datos = media as unknown as { buffer?: Buffer; extension?: string } | undefined;
    if (!datos?.buffer) continue;
    const fila = Math.round(img.range.tl.nativeRow) + 1;
    porFila.set(fila, { buffer: datos.buffer, ext: datos.extension ?? 'png' });
  }
  return porFila;
}

export const catalogImportService = {
  /**
   * Plantilla vacía con las cuatro hojas y una de instrucciones. Se arma en el servidor (y no
   * como un archivo suelto en el repo) para que los ejemplos salgan con la moneda real del
   * restaurante y las categorías que ya tiene cargadas.
   */
  async buildTemplate(restaurantId: string): Promise<ExcelJS.Workbook> {
    const restaurante = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { baseCurrency: true, name: true },
    });
    const simbolo = restaurante?.baseCurrency === 'EUR' ? '€' : '$';

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QuickTap';

    // ---------------- Instrucciones ----------------
    const guia = workbook.addWorksheet('Instrucciones');
    guia.columns = [{ width: 4 }, { width: 96 }];
    const lineas: [string, string][] = [
      ['', `Carga inicial del catálogo — ${restaurante?.name ?? 'tu negocio'}`],
      ['', ''],
      ['', 'Llena solo las hojas que necesites y sube este mismo archivo. Ninguna es obligatoria.'],
      ['', ''],
      ['1.', 'PRODUCTOS — tu carta. Es la única hoja que casi siempre vas a llenar.'],
      ['', `      Precio y Costo van en ${simbolo}. La categoría se crea sola si no existe.`],
      ['', '      FOTO: pega la imagen dentro de la celda de esa fila (Insertar → Imagen → En celda).'],
      ['', '      No pongas un enlace: la imagen tiene que quedar pegada en el archivo.'],
      ['', ''],
      ['2.', 'INSUMOS — lo que compras (harina, queso, aceite). Solo si vas a llevar inventario.'],
      ['', '      Unidad: kg, lt, ml o unidad. Si escribes gramos se convierte solo a kg.'],
      ['', ''],
      ['3.', 'MODIFICADORES — las opciones de un plato (Término: rojo/tres cuartos; Extras: queso).'],
      ['', '      Una fila POR OPCIÓN. Repite Producto y Grupo en cada fila del mismo grupo.'],
      ['', ''],
      ['4.', 'RECETAS — cuánto insumo lleva cada plato. Descuenta el stock solo al vender.'],
      ['', '      Una fila por ingrediente. La cantidad va en la unidad del insumo.'],
      ['', ''],
      ['', 'Se puede volver a subir el mismo archivo corregido: lo que ya existe se actualiza'],
      ['', 'por nombre, no se duplica. Al terminar verás un reporte de qué entró y qué falló.'],
    ];
    lineas.forEach(([a, b]) => guia.addRow([a, b]));
    guia.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF0A1428' } };
    [5, 10, 13, 16].forEach((n) => { guia.getRow(n).font = { bold: true }; });

    // Ejemplos de referencia. Van ACÁ y no en las hojas de datos: una fila de ejemplo olvidada
    // en "Productos" termina publicada en el menú del negocio.
    guia.addRow([]);
    const tituloEjemplos = guia.addRow(['', 'Así se llena cada hoja (solo de referencia, no se importa):']);
    tituloEjemplos.font = { bold: true };
    const ejemplos: string[][] = [
      ['', 'Productos    Hamburguesa Clásica | Hamburguesas | 8.50 | Carne 150g y queso | 3.20 | sí | (foto pegada)'],
      ['', 'Insumos      Carne molida | kg | 20 | 3 | 6.50'],
      ['', 'Insumos      Pan de hamburguesa | unidad | 200 | 40 | 0.35'],
      ['', 'Modificadores  Hamburguesa Clásica | Término | Tres cuartos | 0 | sí | no'],
      ['', 'Modificadores  Hamburguesa Clásica | Extras | Queso adicional | 1 | no | sí'],
      ['', 'Recetas      Hamburguesa Clásica | Carne molida | 0.15'],
    ];
    ejemplos.forEach((e) => {
      const fila = guia.addRow(e);
      fila.font = { italic: true, color: { argb: 'FF6B7280' } };
    });

    // ---------------- Productos ----------------
    const productos = workbook.addWorksheet('Productos');
    productos.columns = PRODUCTOS_HEADERS.map((header) => ({
      header,
      width: header === 'Descripción' ? 40 : header === 'Foto' ? 18 : 22,
    }));
    styleTemplateHeader(productos);
    // Las hojas de datos van VACÍAS a propósito: con filas de ejemplo dentro, el dueño que no
    // las borra termina con "Hamburguesa Clásica" publicada en su menú real. Los ejemplos viven
    // en la hoja Instrucciones, donde se ven pero no se importan.
    // Alto extra en las primeras filas para que quepa la foto pegada.
    for (let i = 2; i <= 12; i++) productos.getRow(i).height = 56;

    // ---------------- Insumos ----------------
    const insumos = workbook.addWorksheet('Insumos');
    insumos.columns = INSUMOS_HEADERS.map((header) => ({ header, width: 24 }));
    styleTemplateHeader(insumos);

    // ---------------- Modificadores ----------------
    const modificadores = workbook.addWorksheet('Modificadores');
    modificadores.columns = MODIFICADORES_HEADERS.map((header) => ({ header, width: 26 }));
    styleTemplateHeader(modificadores);

    // ---------------- Recetas ----------------
    const recetas = workbook.addWorksheet('Recetas');
    recetas.columns = RECETAS_HEADERS.map((header) => ({ header, width: 30 }));
    styleTemplateHeader(recetas);

    return workbook;
  },

  /** Procesa el libro completo, hoja por hoja, en orden de dependencia. */
  async importWorkbook(restaurantId: string, buffer: Buffer): Promise<CatalogImportResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const hojas: CatalogSheetResult[] = [];
    let fotosSubidas = 0;

    const insumosRes = await importarInsumos(workbook, restaurantId);
    if (insumosRes) hojas.push(insumosRes);

    const productosRes = await importarProductos(workbook, restaurantId);
    if (productosRes) {
      hojas.push(productosRes.resultado);
      fotosSubidas = productosRes.fotos;
    }

    const modsRes = await importarModificadores(workbook, restaurantId);
    if (modsRes) hojas.push(modsRes);

    const recetasRes = await importarRecetas(workbook, restaurantId);
    if (recetasRes) hojas.push(recetasRes);

    return { hojas, fotosSubidas };
  },
};

/** Encuentra una hoja por nombre, tolerando acentos y mayúsculas. */
function hoja(workbook: ExcelJS.Workbook, nombre: string): ExcelJS.Worksheet | undefined {
  return workbook.worksheets.find((w) => clave(w.name) === clave(nombre));
}

async function importarInsumos(workbook: ExcelJS.Workbook, restaurantId: string): Promise<CatalogSheetResult | null> {
  const sheet = hoja(workbook, 'Insumos');
  if (!sheet) return null;

  const filaEncabezado = detectHeaderRow(sheet, INSUMOS_SPEC);
  const { columns } = resolveColumns(sheet, INSUMOS_SPEC, filaEncabezado);
  const res: CatalogSheetResult = { hoja: 'Insumos', creados: 0, actualizados: 0, errores: [] };
  if (!columns.name) {
    res.errores.push({ row: filaEncabezado, message: 'No se encontró la columna "Nombre".' });
    return res;
  }

  // El inventario puede vivir en la raíz del grupo (sucursales con stock compartido).
  const inventarioDe = await resolveInventoryScopeById(restaurantId);

  for (let r = filaEncabezado + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const nombre = cellText(row, columns.name);
    if (!nombre) continue;

    const unidadCruda = clave(cellText(row, columns.unit) || 'unidad');
    const unidad = UNIDADES[unidadCruda];
    if (!unidad) {
      res.errores.push({ row: r, message: `Unidad "${unidadCruda}" no reconocida. Usa kg, lt, ml o unidad.` });
      continue;
    }
    const factor = FACTOR_A_UNIDAD_BASE[unidadCruda] ?? 1;
    const cantidad = (cellNumber(row, columns.quantity) ?? 0) * factor;
    const minima = (cellNumber(row, columns.minQuantity) ?? 0) * factor;
    // El costo va por unidad, así que al convertir gramos→kg el costo sube en la misma proporción.
    const costoCrudo = cellNumber(row, columns.cost);
    const costo = costoCrudo != null ? costoCrudo / factor : null;

    const existente = await prisma.inventoryItem.findFirst({
      where: { restaurantId: inventarioDe, name: { equals: nombre, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existente) {
      await prisma.inventoryItem.update({
        where: { id: existente.id },
        data: { unit: unidad, quantity: cantidad, minQuantity: minima, ...(costo != null ? { pricePerUnitBase: costo } : {}) },
      });
      res.actualizados += 1;
    } else {
      await prisma.inventoryItem.create({
        data: {
          restaurantId: inventarioDe,
          name: nombre,
          unit: unidad,
          quantity: cantidad,
          minQuantity: minima,
          ...(costo != null ? { pricePerUnitBase: costo } : {}),
        },
      });
      res.creados += 1;
    }
  }
  return res;
}

async function importarProductos(
  workbook: ExcelJS.Workbook,
  restaurantId: string,
): Promise<{ resultado: CatalogSheetResult; fotos: number } | null> {
  const sheet = hoja(workbook, 'Productos');
  if (!sheet) return null;

  const filaEncabezado = detectHeaderRow(sheet, PRODUCTOS_SPEC);
  const { columns } = resolveColumns(sheet, PRODUCTOS_SPEC, filaEncabezado);
  const res: CatalogSheetResult = { hoja: 'Productos', creados: 0, actualizados: 0, errores: [] };
  if (!columns.name) {
    res.errores.push({ row: filaEncabezado, message: 'No se encontró la columna "Nombre".' });
    return { resultado: res, fotos: 0 };
  }

  const imagenes = fotosPorFila(sheet, workbook);
  let fotos = 0;

  // Categorías ya existentes, para no crear duplicados que solo cambian en mayúsculas.
  const categorias = new Map<string, string>();
  for (const c of await prisma.category.findMany({ where: { restaurantId }, select: { id: true, name: true } })) {
    categorias.set(clave(c.name), c.id);
  }

  for (let r = filaEncabezado + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const nombre = cellText(row, columns.name);
    if (!nombre) continue;

    const precio = cellNumber(row, columns.price);
    if (precio == null) {
      res.errores.push({ row: r, message: `"${nombre}": falta el precio.` });
      continue;
    }

    // Categoría: se crea al vuelo. Sin categoría, va a una "General" para que el producto
    // igual entre — el menú público agrupa por categoría y una vacía lo dejaría invisible.
    const nombreCategoria = cellText(row, columns.category) || 'General';
    let categoryId = categorias.get(clave(nombreCategoria));
    if (!categoryId) {
      const creada = await prisma.category.create({ data: { restaurantId, name: nombreCategoria } });
      categoryId = creada.id;
      categorias.set(clave(nombreCategoria), categoryId);
    }

    const imagen = imagenes.get(r);
    const photoUrl = imagen ? guardarFoto(imagen.buffer, imagen.ext) : undefined;
    if (photoUrl) fotos += 1;

    const datos = {
      categoryId,
      price: precio,
      description: cellText(row, columns.description) || null,
      costBase: cellNumber(row, columns.cost) ?? null,
      isAvailable: cellBoolean(row, columns.isAvailable) ?? true,
      ...(photoUrl ? { photoUrl } : {}),
    };

    const existente = await prisma.product.findFirst({
      where: { restaurantId, name: { equals: nombre, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existente) {
      await prisma.product.update({ where: { id: existente.id }, data: datos });
      res.actualizados += 1;
    } else {
      await prisma.product.create({ data: { restaurantId, name: nombre, ...datos } });
      res.creados += 1;
    }
  }
  return { resultado: res, fotos };
}

async function importarModificadores(workbook: ExcelJS.Workbook, restaurantId: string): Promise<CatalogSheetResult | null> {
  const sheet = hoja(workbook, 'Modificadores');
  if (!sheet) return null;

  const filaEncabezado = detectHeaderRow(sheet, MODIFICADORES_SPEC);
  const { columns } = resolveColumns(sheet, MODIFICADORES_SPEC, filaEncabezado);
  const res: CatalogSheetResult = { hoja: 'Modificadores', creados: 0, actualizados: 0, errores: [] };
  if (!columns.product || !columns.group || !columns.option) {
    res.errores.push({ row: filaEncabezado, message: 'Faltan columnas: se necesitan "Producto", "Grupo" y "Opción".' });
    return res;
  }

  const productos = new Map<string, string>();
  for (const p of await prisma.product.findMany({ where: { restaurantId }, select: { id: true, name: true } })) {
    productos.set(clave(p.name), p.id);
  }
  // Un grupo ("Extras") se comparte entre los platos que lo usen, así que se resuelve una vez.
  const grupos = new Map<string, string>();
  for (const g of await prisma.modifierCategory.findMany({ where: { restaurantId }, select: { id: true, name: true } })) {
    grupos.set(clave(g.name), g.id);
  }

  for (let r = filaEncabezado + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const nombreProducto = cellText(row, columns.product);
    const nombreGrupo = cellText(row, columns.group);
    const nombreOpcion = cellText(row, columns.option);
    if (!nombreProducto && !nombreGrupo && !nombreOpcion) continue;

    const productId = productos.get(clave(nombreProducto));
    if (!productId) {
      res.errores.push({ row: r, message: `No existe el producto "${nombreProducto}". Cárgalo en la hoja Productos.` });
      continue;
    }
    if (!nombreGrupo || !nombreOpcion) {
      res.errores.push({ row: r, message: 'Falta el grupo o la opción.' });
      continue;
    }

    let categoryId = grupos.get(clave(nombreGrupo));
    if (!categoryId) {
      const creado = await prisma.modifierCategory.create({
        data: {
          restaurantId,
          name: nombreGrupo,
          isRequired: cellBoolean(row, columns.required) ?? false,
          allowMultiple: cellBoolean(row, columns.multiple) ?? false,
        },
      });
      categoryId = creado.id;
      grupos.set(clave(nombreGrupo), categoryId);
    }

    // Enlaza el grupo al producto (si ya estaba, no se duplica).
    const yaEnlazado = await prisma.productModifierCategory.findFirst({
      where: { productId, modifierCategoryId: categoryId },
      select: { id: true },
    });
    if (!yaEnlazado) {
      await prisma.productModifierCategory.create({ data: { productId, modifierCategoryId: categoryId } });
    }

    const precioExtra = cellNumber(row, columns.price) ?? 0;
    const existente = await prisma.modifier.findFirst({
      where: { restaurantId, categoryId, name: { equals: nombreOpcion, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existente) {
      await prisma.modifier.update({ where: { id: existente.id }, data: { priceBase: precioExtra } });
      res.actualizados += 1;
    } else {
      await prisma.modifier.create({ data: { restaurantId, categoryId, name: nombreOpcion, priceBase: precioExtra } });
      res.creados += 1;
    }
  }
  return res;
}

async function importarRecetas(workbook: ExcelJS.Workbook, restaurantId: string): Promise<CatalogSheetResult | null> {
  const sheet = hoja(workbook, 'Recetas');
  if (!sheet) return null;

  const filaEncabezado = detectHeaderRow(sheet, RECETAS_SPEC);
  const { columns } = resolveColumns(sheet, RECETAS_SPEC, filaEncabezado);
  const res: CatalogSheetResult = { hoja: 'Recetas', creados: 0, actualizados: 0, errores: [] };
  if (!columns.product || !columns.ingredient) {
    res.errores.push({ row: filaEncabezado, message: 'Faltan columnas: se necesitan "Plato" e "Insumo".' });
    return res;
  }

  const inventarioDe = await resolveInventoryScopeById(restaurantId);
  // El costo de cada línea se CONGELA al crearla, igual que en el panel (ver recipe.service):
  // el grafo resuelve el costo por unidad base del insumo y se multiplica por la cantidad.
  const grafo = await buildCostGraph(prisma, restaurantId);
  const productos = new Map<string, string>();
  for (const p of await prisma.product.findMany({ where: { restaurantId }, select: { id: true, name: true } })) {
    productos.set(clave(p.name), p.id);
  }
  const insumos = new Map<string, string>();
  for (const i of await prisma.inventoryItem.findMany({ where: { restaurantId: inventarioDe }, select: { id: true, name: true } })) {
    insumos.set(clave(i.name), i.id);
  }

  for (let r = filaEncabezado + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const nombrePlato = cellText(row, columns.product);
    const nombreInsumo = cellText(row, columns.ingredient);
    if (!nombrePlato && !nombreInsumo) continue;

    const productId = productos.get(clave(nombrePlato));
    if (!productId) {
      res.errores.push({ row: r, message: `No existe el plato "${nombrePlato}".` });
      continue;
    }
    const inventoryItemId = insumos.get(clave(nombreInsumo));
    if (!inventoryItemId) {
      res.errores.push({ row: r, message: `No existe el insumo "${nombreInsumo}". Cárgalo en la hoja Insumos.` });
      continue;
    }
    const cantidad = cellNumber(row, columns.quantity);
    if (cantidad == null || cantidad <= 0) {
      res.errores.push({ row: r, message: `"${nombrePlato}" / "${nombreInsumo}": la cantidad debe ser mayor que 0.` });
      continue;
    }

    const costoLinea = round2(resolveCostPerBaseUnit(grafo, { inventoryItemId }).mul(cantidad));
    const existente = await prisma.recipeIngredient.findFirst({
      where: { restaurantId, productId, inventoryItemId },
      select: { id: true },
    });
    if (existente) {
      await prisma.recipeIngredient.update({ where: { id: existente.id }, data: { quantity: cantidad, costBase: costoLinea } });
      res.actualizados += 1;
    } else {
      await prisma.recipeIngredient.create({
        data: { restaurantId, productId, inventoryItemId, quantity: cantidad, costBase: costoLinea },
      });
      res.creados += 1;
    }
  }
  return res;
}
