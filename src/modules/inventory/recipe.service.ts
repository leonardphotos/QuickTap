import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { round2, toDecimal } from '../../utils/money';
import { CreateRecipeIngredientInput, UpdateCascadeConfigInput, UpdateRecipeIngredientInput } from './recipe.dto';
import { buildCostGraph, resolveCostPerBaseUnit } from './costing';

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

  /** Líneas de receta de un producto puntual, con el insumo o preparación vinculada. */
  async getByProduct(restaurantId: string, productId: string) {
    const product = await prisma.product.findFirst({
      where: { id: productId, restaurantId },
      select: { id: true, name: true, recipeNotes: true },
    });
    if (!product) throw notFound('Producto no encontrado.');

    const lines = await prisma.recipeIngredient.findMany({
      where: { restaurantId, productId },
      orderBy: { createdAt: 'asc' },
      include: {
        inventoryItem: { select: { id: true, name: true, unit: true, quantity: true } },
        preparation: { select: { id: true, name: true, unit: true } },
      },
    });

    const totalCostBase = round2(lines.reduce((acc, l) => acc.add(l.costBase), toDecimal(0)));

    return {
      productId: product.id,
      productName: product.name,
      recipeNotes: product.recipeNotes ?? '',
      totalCostBase: totalCostBase.toFixed(2),
      ingredients: lines.map((l) => ({
        id: l.id,
        type: l.inventoryItemId ? ('insumo' as const) : ('preparacion' as const),
        inventoryItemId: l.inventoryItemId,
        preparationId: l.preparationId,
        name: l.inventoryItem?.name ?? l.preparation?.name ?? '',
        unit: l.inventoryItem?.unit ?? l.preparation?.unit ?? '',
        stockQuantity: l.inventoryItem?.quantity.toFixed(2) ?? null,
        quantity: l.quantity.toFixed(3),
        costBase: l.costBase.toFixed(2),
      })),
    };
  },

  async addIngredient(restaurantId: string, productId: string, input: CreateRecipeIngredientInput) {
    const product = await prisma.product.findFirst({ where: { id: productId, restaurantId }, select: { id: true } });
    if (!product) throw notFound('Producto no encontrado.');

    if (input.inventoryItemId) {
      const item = await prisma.inventoryItem.findFirst({ where: { id: input.inventoryItemId, restaurantId } });
      if (!item) throw badRequest('El insumo elegido no existe.');
    } else if (input.preparationId) {
      const preparation = await prisma.preparation.findFirst({ where: { id: input.preparationId, restaurantId } });
      if (!preparation) throw badRequest('La preparación elegida no existe.');
    }

    return prisma.$transaction(async (tx) => {
      const graph = await buildCostGraph(tx, restaurantId);
      const costPerUnit = resolveCostPerBaseUnit(graph, { inventoryItemId: input.inventoryItemId, preparationId: input.preparationId });
      const created = await tx.recipeIngredient.create({
        data: {
          restaurantId,
          productId,
          inventoryItemId: input.inventoryItemId ?? null,
          preparationId: input.preparationId ?? null,
          quantity: input.quantity,
          costBase: round2(costPerUnit.mul(input.quantity)),
        },
      });
      return created;
    });
  },

  async updateIngredient(restaurantId: string, id: string, input: UpdateRecipeIngredientInput) {
    const existing = await prisma.recipeIngredient.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Ingrediente no encontrado.');

    if (input.inventoryItemId) {
      const item = await prisma.inventoryItem.findFirst({ where: { id: input.inventoryItemId, restaurantId } });
      if (!item) throw badRequest('El insumo elegido no existe.');
    } else if (input.preparationId) {
      const preparation = await prisma.preparation.findFirst({ where: { id: input.preparationId, restaurantId } });
      if (!preparation) throw badRequest('La preparación elegida no existe.');
    }

    return prisma.$transaction(async (tx) => {
      const nextInventoryItemId = input.inventoryItemId !== undefined ? input.inventoryItemId : existing.inventoryItemId;
      const nextPreparationId = input.preparationId !== undefined ? input.preparationId : existing.preparationId;
      const graph = await buildCostGraph(tx, restaurantId);
      const costPerUnit = resolveCostPerBaseUnit(graph, { inventoryItemId: nextInventoryItemId, preparationId: nextPreparationId });
      const quantity = input.quantity ?? existing.quantity;

      return tx.recipeIngredient.update({
        where: { id },
        data: {
          ...(input.inventoryItemId !== undefined ? { inventoryItemId: input.inventoryItemId, preparationId: null } : {}),
          ...(input.preparationId !== undefined ? { preparationId: input.preparationId, inventoryItemId: null } : {}),
          ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
          costBase: round2(costPerUnit.mul(quantity)),
        },
      });
    });
  },

  /** Cascada de precio sugerido: costo de materia prima -> +resguardo -> costo de la
   * receta -> base sugerida según food cost objetivo, comparada contra el precio real
   * del producto (que ya es base imponible, ver decisión en el plan de esta feature —
   * Order calcula servicio/IVA como % SOBRE Product.price, así que no hace falta
   * dividir por 1+IVA/servicio para comparar). Servicio/IVA se muestran solo
   * informativos, leídos de la config real del restaurante — nunca se editan por
   * receta. `foodCostReal`/`margen` usan el costo CON resguardo, a propósito distinto
   * del `marginPercent` de product.service.ts#listWithMargin (que usa el costo crudo
   * sin resguardo) — ambas cifras conviven, cada una con su propósito. */
  async getCascade(restaurantId: string, productId: string) {
    const product = await prisma.product.findFirst({
      where: { id: productId, restaurantId },
      select: {
        id: true,
        price: true,
        recipeBufferPercent: true,
        recipeTargetFoodCostPercent: true,
        recipeApplyService: true,
        recipeApplyIva: true,
      },
    });
    if (!product) throw notFound('Producto no encontrado.');

    const [restaurant, lines] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { serviceChargeEnabled: true, ivaEnabled: true } }),
      prisma.recipeIngredient.findMany({ where: { restaurantId, productId }, select: { costBase: true } }),
    ]);

    const costoMP = round2(lines.reduce((acc, l) => acc.add(l.costBase), toDecimal(0)));
    const resguardo = round2(costoMP.mul(product.recipeBufferPercent.div(100)));
    const costoReceta = costoMP.add(resguardo);
    const baseSugerida = product.recipeTargetFoodCostPercent.greaterThan(0)
      ? round2(costoReceta.mul(100).div(product.recipeTargetFoodCostPercent))
      : toDecimal(0);
    // El restaurante define si cobra servicio/IVA; el producto define si su PVP sugerido
    // los suma. Apagado cualquiera de los dos, ese cargo no entra en la sugerencia.
    const servicioPercent = restaurant?.serviceChargeEnabled && product.recipeApplyService ? 10 : 0;
    const ivaPercent = restaurant?.ivaEnabled && product.recipeApplyIva ? 16 : 0;
    const servicioInfo = round2(baseSugerida.mul(servicioPercent).div(100));
    const ivaInfo = round2(baseSugerida.mul(ivaPercent).div(100));
    const precioActual = toDecimal(product.price);
    const foodCostReal = precioActual.greaterThan(0) ? costoReceta.div(precioActual) : toDecimal(0);
    const margen = round2(precioActual.sub(costoReceta));

    return {
      costoMP: costoMP.toFixed(2),
      resguardoPercent: product.recipeBufferPercent.toFixed(2),
      resguardo: resguardo.toFixed(2),
      costoReceta: costoReceta.toFixed(2),
      targetFoodCostPercent: product.recipeTargetFoodCostPercent.toFixed(2),
      baseSugerida: baseSugerida.toFixed(2),
      servicioPercent,
      servicioInfo: servicioInfo.toFixed(2),
      // Si el restaurante no cobra servicio/IVA, el interruptor no aplica: se informa
      // aparte para que la pantalla pueda explicar por qué está en gris.
      servicioDisponible: !!restaurant?.serviceChargeEnabled,
      aplicaServicio: product.recipeApplyService,
      ivaPercent,
      ivaInfo: ivaInfo.toFixed(2),
      ivaDisponible: !!restaurant?.ivaEnabled,
      aplicaIva: product.recipeApplyIva,
      pvpSugeridoConImpuestos: baseSugerida.add(servicioInfo).add(ivaInfo).toFixed(2),
      precioActual: precioActual.toFixed(2),
      foodCostReal: round2(foodCostReal.mul(100)).toFixed(1),
      margen: margen.toFixed(2),
    };
  },

  async updateCascadeConfig(restaurantId: string, productId: string, input: UpdateCascadeConfigInput) {
    const product = await prisma.product.findFirst({ where: { id: productId, restaurantId }, select: { id: true } });
    if (!product) throw notFound('Producto no encontrado.');
    const { recipeNotes, ...rest } = input;
    await prisma.product.update({
      where: { id: productId },
      data: { ...rest, ...(recipeNotes !== undefined ? { recipeNotes: recipeNotes ? recipeNotes : null } : {}) },
    });
    return this.getCascade(restaurantId, productId);
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
    // Excel v1 es solo insumos — los ingredientes que son preparaciones no se incluyen
    // en la plantilla (no son importables por Excel todavía).
    const insumoLines = lines.filter((l): l is typeof l & { inventoryItem: { name: string } } => Boolean(l.inventoryItem));
    for (const l of insumoLines) sheet.addRow([l.inventoryItem.name, l.quantity.toNumber()]);
    if (insumoLines.length === 0) sheet.addRow(['Pan de hamburguesa', 2]);

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

    const [items, existingLines, graph] = await Promise.all([
      prisma.inventoryItem.findMany({ where: { restaurantId, locationScope: 'LOCAL' } }),
      prisma.recipeIngredient.findMany({ where: { restaurantId, productId } }),
      buildCostGraph(prisma, restaurantId),
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

      const costBase = round2(resolveCostPerBaseUnit(graph, { inventoryItemId: item.id }).mul(quantity));
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
