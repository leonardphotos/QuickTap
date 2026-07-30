import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { decryptOlaclickApiKey, encryptOlaclickApiKey } from './master-olaclick-import.crypto';
import { fetchOlaclickMenu, OlaclickCategory, OlaclickProduct } from './master-olaclick-import.client';

const EXTERNAL_SOURCE = 'olaclick';

/**
 * OlaClick manda el precio ya en unidades mayores (6,00 llega como `6`), así que
 * acá solo se normaliza a 2 decimales. Antes se dividía entre 100 asumiendo
 * centavos, y eso importaba todo el menú 100 veces más barato.
 */
function toPriceDecimal(amount: number | undefined | null): number | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  return Math.round(amount * 100) / 100;
}

function mapProductPreview(product: OlaclickProduct) {
  const variant = product.variants.find((v) => v.name === 'Default') ?? product.variants[0];
  return {
    externalSourceId: product.id,
    name: product.name,
    description: product.description ?? '',
    isAvailable: product.available ?? true,
    price: toPriceDecimal(variant?.price),
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

    // Las monedas que declara OlaClick. Los precios se guardan tal cual en
    // `Product.price`, que la app interpreta SIEMPRE en el baseCurrency del
    // restaurante — así que si no coinciden hay que avisarlo antes de importar,
    // no convertir a ciegas con una tasa que nadie decidió.
    const sourceCurrencies = Array.from(
      new Set(categories.flatMap((c) => c.products.map((p) => p.currency).filter(Boolean))),
    ) as string[];

    return {
      categories,
      summary: {
        totalCategories: categories.length,
        totalProducts,
        productsWithImportedPhoto: productsWithPhoto,
        productsMissingPhoto: totalProducts - productsWithPhoto,
        sourceCurrencies,
        baseCurrency: restaurant.baseCurrency,
        currencyMismatch: sourceCurrencies.some((c) => c !== restaurant.baseCurrency),
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

    // Fotos que ya tiene cada producto importado, para no pisar en una segunda
    // corrida una que el restaurante subió a mano (ver el upsert más abajo).
    const alreadyImported = await prisma.product.findMany({
      where: { restaurantId, externalSource: EXTERNAL_SOURCE },
      select: { externalSourceId: true, photoUrl: true },
    });
    const existingPhotoByExternalId = new Map(
      alreadyImported
        .filter((p) => p.externalSourceId && p.photoUrl)
        .map((p) => [p.externalSourceId as string, p.photoUrl as string]),
    );

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
        const price = toPriceDecimal(variant?.price) ?? 0;
        const photo = prod.image_url ?? null;
        if (!photo) productsMissingPhoto++;

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
            importedImageUrl: photo,
            // La foto importada se usa de una: `importedImageUrl` sola no la
            // muestra en ningún lado (el catálogo y el menú público leen
            // `photoUrl`), así que el menú quedaba entero sin fotos. Sigue
            // siendo reemplazable subiendo una propia desde el catálogo.
            photoUrl: photo,
          },
          update: {
            name: prod.name,
            description: prod.description ?? null,
            price,
            isAvailable: prod.available ?? true,
            importedImageUrl: photo,
            // En re-sincronizaciones NO se pisa una foto que alguien ya subió a
            // mano: solo se rellena si el producto todavía no tiene ninguna.
            ...(photo ? { photoUrl: existingPhotoByExternalId.get(prod.id) ?? photo } : {}),
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
