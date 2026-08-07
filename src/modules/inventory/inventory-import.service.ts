import ExcelJS from 'exceljs';
import { prisma } from '../../config/prisma';
import { badRequest } from '../../utils/http-error';
import { cellNumber, cellText, ImportResult, normalizeHeader, resolveColumns, styleTemplateHeader } from '../../utils/excel-import';
import { effectiveInventoryRestaurantId } from './inventory-scope';
import { inventoryService } from './inventory.service';
import { CreateInventoryItemInput } from './inventory.dto';

/**
 * Importar insumos en bloque por Excel (botones "Descargar plantilla"/"Importar Excel" de la
 * pestaña Insumos). Reutiliza `inventoryService.create`/`update` fila por fila en vez de
 * escribir Prisma directo acá, para no duplicar la resolución de scope/precio.
 *
 * Las columnas se resuelven por NOMBRE de encabezado (ver utils/excel-import.ts), no por
 * posición: el archivo puede traer columnas de más, en otro orden, o con otro título.
 */

const HEADERS = ['Nombre', 'Unidad (kg/lt/ml/unidad)', 'Cantidad', 'Cantidad mínima', 'Costo', 'Categoría'] as const;

/** Sinónimos aceptados por columna. El primero de cada lista es el de la plantilla oficial. */
const COLUMN_SPEC = {
  name: ['nombre', 'insumo', 'descripcion', 'descripción', 'producto', 'item', 'articulo', 'artículo'],
  unit: ['unidad (kg/lt/ml/unidad)', 'unidad', 'unidad de medida', 'medida', 'um'],
  minQuantity: ['cantidad minima', 'cantidad mínima', 'stock minimo', 'stock mínimo', 'minimo', 'mínimo'],
  quantity: ['cantidad', 'stock', 'existencia', 'existencias'],
  price: ['costo', 'precio', 'costo unitario', 'precio unitario'],
  category: ['categoria', 'categoría', 'rubro', 'grupo'],
};

/**
 * Cómo se escribe cada unidad en la práctica. Todo lo que no esté acá (o venga vacío) cae en
 * "unidad": es el default sensato para un insumo que se cuenta de a uno, y sobre todo evita
 * que una columna de unidad ausente o rara tumbe TODA la importación — el restaurante puede
 * corregir la unidad de un insumo puntual después, pero recargar 90 filas a mano no.
 */
const UNIT_ALIASES: Record<string, CreateInventoryItemInput['unit']> = {
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogramo: 'kg', kilogramos: 'kg', k: 'kg',
  lt: 'lt', l: 'lt', lts: 'lt', litro: 'lt', litros: 'lt',
  ml: 'ml', mililitro: 'ml', mililitros: 'ml', cc: 'ml',
  unidad: 'unidad', unidades: 'unidad', und: 'unidad', unid: 'unidad', un: 'unidad', u: 'unidad',
  ud: 'unidad', uds: 'unidad', pza: 'unidad', pzas: 'unidad', pieza: 'unidad', piezas: 'unidad',
};

function normalizeUnit(raw: string): CreateInventoryItemInput['unit'] {
  return UNIT_ALIASES[normalizeHeader(raw)] ?? 'unidad';
}

function buildTemplate(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Insumos');
  sheet.columns = HEADERS.map((header) => ({ header, width: 22 }));
  styleTemplateHeader(sheet);
  sheet.addRow(['Pan de hamburguesa', 'unidad', 100, 10, 15, 'Panadería']);
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

  const effectiveId = await effectiveInventoryRestaurantId(restaurantId, parentRestaurantId, 'LOCAL');
  const [existingItems, existingCategories] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { restaurantId: effectiveId, locationScope: 'LOCAL' } }),
    prisma.inventoryCategory.findMany({ where: { restaurantId: effectiveId } }),
  ]);
  const itemByName = new Map(existingItems.map((i) => [i.name.trim().toLowerCase(), i]));
  const categoryByName = new Map(existingCategories.map((c) => [c.name.trim().toLowerCase(), c]));

  const result: ImportResult = { created: 0, updated: 0, errors: [] };

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const name = cellText(row, columns.name);
    if (!name) continue; // fila sin nombre = fila vacía o de relleno, se ignora en silencio

    const unit = normalizeUnit(cellText(row, columns.unit));
    const quantity = cellNumber(row, columns.quantity) ?? 0;
    const minQuantity = cellNumber(row, columns.minQuantity) ?? 0;
    const price = cellNumber(row, columns.price);
    const categoryName = cellText(row, columns.category);

    let categoryId: string | undefined;
    if (categoryName) {
      const key = categoryName.toLowerCase();
      let category = categoryByName.get(key);
      if (!category) {
        category = await prisma.inventoryCategory.create({ data: { restaurantId: effectiveId, name: categoryName } });
        categoryByName.set(key, category);
      }
      categoryId = category.id;
    }

    const input: CreateInventoryItemInput = {
      name,
      unit,
      quantity,
      minQuantity,
      price,
      priceCurrency: 'BASE',
      categoryId: categoryId ?? null,
      locationScope: 'LOCAL',
    };

    try {
      const existing = itemByName.get(name.toLowerCase());
      if (existing) {
        await inventoryService.update(restaurantId, parentRestaurantId, existing.id, input);
        result.updated += 1;
      } else {
        const created = await inventoryService.create(restaurantId, parentRestaurantId, input);
        itemByName.set(name.toLowerCase(), created);
        result.created += 1;
      }
    } catch (err: any) {
      result.errors.push({ row: rowNumber, message: err?.message ?? 'No se pudo guardar esta fila.' });
    }
  }

  return result;
}

export const inventoryImportService = { buildTemplate, importFromExcel };
