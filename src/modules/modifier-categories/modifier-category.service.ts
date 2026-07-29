import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import {
  AssociateProductInput,
  CreateModifierCategoryInput,
  CreateModifierInput,
  ReorderModifiersInput,
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
          // Nombre y unidad del insumo vinculado, para que el editor muestre
          // "30 gr de Queso" sin tener que cruzar listas en el frontend.
          include: { inventoryItem: { select: { id: true, name: true, unit: true } } },
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
        // En la unidad base del insumo (kg/lt/unidad). El editor la muestra en
        // gr/ml cuando conviene, usando `inventoryItemUnit`.
        inventoryQuantity: m.inventoryQuantity?.toString() ?? null,
        inventoryItemName: m.inventoryItem?.name ?? null,
        inventoryItemUnit: m.inventoryItem?.unit ?? null,
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
   * El insumo vinculado tiene que ser de ESTE restaurante (aislamiento
   * multi-tenant: nadie puede apuntar al inventario de otro), y el vínculo solo
   * tiene sentido completo — insumo sin cantidad no descontaría nada, y una
   * cantidad sin insumo no sabe de dónde descontar.
   */
  async assertInventoryLinkValid(
    restaurantId: string,
    input: { inventoryItemId?: string | null; inventoryQuantity?: number | null },
  ) {
    if (input.inventoryItemId == null && input.inventoryQuantity == null) return;

    if (input.inventoryItemId) {
      const item = await prisma.inventoryItem.findFirst({
        where: { id: input.inventoryItemId, restaurantId },
        select: { id: true },
      });
      if (!item) throw notFound('El insumo seleccionado no existe en este restaurante.');
      if (input.inventoryQuantity == null || input.inventoryQuantity <= 0) {
        throw badRequest('Indica cuánto del insumo consume este modificador.');
      }
    } else if (input.inventoryQuantity != null) {
      throw badRequest('Elige el insumo que consume este modificador.');
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
};
