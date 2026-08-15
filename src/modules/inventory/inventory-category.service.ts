import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { BulkAssignCategoryInput, CreateInventoryCategoryInput, UpdateInventoryCategoryInput } from './inventory-category.dto';
import { resolveInventoryScope } from './inventory-scope';

/** Categorías de insumos y de "Stock de productos" en Inventario. Aisladas por restaurantId,
 * salvo que el grupo (sede principal + sucursales) tenga inventoryMode = "SHARED" (ver
 * inventory-scope.ts) — se comparten igual entre Insumos normales y la ventana de Casa Matriz,
 * son solo etiquetas, no necesitan su propio scope. */
export const inventoryCategoryService = {
  async list(restaurantId: string, parentRestaurantId?: string | null) {
    const effectiveId = await resolveInventoryScope(restaurantId, parentRestaurantId);
    return prisma.inventoryCategory.findMany({
      where: { restaurantId: effectiveId },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
  },

  async create(restaurantId: string, parentRestaurantId: string | null | undefined, input: CreateInventoryCategoryInput) {
    const effectiveId = await resolveInventoryScope(restaurantId, parentRestaurantId);
    return prisma.inventoryCategory.create({ data: { restaurantId: effectiveId, ...input } });
  },

  async update(
    restaurantId: string,
    parentRestaurantId: string | null | undefined,
    id: string,
    input: UpdateInventoryCategoryInput,
  ) {
    const effectiveId = await resolveInventoryScope(restaurantId, parentRestaurantId);
    const existing = await prisma.inventoryCategory.findFirst({ where: { id, restaurantId: effectiveId } });
    if (!existing) throw notFound('Categoría no encontrada.');
    return prisma.inventoryCategory.update({ where: { id }, data: input });
  },

  async remove(restaurantId: string, parentRestaurantId: string | null | undefined, id: string) {
    const effectiveId = await resolveInventoryScope(restaurantId, parentRestaurantId);
    const existing = await prisma.inventoryCategory.findFirst({ where: { id, restaurantId: effectiveId } });
    if (!existing) throw notFound('Categoría no encontrada.');
    await prisma.inventoryCategory.delete({ where: { id } });
    return { deleted: true };
  },

  /**
   * Mueve varios insumos a una categoría de un solo golpe (o los deja "Sin categoría" con
   * null). Solo toca insumos del mismo scope de inventario — un id ajeno simplemente no
   * cambia — y la categoría destino tiene que ser de ese mismo scope.
   */
  async bulkAssign(restaurantId: string, parentRestaurantId: string | null | undefined, input: BulkAssignCategoryInput) {
    const effectiveId = await resolveInventoryScope(restaurantId, parentRestaurantId);
    if (input.categoryId) await this.assertBelongs(effectiveId, input.categoryId);
    const result = await prisma.inventoryItem.updateMany({
      where: { id: { in: input.itemIds }, restaurantId: effectiveId },
      data: { categoryId: input.categoryId },
    });
    return { updated: result.count };
  },

  /** La categoría debe pertenecer al mismo restaurante (evita fugas de tenant). `restaurantId`
   * aquí ya debe venir resuelto (efectivo) por el llamador — ver inventory.service.ts. */
  async assertBelongs(restaurantId: string, categoryId: string) {
    const category = await prisma.inventoryCategory.findFirst({ where: { id: categoryId, restaurantId } });
    if (!category) throw badRequest('La categoría seleccionada no es válida.');
  },
};
