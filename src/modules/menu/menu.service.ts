import { prisma } from '../../config/prisma';
import { HttpError, notFound } from '../../utils/http-error';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import { CURRENCY_SYMBOLS, round2, toDecimal } from '../../utils/money';
import { isLockedAsync } from '../../utils/subscription';
import { getRestaurantOpenStatus } from '../../utils/business-hours';
import { effectiveProductPrice, isPromoPriceActive } from '../../utils/promo-price';

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
        whatsappBotEnabled: true,
        whatsappBotConnectedNumber: true,
        isActive: true,
        theme: true,
        periodEnd: true,
        suspended: true,
        parentRestaurantId: true,
        orderingEnabled: true,
        serviceChargeEnabled: true,
        ivaEnabled: true,
        paymentMethodsConfig: true,
        requireCustomerData: true,
        fullscreenImageEnabled: true,
        fullscreenImageUrl: true,
        deliveryOriginLat: true,
        deliveryOriginLng: true,
        _count: { select: { tables: true } },
      },
    });

    if (!restaurant || !restaurant.isActive) {
      throw notFound('Restaurante no encontrado.');
    }

    // Cuenta bloqueada por falta de pago: se apaga también el menú público.
    if (await isLockedAsync(restaurant)) {
      throw new HttpError(403, 'Este menú no está disponible en este momento.', { code: 'ACCOUNT_LOCKED' });
    }

    const openStatus = await getRestaurantOpenStatus(restaurant.id);

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
          whatsappBotConnected: restaurant.whatsappBotEnabled && !!restaurant.whatsappBotConnectedNumber,
          theme: restaurant.theme,
          orderingEnabled: restaurant.orderingEnabled,
          isOpen: openStatus.open,
          closedReason: openStatus.reason ?? null,
          serviceChargeEnabled: restaurant.serviceChargeEnabled,
          paymentMethodsConfig: restaurant.paymentMethodsConfig,
          requireCustomerData: restaurant.requireCustomerData,
          ivaEnabled: restaurant.ivaEnabled,
          fullscreenImageEnabled: true,
          fullscreenImageUrl: restaurant.fullscreenImageUrl,
          deliveryOriginLat: restaurant.deliveryOriginLat,
          deliveryOriginLng: restaurant.deliveryOriginLng,
          hasTables: restaurant._count.tables > 0,
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
          // Agotado por stock (control activo y en 0) se trata igual que "no disponible": no se muestra.
          where: { isAvailable: true, OR: [{ stockControlEnabled: false }, { stockQuantity: { gt: 0 } }] },
          orderBy: [{ priority: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            promoPriceEnabled: true,
            promoPrice: true,
            promoStartTime: true,
            promoEndTime: true,
            promoDaysOfWeek: true,
            promoStartDate: true,
            promoEndDate: true,
            photoUrl: true,
            prepTimeMinutes: true,
            isStar: true,
            isPromo: true,
            isHouseSpecial: true,
            pricingMode: true,
            packagingMode: true,
            packagingFeeBase: true,
            packagingItem: { select: { salePriceBase: true } },
            variants: {
              where: { isAvailable: true },
              orderBy: [{ priority: 'asc' }, { name: 'asc' }],
              select: { id: true, name: true, priceBase: true, packagingFeeBase: true, discountBase: true },
            },
            modifierCategories: {
              orderBy: { priority: 'asc' },
              select: {
                maxSelectionsOverride: true,
                variantIds: true,
                modifierCategory: {
                  select: {
                    id: true,
                    name: true,
                    isRequired: true,
                    allowMultiple: true,
                    maxSelections: true,
                    minSelections: true,
                    modifiers: {
                      where: { isAvailable: true },
                      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
                      select: {
                        id: true,
                        name: true,
                        priceBase: true,
                        discountBase: true,
                        maxQuantity: true,
                        variantPrices: { select: { variantId: true, priceBase: true } },
                      },
                    },
                  },
                },
              },
            },
            // Combo armable: sus platos componentes, cada uno con SUS propias categorías de
            // modificadores — la pantalla de pedido arma cada instancia con esos grupos.
            comboComponents: {
              orderBy: { priority: 'asc' },
              select: {
                componentProductId: true,
                quantity: true,
                componentProduct: {
                  select: {
                    name: true,
                    isAvailable: true,
                    modifierCategories: {
                      orderBy: { priority: 'asc' },
                      select: {
                        maxSelectionsOverride: true,
                        variantIds: true,
                        modifierCategory: {
                          select: {
                            id: true,
                            name: true,
                            isRequired: true,
                            allowMultiple: true,
                            maxSelections: true,
                            minSelections: true,
                            modifiers: {
                              where: { isAvailable: true },
                              orderBy: [{ priority: 'asc' }, { name: 'asc' }],
                              select: { id: true, name: true, priceBase: true, discountBase: true, maxQuantity: true },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Aplana la relación de asociación y ya resuelve el precio efectivo (precio - descuento) de
    // variantes/modificadores, para que el frontend público no tenga que hacer esa cuenta.
    const structuredCategories = categories
      .filter((c) => c.products.length > 0)
      .map((c) => ({
        id: c.id,
        name: c.name,
        products: c.products.map((p) => {
          // Promoción por tiempo activa ahora mismo: se muestra el precio especial
          // ya calculado, más el precio normal aparte para tacharlo en el frontend.
          const onTimePromo = p.pricingMode === 'SIMPLE' && isPromoPriceActive(p);
          return {
          id: p.id,
          name: p.name,
          description: p.description,
          price: onTimePromo ? effectiveProductPrice(p) : p.price,
          originalPrice: onTimePromo ? p.price : null,
          onTimePromo,
          photoUrl: p.photoUrl,
          prepTimeMinutes: p.prepTimeMinutes,
          isStar: p.isStar,
          isPromo: p.isPromo,
          isHouseSpecial: p.isHouseSpecial,
          pricingMode: p.pricingMode,
          // Envase: solo lo cobra el servidor en DELIVERY/PICKUP, pero el checkout público
          // necesita verlo para no mostrar un total menor al que después realmente se cobra.
          packagingMode: p.packagingMode,
          packagingFeeBase: p.packagingFeeBase?.toString() ?? null,
          packagingItem: p.packagingItem ? { salePriceBase: p.packagingItem.salePriceBase?.toString() ?? null } : null,
          variants: p.variants.map((v) => ({
            id: v.id,
            name: v.name,
            priceBase: round2(v.priceBase.add(v.packagingFeeBase ?? 0).sub(v.discountBase ?? 0)).toFixed(2),
          })),
          comboComponents: p.comboComponents.map((c) => ({
            componentProductId: c.componentProductId,
            name: c.componentProduct.name,
            quantity: c.quantity,
            isAvailable: c.componentProduct.isAvailable,
            modifierCategories: c.componentProduct.modifierCategories.map((link) => ({
              id: link.modifierCategory.id,
              name: link.modifierCategory.name,
              isRequired: link.modifierCategory.isRequired,
              allowMultiple: link.modifierCategory.allowMultiple,
              maxSelections: link.maxSelectionsOverride ?? link.modifierCategory.maxSelections,
            variantIds: link.variantIds,
              minSelections: link.modifierCategory.minSelections,
              modifiers: link.modifierCategory.modifiers.map((m) => ({
                id: m.id,
                name: m.name,
                priceBase: round2(toDecimal(m.priceBase).sub(m.discountBase ?? 0)).toFixed(2),
                maxQuantity: m.maxQuantity,
                variantPrices: [],
              })),
            })),
          })),
          modifierCategories: p.modifierCategories.map((link) => ({
            id: link.modifierCategory.id,
            name: link.modifierCategory.name,
            isRequired: link.modifierCategory.isRequired,
            allowMultiple: link.modifierCategory.allowMultiple,
            maxSelections: link.maxSelectionsOverride ?? link.modifierCategory.maxSelections,
            variantIds: link.variantIds,
            minSelections: link.modifierCategory.minSelections,
            modifiers: link.modifierCategory.modifiers.map((m) => ({
              id: m.id,
              name: m.name,
              priceBase: round2(toDecimal(m.priceBase).sub(m.discountBase ?? 0)).toFixed(2),
              maxQuantity: m.maxQuantity,
              // Precios propios por variante (ej. "Extra queso" en Pizza Grande vs. Pequeña),
              // ya con el descuento del modificador restado — el frontend público no
              // recalcula nada, solo elige la fila que corresponda a la variante activa.
              variantPrices: m.variantPrices.map((vp) => ({
                variantId: vp.variantId,
                priceBase: round2(toDecimal(vp.priceBase).sub(m.discountBase ?? 0)).toFixed(2),
              })),
            })),
          })),
          };
        }),
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
      const rate = await exchangeRateService.getRate(restaurant.baseCurrency, restaurant.id);
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
        whatsappBotConnected: restaurant.whatsappBotEnabled && !!restaurant.whatsappBotConnectedNumber,
        theme: restaurant.theme,
        orderingEnabled: restaurant.orderingEnabled,
        isOpen: openStatus.open,
        closedReason: openStatus.reason ?? null,
        serviceChargeEnabled: restaurant.serviceChargeEnabled,
        ivaEnabled: restaurant.ivaEnabled,
        paymentMethodsConfig: restaurant.paymentMethodsConfig,
        requireCustomerData: restaurant.requireCustomerData,
        fullscreenImageEnabled: false,
        fullscreenImageUrl: restaurant.fullscreenImageUrl,
        deliveryOriginLat: restaurant.deliveryOriginLat,
        deliveryOriginLng: restaurant.deliveryOriginLng,
        hasTables: restaurant._count.tables > 0,
      },
      highlights,
      categories: structuredCategories,
    };
  },
};
