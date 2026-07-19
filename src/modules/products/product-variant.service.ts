import { prisma } from '../../config/prisma';
import { notFound } from '../../utils/http-error';
import { CreateProductVariantInput, UpdateProductVariantInput } from './product-variant.dto';

/** Variantes de un producto (pricingMode = "VARIANTS"), ej. "Ensalada César" / "Ensalada Mixta". */
export const productVariantService = {
  async list(restaurantId: string, productId: string) {
    await assertProductBelongs(restaurantId, productId);
    return prisma.productVariant.findMany({
      where: { restaurantId, productId },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
  },

  async create(restaurantId: string, productId: string, input: CreateProductVariantInput) {
    await assertProductBelongs(restaurantId, productId);
    return prisma.productVariant.create({ data: { restaurantId, productId, ...input } });
  },

  async update(restaurantId: string, id: string, input: UpdateProductVariantInput) {
    const existing = await prisma.productVariant.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Variante no encontrada.');
    return prisma.productVariant.update({ where: { id }, data: input });
  },

  async remove(restaurantId: string, id: string) {
    const existing = await prisma.productVariant.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Variante no encontrada.');
    await prisma.productVariant.delete({ where: { id } });
    return { deleted: true };
  },
};

async function assertProductBelongs(restaurantId: string, productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, restaurantId }, select: { id: true } });
  if (!product) throw notFound('Producto no encontrado.');
  return product;
}
