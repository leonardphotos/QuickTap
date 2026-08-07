import ExcelJS from 'exceljs';
import { prisma } from '../../config/prisma';
import { badRequest } from '../../utils/http-error';
import {
  cellBoolean,
  cellNumber,
  cellText,
  ImportResult,
  resolveColumns,
  styleTemplateHeader,
} from '../../utils/excel-import';
import { productService } from './product.service';
import { CreateProductInput, UpdateProductInput } from './product.dto';

/**
 * Importar productos del menú en bloque por Excel (botones "Descargar plantilla"/"Importar
 * Excel" en Productos). Mismo criterio que la importación de insumos: las columnas se
 * resuelven por NOMBRE de encabezado (ver utils/excel-import.ts), no por posición.
 *
 * Regla de carga parcial: lo ÚNICO obligatorio es el nombre. Cualquier otra columna que el
 * archivo no traiga simplemente no se toca — el restaurante termina de completar precio,
 * foto, cocina, etc. después desde el panel. En un producto que ya existe (mismo nombre) esto
 * es especialmente importante: importar un archivo con solo "Nombre" y "Precio" actualiza el
 * precio y NO borra la descripción/foto/SKU que ya tenía cargados.
 */

const HEADERS = [
  'Nombre',
  'Categoría',
  'Precio',
  'Descripción',
  'Costo',
  'SKU',
  'Tiempo de preparación (min)',
  'Disponible (sí/no)',
  'Stock',
] as const;

/** Categoría de respaldo cuando el archivo no trae columna de categoría (o la trae vacía):
 * el modelo exige una, pero no queremos rechazar la fila por eso. */
const FALLBACK_CATEGORY_NAME = 'Sin categoría';

const COLUMN_SPEC = {
  prepTimeMinutes: ['tiempo de preparacion (min)', 'tiempo de preparación (min)', 'tiempo de preparacion', 'tiempo de preparación', 'preparacion', 'preparación'],
  isAvailable: ['disponible (si/no)', 'disponible (sí/no)', 'disponible', 'activo'],
  description: ['descripcion', 'descripción', 'detalle'],
  category: ['categoria', 'categoría', 'rubro', 'grupo'],
  price: ['precio', 'precio de venta', 'pvp', 'venta'],
  name: ['nombre', 'producto', 'item', 'articulo', 'artículo', 'plato'],
  cost: ['costo', 'costo unitario'],
  sku: ['sku', 'codigo', 'código', 'cod'],
  // Cantidad de "Control de stock simple" del producto (independiente del sistema de
  // insumos/receta) — ver Product.stockControlEnabled/stockQuantity en schema.prisma.
  stock: ['stock', 'cantidad en stock', 'cantidad', 'existencia', 'existencias'],
};

/** Primera letra en mayúscula, el resto del nombre tal cual lo escribieron (no fuerza el
 * resto a minúsculas: respeta marcas o siglas como "BBQ Bacon"). */
