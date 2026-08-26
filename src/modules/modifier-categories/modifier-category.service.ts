import { prisma } from '../../config/prisma';
import { resolveInventoryScopeById } from '../inventory/inventory-scope';
import { badRequest, notFound } from '../../utils/http-error';
import {
  AssociateProductInput,
  CreateModifierCategoryInput,
  CreateModifierInput,
  ReorderModifiersInput,
  SetModifierVariantPriceInput,
  UpdateModifierCategoryInput,
  UpdateModifierInput,
  UpdateProductLinkInput,
} from './modifier-category.dto';

/**
 * Categorías de modificadores (ej. "Extra", "Elige el término de la carne"): se arman una
 * vez y se reutilizan en varios productos ("Asociar/Desasociar"). Cada categoría define si
 * es obligatoria y si se puede elegir uno o varios de sus modificadores.
 */
export const modifierCategoryService = {
  async list(restaurantId: string) {
    const categories = await prisma.modifierCategory.findMany({
      where: { restaurantId },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      include: {
        modifiers: {
          orderBy: [{ priority: 'asc' }, { name: 'asc' }],
          // Nombre y unidad del insumo/preparación vinculado, para que el editor muestre
          // "30 gr de Queso" sin tener que cruzar listas en el frontend.
          include: {
            inventoryItem: { select: { id: true, name: true, unit: true } },
            preparation: { select: { id: true, name: true, unit: true } },
            variantPrices: { select: { variantId: true, priceBase: true, inventoryQuantity: true } },
          },
        },
        _count: { select: { products: true } },
      },
    });
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      isRequired: c.isRequired,
      allowMultiple: c.allowMultiple,
      maxSelections: c.maxSelections,
      minSelections: c.minSelections,
      priority: c.priority,
      productCount: c._count.products,
      modifiers: c.modifiers.map((m) => ({
        id: m.id,
        name: m.name,
        priceBase: m.priceBase.toFixed(2),
        costBase: m.costBase?.toFixed(2) ?? null,
        discountBase: m.discountBase?.toFixed(2) ?? null,
        isAvailable: m.isAvailable,
        maxQuantity: m.maxQuantity,
        sku: m.sku,
        priority: m.priority,
        inventoryItemId: m.inventoryItemId,
        preparationId: m.preparationId,
        // En la unidad base del insumo/preparación (kg/lt/unidad). El editor la muestra en
        // gr/ml cuando conviene, usando `inventoryItemUnit`/`preparationUnit`.
        inventoryQuantity: m.inventoryQuantity?.toString() ?? null,
        inventoryItemName: m.inventoryItem?.name ?? null,
        inventoryItemUnit: m.inventoryItem?.unit ?? null,
        preparationName: m.preparation?.name ?? null,
        preparationUnit: m.preparation?.unit ?? null,
        // Precios propios por variante (ej. "Extra queso" en Pizza Grande vs. Pequeña).
        // Vacío = usa priceBase de arriba sin importar la variante elegida.
        variantPrices: m.variantPrices.map((vp) => ({
          variantId: vp.variantId,
          priceBase: vp.priceBase.toFixed(2),
          inventoryQuantity: vp.inventoryQuantity != null ? Number(vp.inventoryQuantity) : null,
        })),
      })),
    }));
  },

  async create(restaurantId: string, input: CreateModifierCategoryInput) {
    return prisma.modifierCategory.create({ data: { restaurantId, ...input } });
  },

  async update(restaurantId: string, id: string, input: UpdateModifierCategoryInput) {
    await this.assertCategoryBelongs(restaurantId, id);
    return prisma.modifierCategory.update({ where: { id }, data: input });
  },

  async remove(restaurantId: string, id: string) {
    await this.assertCategoryBelongs(restaurantId, id);
    await prisma.modifierCategory.delete({ where: { id } });
    return { deleted: true };
  },

  /**
   * "Duplicar lista": copia completa de una categoría — su configuración, TODOS sus
   * modificadores (con precio, costo, SKU, vínculo a inventario, precios por variante y orden) y
   * las asociaciones a productos. Sirve para armar variantes de una lista ya afinada (ej.
   * "Toppings pizza" → "Toppings pasta") sin cargar todo de nuevo. Se hace en una sola
   * transacción: o se copia todo o nada.
   */
  async duplicate(restaurantId: string, id: string) {
    const source = await prisma.modifierCategory.findFirst({
      where: { id, restaurantId },
      include: { modifiers: { include: { variantPrices: true }, orderBy: { priority: 'asc' } }, products: true },
    });
    if (!source) throw notFound('Categoría no encontrada.');

    return prisma.$transaction(async (tx) => {
      const copy = await tx.modifierCategory.create({
        data: {
          restaurantId,
          name: `${source.name} (copia)`,
          isRequired: source.isRequired,
          allowMultiple: source.allowMultiple,
          maxSelections: source.maxSelections,
          minSelections: source.minSelections,
          priority: source.priority,
        },
      });
      for (const m of source.modifiers) {
        const created = await tx.modifier.create({
          data: {
            restaurantId,
            categoryId: copy.id,
            name: m.name,
            priceBase: m.priceBase,
            costBase: m.costBase,
            discountBase: m.discountBase,
            isAvailable: m.isAvailable,
            maxQuantity: m.maxQuantity,
            sku: m.sku,
            priority: m.priority,
            inventoryItemId: m.inventoryItemId,
            preparationId: m.preparationId,
            inventoryQuantity: m.inventoryQuantity,
          },
        });
        if (m.variantPrices.length > 0) {
          await tx.modifierVariantPrice.createMany({
            data: m.variantPrices.map((vp) => ({ modifierId: created.id, variantId: vp.variantId, priceBase: vp.priceBase })),
          });
        }
      }
      if (source.products.length > 0) {
        await tx.productModifierCategory.createMany({
          data: source.products.map((p) => ({
            productId: p.productId,
            modifierCategoryId: copy.id,
            priority: p.priority,
            maxSelectionsOverride: p.maxSelectionsOverride,
          })),
        });
      }
      return copy;
    });
  },

  async createModifier(restaurantId: string, categoryId: string, input: CreateModifierInput) {
    await this.assertCategoryBelongs(restaurantId, categoryId);
    await this.assertInventoryLinkValid(restaurantId, input);
    return prisma.modifier.create({ data: { restaurantId, categoryId, ...input } });
  },

  async updateModifier(restaurantId: string, modifierId: string, input: UpdateModifierInput) {
    const existing = await prisma.modifier.findFirst({ where: { id: modifierId, restaurantId } });
    if (!existing) throw notFound('Modificador no encontrado.');
    await this.assertInventoryLinkValid(restaurantId, input);
    return prisma.modifier.update({ where: { id: modifierId }, data: input });
  },

  /**
   * El insumo o preparación vinculado tiene que ser de ESTE restaurante (aislamiento
   * multi-tenant: nadie puede apuntar al inventario de otro), y el vínculo solo tiene
   * sentido completo — insumo/preparación sin cantidad no descontaría nada, y una
   * cantidad sin insumo/preparación no sabe de dónde descontar. Nunca ambos a la vez
   * (ya lo valida el DTO, esto es la segunda capa de defensa del service).
   */
  async assertInventoryLinkValid(
    restaurantId: string,
    input: { inventoryItemId?: string | null; preparationId?: string | null; inventoryQuantity?: number | null },
  ) {
    if (input.inventoryItemId == null && input.preparationId == null && input.inventoryQuantity == null) return;

    if (input.inventoryItemId) {
      // Con "inventario compartido entre sedes" el insumo vive en la raíz del grupo.
      const item = await prisma.inventoryItem.findFirst({
        where: { id: input.inventoryItemId, restaurantId: await resolveInventoryScopeById(restaurantId) },
        select: { id: true },
      });
      if (!item) throw notFound('El insumo seleccionado no existe en este restaurante.');
      if (input.inventoryQuantity == null || input.inventoryQuantity <= 0) {
        throw badRequest('Indica cuánto del insumo consume este modificador.');
      }
    } else if (input.preparationId) {
      const preparation = await prisma.preparation.findFirst({
        where: { id: input.preparationId, restaurantId },
        select: { id: true },
      });
      if (!preparation) throw notFound('La preparación seleccionada no existe en este restaurante.');
      if (input.inventoryQuantity == null || input.inventoryQuantity <= 0) {
        throw badRequest('Indica cuánto de la preparación consume este modificador.');
      }
    } else if (input.inventoryQuantity != null) {
      throw badRequest('Elige el insumo o la preparación que consume este modificador.');
    }
  },

  async removeModifier(restaurantId: string, modifierId: string) {
    const existing = await prisma.modifier.findFirst({ where: { id: modifierId, restaurantId } });
    if (!existing) throw notFound('Modificador no encontrado.');
    await prisma.modifier.delete({ where: { id: modifierId } });
    return { deleted: true };
  },

  /** Reordena los modificadores de una categoría (botones ↑/↓ en el editor): recibe la lista
   * completa de ids en el nuevo orden y persiste esa posición en `priority`. */
  async reorderModifiers(restaurantId: string, categoryId: string, input: ReorderModifiersInput) {
    await this.assertCategoryBelongs(restaurantId, categoryId);
    const modifiers = await prisma.modifier.findMany({
      where: { id: { in: input.modifierIds }, categoryId, restaurantId },
      select: { id: true },
    });
    if (modifiers.length !== input.modifierIds.length) {
      throw badRequest('Alguno de los modificadores no pertenece a esta categoría.');
    }
    await prisma.$transaction(
      input.modifierIds.map((id, index) => prisma.modifier.update({ where: { id }, data: { priority: index } })),
    );
    return { reordered: true };
  },

  /** Productos que hoy tienen asociada esta categoría (para el botón "Asociar/Desasociar"). */
  async listLinkedProducts(restaurantId: string, categoryId: string) {
    await this.assertCategoryBelongs(restaurantId, categoryId);
    const links = await prisma.productModifierCategory.findMany({
      where: { modifierCategoryId: categoryId },
      include: { product: { select: { id: true, name: true } } },
    });
    return links.map((link) => ({ productId: link.product.id, name: link.product.name }));
  },

  async associateProduct(restaurantId: string, categoryId: string, input: AssociateProductInput) {
    await this.assertCategoryBelongs(restaurantId, categoryId);
    const product = await prisma.product.findFirst({ where: { id: input.productId, restaurantId }, select: { id: true } });
    if (!product) throw badRequest('El producto no existe o no pertenece a este restaurante.');

    const existing = await prisma.productModifierCategory.findFirst({
      where: { productId: input.productId, modifierCategoryId: categoryId },
    });
    if (existing) return existing;

    return prisma.productModifierCategory.create({
      data: { productId: input.productId, modifierCategoryId: categoryId },
    });
  },

  async dissociateProduct(restaurantId: string, categoryId: string, productId: string) {
    await this.assertCategoryBelongs(restaurantId, categoryId);
    await prisma.productModifierCategory.deleteMany({ where: { productId, modifierCategoryId: categoryId } });
    return { deleted: true };
  },

  /** Sobreescribe el límite de selecciones de la categoría solo para este producto puntual. */
  async updateProductLink(restaurantId: string, categoryId: string, productId: string, input: UpdateProductLinkInput) {
    await this.assertCategoryBelongs(restaurantId, categoryId);
    const link = await prisma.productModifierCategory.findFirst({
      where: { productId, modifierCategoryId: categoryId },
    });
    if (!link) throw notFound('Este producto no tiene asociada esa categoría de modificadores.');
    return prisma.productModifierCategory.update({ where: { id: link.id }, data: input });
  },

  async assertCategoryBelongs(restaurantId: string, id: string) {
    const category = await prisma.modifierCategory.findFirst({ where: { id, restaurantId }, select: { id: true } });
    if (!category) throw notFound('Categoría de modificadores no encontrada.');
    return category;
  },

  /** Guarda/reemplaza el precio propio de un modificador para una variante puntual (ej. "Extra
   * queso" en Pizza Grande). Tanto el modificador como la variante deben ser de este restaurante. */
  async setModifierVariantPrice(
    restaurantId: string,
    modifierId: string,
    variantId: string,
    input: SetModifierVariantPriceInput,
  ) {
    const modifier = await prisma.modifier.findFirst({ where: { id: modifierId, restaurantId }, select: { id: true, priceBase: true } });
    if (!modifier) throw notFound('Modificador no encontrado.');
    const variant = await prisma.productVariant.findFirst({ where: { id: variantId, restaurantId }, select: { id: true } });
    if (!variant) throw notFound('Variante no encontrada.');

    return prisma.modifierVariantPrice.upsert({
      where: { modifierId_variantId: { modifierId, variantId } },
      update: {
        ...(input.priceBase !== undefined ? { priceBase: input.priceBase } : {}),
        ...(input.inventoryQuantity !== undefined ? { inventoryQuantity: input.inventoryQuantity } : {}),
      },
      // Guardar solo el consumo también crea la fila: el precio se copia del general para que
      // nada cambie en lo que se cobra.
      create: {
        modifierId,
        variantId,
        priceBase: input.priceBase ?? modifier.priceBase,
        ...(input.inventoryQuantity !== undefined ? { inventoryQuantity: input.inventoryQuantity } : {}),
      },
    });
  },

  /** Quita el override: la variante vuelve a usar el priceBase general del modificador. */
  async removeModifierVariantPrice(restaurantId: string, modifierId: string, variantId: string) {
    const modifier = await prisma.modifier.findFirst({ where: { id: modifierId, restaurantId }, select: { id: true } });
    if (!modifier) throw notFound('Modificador no encontrado.');
    await prisma.modifierVariantPrice.deleteMany({ where: { modifierId, variantId } });
    return { deleted: true };
  },
};
