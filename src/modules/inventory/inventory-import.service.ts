import ExcelJS from 'exceljs';
import { prisma } from '../../config/prisma';
import { badRequest } from '../../utils/http-error';
import { effectiveInventoryRestaurantId } from './inventory-scope';
import { inventoryService } from './inventory.service';
import { CreateInventoryItemInput } from './inventory.dto';

/**
 * Importar/exportar insumos en bloque por Excel (botones "Descargar plantilla"/"Importar
 * Excel" de la pestaña Insumos). Reutiliza `inventoryService.create`/`update` fila por fila
 * en vez de escribir Prisma directo acá, para no duplicar la resolución de scope/precio.
 */

const HEADERS = ['Nombre', 'Unidad (kg/lt/ml/unidad)', 'Cantidad', 'Cantidad mínima', 'Costo', 'Categoría'] as const;
const VALID_UNITS = new Set(['kg', 'lt', 'ml', 'unidad']);

function styleHeader(sheet: ExcelJS.Worksheet) {
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1428' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function buildTemplate(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Insumos');
  sheet.columns = HEADERS.map((header) => ({ header, width: 22 }));
  styleHeader(sheet);
  sheet.addRow(['Pan de hamburguesa', 'unidad', 100, 10, 15, 'Panadería']);
  return workbook;
}

interface ImportRowError {
  row: number;
  message: string;
}

interface ImportResult {
  created: number;
  updated: number;
  errors: ImportRowError[];
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
    const name = String(row.getCell(1).value ?? '').trim();
    const unit = String(row.getCell(2).value ?? '').trim().toLowerCase();
    if (!name && !unit) continue; // fila vacía, se ignora en silencio

    if (!name) {
      result.errors.push({ row: rowNumber, message: 'Falta el nombre.' });
      continue;
    }
    if (!VALID_UNITS.has(unit)) {
      result.errors.push({ row: rowNumber, message: `Unidad inválida "${unit}" (usa kg, lt, ml o unidad).` });
      continue;
    }

    const quantity = Number(row.getCell(3).value ?? 0) || 0;
    const minQuantity = Number(row.getCell(4).value ?? 0) || 0;
    const costRaw = row.getCell(5).value;
    const price = costRaw != null && costRaw !== '' ? Number(costRaw) : undefined;
    const categoryName = String(row.getCell(6).value ?? '').trim();

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
      unit: unit as CreateInventoryItemInput['unit'],
      quantity,
      minQuantity,
      price: price != null && !Number.isNaN(price) ? price : undefined,
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
