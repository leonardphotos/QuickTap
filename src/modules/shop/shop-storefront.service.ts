import { prisma } from '../../config/prisma';
import { badRequest, HttpError, notFound } from '../../utils/http-error';
import { CURRENCY_SYMBOLS } from '../../utils/money';
import { isLockedAsync } from '../../utils/subscription';
import { getRestaurantOpenStatus } from '../../utils/business-hours';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import type { ShopCheckoutInput } from './shop-storefront.dto';

/**
 * ============================================================================
 *  Tienda virtual del Local Comercial — lado público (sin auth)
 * ============================================================================
 *  Contraparte de menu.service.ts, pero para businessType = SHOP: el catálogo
 *  sale de ShopProduct en vez de Product, y el pedido cae en ShopOrder en vez
 *  de Order. Se resuelve por `slug`, nunca por un id que mande el cliente.
 *
 *  Dos reglas que no se pueden relajar acá:
 *  1. Solo salen los productos con `isPublished` — el inventario del local
 *     también tiene insumos internos que no se le venden a nadie.
 *  2. El costo (`cost`) NUNCA viaja al cliente. Se lee para congelarlo en el
 *     pedido (y que el margen del reporte sea real), pero se queda del lado
 *     del servidor.
 */

/** Un servicio no tiene stock propio: lo que lo limita son sus insumos, que se descuentan al
 * cobrarlo (ver applySupplyConsumption). Sin esto, una barbería tendría que cargarle un stock
 * inventado a "Corte de Cabello" para poder publicarlo. */
function isOrderable(variantStock: number, isService: boolean): boolean {
  return isService || variantStock > 0;
}

async function getStorefrontBySlug(slug: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      logoUrl: true,
      baseCurrency: true,
      businessType: true,
      whatsappPhone: true,
      whatsappBotEnabled: true,
      whatsappBotConnectedNumber: true,
      isActive: true,
      theme: true,
      periodEnd: true,
      suspended: true,
      parentRestaurantId: true,
      orderingEnabled: true,
      paymentMethodsConfig: true,
      shopRubro: true,
      shopDeliveryFee: true,
    },
  });

  if (!restaurant || !restaurant.isActive) throw notFound('Tienda no encontrada.');
  // Un slug de restaurante o de club no debe abrir una vitrina vacía: es otro vertical.
  if (restaurant.businessType !== 'SHOP') throw notFound('Tienda no encontrada.');

  // Cuenta bloqueada por falta de pago: se apaga también la tienda pública.
  if (await isLockedAsync(restaurant)) {
    throw new HttpError(403, 'Esta tienda no está disponible en este momento.', { code: 'ACCOUNT_LOCKED' });
  }

  const openStatus = await getRestaurantOpenStatus(restaurant.id);

  const products = await prisma.shopProduct.findMany({
    where: { restaurantId: restaurant.id, isPublished: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      category: true,
      subcategory: true,
      brand: true,
      price: true,
      promoPrice: true,
      photoUrl: true,
      variants: { select: { id: true, v1: true, v2: true, stock: true, soldByWeight: true } },
      // Solo para saber si es un servicio; no se expone la receta.
      _count: { select: { serviceSupplies: true } },
    },
  });

  const items = products.map((p) => {
    const isService = p._count.serviceSupplies > 0;
    // El precio promocional gana sobre el de lista, igual que en el POS (ver ShopPosPage).
    const price = p.promoPrice != null && p.promoPrice > 0 ? p.promoPrice : p.price;
    const variants = p.variants.map((v) => ({
      id: v.id,
      v1: v.v1,
      v2: v.v2,
      soldByWeight: v.soldByWeight,
      available: isOrderable(v.stock, isService),
    }));
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      subcategory: p.subcategory,
      brand: p.brand || null,
      photoUrl: p.photoUrl,
      price,
      originalPrice: price < p.price ? p.price : null,
      isService,
      variants,
      available: variants.some((v) => v.available),
    };
  });

  // Agrupado por categoría, en el mismo orden en que vienen (ya ordenados por categoría+nombre).
  const byCategory = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.category || 'Otros';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(item);
  }

  let exchangeRate: { rateBs: string; fetchedAt: Date } | null = null;
  try {
    const rate = await exchangeRateService.getRate(restaurant.baseCurrency);
    exchangeRate = { rateBs: String(rate.rateBs), fetchedAt: rate.fetchedAt };
  } catch {
    // Igual que el menú público: sin tasa se muestra solo en la moneda base, no se cae la tienda.
  }

  return {
    shop: {
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
      paymentMethodsConfig: restaurant.paymentMethodsConfig,
      shopRubro: restaurant.shopRubro,
      // Se muestra en el carrito antes de pedir; el que vale igual lo recalcula el checkout.
      deliveryFee: Number(restaurant.shopDeliveryFee ?? 0),
    },
    categories: [...byCategory.entries()].map(([name, products]) => ({ name, products })),
  };
}

