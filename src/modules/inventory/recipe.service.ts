import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { prisma } from '../../config/prisma';
import { resolveInventoryScopeById } from './inventory-scope';
import { badRequest, notFound } from '../../utils/http-error';
import { round2, toDecimal } from '../../utils/money';
import { CreateRecipeIngredientInput, DuplicateRecipeInput, DuplicateRecipeVariantInput, UpdateCascadeConfigInput, UpdateRecipeIngredientInput } from './recipe.dto';
import { buildCostGraph, recomputeDependentCosts, resolveCostPerBaseUnit, resolveCustomerChoiceCostPerUnit } from './costing';

/** La categoría de modificadores de una línea "A elección del cliente" tiene que estar
 * asociada al producto (si no, el cliente nunca la vería al pedir ese plato). */
async function assertCategoryBelongsToProduct(restaurantId: string, productId: string, categoryId: string) {
  const link = await prisma.productModifierCategory.findFirst({
    where: { productId, modifierCategoryId: categoryId, modifierCategory: { restaurantId } },
  });
  if (!link) throw badRequest('Esa categoría de modificadores no está asociada a este producto.');
}

/** Un topping concreto tiene que ser un modificador de ESA categoría (y del restaurante). */
async function assertModifierInCategory(restaurantId: string, categoryId: string, modifierId: string) {
  const mod = await prisma.modifier.findFirst({ where: { id: modifierId, categoryId, restaurantId }, select: { id: true } });
  if (!mod) throw badRequest('Ese topping no pertenece a la categoría elegida.');
}

/** El tamaño de una línea de receta tiene que ser una variante real de ESE producto. */
async function assertVariantBelongsToProduct(restaurantId: string, productId: string, variantId: string) {
  const variant = await prisma.productVariant.findFirst({ where: { id: variantId, productId, restaurantId } });
  if (!variant) throw badRequest('Ese tamaño no pertenece a este producto.');
}

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
/**
 * Un combo no puede incluirse a sí mismo, ni directa ni indirectamente. Si el Combo A incluye
 * al Combo B y alguien mete el A dentro del B, el costo y el descuento de stock se llamarían
 * en círculo para siempre.
 *
 * El resolutor de costos corta los ciclos igual (devuelve 0 al reencontrarse), pero eso deja
 * una receta que miente en silencio: mostraría un costo demasiado bajo sin avisar. Por eso se
 * rechaza al guardar, que es donde el usuario todavía entiende qué hizo mal.
 */
