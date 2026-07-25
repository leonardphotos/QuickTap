import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { decryptOlaclickApiKey, encryptOlaclickApiKey } from './master-olaclick-import.crypto';
import { fetchOlaclickMenu, OlaclickCategory, OlaclickProduct } from './master-olaclick-import.client';

const EXTERNAL_SOURCE = 'olaclick';

function minorUnitsToDecimal(amount: number | undefined | null): number | null {
  if (typeof amount !== 'number') return null;
  return Math.round(amount) / 100;
}

function mapProductPreview(product: OlaclickProduct) {
  const variant = product.variants.find((v) => v.name === 'Default') ?? product.variants[0];
  return {
    externalSourceId: product.id,
    name: product.name,
    description: product.description ?? '',
    isAvailable: product.available ?? true,
    price: minorUnitsToDecimal(variant?.price),
    currency: variant?.currency ?? null,
    importedImageUrl: product.image_url ?? null,
    hasPhoto: Boolean(product.image_url),
  };
}

function mapCategoryPreview(category: OlaclickCategory) {
  return {
    externalSourceId: category.id,
    name: category.name,
    priority: category.position ?? 0,
    products: (category.products ?? []).map(mapProductPreview),
  };
}

async function getRestaurantOrThrow(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant) throw notFound('Restaurante no encontrado.');
  return restaurant;
}

export const masterOlaclickImportService = {
  /** Guarda (cifrada) la API Key que el equipo QuickTap recibió del restaurante por canal interno. */
  async connect(restaurantId: string, apiKey: string) {
    await getRestaurantOrThrow(restaurantId);
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { olaclickApiKeyEncrypted: encryptOlaclickApiKey(apiKey) },
    });
    return { connected: true };
  },

  /** Trae y mapea el menú de OlaClick, SIN persistir nada todavía. */
  async preview(restaurantId: string) {
    const restaurant = await getRestaurantOrThrow(restaurantId);
    if (!restaurant.olaclickApiKeyEncrypted) {
      throw badRequest('Este restaurante todavía no tiene una API Key de OlaClick conectada.');
    }

    const apiKey = decryptOlaclickApiKey(restaurant.olaclickApiKeyEncrypted);
    const rawCategories = await fetchOlaclickMenu(apiKey);
    const categories = rawCategories.map(mapCategoryPreview);

    const totalProducts = categories.reduce((sum, c) => sum + c.products.length, 0);
    const productsWithPhoto = categories.reduce(
      (sum, c) => sum + c.products.filter((p) => p.hasPhoto).length,
      0,
    );

    return {
      categories,
      summary: {
        totalCategories: categories.length,
        totalProducts,
        productsWithImportedPhoto: productsWithPhoto,
        productsMissingPhoto: totalProducts - productsWithPhoto,
      },
    };
  },

  /**
   * Vuelve a pedir el menú fresco a OlaClick (no confía en lo que el
   * navegador mandó de vuelta) y hace upsert de categorías/productos por
   * (restaurantId, externalSource, externalSourceId) — así una segunda
   * corrida no duplica nada, solo actualiza precios/disponibilidad.
   */
  async confirm(restaurantId: string, excludedProductExternalIds: string[]) {
    const restaurant = await getRestaurantOrThrow(restaurantId);
    if (!restaurant.olaclickApiKeyEncrypted) {
      throw badRequest('Este restaurante todavía no tiene una API Key de OlaClick conectada.');
    }

    const apiKey = decryptOlaclickApiKey(restaurant.olaclickApiKeyEncrypted);
    const rawCategories = await fetchOlaclickMenu(apiKey);
    const excluded = new Set(excludedProductExternalIds);

    let savedCategories = 0;
    let savedProducts = 0;
    let productsMissingPhoto = 0;

    for (const [index, cat] of rawCategories.entries()) {
      const category = await prisma.category.upsert({
        where: {
          restaurantId_externalSource_externalSourceId: {
            restaurantId,
            externalSource: EXTERNAL_SOURCE,
            externalSourceId: cat.id,
          },
        },
        create: {
          restaurantId,
          externalSource: EXTERNAL_SOURCE,
          externalSourceId: cat.id,
          name: cat.name,
          priority: cat.position ?? index,
        },
        update: {
          name: cat.name,
          priority: cat.position ?? index,
        },
      });
      savedCategories++;

      for (const prod of cat.products ?? []) {
        if (excluded.has(prod.id)) continue;

        const variant = prod.variants.find((v) => v.name === 'Default') ?? prod.variants[0];
        const price = minorUnitsToDecimal(variant?.price) ?? 0;
        const hasPhoto = Boolean(prod.image_url);
        if (!hasPhoto) productsMissingPhoto++;

        await prisma.product.upsert({
          where: {
            restaurantId_externalSource_externalSourceId: {
              restaurantId,
              externalSource: EXTERNAL_SOURCE,
              externalSourceId: prod.id,
            },
          },
          create: {
            restaurantId,
            categoryId: category.id,
            externalSource: EXTERNAL_SOURCE,
            externalSourceId: prod.id,
            name: prod.name,
            description: prod.description ?? null,
            price,
            isAvailable: prod.available ?? true,
            importedImageUrl: prod.image_url ?? null,
            // photoUrl queda null a propósito: el equipo/restaurante decide si
            // sube una foto propia o confirma usar importedImageUrl más adelante.
          },
          update: {
            name: prod.name,
            description: prod.description ?? null,
            price,
            isAvailable: prod.available ?? true,
            importedImageUrl: prod.image_url ?? null,
          },
        });
        savedProducts++;
      }
    }

    const summary = {
      totalCategories: savedCategories,
      totalProducts: savedProducts,
      productsMissingPhoto,
    };

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { olaclickLastSyncAt: new Date(), olaclickLastSyncSummary: summary },
    });

    return summary;
  },

  async status(restaurantId: string) {
    const restaurant = await getRestaurantOrThrow(restaurantId);
    return {
      connected: Boolean(restaurant.olaclickApiKeyEncrypted),
      lastSyncAt: restaurant.olaclickLastSyncAt,
      lastSyncSummary: restaurant.olaclickLastSyncSummary,
    };
  },
};
