import { prisma } from '../../config/prisma';
import { notFound } from '../../utils/http-error';

/**
 * Servicio del menú público. Se resuelve por `slug` (no requiere auth) y
 * devuelve una estructura lista para pintar en el frontend del cliente.
 */
export const menuService = {
  async getPublicMenuBySlug(slug: string) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        logoUrl: true,
        baseCurrency: true,
        exchangeRate: true,
        whatsappPhone: true,
        isActive: true,
      },
    });

    if (!restaurant || !restaurant.isActive) {
      throw notFound('Restaurante no encontrado.');
    }

    // Solo categorías activas con al menos un producto disponible.
    const categories = await prisma.category.findMany({
      where: { restaurantId: restaurant.id, isActive: true },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        priority: true,
        products: {
          where: { isAvailable: true },
          orderBy: [{ priority: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            photoUrl: true,
            isStar: true,
            isPromo: true,
            isHouseSpecial: true,
          },
        },
      },
    });

    const structuredCategories = categories
      .filter((c) => c.products.length > 0)
      .map((c) => ({
        id: c.id,
        name: c.name,
        products: c.products,
      }));

    // Secciones destacadas transversales (para carruseles / banners arriba).
    const allProducts = structuredCategories.flatMap((c) => c.products);
    const highlights = {
      stars: allProducts.filter((p) => p.isStar),
      promos: allProducts.filter((p) => p.isPromo),
      houseSpecials: allProducts.filter((p) => p.isHouseSpecial),
    };

    return {
      restaurant: {
        id: restaurant.id,
        slug: restaurant.slug,
        name: restaurant.name,
        description: restaurant.description,
        logoUrl: restaurant.logoUrl,
        baseCurrency: restaurant.baseCurrency,
        exchangeRate: restaurant.exchangeRate,
        whatsappPhone: restaurant.whatsappPhone,
      },
      highlights,
      categories: structuredCategories,
    };
  },
};