async function assertSinCiclo(restaurantId: string, productId: string, componentProductId: string) {
  if (componentProductId === productId) throw badRequest('Un plato no puede incluirse a sí mismo.');

  const lineas = await prisma.recipeIngredient.findMany({
    where: { restaurantId, componentProductId: { not: null } },
    select: { productId: true, componentProductId: true },
  });
  const hijos = new Map<string, string[]>();
  for (const l of lineas) {
    if (!l.componentProductId) continue;
    hijos.set(l.productId, [...(hijos.get(l.productId) ?? []), l.componentProductId]);
  }

  // ¿Desde el plato que se quiere incluir se llega de vuelta al que estamos editando?
  const pila = [componentProductId];
  const vistos = new Set<string>();
  while (pila.length) {
    const actual = pila.pop()!;
    if (actual === productId) {
      const nombre = await prisma.product.findFirst({ where: { id: componentProductId }, select: { name: true } });
      throw badRequest(`No se puede: "${nombre?.name ?? 'ese plato'}" ya incluye a este, y quedarían uno dentro del otro.`);
    }
    if (vistos.has(actual)) continue;
    vistos.add(actual);
    pila.push(...(hijos.get(actual) ?? []));
  }
}

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

  /** Líneas de receta de un producto puntual, con el insumo/preparación/categoría "a elección
   * del cliente" vinculada — más los tamaños y categorías de modificadores del producto, para
   * que el editor pueda ofrecerlos como picker sin otra ida y vuelta al servidor. */
  async getByProduct(restaurantId: string, productId: string) {
    const product = await prisma.product.findFirst({
      where: { id: productId, restaurantId },
      select: {
        id: true,
        name: true,
        recipeNotes: true,
        variants: { select: { id: true, name: true }, orderBy: { priority: 'asc' } },
        modifierCategories: {
          select: {
            modifierCategory: {
              select: {
                id: true,
                name: true,
                // Toppings de la categoría, con su insumo vinculado — para el picker "topping
                // concreto" del editor. Sin insumo vinculado no descuentan stock (se avisa en la UI).
                modifiers: {
                  select: { id: true, name: true, inventoryItem: { select: { id: true, name: true, unit: true } } },
                  orderBy: [{ priority: 'asc' }, { name: 'asc' }],
                },
              },
            },
          },
          orderBy: { priority: 'asc' },
        },
      },
    });
    if (!product) throw notFound('Producto no encontrado.');

    const lines = await prisma.recipeIngredient.findMany({
      where: { restaurantId, productId },
      orderBy: { createdAt: 'asc' },
      include: {
        inventoryItem: { select: { id: true, name: true, unit: true, quantity: true } },
        preparation: { select: { id: true, name: true, unit: true } },
        componentProduct: { select: { id: true, name: true } },
        customerChoiceCategory: { select: { id: true, name: true } },
        customerChoiceModifier: { select: { id: true, name: true, inventoryItem: { select: { name: true, unit: true } } } },
        productVariant: { select: { id: true, name: true } },
      },
    });

    const totalCostBase = round2(lines.reduce((acc, l) => acc.add(l.costBase), toDecimal(0)));

    return {
      productId: product.id,
      productName: product.name,
      recipeNotes: product.recipeNotes ?? '',
      totalCostBase: totalCostBase.toFixed(2),
      variants: product.variants,
      modifierCategories: product.modifierCategories.map((pc) => ({
        id: pc.modifierCategory.id,
        name: pc.modifierCategory.name,
        modifiers: pc.modifierCategory.modifiers.map((m) => ({
          id: m.id,
          name: m.name,
          inventoryItemName: m.inventoryItem?.name ?? null,
          inventoryItemUnit: m.inventoryItem?.unit ?? null,
        })),
      })),
      ingredients: lines.map((l) => ({
        id: l.id,
        type: l.inventoryItemId
          ? ('insumo' as const)
          : l.preparationId
            ? ('preparacion' as const)
            : l.componentProductId
              ? ('plato' as const)
              : ('cliente' as const),
        inventoryItemId: l.inventoryItemId,
        preparationId: l.preparationId,
        componentProductId: l.componentProductId,
        customerChoiceModifierCategoryId: l.customerChoiceModifierCategoryId,
        customerChoiceCategoryName: l.customerChoiceCategory?.name ?? null,
        customerChoiceModifierId: l.customerChoiceModifierId,
        customerChoiceModifierName: l.customerChoiceModifier?.name ?? null,
        customerChoiceInventoryItemName: l.customerChoiceModifier?.inventoryItem?.name ?? null,
        productVariantId: l.productVariantId,
        variantName: l.productVariant?.name ?? null,
        name:
          l.inventoryItem?.name ??
          l.preparation?.name ??
          l.componentProduct?.name ??
          (l.customerChoiceModifier
            ? `${l.customerChoiceModifier.name} (topping${l.customerChoiceCategory ? ` · ${l.customerChoiceCategory.name}` : ''})`
            : `Cualquier topping${l.customerChoiceCategory ? ` (${l.customerChoiceCategory.name})` : ''}`),
        // Topping concreto: se mide en la unidad de SU insumo (un huevo va en "unidad", el queso en
        // kg). Genérico: siempre kg (gramos), porque no se sabe qué insumo será.
        unit: l.inventoryItem?.unit ?? l.preparation?.unit ?? l.customerChoiceModifier?.inventoryItem?.unit ?? 'kg',
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
      const item = await prisma.inventoryItem.findFirst({
        where: { id: input.inventoryItemId, restaurantId: await resolveInventoryScopeById(restaurantId) },
      });
      if (!item) throw badRequest('El insumo elegido no existe.');
    } else if (input.preparationId) {
      const preparation = await prisma.preparation.findFirst({ where: { id: input.preparationId, restaurantId } });
      if (!preparation) throw badRequest('La preparación elegida no existe.');
    } else if (input.componentProductId) {
      const componente = await prisma.product.findFirst({
        where: { id: input.componentProductId, restaurantId },
        select: { id: true, name: true },
      });
      if (!componente) throw badRequest('El plato que quieres incluir no existe.');
      await assertSinCiclo(restaurantId, productId, input.componentProductId);
    } else if (input.customerChoiceModifierCategoryId) {
      await assertCategoryBelongsToProduct(restaurantId, productId, input.customerChoiceModifierCategoryId);
      if (input.customerChoiceModifierId) {
        await assertModifierInCategory(restaurantId, input.customerChoiceModifierCategoryId, input.customerChoiceModifierId);
      }
    }
    if (input.productVariantId) await assertVariantBelongsToProduct(restaurantId, productId, input.productVariantId);

    return prisma.$transaction(async (tx) => {
      const graph = await buildCostGraph(tx, restaurantId);
      const costPerUnit = input.customerChoiceModifierCategoryId
        ? await resolveCustomerChoiceCostPerUnit(tx, graph, restaurantId, input.customerChoiceModifierCategoryId, input.customerChoiceModifierId)
        : resolveCostPerBaseUnit(graph, {
            inventoryItemId: input.inventoryItemId,
            preparationId: input.preparationId,
            componentProductId: input.componentProductId,
          });
      const created = await tx.recipeIngredient.create({
        data: {
          restaurantId,
          productId,
          inventoryItemId: input.inventoryItemId ?? null,
          preparationId: input.preparationId ?? null,
          componentProductId: input.componentProductId ?? null,
          customerChoiceModifierCategoryId: input.customerChoiceModifierCategoryId ?? null,
          customerChoiceModifierId: input.customerChoiceModifierCategoryId ? (input.customerChoiceModifierId ?? null) : null,
          productVariantId: input.productVariantId ?? null,
          quantity: input.quantity,
          costBase: round2(costPerUnit.mul(input.quantity)),
        },
      });
      return created;
    });
  },

  /**
   * Copia la receta de un plato a otro. Es el atajo para los platos que se parecen: la misma
   * hamburguesa con otro término, la pizza que solo cambia un topping. Rearmar quince
   * ingredientes a mano para cambiar uno es donde se cometen los errores.
   *
   * No todo se puede copiar tal cual, y eso es lo delicado:
   *  - Los insumos y las preparaciones son del restaurante, así que pasan siempre.
   *  - Un ingrediente atado a un TAMAÑO del plato origen no significa nada en el destino, que
   *    tiene otros tamaños. Se intenta emparejar por nombre ("Grande" con "Grande"); si el
   *    destino no lo tiene, la línea pasa aplicada al plato completo y se avisa — perderla en
   *    silencio dejaría la receta corta sin que nadie lo note.
   *  - Un ingrediente atado a una categoría de modificadores solo pasa si esa categoría también
   *    está asociada al plato destino. Si no, se omite: apuntaría a toppings que ese plato no
   *    ofrece.
   *
   * El costo se recalcula contra los precios de HOY, no se copia el del origen: si el insumo
   * cambió de precio desde que se armó la receta original, copiar el costo viejo arrastraría un
   * margen falso al plato nuevo.
   */
  async duplicate(restaurantId: string, productId: string, input: DuplicateRecipeInput) {
    if (productId === input.targetProductId) throw badRequest('Elige un plato distinto al de origen.');

    const [origen, destino] = await Promise.all([
      prisma.product.findFirst({ where: { id: productId, restaurantId }, select: { id: true, name: true } }),
      prisma.product.findFirst({ where: { id: input.targetProductId, restaurantId }, select: { id: true, name: true } }),
    ]);
    if (!origen) throw notFound('El plato de origen no existe.');
    if (!destino) throw notFound('El plato de destino no existe.');

    const ingredientes = await prisma.recipeIngredient.findMany({ where: { restaurantId, productId } });
    if (ingredientes.length === 0) throw badRequest(`"${origen.name}" no tiene receta que copiar.`);

    const yaTiene = await prisma.recipeIngredient.count({ where: { restaurantId, productId: destino.id } });
    // Nunca se pisa una receta existente sin permiso: puede ser trabajo de horas.
    if (yaTiene > 0 && !input.replace) {
      throw badRequest(`"${destino.name}" ya tiene ${yaTiene} ingrediente(s). Marca "reemplazar" si quieres sustituir su receta.`);
    }

    // Tamaños del destino, por nombre, para reubicar los ingredientes por tamaño.
    const [variantesOrigen, variantesDestino, categoriasDestino] = await Promise.all([
      prisma.productVariant.findMany({ where: { productId, restaurantId }, select: { id: true, name: true } }),
      prisma.productVariant.findMany({ where: { productId: destino.id, restaurantId }, select: { id: true, name: true } }),
      prisma.productModifierCategory.findMany({ where: { productId: destino.id }, select: { modifierCategoryId: true } }),
    ]);
    const nombreVarianteOrigen = new Map(variantesOrigen.map((v) => [v.id, v.name]));
    const varianteDestinoPorNombre = new Map(variantesDestino.map((v) => [v.name.trim().toLowerCase(), v.id]));
    const categoriasPermitidas = new Set(categoriasDestino.map((c) => c.modifierCategoryId));

    const avisos: string[] = [];
    const aCrear: Prisma.RecipeIngredientCreateManyInput[] = [];

    for (const ing of ingredientes) {
      if (ing.customerChoiceModifierCategoryId && !categoriasPermitidas.has(ing.customerChoiceModifierCategoryId)) {
        avisos.push('Se omitió un ingrediente por topping: esa categoría de modificadores no está en el plato destino.');
        continue;
      }
      let productVariantId: string | null = null;
      if (ing.productVariantId) {
        const nombre = (nombreVarianteOrigen.get(ing.productVariantId) ?? '').trim().toLowerCase();
        productVariantId = varianteDestinoPorNombre.get(nombre) ?? null;
        if (!productVariantId) {
          avisos.push(`El tamaño "${nombreVarianteOrigen.get(ing.productVariantId) ?? '?'}" no existe en el destino: ese ingrediente quedó aplicado al plato completo.`);
        }
      }
      aCrear.push({
        restaurantId,
        productId: destino.id,
        inventoryItemId: ing.inventoryItemId,
        preparationId: ing.preparationId,
        customerChoiceModifierCategoryId: ing.customerChoiceModifierCategoryId,
        customerChoiceModifierId: ing.customerChoiceModifierId,
        productVariantId,
        quantity: ing.quantity,
        costBase: ing.costBase,
      });
    }

    if (aCrear.length === 0) throw badRequest('Ningún ingrediente de esa receta se puede aplicar a este plato.');

    return prisma.$transaction(async (tx) => {
      if (yaTiene > 0) await tx.recipeIngredient.deleteMany({ where: { restaurantId, productId: destino.id } });
      await tx.recipeIngredient.createMany({ data: aCrear });

      // Costo recalculado a precios de hoy (ver el comentario de arriba).
      const graph = await buildCostGraph(tx, restaurantId);
      const creados = await tx.recipeIngredient.findMany({ where: { restaurantId, productId: destino.id } });
      for (const ing of creados) {
        const costPerUnit = ing.customerChoiceModifierCategoryId
          ? await resolveCustomerChoiceCostPerUnit(tx, graph, restaurantId, ing.customerChoiceModifierCategoryId, ing.customerChoiceModifierId)
          : resolveCostPerBaseUnit(graph, { inventoryItemId: ing.inventoryItemId, preparationId: ing.preparationId });
        const costBase = round2(costPerUnit.mul(ing.quantity));
        if (!costBase.equals(ing.costBase)) {
          await tx.recipeIngredient.update({ where: { id: ing.id }, data: { costBase } });
        }
      }

      return {
        origen: origen.name,
        destino: destino.name,
        copiados: aCrear.length,
        omitidos: ingredientes.length - aCrear.length,
        reemplazo: yaTiene > 0,
        avisos: [...new Set(avisos)],
      };
    });
  },

  /**
   * Copia los ingredientes de un tamaño a otro DENTRO del mismo plato.
   *
   * Es el caso de la pizza: la Grande lleva lo mismo que la Mediana, solo que más. Hoy hay que
   * volver a cargar cada línea a mano en la pestaña del otro tamaño.
   *
   * `fromVariantId`/`toVariantId` en null son las líneas compartidas ("Todos los tamaños"), que
   * es una pestaña más y se copia igual que cualquier otra.
   *
   * Las cantidades se copian tal cual, no se escalan: cuánto más lleva la Grande lo sabe el
   * cocinero, no el sistema, y un factor inventado saldría mal en la mitad de los ingredientes
   * (el queso escala, el palito de la aceituna no). Se copia y se ajusta lo que haga falta.
   */
  async duplicateVariant(restaurantId: string, productId: string, input: DuplicateRecipeVariantInput) {
    const desde = input.fromVariantId ?? null;
    const hasta = input.toVariantId ?? null;
    if (desde === hasta) throw badRequest('Elige un tamaño distinto al de origen.');

    const product = await prisma.product.findFirst({ where: { id: productId, restaurantId }, select: { id: true } });
    if (!product) throw notFound('Producto no encontrado.');
    if (desde) await assertVariantBelongsToProduct(restaurantId, productId, desde);
    if (hasta) await assertVariantBelongsToProduct(restaurantId, productId, hasta);

    const nombreDe = async (id: string | null) =>
      id
        ? (await prisma.productVariant.findFirst({ where: { id }, select: { name: true } }))?.name ?? 'ese tamaño'
        : 'Todos los tamaños';

    const origen = await prisma.recipeIngredient.findMany({ where: { restaurantId, productId, productVariantId: desde } });
    if (origen.length === 0) throw badRequest(`"${await nombreDe(desde)}" no tiene ingredientes que copiar.`);

    const yaTiene = await prisma.recipeIngredient.count({ where: { restaurantId, productId, productVariantId: hasta } });
    // Mismo criterio que copiar entre platos: no se pisa lo ya cargado sin permiso.
    if (yaTiene > 0 && !input.replace) {
      throw badRequest(`"${await nombreDe(hasta)}" ya tiene ${yaTiene} ingrediente(s). Marca "reemplazar" para sustituirlos.`);
    }

    return prisma.$transaction(async (tx) => {
      if (yaTiene > 0) {
        await tx.recipeIngredient.deleteMany({ where: { restaurantId, productId, productVariantId: hasta } });
      }
      // El costo se copia tal cual: es el mismo insumo, la misma cantidad y el mismo plato, así
      // que ya está calculado a precio de hoy — a diferencia de copiar a OTRO plato, donde la
      // receta original puede ser vieja.
      await tx.recipeIngredient.createMany({
        data: origen.map((ing) => ({
          restaurantId,
          productId,
          inventoryItemId: ing.inventoryItemId,
          preparationId: ing.preparationId,
          customerChoiceModifierCategoryId: ing.customerChoiceModifierCategoryId,
          customerChoiceModifierId: ing.customerChoiceModifierId,
          productVariantId: hasta,
          quantity: ing.quantity,
          costBase: ing.costBase,
        })),
      });
      return {
        desde: await nombreDe(desde),
        hasta: await nombreDe(hasta),
        copiados: origen.length,
        reemplazo: yaTiene > 0,
      };
    });
  },

  /**
   * Plantilla del RECETARIO COMPLETO, no de un plato. La que ya existía carga un plato por
   * archivo, que sirve para corregir uno suelto pero no para montar una carta de sesenta.
   *
   * Sale llena con lo que ya hay cargado, así que también funciona como respaldo: se baja, se
   * corrige en Excel y se vuelve a subir. Y trae una segunda hoja con los nombres válidos de
   * insumos, preparaciones y platos, porque la importación empareja por NOMBRE y sin esa lista
   * el usuario adivina cómo se escribe cada cosa.
   */
  async buildGlobalImportTemplate(restaurantId: string) {
    const [productos, insumos, preparaciones] = await Promise.all([
      prisma.product.findMany({
        where: { restaurantId },
        select: {
          name: true,
          recipeIngredients: {
            select: {
              quantity: true,
              inventoryItem: { select: { name: true, unit: true } },
              preparation: { select: { name: true, unit: true } },
              componentProduct: { select: { name: true } },
              productVariant: { select: { name: true } },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.inventoryItem.findMany({ where: { restaurantId: await resolveInventoryScopeById(restaurantId) }, select: { name: true, unit: true }, orderBy: { name: 'asc' } }),
      prisma.preparation.findMany({ where: { restaurantId }, select: { name: true, unit: true }, orderBy: { name: 'asc' } }),
    ]);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Recetas');
    sheet.columns = [
      { header: 'Plato', width: 32 },
      { header: 'Tipo', width: 14 },
      { header: 'Ingrediente', width: 32 },
      { header: 'Cantidad', width: 12 },
      { header: 'Unidad', width: 10 },
      { header: 'Tamaño', width: 16 },
    ];
    styleHeader(sheet);

    let hayFilas = false;
    for (const prod of productos) {
      for (const l of prod.recipeIngredients) {
        const tipo = l.inventoryItem ? 'Insumo' : l.preparation ? 'Preparación' : l.componentProduct ? 'Plato' : null;
        // Las líneas "a elección del cliente" se omiten: dependen de lo que elija el comensal y
        // no se pueden expresar como una fila fija sin mentir.
        if (!tipo) continue;
        hayFilas = true;
        sheet.addRow([
          prod.name,
          tipo,
          l.inventoryItem?.name ?? l.preparation?.name ?? l.componentProduct?.name ?? '',
          l.quantity.toNumber(),
          l.inventoryItem?.unit ?? l.preparation?.unit ?? 'unidad',
          l.productVariant?.name ?? '',
        ]);
      }
    }
    if (!hayFilas) {
      const ejemploInsumo = insumos[0]?.name ?? 'Pan de hamburguesa';
      const ejemploPlato = productos[0]?.name ?? 'Hamburguesa clásica';
      sheet.addRow([ejemploPlato, 'Insumo', ejemploInsumo, 2, insumos[0]?.unit ?? 'unidad', '']);
      if (productos[1]) sheet.addRow(['Combo familiar', 'Plato', ejemploPlato, 2, 'unidad', '']);
    }

    // Hoja de referencia: los nombres tienen que escribirse igual que acá.
    const ref = workbook.addWorksheet('Nombres válidos');
    ref.columns = [
      { header: 'Tipo', width: 14 },
      { header: 'Nombre', width: 34 },
      { header: 'Unidad', width: 10 },
    ];
    styleHeader(ref);
    for (const i of insumos) ref.addRow(['Insumo', i.name, i.unit]);
    for (const pr of preparaciones) ref.addRow(['Preparación', pr.name, pr.unit]);
    for (const pr of productos) ref.addRow(['Plato', pr.name, 'unidad']);

    return workbook;
  },

  /**
   * Importa el recetario completo. Reemplaza la receta de CADA plato que aparezca en el archivo
   * y no toca los que no aparecen: así se puede subir un archivo con tres platos sin borrar los
   * otros cincuenta.
   *
   * Nada se escribe si hay errores de forma. Media carta importada y media no es peor que no
   * haber importado nada, porque nadie sabe dónde quedó el corte.
   */
  async importGlobalFromExcel(restaurantId: string, buffer: Buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw badRequest('El archivo no tiene ninguna hoja.');

    const scope = await resolveInventoryScopeById(restaurantId);
    const [productos, insumos, preparaciones] = await Promise.all([
      prisma.product.findMany({ where: { restaurantId }, select: { id: true, name: true, variants: { select: { id: true, name: true } } } }),
      prisma.inventoryItem.findMany({ where: { restaurantId: scope }, select: { id: true, name: true } }),
      prisma.preparation.findMany({ where: { restaurantId }, select: { id: true, name: true } }),
    ]);
    const clave = (s: string) => s.trim().toLowerCase();
    const porPlato = new Map(productos.map((p) => [clave(p.name), p]));
    const porInsumo = new Map(insumos.map((i) => [clave(i.name), i.id]));
    const porPrep = new Map(preparaciones.map((p) => [clave(p.name), p.id]));

    const errores: { row: number; message: string }[] = [];
    const filas: { productId: string; ref: { inventoryItemId?: string; preparationId?: string; componentProductId?: string }; quantity: number; productVariantId: string | null }[] = [];

    for (let n = 2; n <= sheet.rowCount; n++) {
      const row = sheet.getRow(n);
      const plato = String(row.getCell(1).value ?? '').trim();
      const tipo = clave(String(row.getCell(2).value ?? ''));
      const ingrediente = String(row.getCell(3).value ?? '').trim();
      const cantidadRaw = row.getCell(4).value;
      const tamano = String(row.getCell(6).value ?? '').trim();
      if (!plato && !ingrediente) continue; // fila vacía

      const prod = porPlato.get(clave(plato));
      if (!prod) { errores.push({ row: n, message: `No existe el plato "${plato}".` }); continue; }
      const cantidad = Number(cantidadRaw);
      if (!Number.isFinite(cantidad) || cantidad <= 0) { errores.push({ row: n, message: 'La cantidad debe ser mayor a 0.' }); continue; }

      let ref: { inventoryItemId?: string; preparationId?: string; componentProductId?: string };
      if (tipo.startsWith('insumo')) {
        const id = porInsumo.get(clave(ingrediente));
        if (!id) { errores.push({ row: n, message: `No existe el insumo "${ingrediente}".` }); continue; }
        ref = { inventoryItemId: id };
      } else if (tipo.startsWith('prepar')) {
        const id = porPrep.get(clave(ingrediente));
        if (!id) { errores.push({ row: n, message: `No existe la preparación "${ingrediente}".` }); continue; }
        ref = { preparationId: id };
      } else if (tipo.startsWith('plato')) {
        const comp = porPlato.get(clave(ingrediente));
        if (!comp) { errores.push({ row: n, message: `No existe el plato "${ingrediente}".` }); continue; }
        if (comp.id === prod.id) { errores.push({ row: n, message: 'Un plato no puede incluirse a sí mismo.' }); continue; }
        ref = { componentProductId: comp.id };
      } else {
        errores.push({ row: n, message: 'La columna Tipo debe decir Insumo, Preparación o Plato.' });
        continue;
      }

      let productVariantId: string | null = null;
      if (tamano) {
        const v = prod.variants.find((x) => clave(x.name) === clave(tamano));
        if (!v) { errores.push({ row: n, message: `"${plato}" no tiene el tamaño "${tamano}".` }); continue; }
        productVariantId = v.id;
      }
      filas.push({ productId: prod.id, ref, quantity: cantidad, productVariantId });
    }

    if (errores.length > 0) return { imported: 0, platos: 0, errors: errores };
    if (filas.length === 0) throw badRequest('El archivo no tiene ninguna fila con datos.');

    // Ciclos entre combos: se valida sobre el resultado FINAL, no fila por fila, porque el
    // archivo puede armar el ciclo entre dos filas que por separado son válidas.
    const hijos = new Map<string, string[]>();
    for (const f of filas) {
      if (!f.ref.componentProductId) continue;
      hijos.set(f.productId, [...(hijos.get(f.productId) ?? []), f.ref.componentProductId]);
    }
    const platosDelArchivo = new Set(filas.map((f) => f.productId));
    const existentes = await prisma.recipeIngredient.findMany({
      where: { restaurantId, componentProductId: { not: null }, productId: { notIn: [...platosDelArchivo] } },
      select: { productId: true, componentProductId: true },
    });
    for (const e of existentes) {
      if (e.componentProductId) hijos.set(e.productId, [...(hijos.get(e.productId) ?? []), e.componentProductId]);
    }
    for (const raiz of hijos.keys()) {
      const pila = [...(hijos.get(raiz) ?? [])];
      const vistos = new Set<string>();
      while (pila.length) {
        const actual = pila.pop()!;
        if (actual === raiz) {
          const nombre = productos.find((p) => p.id === raiz)?.name ?? 'un plato';
          return { imported: 0, platos: 0, errors: [{ row: 0, message: `"${nombre}" quedaría dentro de sí mismo. Revisa los combos del archivo.` }] };
        }
        if (vistos.has(actual)) continue;
        vistos.add(actual);
        pila.push(...(hijos.get(actual) ?? []));
      }
    }

    return prisma.$transaction(async (tx) => {
      await tx.recipeIngredient.deleteMany({ where: { restaurantId, productId: { in: [...platosDelArchivo] } } });
      const graph = await buildCostGraph(tx, restaurantId);
      for (const f of filas) {
        const perUnit = resolveCostPerBaseUnit(graph, f.ref);
        await tx.recipeIngredient.create({
          data: {
            restaurantId,
            productId: f.productId,
            inventoryItemId: f.ref.inventoryItemId ?? null,
            preparationId: f.ref.preparationId ?? null,
            componentProductId: f.ref.componentProductId ?? null,
            productVariantId: f.productVariantId,
            quantity: f.quantity,
            costBase: round2(perUnit.mul(f.quantity)),
          },
        });
      }
      // Los combos apuntan a recetas que acaban de cambiar: se recalcula todo lo dependiente.
      await recomputeDependentCosts(tx, restaurantId);
      return { imported: filas.length, platos: platosDelArchivo.size, errors: [] };
    });
  },

  async updateIngredient(restaurantId: string, id: string, input: UpdateRecipeIngredientInput) {
    const existing = await prisma.recipeIngredient.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Ingrediente no encontrado.');

    if (input.inventoryItemId) {
      const item = await prisma.inventoryItem.findFirst({
        where: { id: input.inventoryItemId, restaurantId: await resolveInventoryScopeById(restaurantId) },
      });
      if (!item) throw badRequest('El insumo elegido no existe.');
    } else if (input.preparationId) {
      const preparation = await prisma.preparation.findFirst({ where: { id: input.preparationId, restaurantId } });
      if (!preparation) throw badRequest('La preparación elegida no existe.');
    } else if (input.customerChoiceModifierCategoryId) {
      await assertCategoryBelongsToProduct(restaurantId, existing.productId, input.customerChoiceModifierCategoryId);
    }
    if (input.customerChoiceModifierId) {
      const categoryId = input.customerChoiceModifierCategoryId ?? existing.customerChoiceModifierCategoryId;
      if (!categoryId) throw badRequest('Un topping concreto necesita su categoría de modificadores.');
      await assertModifierInCategory(restaurantId, categoryId, input.customerChoiceModifierId);
    }
    if (input.productVariantId) await assertVariantBelongsToProduct(restaurantId, existing.productId, input.productVariantId);

    // Cualquiera de los tres campos de "tipo" presente en el body significa que se está
    // cambiando de tipo de línea — los otros dos se limpian, igual que antes con insumo/preparación.
    const switchingType =
      input.inventoryItemId !== undefined || input.preparationId !== undefined || input.customerChoiceModifierCategoryId !== undefined;

    return prisma.$transaction(async (tx) => {
      const nextInventoryItemId = input.inventoryItemId !== undefined ? input.inventoryItemId : switchingType ? null : existing.inventoryItemId;
      const nextPreparationId = input.preparationId !== undefined ? input.preparationId : switchingType ? null : existing.preparationId;
      const nextCategoryId =
        input.customerChoiceModifierCategoryId !== undefined
          ? input.customerChoiceModifierCategoryId
          : switchingType
            ? null
            : existing.customerChoiceModifierCategoryId;

      // El topping concreto solo tiene sentido con categoría: cambiar de tipo lo limpia, salvo que
      // el body traiga uno explícito para la categoría nueva.
      const nextModifierId = !nextCategoryId
        ? null
        : input.customerChoiceModifierId !== undefined
          ? input.customerChoiceModifierId
          : switchingType
            ? null
            : existing.customerChoiceModifierId;

      const graph = await buildCostGraph(tx, restaurantId);
      const costPerUnit = nextCategoryId
        ? await resolveCustomerChoiceCostPerUnit(tx, graph, restaurantId, nextCategoryId, nextModifierId)
        : resolveCostPerBaseUnit(graph, { inventoryItemId: nextInventoryItemId, preparationId: nextPreparationId });
      const quantity = input.quantity ?? existing.quantity;

      return tx.recipeIngredient.update({
        where: { id },
        data: {
          ...(switchingType || input.customerChoiceModifierId !== undefined
            ? {
                inventoryItemId: nextInventoryItemId,
                preparationId: nextPreparationId,
                customerChoiceModifierCategoryId: nextCategoryId,
                customerChoiceModifierId: nextModifierId,
              }
            : {}),
          ...(input.productVariantId !== undefined ? { productVariantId: input.productVariantId } : {}),
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