function capitalizeFirst(name: string): string {
  if (!name) return name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function buildTemplate(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Productos');
  sheet.columns = HEADERS.map((header) => ({ header, width: 24 }));
  styleTemplateHeader(sheet);
  sheet.addRow(['Hamburguesa Clásica', 'Hamburguesas', 6.5, 'Carne de res, queso y vegetales.', 2.4, 'HAM-01', 12, 'sí', 25]);
  return workbook;
}

async function importFromExcel(
  restaurantId: string,
  parentRestaurantId: string | null | undefined,
  buffer: Buffer,
): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw badRequest('El archivo no tiene ninguna hoja.');

  const { columns, headers } = resolveColumns(sheet, COLUMN_SPEC);
  if (!columns.name) {
    const found = headers.filter(Boolean).join(', ') || '(ninguna)';
    throw badRequest(
      `No se encontró la columna "Nombre" en la primera fila del archivo. Columnas detectadas: ${found}. ` +
        'Descarga la plantilla para ver el formato esperado.',
    );
  }

  const [existingProducts, existingCategories] = await Promise.all([
    prisma.product.findMany({ where: { restaurantId }, select: { id: true, name: true } }),
    prisma.category.findMany({ where: { restaurantId }, select: { id: true, name: true } }),
  ]);
  const productByName = new Map(existingProducts.map((p) => [p.name.trim().toLowerCase(), p]));
  const categoryByName = new Map(existingCategories.map((c) => [c.name.trim().toLowerCase(), c]));

  async function resolveCategoryId(name: string): Promise<string> {
    const key = name.trim().toLowerCase();
    const existing = categoryByName.get(key);
    if (existing) return existing.id;
    const created = await prisma.category.create({ data: { restaurantId, name: name.trim() } });
    categoryByName.set(key, created);
    return created.id;
  }

  const result: ImportResult = { created: 0, updated: 0, errors: [] };

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const rawName = cellText(row, columns.name);
    if (!rawName) continue; // fila sin nombre = fila vacía o de relleno, se ignora en silencio
    const name = capitalizeFirst(rawName);

    // Solo se arma lo que el archivo realmente trae; el resto queda como estaba (o en su
    // default al crear) para que el restaurante lo complete después.
    const categoryName = cellText(row, columns.category);
    const price = cellNumber(row, columns.price);
    const costBase = cellNumber(row, columns.cost);
    const prepTimeMinutes = cellNumber(row, columns.prepTimeMinutes);
    const description = cellText(row, columns.description);
    const sku = cellText(row, columns.sku);
    const isAvailable = cellBoolean(row, columns.isAvailable);
    const stock = cellNumber(row, columns.stock);

    // categoryId no entra acá: necesita un await para resolverse/crearse, se agrega abajo.
    const optionalFields: UpdateProductInput = {
      ...(price != null ? { price } : {}),
      ...(costBase != null ? { costBase } : {}),
      ...(prepTimeMinutes != null ? { prepTimeMinutes: Math.round(prepTimeMinutes) } : {}),
      ...(description ? { description } : {}),
      ...(sku ? { sku } : {}),
      ...(isAvailable != null ? { isAvailable } : {}),
      // La columna Stock activa el control de stock simple del producto (Product.
      // stockControlEnabled/stockQuantity) y carga la cantidad tal cual viene en el archivo.
      ...(stock != null ? { stockControlEnabled: true, stockQuantity: Math.round(stock) } : {}),
    };

    try {
      const existing = productByName.get(name.toLowerCase());

      if (existing) {
        const input: UpdateProductInput = { ...optionalFields };
        // La categoría solo se pisa si el archivo la trae; si no, conserva la que ya tenía.
        if (categoryName) input.categoryId = await resolveCategoryId(categoryName);
        await productService.update(restaurantId, parentRestaurantId, existing.id, input);
        result.updated += 1;
      } else {
        const input: CreateProductInput = {
          name,
          // Al crear sí hace falta una categoría y un precio: si el archivo no los trae, entra
          // en "Sin categoría" con precio 0 para que quede cargado y se complete después.
          categoryId: await resolveCategoryId(categoryName || FALLBACK_CATEGORY_NAME),
          price: price ?? 0,
          pricingMode: 'SIMPLE',
          costSource: 'MANUAL',
          isAvailable: isAvailable ?? true,
          stockControlEnabled: false,
          packagingMode: 'NONE',
          isStar: false,
          isPromo: false,
          isHouseSpecial: false,
          promoPriceEnabled: false,
          promoDaysOfWeek: [],
          priority: 0,
          ...optionalFields,
        };
        const created = await productService.create(restaurantId, parentRestaurantId, input);
        productByName.set(name.toLowerCase(), { id: created.id, name: created.name });
        result.created += 1;
      }
    } catch (err: any) {
      result.errors.push({ row: rowNumber, message: err?.message ?? 'No se pudo guardar esta fila.' });
    }
  }

  return result;
}

export const productImportService = { buildTemplate, importFromExcel };
