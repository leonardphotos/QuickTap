import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import {
  AssociateProductInput,
  CreateModifierCategoryInput,
  CreateModifierInput,
  UpdateModifierCategoryInput,
  UpdateModifierInput,
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
        modifiers: { orderBy: [{ priority: 'asc' }, { name: 'asc' }] },
        _count: { select: { products: true } },
      },
    });
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      isRequired: c.isRequired,
      allowMultiple: c.allowMultiple,
      priority: c.priority,
      productCount: c._count.products,
      modifiers: c.modifiers.map((m) => ({
        id: m.id,
        name: m.name,
        priceBase: m.priceBase.toFixed(2),
        costBase: m.costBase?.toFixed(2) ?? null,
        discountBase: m.discountBase?.toFixed(2) ?? null,
        isAvailable: m.isAvailable,
        priority: m.priority,
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
    return prisma.modifier.create({ data: { restaurantId, categoryId, ...input } });
  },

  async updateModifier(restaurantId: string, modifierId: string, input: UpdateModifierInput) {
    const existing = await prisma.modifier.findFirst({ where: { id: modifierId, restaurantId } });
    if (!existing) throw notFound('Modificador no encontrado.');
    return prisma.modifier.update({ where: { id: modifierId }, data: input });
  },

  async removeModifier(restaurantId: string, modifierId: string) {
    const existing = await prisma.modifier.findFirst({ where: { id: modifierId, restaurantId } });
    if (!existing) throw notFound('Modificador no encontrado.');
    await prisma.modifier.delete({ where: { id: modifierId } });
    return { deleted: true };
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

  async assertCategoryBelongs(restaurantId: string, id: string) {
    const category = await prisma.modifierCategory.findFirst({ where: { id, restaurantId }, select: { id: true } });
    if (!category) throw notFound('Categoría de modificadores no encontrada.');
    return category;
  },
};