/** Correlativo por local, mismo criterio que nextOrderNumber() del vertical restaurante. */
async function nextShopOrderNumber(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  restaurantId: string,
): Promise<number> {
  const last = await tx.shopOrder.findFirst({
    where: { restaurantId },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  });
  return (last?.orderNumber ?? 0) + 1;
}

/**
 * Crea el pedido que entró por el catálogo público.
 *
 * Los precios se resuelven ACÁ, contra el catálogo, nunca contra lo que mande el cliente:
 * si no, cualquiera podría pedir con `price: 0` desde la consola del navegador. Lo mismo con
 * el costo, que además nunca se le mostró.
 */
async function checkout(slug: string, input: ShopCheckoutInput) {
  const storefront = await prisma.restaurant.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      isActive: true,
      businessType: true,
      periodEnd: true,
      suspended: true,
      parentRestaurantId: true,
      orderingEnabled: true,
      baseCurrency: true,
      shopDeliveryFee: true,
    },
  });

  if (!storefront || !storefront.isActive || storefront.businessType !== 'SHOP') {
    throw notFound('Tienda no encontrada.');
  }
  if (await isLockedAsync(storefront)) {
    throw new HttpError(403, 'Esta tienda no está disponible en este momento.', { code: 'ACCOUNT_LOCKED' });
  }
  if (!storefront.orderingEnabled) throw badRequest('Esta tienda no está recibiendo pedidos en este momento.');

  const openStatus = await getRestaurantOpenStatus(storefront.id);
  if (!openStatus.open) throw badRequest(openStatus.reason ?? 'La tienda está cerrada en este momento.');

  if (input.mode === 'DELIVERY' && !input.customer.address?.trim() && !input.customer.locationUrl) {
    throw badRequest('Para delivery hace falta una dirección de entrega.');
  }

  // Se traen los productos pedidos DE ESTE local: un id de otro tenant no resuelve nada.
  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.shopProduct.findMany({
    where: { id: { in: productIds }, restaurantId: storefront.id, isPublished: true },
    select: {
      id: true,
      name: true,
      category: true,
      price: true,
      promoPrice: true,
      cost: true,
      variants: { select: { v1: true, v2: true, stock: true, soldByWeight: true } },
      _count: { select: { serviceSupplies: true } },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines = input.items.map((item) => {
    const product = byId.get(item.productId);
    if (!product) throw badRequest(`Un producto de tu pedido ya no está disponible.`);
    const variant = product.variants.find((v) => v.v1 === item.v1 && v.v2 === item.v2);
    if (!variant) throw badRequest(`Una opción de "${product.name}" ya no está disponible.`);

    const isService = product._count.serviceSupplies > 0;
    if (!isOrderable(variant.stock, isService)) throw badRequest(`"${product.name}" se quedó sin existencia.`);
    // Un servicio no descuenta stock propio, así que no tiene sentido limitarle la cantidad.
    if (!isService && item.qty > variant.stock) {
      throw badRequest(`Solo quedan ${variant.stock} de "${product.name}".`);
    }

    const price = product.promoPrice != null && product.promoPrice > 0 ? product.promoPrice : product.price;
    return {
      productId: product.id,
      v1: item.v1,
      v2: item.v2,
      name: product.name,
      category: product.category || null,
      qty: item.qty,
      price,
      cost: product.cost,
      soldByWeight: variant.soldByWeight,
    };
  });

  const subtotal = round2(lines.reduce((acc, l) => acc + l.price * l.qty, 0));
  // Tarifa plana que fija el local en Ajustes. No hay zonas ni cálculo por distancia acá: un
  // local comercial despacha con su propio motorizado, no con el mapa de reparto del restaurante.
  const deliveryFee = input.mode === 'DELIVERY' ? round2(Number(storefront.shopDeliveryFee ?? 0)) : 0;
  const total = round2(subtotal + deliveryFee);

  let exchangeRate: number | null = null;
  let totalBs: number | null = null;
  try {
    const rate = await exchangeRateService.getRate(storefront.baseCurrency);
    exchangeRate = Number(rate.rateBs);
    totalBs = round2(total * exchangeRate);
  } catch {
    // Sin tasa el pedido se registra igual, en la moneda base.
  }

  const address = [input.customer.address?.trim(), input.customer.locationUrl].filter(Boolean).join(' — ') || null;

  const order = await prisma.$transaction(async (tx) => {
    const orderNumber = await nextShopOrderNumber(tx, storefront.id);
    return tx.shopOrder.create({
      data: {
        restaurantId: storefront.id,
        orderNumber,
        mode: input.mode,
        status: 'PENDING',
        customerName: input.customer.name.trim(),
        customerPhone: input.customer.phone.trim(),
        customerAddress: input.mode === 'DELIVERY' ? address : null,
        note: input.customer.note?.trim() || null,
        paymentMethod: input.customer.paymentMethod ?? null,
        subtotal,
        deliveryFee,
        total,
        exchangeRate,
        totalBs,
        items: { createMany: { data: lines } },
      },
      include: { items: true },
    });
  });

  return order;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const shopStorefrontService = { getStorefrontBySlug, checkout };
