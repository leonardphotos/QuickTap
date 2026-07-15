import { prisma } from '../../config/prisma';
import { HttpError, notFound } from '../../utils/http-error';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import { CURRENCY_SYMBOLS } from '../../utils/money';
import { isLocked } from '../../utils/subscription';

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
        whatsappPhone: true,
        isActive: true,
        theme: true,
        periodEnd: true,
        suspended: true,
        orderingEnabled: true,
        serviceChargeEnabled: true,
        ivaEnabled: true,
        paymentMethodsConfig: true,
        fullscreenImageEnabled: true,
        fullscreenImageUrl: true,
        deliveryOriginLat: true,
        deliveryOriginLng: true,
      },
    });

    if (!restaurant || !restaurant.isActive) {
      throw notFound('Restaurante no encontrado.');
    }

    // Cuenta bloqueada por falta de pago: se apaga también el menú público.
    if (isLocked(restaurant)) {
      throw new HttpError(403, 'Este menú no está disponible en este momento.', { code: 'ACCOUNT_LOCKED' });
    }

    // Modo Cartelera: solo la imagen de pantalla completa, sin catálogo.
    if (restaurant.fullscreenImageEnabled && restaurant.fullscreenImageUrl) {
      return {
        restaurant: {
          id: restaurant.id,
          slug: restaurant.slug,
          name: restaurant.name,
          description: restaurant.description,
          logoUrl: restaurant.logoUrl,
          baseCurrency: restaurant.baseCurrency,
          currencySymbol: CURRENCY_SYMBOLS[restaurant.baseCurrency],
          exchangeRate: null,
          whatsappPhone: restaurant.whatsappPhone,
          theme: restaurant.theme,
          orderingEnabled: restaurant.orderingEnabled,
          serviceChargeEnabled: restaurant.serviceChargeEnabled,
          paymentMethodsConfig: restaurant.paymentMethodsConfig,
          ivaEnabled: restaurant.ivaEnabled,
          fullscreenImageEnabled: true,
          fullscreenImageUrl: restaurant.fullscreenImageUrl,
          deliveryOriginLat: restaurant.deliveryOriginLat,
          deliveryOriginLng: restaurant.deliveryOriginLng,
        },
        highlights: { stars: [], promos: [], houseSpecials: [] },
        categories: [],
      };
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
            prepTimeMinutes: true,
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

    // La tasa BCV es lo que permite mostrar los precios en Bs al público.
    // Si aún no hay ninguna tasa cacheada (primer arranque), degradamos con
    // null en vez de tumbar el menú completo.
    let exchangeRate: { rateBs: string; fetchedAt: Date } | null = null;
    try {
      const rate = await exchangeRateService.getRate(restaurant.baseCurrency);
      exchangeRate = { rateBs: rate.rateBs.toString(), fetchedAt: rate.fetchedAt };
    } catch {
      exchangeRate = null;
    }

    return {
      restaurant: {
        id: restaurant.id,
        slug: restaurant.slug,
        name: restaurant.name,
        description: restaurant.description,
        logoUrl: restaurant.logoUrl,
        baseCurrency: restaurant.baseCurrency,
        currencySymbol: CURRENCY_SYMBOLS[restaurant.baseCurrency],
        exchangeRate,
        whatsappPhone: restaurant.whatsappPhone,
        theme: restaurant.theme,
        orderingEnabled: restaurant.orderingEnabled,
        serviceChargeEnabled: restaurant.serviceChargeEnabled,
        ivaEnabled: restaurant.ivaEnabled,
        paymentMethodsConfig: restaurant.paymentMethodsConfig,
        fullscreenImageEnabled: false,
        fullscreenImageUrl: restaurant.fullscreenImageUrl,
        deliveryOriginLat: restaurant.deliveryOriginLat,
        deliveryOriginLng: restaurant.deliveryOriginLng,
      },
      highlights,
      categories: structuredCategories,
    };
  },
};
