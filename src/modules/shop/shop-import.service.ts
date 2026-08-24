import ExcelJS from 'exceljs';
import { prisma } from '../../config/prisma';
import { badRequest } from '../../utils/http-error';
import { ImportResult, cellNumber, cellText, detectHeaderRow, resolveColumns, styleTemplateHeader } from '../../utils/excel-import';
import { shopService } from './shop.service';

/**
 * Carga masiva de productos del Local Comercial por Excel (Inventario → "Cargar Excel").
 *
 * Pensado para ARCHIVOS EXPORTADOS DE OTRO SISTEMA y no solo la plantilla propia: quien está
 * migrando a QuickTap ya tiene su inventario en algún lado, y ese archivo casi nunca es la
 * plantilla — trae encabezados en otro idioma de columnas, en otra fila (con el nombre del
 * negocio y totales arriba de la tabla), y puede faltarle SKU, marca o categoría. Por eso las
 * columnas se resuelven por NOMBRE (ver utils/excel-import.ts) y la fila de encabezado se
 * detecta sola en vez de asumir que es la primera.
 *
 * Reutiliza shopService.createProduct/updateProduct fila por fila en vez de escribir Prisma
 * directo, para no duplicar la resolución de categoría ni el lote inicial de stock.
 */

const HEADERS = ['Nombre', 'Categoría', 'Cantidad', 'Costo unitario', 'Precio unitario'] as const;

const COLUMN_SPEC = {
  name: ['nombre', 'producto', 'articulo', 'artículo', 'descripcion', 'descripción', 'item'],
  category: ['categoria', 'categoría', 'rubro', 'grupo'],
  quantity: ['cantidad', 'cant.', 'cant', 'stock', 'existencia', 'existencias'],
  cost: ['costo unitario', 'costo', 'precio de costo', 'precio costo'],
  price: ['precio unitario', 'precio', 'precio de venta', 'pvp'],
};

function buildTemplate(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Productos');
  sheet.columns = HEADERS.map((header) => ({ header, width: 22 }));
  styleTemplateHeader(sheet);
  sheet.addRow(['Camisa manga larga', 'Camisas', 10, 8, 15]);
  return workbook;
}

async function importFromExcel(restaurantId: string, buffer: Buffer): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw badRequest('El archivo no tiene ninguna hoja.');

  const headerRowNumber = detectHeaderRow(sheet, COLUMN_SPEC);
  const { columns } = resolveColumns(sheet, COLUMN_SPEC, headerRowNumber);
  if (!columns.name) {
    throw badRequest('No se encontró una columna de nombre de producto. Revisa que el archivo tenga una columna "Nombre" (o "Producto", "Artículo"…).');
  }

  interface FilaValida {
    row: number;
    name: string;
    category: string;
    quantity: number;
    cost: number;
    price: number;
  }
  const filas: FilaValida[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let n = headerRowNumber + 1; n <= sheet.rowCount; n++) {
    const row = sheet.getRow(n);
    const name = cellText(row, columns.name);
    const category = cellText(row, columns.category);
    const quantity = cellNumber(row, columns.quantity);
    const cost = cellNumber(row, columns.cost);
    const price = cellNumber(row, columns.price);
    // Fila realmente vacía (frecuente al final de un archivo exportado, donde Excel deja
    // cientos de filas "usadas" sin datos reales) — se ignora sin contarla como error.
    if (!name && category === '' && quantity == null && cost == null && price == null) continue;
    if (!name) {
      errors.push({ row: n, message: 'Falta el nombre del producto.' });
      continue;
    }
    filas.push({
      row: n,
      name,
      category: category || 'Sin categoría',
      quantity: Math.max(0, quantity ?? 0),
      cost: Math.max(0, cost ?? 0),
      price: Math.max(0, price ?? 0),
    });
  }

  if (errors.length > 0) return { created: 0, updated: 0, errors };
  if (filas.length === 0) throw badRequest('El archivo no tiene ninguna fila con datos.');

  // Se reconoce por NOMBRE (sin distinguir mayúsculas) y no se toca su stock: reimportar el
  // mismo reporte más tarde actualiza precio/costo/categoría pero no duplica ni resetea lo que
  // ya se vendió o se cargó desde entonces. Solo un producto NUEVO nace con el stock del archivo.
  const existentes = await prisma.shopProduct.findMany({ where: { restaurantId }, select: { id: true, name: true } });
  const porNombre = new Map(existentes.map((p) => [p.name.trim().toLowerCase(), p.id]));

  let created = 0;
  let updated = 0;
  for (const f of filas) {
    const existingId = porNombre.get(f.name.toLowerCase());
    if (existingId) {
      await shopService.updateProduct(restaurantId, existingId, {
        price: f.price,
        cost: f.cost,
        category: f.category,
      } as never);
      updated++;
    } else {
      const nuevo = await shopService.createProduct(restaurantId, {
        name: f.name,
        category: f.category,
        subcategory: '',
        brand: '',
        sku: '',
        location: '',
        price: f.price,
        cost: f.cost,
        minStock: 0,
        variants: [{ v1: 'Único', v2: '', stock: f.quantity, soldByWeight: false }],
      } as never);
      created++;
      // Guarda el id REAL: si el archivo repite el mismo nombre más abajo (algunos exports
      // traen el mismo artículo en más de una fila, con distinta fecha), la siguiente vuelta
      // tiene que actualizar este producto, no intentar crear otro con id inventado.
      porNombre.set(f.name.toLowerCase(), nuevo.id);
    }
  }

  return { created, updated, errors: [] };
}

export const shopImportService = { buildTemplate, importFromExcel };
