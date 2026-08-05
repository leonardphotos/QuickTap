import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { round2, toDecimal } from '../../utils/money';
import { CreateRecipeIngredientInput, UpdateRecipeIngredientInput } from './recipe.dto';

function styleHeader(sheet: ExcelJS.Worksheet) {
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1428' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

/**
 * Recetas: cuánto de cada insumo (InventoryItem) usa un producto del menú por
 * unidad vendida. Vincula el inventario "normal" (insumos con stock propio)
 * con el catálogo de productos. Vender un producto con receta (al marcarlo
 * SERVED) descuenta esas cantidades del stock del insumo automáticamente
 * (ver deductRecipeStock en order.service.ts).
 */
export const recipeService = {
  /** Todos los productos del restaurante, con si tienen receta y su costo total. */
  async listOverview(restaurantId: string) {
    const [products, lines] = await Promise.all([
      prisma.product.findMany({
        where: { restaurantId },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, photoUrl: true, category: { select: { name: true } } },
      }),
      prisma.recipeIngredient.findMany({ where: { restaurantId }, select: { productId: true, costBase: true } }),
    ]);

    const costByProduct = new Map<string, { count: number; totalCostBase: Prisma.Decimal }>();
    for (const line of lines) {
      const entry = costByProduct.get(line.productId);
      if (entry) {
        entry.count += 1;
        entry.totalCostBase = entry.totalCostBase.add(line.costBase);
      } else {
        costByProduct.set(line.productId, { count: 1, totalCostBase: toDecimal(line.costBase) });
      }
    }

    return products.map((p) => {
      const entry = costByProduct.get(p.id);
      return {
        productId: p.id,
        name: p.name,
        photoUrl: p.photoUrl,
        categoryName: p.category?.name ?? null,
        hasRecipe: Boolean(entry),
        ingredientCount: entry?.count ?? 0,
        totalCostBase: round2(entry?.totalCostBase ?? toDecimal(0)).toFixed(2),
      };
    });
  },

  /** Líneas de receta de un producto puntual, con el insumo vinculado. */
  async getByProduct(restaurantId: string, productId: string) {
    const product = await prisma.product.findFirst({ where: { id: productId, restaurantId }, select: { id: true, name: true } });
    if (!product) throw notFound('Producto no encontrado.');

    const lines = await prisma.recipeIngredient.findMany({
      where: { restaurantId, productId },
      orderBy: { createdAt: 'asc' },
      include: { inventoryItem: { select: { id: true, name: true, unit: true, quantity: true } } },
    });

    const totalCostBase = round2(lines.reduce((acc, l) => acc.add(l.costBase), toDecimal(0)));

    return {
      productId: product.id,
      productName: product.name,
      totalCostBase: totalCostBase.toFixed(2),
      ingredients: lines.map((l) => ({
        id: l.id,
        inventoryItemId: l.inventoryItemId,
        inventoryItemName: l.inventoryItem.name,
        unit: l.inventoryItem.unit,
        stockQuantity: l.inventoryItem.quantity.toFixed(2),
        quantity: l.quantity.toFixed(3),
        costBase: l.costBase.toFixed(2),
      })),
    };
  },

  async addIngredient(restaurantId: string, productId: string, input: CreateRecipeIngredientInput) {
    const product = await prisma.product.findFirst({ where: { id: productId, restaurantId }, select: { id: true } });
    if (!product) throw notFound('Producto no encontrado.');

    const item = await prisma.inventoryItem.findFirst({ where: { id: input.inventoryItemId, restaurantId } });
    if (!item) throw badRequest('El insumo elegido no existe.');

    // Costo automático: si el insumo no tiene precio cargado, queda en 0 (se
    // puede completar más tarde cargando el precio del insumo y reeditando).
    const costBase = item.pricePerUnitBase ? round2(item.pricePerUnitBase.mul(input.quantity)) : toDecimal(0);

    return prisma.recipeIngredient.create({
      data: {
        restaurantId,
        productId,
        inventoryItemId: input.inventoryItemId,
        quantity: input.quantity,
        costBase,
      },
    });
  },

  async updateIngredient(restaurantId: string, id: string, input: UpdateRecipeIngredientInput) {
    const existing = await prisma.recipeIngredient.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Ingrediente no encontrado.');

    let item = null;
    if (input.inventoryItemId) {
      item = await prisma.inventoryItem.findFirst({ where: { id: input.inventoryItemId, restaurantId } });
      if (!item) throw badRequest('El insumo elegido no existe.');
    } else if (input.quantity != null) {
      item = await prisma.inventoryItem.findFirst({ where: { id: existing.inventoryItemId, restaurantId } });
    }

    const quantity = input.quantity ?? existing.quantity;
    const costBase = item ? (item.pricePerUnitBase ? round2(item.pricePerUnitBase.mul(quantity)) : toDecimal(0)) : undefined;

    return prisma.recipeIngredient.update({
      where: { id },
      data: { ...input, ...(costBase !== undefined ? { costBase } : {}) },
    });
  },

  async removeIngredient(restaurantId: string, id: string) {
    const existing = await prisma.recipeIngredient.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Ingrediente no encontrado.');
    await prisma.recipeIngredient.delete({ where: { id } });
    return { deleted: true };
  },

  /** Plantilla de importación de UN producto — prellenada con su receta actual, para que el
   * usuario edite y resuba en vez de partir de cero. */
  async buildImportTemplate(restaurantId: string, productId: string) {
    const product = await prisma.product.findFirst({ where: { id: productId, restaurantId }, select: { name: true } });
    if (!product) throw notFound('Producto no encontrado.');
    const lines = await prisma.recipeIngredient.findMany({
      where: { restaurantId, productId },
      include: { inventoryItem: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Receta');
    sheet.columns = [
      { header: 'Insumo', width: 28 },
      { header: 'Cantidad', width: 14 },
    ];
    styleHeader(sheet);
    for (const l of lines) sheet.addRow([l.inventoryItem.name, l.quantity.toNumber()]);
    if (lines.length === 0) sheet.addRow(['Pan de hamburguesa', 2]);

    return { workbook, productName: product.name };
  },

  /**
   * Carga la receta de UN producto desde un Excel de 2 columnas (insumo, cantidad). Hace
   * upsert por nombre de insumo dentro de esa receta — no borra ingredientes existentes que
   * no aparezcan en el archivo (no destructivo). Nombres que no calzan con ningún insumo del
   * restaurante quedan reportados en `errors`, sin crear insumos fantasma (para eso está la
   * importación de insumos de Inventario).
   */
  async importFromExcel(restaurantId: string, productId: string, buffer: Buffer) {
    const product = await prisma.product.findFirst({ where: { id: productId, restaurantId }, select: { id: true } });
    if (!product) throw notFound('Producto no encontrado.');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw badRequest('El archivo no tiene ninguna hoja.');

    const [items, existingLines] = await Promise.all([
      prisma.inventoryItem.findMany({ where: { restaurantId, locationScope: 'LOCAL' } }),
      prisma.recipeIngredient.findMany({ where: { restaurantId, productId } }),
    ]);
    const itemByName = new Map(items.map((i) => [i.name.trim().toLowerCase(), i]));
    const lineByItemId = new Map(existingLines.map((l) => [l.inventoryItemId, l]));

    const result = { created: 0, updated: 0, errors: [] as { row: number; message: string }[] };

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const insumoName = String(row.getCell(1).value ?? '').trim();
      const quantityRaw = row.getCell(2).value;
      if (!insumoName && (quantityRaw == null || quantityRaw === '')) continue; // fila vacía

      if (!insumoName) {
        result.errors.push({ row: rowNumber, message: 'Falta el nombre del insumo.' });
        continue;
      }
      const quantity = Number(quantityRaw);
      if (!quantity || quantity <= 0) {
        result.errors.push({ row: rowNumber, message: 'La cantidad debe ser mayor a 0.' });
        continue;
      }
      const item = itemByName.get(insumoName.toLowerCase());
      if (!item) {
        result.errors.push({ row: rowNumber, message: `No existe un insumo llamado "${insumoName}".` });
        continue;
      }

      const costBase = item.pricePerUnitBase ? round2(item.pricePerUnitBase.mul(quantity)) : toDecimal(0);
      const existingLine = lineByItemId.get(item.id);
      if (existingLine) {
        await prisma.recipeIngredient.update({ where: { id: existingLine.id }, data: { quantity, costBase } });
        result.updated += 1;
      } else {
        const created = await prisma.recipeIngredient.create({
          data: { restaurantId, productId, inventoryItemId: item.id, quantity, costBase },
        });
        lineByItemId.set(item.id, created);
        result.created += 1;
      }
    }

    return result;
  },
};
