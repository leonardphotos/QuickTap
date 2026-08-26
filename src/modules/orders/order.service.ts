import bcrypt from 'bcryptjs';
import { OrderChannel, PaymentMethod, Prisma } from '@prisma/client';
import { whatsappLinkService, frase } from '../whatsapp-link/whatsapp-link.service';
import { prisma } from '../../config/prisma';
import { primaryTableIdOf } from '../../utils/table-merge';
import { badRequest, conflict, forbidden, notFound } from '../../utils/http-error';
import { ADMIN_CASHIER_ROLES } from '../../utils/roles';
import { resolveInventoryScopeById } from '../inventory/inventory-scope';
import { baseToBs, CURRENCY_SYMBOLS, formatBs, formatMoney, round2, toDecimal } from '../../utils/money';
import {
  buildWhatsappCheckoutUrl,
  buildWhatsappUrl,
  DEFAULT_COMANDA_WHATSAPP_TEMPLATE,
  formatVenezuelanWhatsappPhone,
  PAYMENT_LABELS,
  PROOF_REQUIRED_PAYMENT_METHODS,
  renderPaymentInstructions,
  renderWhatsappTemplate,
} from '../../utils/whatsapp';
import { emitToKitchen, emitToTable, SocketEvents } from '../../sockets';
import { getMessaging } from '../../utils/firebase-admin';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import { resolveDateFilter } from '../../utils/date-range';
import { bankLedgerService } from '../bank-accounts/bank-ledger.service';
import { promotionDiscountOf, recordPromotionRedemption, resolvePromotionForRedeem } from '../promotions/promotion.service';
import { hourCaracas, startOfDayCaracas, startOfTodayCaracas, startOfWeekCaracas } from '../../utils/timezone';
import { assertRestaurantOpen } from '../../utils/business-hours';
import { effectiveProductPrice } from '../../utils/promo-price';
import { whatsappBotService } from '../whatsapp-bot/whatsapp-bot.service';
import { orderPaymentVerificationService } from './order-payment-verification.service';
import { distanceToPolygonKm, haversineDistanceKm, isPointInPolygon, LatLng, polygonCentroid, squarePolygonAround } from '../../utils/geo';
import { tableSessionService } from '../table-sessions/table-session.service';
import { fiscalInvoicingService } from '../fiscal-invoicing/fiscal-invoicing.service';
import { writeFiscalAudit } from '../fiscal-invoicing/fiscal-invoicing.audit';
import { customerService } from '../customers/customer.service';
import { buildCostGraph, resolveConsumedInventoryItems, type CostGraph } from '../inventory/costing';
import {
  AddOrderItemInput,
  CartItemInput,
  ChangeChannelInput,
  DeliveryCheckoutInput,
  DineInCheckoutInput,
  ManualOrderInput,
  OrderHistoryQuery,
  RecordPaymentInput,
  ReportRange,
  ReturnOrderItemInput,
  UpdateOrderCustomerInput,
  UpdateOrderItemsInput,
} from './order.dto';
import { wasteService } from '../waste/waste.service';
import { notifyStockChanged } from '../../utils/inventory-alerts';
import { sendPushToRestaurant } from '../../utils/push';

/**
 * ============================================================================
 *  Servicio de comandas — resuelve los dos canales de venta.
 * ============================================================================
 */

interface PricedLineModifier {
  // Id del Modifier del catálogo: se guarda en el snapshot solo para poder
  // resolver el insumo vinculado al descontar stock (ver deductModifierStock).
  // Null = fila decorativa (el encabezado de cada plato dentro de un combo).
  modifierId: string | null;
  name: string;
  priceBase: Prisma.Decimal;
  // Cuántas veces se elige esta misma opción (ej. "Ketchup x4"), ver ModifierCategory.maxSelections.
  quantity: number;
}

interface PricedLine {
  productId: string;
  productName: string;
  // Nombre de la variante elegida (si el producto usa "Precio por variantes").
  variantName: string | null;
  unitPrice: Prisma.Decimal;
  quantity: number;
  lineTotal: Prisma.Decimal;
  modifiers: PricedLineModifier[];
  note?: string;
  // Snapshot de la cocina asignada al producto (null = sin asignar). Se
  // congela al pedir, igual que productName, para dividir la comanda.
  kitchenName: string | null;
}

/**
 * Toma los ítems del carrito, valida que los productos existan / estén
 * disponibles y pertenezcan al tenant, y CONGELA los precios desde la BD
 * (nunca se confía en el precio que envía el cliente). Si el producto usa
 * "Precio por variantes", resuelve la variante elegida; valida las categorías
 * de modificadores asociadas (obligatoria / uno-vs-varios) y suma sus precios.
 */
type ProductForPricing = {
  name: string;
  modifierCategories: {
    maxSelectionsOverride: number | null;
    modifierCategory: {
      name: string;
      isRequired: boolean;
      allowMultiple: boolean;
      maxSelections: number | null;
      minSelections: number | null;
      modifiers: {
        id: string;
        name: string;
        isAvailable: boolean;
        maxQuantity: number | null;
        priceBase: Prisma.Decimal;
        discountBase: Prisma.Decimal | null;
        variantPrices: { variantId: string; priceBase: Prisma.Decimal }[];
      }[];
    };
  }[];
};

/**
 * Valida y congela los modificadores elegidos contra las categorías de UN producto — el mismo
 * código para el plato suelto y para cada instancia de un plato dentro de un combo.
 * `modifierIds` es un multiset: un mismo id repetido N veces = "xN".
 */
function priceModifierSelection(product: ProductForPricing, modifierIds: string[], variantId: string | null): PricedLineModifier[] {
  const idCounts = new Map<string, number>();
  for (const id of modifierIds) {
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }
  const modifierLines: PricedLineModifier[] = [];
  for (const link of product.modifierCategories) {
    const category = link.modifierCategory;
    const chosen = category.modifiers.filter((m) => idCounts.has(m.id));
    const totalSelected = chosen.reduce((acc, m) => acc + (idCounts.get(m.id) ?? 0), 0);
    // isRequired manda: una categoría marcada "Opcional" nunca debe bloquear el carrito, así
    // tenga un minSelections guardado — minSelections solo afina el mínimo de una categoría
    // que ya es obligatoria, no la vuelve obligatoria por sí solo.
    const effectiveMin = category.isRequired ? (category.minSelections ?? 1) : 0;
    if (totalSelected < effectiveMin) {
      throw badRequest(
        effectiveMin <= 1
          ? `Elige una opción de "${category.name}" para "${product.name}".`
          : `Elige al menos ${effectiveMin} opciones de "${category.name}" para "${product.name}".`,
      );
    }
    const effectiveMax = link.maxSelectionsOverride ?? category.maxSelections ?? (category.allowMultiple ? Infinity : 1);
    if (totalSelected > effectiveMax) {
      throw badRequest(`Elige como máximo ${effectiveMax} opciones de "${category.name}" para "${product.name}".`);
    }
    for (const m of chosen) {
      if (!m.isAvailable) throw badRequest(`"${m.name}" no está disponible en este momento.`);
      const chosenQty = idCounts.get(m.id) ?? 1;
      if (m.maxQuantity != null && chosenQty > m.maxQuantity) {
        throw badRequest(`Elige como máximo ${m.maxQuantity} de "${m.name}" en "${product.name}".`);
      }
      const variantOverride = variantId ? m.variantPrices.find((vp) => vp.variantId === variantId) : undefined;
      const effectivePriceBase = variantOverride?.priceBase ?? m.priceBase;
      modifierLines.push({
        modifierId: m.id,
        name: m.name,
        priceBase: round2(effectivePriceBase.sub(m.discountBase ?? 0)),
        quantity: chosenQty,
      });
    }
  }
  return modifierLines;
}

async function priceCart(restaurantId: string, items: CartItemInput[]): Promise<PricedLine[]> {
  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, restaurantId },
    include: {
      kitchen: { select: { name: true } },
      variants: true,
      modifierCategories: {
        include: { modifierCategory: { include: { modifiers: { include: { variantPrices: true } } } } },
      },
      comboComponents: {
        orderBy: { priority: 'asc' },
        include: {
          componentProduct: {
            include: {
              modifierCategories: {
                include: { modifierCategory: { include: { modifiers: { include: { variantPrices: true } } } } },
              },
            },
          },
        },
      },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  return items.map((item) => {
    const product = byId.get(item.productId);
    if (!product) {
      throw badRequest(`El producto ${item.productId} no existe en este restaurante.`);
    }
    if (!product.isAvailable) {
      throw badRequest(`"${product.name}" no está disponible en este momento.`);
    }

    // Precio de promoción por tiempo (si está activa ahora — hora/días/fechas configurados en
    // el producto): solo aplica al precio simple, no a variantes (ver promo-price.ts).
    let basePrice = effectiveProductPrice(product);
    let variantName: string | null = null;
    // Variante ya validada como del propio producto. Los precios por variante de un modificador
    // se resuelven SOLO con esta: usando el `variantId` crudo del cliente, un producto simple
    // podía traerse el precio de una variante de otro producto (y quedarse con el más barato).
    let variantId: string | null = null;
    if (product.pricingMode === 'VARIANTS') {
      const variant = product.variants.find((v) => v.id === item.variantId);
      if (!variant) throw badRequest(`Elige una variante para "${product.name}".`);
      if (!variant.isAvailable) throw badRequest(`"${variant.name}" no está disponible en este momento.`);
      basePrice = round2(
        variant.priceBase.add(variant.packagingFeeBase ?? 0).sub(variant.discountBase ?? 0),
      );
      variantName = variant.name;
      variantId = variant.id;
    }

    // Categorías de modificadores asociadas al producto: valida obligatoriedad y el límite de
    // selecciones, y congela nombre + precio efectivo (precio - descuento) + cantidad de cada
    // modificador elegido. Extraído a priceModifierSelection porque un COMBO corre esta misma
    // validación una vez por cada instancia de cada plato componente.
    const modifierLines: PricedLineModifier[] = priceModifierSelection(product, item.modifierIds ?? [], variantId);

    // Combo: cada instancia de cada plato componente llega armada por separado en
    // comboSelections (2× wokbox = dos entradas). Se valida contra los modificadores del
    // PROPIO plato componente y todo se congela como filas del ítem: un encabezado decorativo
    // por instancia + sus elecciones — cocina, recibos e impresión ya saben pintar eso.
    if (product.comboComponents.length > 0) {
      const esperadas = product.comboComponents.flatMap((c) =>
        Array.from({ length: c.quantity }, () => c),
      );
      const selecciones = item.comboSelections ?? [];
      if (selecciones.length !== esperadas.length) {
        throw badRequest(`Arma los ${esperadas.length} platos que trae "${product.name}".`);
      }
      // Se emparejan en orden por componente: las selecciones de cada componentProductId
      // deben ser exactamente su cantidad.
      const porComponente = new Map<string, number>();
      for (const sel of selecciones) {
        porComponente.set(sel.componentProductId, (porComponente.get(sel.componentProductId) ?? 0) + 1);
      }
      for (const c of product.comboComponents) {
        if ((porComponente.get(c.componentProductId) ?? 0) !== c.quantity) {
          throw badRequest(`Arma ${c.quantity} "${c.componentProduct.name}" en "${product.name}".`);
        }
      }
      const contadorInstancia = new Map<string, number>();
      for (const sel of selecciones) {
        const comp = product.comboComponents.find((c) => c.componentProductId === sel.componentProductId)!;
        const n = (contadorInstancia.get(sel.componentProductId) ?? 0) + 1;
        contadorInstancia.set(sel.componentProductId, n);
        const etiqueta = comp.quantity > 1 ? `${comp.componentProduct.name} (${n})` : comp.componentProduct.name;
        if (!comp.componentProduct.isAvailable) {
          throw badRequest(`"${comp.componentProduct.name}" no está disponible en este momento.`);
        }
        modifierLines.push({ modifierId: null, name: `▪ ${etiqueta}`, priceBase: toDecimal(0), quantity: 1 });
        modifierLines.push(...priceModifierSelection(comp.componentProduct, sel.modifierIds ?? [], null));
      }
    }

    const modifiersTotal = modifierLines.reduce((acc, m) => acc.add(m.priceBase.mul(m.quantity)), toDecimal(0));
    const unitPrice = round2(basePrice.add(modifiersTotal));
    const lineTotal = round2(unitPrice.mul(item.quantity));

    return {
      productId: product.id,
      productName: product.name,
      variantName,
      unitPrice,
      quantity: item.quantity,
      lineTotal,
      modifiers: modifierLines,
      note: item.note,
      kitchenName: product.kitchen?.name ?? null,
    };
  });
}

/** Forma de nested-create de Prisma para un OrderItem a partir de una línea ya congelada. */
function buildOrderItemCreateData(line: PricedLine) {
  return {
    productId: line.productId,
    productName: line.productName,
    variantName: line.variantName,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    lineTotal: line.lineTotal,
    note: line.note,
    kitchenName: line.kitchenName,
    modifiers: {
      create: line.modifiers.map((m) => ({
        modifierId: m.modifierId,
        name: m.name,
        priceBase: m.priceBase,
        quantity: m.quantity,
      })),
    },
  };
}

function sumSubtotal(lines: PricedLine[]): Prisma.Decimal {
  return round2(lines.reduce((acc, l) => acc.add(l.lineTotal), toDecimal(0)));
}

// Cargos opcionales del checkout: el restaurante los activa/desactiva desde
// Ajustes, pero el porcentaje en sí no es configurable.
const SERVICE_CHARGE_RATE = 0.1;
const IVA_RATE = 0.16;

function calculateCharges(
  subtotalBase: Prisma.Decimal,
  restaurant: { serviceChargeEnabled: boolean; ivaEnabled: boolean },
) {
  const serviceChargeBase = restaurant.serviceChargeEnabled ? round2(subtotalBase.mul(SERVICE_CHARGE_RATE)) : toDecimal(0);
  const ivaBase = restaurant.ivaEnabled ? round2(subtotalBase.mul(IVA_RATE)) : toDecimal(0);
  const totalBase = round2(subtotalBase.add(serviceChargeBase).add(ivaBase));
  return { serviceChargeBase, ivaBase, totalBase };
}

/**
 * A partir de las zonas ya registradas (precio + distancia de su centroide al origen),
 * ajusta una tarifa lineal precio = intercepto + tarifaPorKm * distancia por mínimos
 * cuadrados. Con una sola zona usa la razón precio/distancia (recta por el origen). Sirve
 * para cotizar zonas que todavía no se dibujaron — ver el comentario en computeDeliveryFee.
 */
function estimateZoneRatePerKm(
  zones: { price: Prisma.Decimal; polygon: unknown }[],
  origin: LatLng,
): { intercept: number; ratePerKm: number } | null {
  const points = zones
    .map((z) => {
      const polygon = z.polygon as unknown as LatLng[];
      if (!Array.isArray(polygon) || polygon.length < 3) return null;
      const distanceKm = haversineDistanceKm(origin, polygonCentroid(polygon));
      return { distanceKm, price: Number(z.price) };
    })
    .filter((p): p is { distanceKm: number; price: number } => p !== null && p.distanceKm > 0.05);
  if (points.length === 0) return null;

  if (points.length === 1) {
    return { intercept: 0, ratePerKm: points[0].price / points[0].distanceKm };
  }

  const n = points.length;
  const sumX = points.reduce((acc, p) => acc + p.distanceKm, 0);
  const sumY = points.reduce((acc, p) => acc + p.price, 0);
  const sumXY = points.reduce((acc, p) => acc + p.distanceKm * p.price, 0);
  const sumXX = points.reduce((acc, p) => acc + p.distanceKm * p.distanceKm, 0);
  const denominator = n * sumXX - sumX * sumX;

  // Zonas casi a la misma distancia del origen (denominador ~0) o pendiente negativa
  // (más lejos no debería salir más barato) — se usa el promedio de precio/distancia
  // de cada zona en vez de la regresión, más robusto con pocos datos ruidosos.
  const slope = denominator === 0 ? NaN : (n * sumXY - sumX * sumY) / denominator;
  if (!Number.isFinite(slope) || slope < 0) {
    const avgRate = points.reduce((acc, p) => acc + p.price / p.distanceKm, 0) / n;
    return { intercept: 0, ratePerKm: avgRate };
  }

  const intercept = Math.max(0, (sumY - slope * sumX) / n);
  return { intercept, ratePerKm: slope };
}

/**
 * Calcula el costo de envío según el modo configurado por el restaurante.
 * Sin ubicación del cliente, sin origen configurado, o sin zona que la
 * contenga, el envío queda en 0 (no bloquea el checkout).
 *
 * `persistFallbackZone`: cuando el cliente cae fuera de toda zona dibujada, además de
 * cotizar por km (ver estimateZoneRatePerKm) se registra una zona nueva alrededor de ese
 * punto con el precio calculado, para que la próxima vez ya esté cubierta sin recalcular.
 * Se desactiva en cotizaciones en vivo (el cliente todavía puede estar moviendo el pin) y
 * solo se activa al confirmar/editar un pedido real.
 */
async function computeDeliveryFee(
  restaurant: {
    id: string;
    deliveryPricingMode: 'DISABLED' | 'DISTANCE' | 'ZONE';
    deliveryOriginLat: number | null;
    deliveryOriginLng: number | null;
    deliveryBaseFee: Prisma.Decimal;
    deliveryPricePerKm: Prisma.Decimal;
  },
  customer: LatLng | null,
  persistFallbackZone = false,
): Promise<Prisma.Decimal> {
  if (!customer || restaurant.deliveryPricingMode === 'DISABLED') return toDecimal(0);

  if (restaurant.deliveryPricingMode === 'DISTANCE') {
    if (restaurant.deliveryOriginLat == null || restaurant.deliveryOriginLng == null) return toDecimal(0);
    const distanceKm = haversineDistanceKm({ lat: restaurant.deliveryOriginLat, lng: restaurant.deliveryOriginLng }, customer);
    return round2(toDecimal(restaurant.deliveryBaseFee).add(toDecimal(restaurant.deliveryPricePerKm).mul(distanceKm)));
  }

  // ZONE: la primera zona cuyo polígono contenga al cliente define el precio.
  const zones = await prisma.deliveryZone.findMany({ where: { restaurantId: restaurant.id } });
  for (const zone of zones) {
    const polygon = zone.polygon as unknown as LatLng[];
    if (Array.isArray(polygon) && isPointInPolygon(customer, polygon)) {
      return round2(toDecimal(zone.price));
    }
  }

  // Ningún polígono contiene al cliente (punto justo afuera de una zona por
  // imprecisión del GPS/dibujo, o zona sin cubrir del todo). En vez de dejarlo
  // sin cobrar, usamos el precio de la zona dibujada más cercana — pero solo si
  // está dentro de NEARBY_ZONE_MAX_KM de esa zona. Más lejos (fuera del área que
  // el restaurante efectivamente cubrió con zonas) se cotiza por km (abajo).
  const NEARBY_ZONE_MAX_KM = 10;
  let nearest: { price: Prisma.Decimal; distanceKm: number } | null = null;
  for (const zone of zones) {
    const polygon = zone.polygon as unknown as LatLng[];
    if (!Array.isArray(polygon) || polygon.length < 2) continue;
    const distanceKm = distanceToPolygonKm(customer, polygon);
    if (!nearest || distanceKm < nearest.distanceKm) nearest = { price: zone.price, distanceKm };
  }
  if (nearest && nearest.distanceKm <= NEARBY_ZONE_MAX_KM) {
    return round2(toDecimal(nearest.price));
  }

  // Zona virgen (sin ninguna zona registrada cerca): en vez de dejar el envío en 0, se
  // estima con la tarifa por km que salió de las zonas que sí tienen precio.
  if (restaurant.deliveryOriginLat == null || restaurant.deliveryOriginLng == null) return toDecimal(0);
  const origin = { lat: restaurant.deliveryOriginLat, lng: restaurant.deliveryOriginLng };
  const rate = estimateZoneRatePerKm(zones, origin);
  if (!rate) return toDecimal(0);

  const distanceFromOriginKm = haversineDistanceKm(origin, customer);
  const estimatedPrice = round2(toDecimal(rate.intercept).add(toDecimal(rate.ratePerKm).mul(distanceFromOriginKm)));

  if (persistFallbackZone) {
    // Radio generoso (3km de lado) para que los próximos pedidos del mismo sector caigan
    // dentro de esta misma zona en vez de generar una nueva cada vez.
    await prisma.deliveryZone.create({
      data: {
        restaurantId: restaurant.id,
        name: `Zona automática (${distanceFromOriginKm.toFixed(1)} km)`,
        price: estimatedPrice,
        polygon: squarePolygonAround(customer, 1.5) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  return estimatedPrice;
}

/**
 * Suma el cargo de envase (envase/caja/bolsa) de las líneas del pedido. Solo aplica en
 * DELIVERY/PICKUP (en mesa/barra se sirve sin empaque) — ver Product.packagingMode.
 * "FIXED" usa Product.packagingFeeBase; "INVENTORY" usa el precio de venta del insumo
 * vinculado (0 si no tiene precio de venta cargado). Se multiplica por la cantidad
 * vendida de cada producto (mismo criterio que sumSubtotal/deductRecipeStock).
 */
async function computeEnvaseFee(
  restaurantId: string,
  channel: OrderChannel,
  items: { productId: string | null; quantity: number }[],
): Promise<Prisma.Decimal> {
  if (channel !== 'DELIVERY' && channel !== 'PICKUP') return toDecimal(0);
  const qtyByProduct = sumQuantityByProduct(items);
  if (qtyByProduct.size === 0) return toDecimal(0);

  const products = await prisma.product.findMany({
    where: { id: { in: [...qtyByProduct.keys()] }, restaurantId, packagingMode: { not: 'NONE' } },
    include: { packagingItem: { select: { salePriceBase: true } } },
  });

  return round2(
    products.reduce((acc, p) => {
      const qty = qtyByProduct.get(p.id) ?? 0;
      const unitFee =
        p.packagingMode === 'FIXED' ? toDecimal(p.packagingFeeBase ?? 0) : toDecimal(p.packagingItem?.salePriceBase ?? 0);
      return acc.add(unitFee.mul(qty));
    }, toDecimal(0)),
  );
}

/**
 * Genera el correlativo por inquilino de forma segura ante concurrencia,
 * dentro de una transacción.
 */
async function nextOrderNumber(tx: Prisma.TransactionClient, restaurantId: string): Promise<number> {
  // Candado por restaurante dentro de la transacción (se suelta solo al confirmar/abortar):
  // dos pedidos que entran en el mismo instante ya no leen el mismo máximo y chocan en el
  // índice único (restaurantId, orderNumber) — el segundo espera y toma el siguiente número.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'order:' + restaurantId}))`;
  const last = await tx.order.findFirst({
    where: { restaurantId },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  });
  return (last?.orderNumber ?? 0) + 1;
}

/**
 * Descuenta del inventario los insumos de cada producto vendido que tenga
 * receta. Se llama una sola vez, al marcar el pedido SERVED por primera vez.
 * El stock nunca baja de 0 (se recorta si hay menos existencia de la que
 * "debería" haber, en vez de fallar el cambio de estado).
 */
/**
 * Unidades vendidas por producto, SUMANDO las líneas repetidas. Un mismo producto
 * aparece en varios OrderItem cuando el cliente lo pidió con modificadores o notas
 * distintas ("2x Hamburguesa sin cebolla" + "1x Hamburguesa"), así que construir el
 * mapa con `new Map(items.map(...))` se quedaba solo con la última línea y descontaba
 * 1 unidad en vez de 3 — el inventario se desviaba en silencio en cada pedido así.
 */
function sumQuantityByProduct(items: { productId: string | null; quantity: number }[]): Map<string, number> {
  const byProduct = new Map<string, number>();
  for (const item of items) {
    if (!item.productId) continue;
    byProduct.set(item.productId, (byProduct.get(item.productId) ?? 0) + item.quantity);
  }
  return byProduct;
}

/** Igual que arriba, pero solo para líneas de receta que aplican a UN tamaño puntual
 * (RecipeIngredient.productVariantId no nulo) — se agrupa por producto+nombre de variante, ya
 * que OrderItem solo congela `variantName` (snapshot), no un id de variante. */
function sumQuantityByProductVariant(items: { productId: string | null; variantName: string | null; quantity: number }[]): Map<string, number> {
  const byKey = new Map<string, number>();
  for (const item of items) {
    if (!item.productId || !item.variantName) continue;
    const key = `${item.productId}::${item.variantName}`;
    byKey.set(key, (byKey.get(key) ?? 0) + item.quantity);
  }
  return byKey;
}

/** Une las líneas de receta vendidas con el grafo de costeo para saber, en definitiva,
 * cuánto de cada INSUMO (nunca una preparación — no tiene stock propio) hay que
 * descontar/devolver. Una preparación usada en 2 platos vendidos a la vez se resuelve
 * correctamente sumando ambos consumos en el mismo Map antes de tocar la DB. Una línea con
 * `productVariantId` solo cuenta las unidades vendidas de ESE tamaño; sin variante, cuenta
 * todas las unidades del producto sin importar el tamaño. */
async function resolveRecipeInventoryDeltas(
  graph: CostGraph,
  recipeLines: {
    productId: string;
    inventoryItemId: string | null;
    preparationId: string | null;
    componentProductId: string | null;
    quantity: Prisma.Decimal;
    productVariantId: string | null;
    productVariant: { name: string } | null;
  }[],
  qtyByProduct: Map<string, number>,
  qtyByProductVariant: Map<string, number>,
): Promise<Map<string, Prisma.Decimal>> {
  const acc = new Map<string, Prisma.Decimal>();
  for (const line of recipeLines) {
    const soldQty = line.productVariantId
      ? (qtyByProductVariant.get(`${line.productId}::${line.productVariant?.name ?? ''}`) ?? 0)
      : (qtyByProduct.get(line.productId) ?? 0);
    if (soldQty <= 0) continue;
    const used = toDecimal(line.quantity).mul(soldQty);
    // componentProductId incluido: vender un combo tiene que descontar los insumos de los platos
    // que lo componen, no solo los suyos propios (ver costing.ts).
    resolveConsumedInventoryItems(
      graph,
      { inventoryItemId: line.inventoryItemId, preparationId: line.preparationId, componentProductId: line.componentProductId },
      used,
      acc,
    );
  }
  return acc;
}

export type RecipeStockItem = {
  productId: string | null;
  variantName: string | null;
  quantity: number;
  modifiers: { modifierId: string | null; quantity: number }[];
};

/** Cuánto de cada insumo hay que descontar/devolver por receta, incluyendo las líneas "A
 * elección del cliente": para esas, se resuelve el insumo EXACTO que el cliente eligió (el
 * modificador de esa categoría que marcó en el pedido) y se usan los gramos de la RECETA —
 * no la cantidad propia que tenga configurada ese modificador. Compartida por deduct/restore
 * para no duplicar la resolución (solo cambia si al final se decrementa o se incrementa). */
export async function computeRecipeStockDeltas(restaurantId: string, items: RecipeStockItem[]): Promise<Map<string, Prisma.Decimal>> {
  const productIds = items.map((i) => i.productId).filter((id): id is string => Boolean(id));
  if (productIds.length === 0) return new Map();

  const recipeLines = await prisma.recipeIngredient.findMany({
    where: { restaurantId, productId: { in: productIds } },
    include: { productVariant: { select: { name: true } } },
  });
  if (recipeLines.length === 0) return new Map();

  const graph = await buildCostGraph(prisma, restaurantId);
  const qtyByProduct = sumQuantityByProduct(items);
  const qtyByProductVariant = sumQuantityByProductVariant(items);
  const fixedLines = recipeLines.filter((l) => !l.customerChoiceModifierCategoryId);
  const deltas = await resolveRecipeInventoryDeltas(graph, fixedLines, qtyByProduct, qtyByProductVariant);

  const customerChoiceLines = recipeLines.filter((l) => l.customerChoiceModifierCategoryId);
  if (customerChoiceLines.length > 0) {
    const modifierIds = [
      ...new Set(items.flatMap((i) => i.modifiers.map((m) => m.modifierId).filter((id): id is string => Boolean(id)))),
    ];
    const modifiers = modifierIds.length
      ? await prisma.modifier.findMany({
          where: { id: { in: modifierIds }, restaurantId, OR: [{ inventoryItemId: { not: null } }, { preparationId: { not: null } }] },
          select: { id: true, categoryId: true, inventoryItemId: true, preparationId: true },
        })
      : [];
    const modifierById = new Map(modifiers.map((m) => [m.id, m]));

    for (const item of items) {
      if (!item.productId) continue;
      const applicableLines = customerChoiceLines.filter(
        (l) => l.productId === item.productId && (l.productVariantId == null || l.productVariant?.name === item.variantName),
      );
      if (applicableLines.length === 0) continue;
      for (const chosen of item.modifiers) {
        if (!chosen.modifierId) continue;
        const mod = modifierById.get(chosen.modifierId);
        if (!mod || (!mod.inventoryItemId && !mod.preparationId)) continue;
        // La porción propia del topping ("Queso → 100 gr") le gana a la genérica de su categoría
        // ("cualquiera → 60 gr"); la genérica solo aplica a los toppings sin porción propia. Y si
        // hay una línea para ESTE tamaño y otra para "todos", manda la del tamaño.
        const ofCategory = applicableLines.filter((l) => l.customerChoiceModifierCategoryId === mod.categoryId);
        const specific = ofCategory.filter((l) => l.customerChoiceModifierId === mod.id);
        const generic = ofCategory.filter((l) => !l.customerChoiceModifierId);
        const pool = specific.length ? specific : generic;
        const line = pool.find((l) => l.productVariantId != null) ?? pool[0];
        if (!line) continue;
        const used = toDecimal(line.quantity).mul(chosen.quantity).mul(item.quantity);
        resolveConsumedInventoryItems(graph, { inventoryItemId: mod.inventoryItemId, preparationId: mod.preparationId }, used, deltas);
      }
    }
  }

  return deltas;
}

/** Modificadores (por ítem vendido) cuya porción YA la resolvió la receta ("A elección del
 * cliente", ver computeRecipeStockDeltas) — deductModifierStock/restoreModifierStock no deben
 * volver a tocarlos con su propia cantidad configurada (evita descontar dos veces el mismo
 * insumo). Cubierto = tiene línea propia ("Queso → 100 gr") o una genérica de su categoría
 * ("cualquiera → 60 gr") aplicable a ese tamaño. Un topping de una categoría que en la receta
 * SOLO tiene porciones para OTROS toppings no está cubierto: para ese sigue mandando la cantidad
 * del propio modificador. Devuelve, por índice de `items`, el set de modifierId cubiertos. */
async function loadRecipeCoveredModifiersByItem(
  restaurantId: string,
  items: { productId: string | null; variantName: string | null; modifiers: { modifierId: string | null }[] }[],
): Promise<Set<string>[]> {
  const productIds = items.map((i) => i.productId).filter((id): id is string => Boolean(id));
  if (productIds.length === 0) return items.map(() => new Set<string>());
  const lines = await prisma.recipeIngredient.findMany({
    where: { restaurantId, productId: { in: productIds }, customerChoiceModifierCategoryId: { not: null } },
    include: { productVariant: { select: { name: true } } },
  });
  if (lines.length === 0) return items.map(() => new Set<string>());
  const modifierIds = [...new Set(items.flatMap((i) => i.modifiers.map((m) => m.modifierId).filter((id): id is string => Boolean(id))))];
  const modifiers = modifierIds.length
    ? await prisma.modifier.findMany({ where: { id: { in: modifierIds }, restaurantId }, select: { id: true, categoryId: true } })
    : [];
  const categoryByModifier = new Map(modifiers.map((m) => [m.id, m.categoryId]));
  return items.map((item) => {
    const set = new Set<string>();
    const applicable = lines.filter(
      (l) => l.productId === item.productId && (l.productVariantId == null || l.productVariant?.name === item.variantName),
    );
    for (const chosen of item.modifiers) {
      if (!chosen.modifierId) continue;
      const categoryId = categoryByModifier.get(chosen.modifierId);
      if (!categoryId) continue;
      const covered = applicable.some(
        (l) => l.customerChoiceModifierCategoryId === categoryId && (l.customerChoiceModifierId == null || l.customerChoiceModifierId === chosen.modifierId),
      );
      if (covered) set.add(chosen.modifierId);
    }
    return set;
  });
}

async function deductRecipeStock(restaurantId: string, items: RecipeStockItem[]) {
  const deltas = await computeRecipeStockDeltas(restaurantId, items);
  let deducted = false;

  for (const [inventoryItemId, used] of deltas) {
    const item = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
    if (!item) continue;
    const nextQuantity = Prisma.Decimal.max(0, toDecimal(item.quantity).sub(used));
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { quantity: nextQuantity } });
    deducted = true;
  }

  // Bajó el stock de al menos un insumo por receta: recalcula el aviso de "se está agotando".
  if (deducted) {
    notifyStockChanged(restaurantId);
  }
}

/**
 * Descuenta del inventario los insumos vinculados a los MODIFICADORES elegidos
 * (ej. "Extra queso" consume 30 gr del insumo Queso). Se llama junto con las
 * otras dos deducciones, una sola vez al marcar SERVED.
 *
 * Dos condiciones para que descuente:
 *  - El restaurante tiene el vínculo activado (botón en Inventario). Apagado,
 *    la configuración queda guardada pero no toca el stock.
 *  - El modificador tiene insumo y cantidad configurados.
 *
 * El consumo escala por las dos cantidades: cuántas veces se eligió el
 * modificador en la línea (ej. "Ketchup x3") POR cuántas unidades del producto
 * se vendieron. Nunca baja de 0.
 */
async function deductModifierStock(
  restaurantId: string,
  items: { productId: string | null; variantName: string | null; quantity: number; modifiers: { modifierId: string | null; quantity: number }[] }[],
) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { modifierInventoryLinkEnabled: true },
  });
  if (!restaurant?.modifierInventoryLinkEnabled) return;

  // Consumo total por insumo, acumulando todas las líneas del pedido.
  const usedByInventoryItem = new Map<string, Prisma.Decimal>();

  const modifierIds = [
    ...new Set(items.flatMap((i) => i.modifiers.map((m) => m.modifierId).filter((id): id is string => Boolean(id)))),
  ];
  if (modifierIds.length === 0) return;

  const modifiers = await prisma.modifier.findMany({
    where: { id: { in: modifierIds }, restaurantId, OR: [{ inventoryItemId: { not: null } }, { preparationId: { not: null } }] },
    select: { id: true, categoryId: true, inventoryItemId: true, preparationId: true, inventoryQuantity: true },
  });
  if (modifiers.length === 0) return;
  const byModifierId = new Map(modifiers.map((m) => [m.id, m]));
  // Consumo propio por VARIANTE (los gramos cambian con el tamaño): el override se resuelve
  // por nombre de variante porque el pedido congela variantName, no variantId.
  const variantOverrides = await prisma.modifierVariantPrice.findMany({
    where: { modifierId: { in: modifiers.map((m) => m.id) }, inventoryQuantity: { not: null } },
    select: { modifierId: true, inventoryQuantity: true, variant: { select: { name: true, productId: true } } },
  });
  const overrideQtyFor = (modifierId: string, productId: string | null, variantName: string | null) =>
    variantOverrides.find(
      (o) => o.modifierId === modifierId && o.variant.productId === productId && o.variant.name === variantName,
    )?.inventoryQuantity ?? null;
  const coveredByItem = await loadRecipeCoveredModifiersByItem(restaurantId, items);
  const graph = await buildCostGraph(prisma, restaurantId);

  items.forEach((item, index) => {
    const covered = coveredByItem[index];
    for (const chosen of item.modifiers) {
      if (!chosen.modifierId) continue;
      const link = byModifierId.get(chosen.modifierId);
      if (!link || (!link.inventoryItemId && !link.preparationId)) continue;
      const qtyPorUnidad = overrideQtyFor(chosen.modifierId, item.productId, item.variantName) ?? link.inventoryQuantity;
      if (!qtyPorUnidad) continue;
      // La receta de este producto ya resuelve este topping con sus propios gramos (ver
      // computeRecipeStockDeltas) — no descontar dos veces el mismo insumo.
      if (covered.has(chosen.modifierId)) continue;

      // (consumo por unidad — el de la variante si tiene uno propio) x (veces elegido) x
      // (unidades vendidas) — una preparación se resuelve hasta sus insumos base.
      const used = toDecimal(qtyPorUnidad).mul(chosen.quantity).mul(item.quantity);
      resolveConsumedInventoryItems(graph, { inventoryItemId: link.inventoryItemId, preparationId: link.preparationId }, used, usedByInventoryItem);
    }
  });
  if (usedByInventoryItem.size === 0) return;

  // Modo "inventario compartido entre sedes": los insumos viven en la raíz del grupo, así que
  // hay que buscarlos ahí — con el restaurantId de la sucursal no aparecían y no se descontaba
  // nada (mientras que la devolución al cancelar sí funcionaba, e inflaba el stock).
  const inventoryRestaurantId = await resolveInventoryScopeById(restaurantId);
  let deducted = false;
  for (const [inventoryItemId, used] of usedByInventoryItem) {
    const inventoryItem = await prisma.inventoryItem.findFirst({
      where: { id: inventoryItemId, restaurantId: inventoryRestaurantId },
    });
    if (!inventoryItem) continue;
    const nextQuantity = Prisma.Decimal.max(0, toDecimal(inventoryItem.quantity).sub(used));
    await prisma.inventoryItem.update({ where: { id: inventoryItem.id }, data: { quantity: nextQuantity } });
    deducted = true;
  }

  if (deducted) {
    notifyStockChanged(restaurantId);
  }
}

/**
 * Descuenta el stock simple de cada producto vendido que tenga control de stock activo
 * (independiente del sistema de insumos/receta). Se llama junto con `deductRecipeStock`,
 * una sola vez, al marcar el pedido SERVED por primera vez. Nunca baja de 0.
 */
async function deductProductStock(restaurantId: string, items: { productId: string | null; quantity: number }[]) {
  const productIds = items.map((i) => i.productId).filter((id): id is string => Boolean(id));
  if (productIds.length === 0) return;

  const products = await prisma.product.findMany({
    where: { restaurantId, id: { in: productIds }, stockControlEnabled: true },
    select: { id: true, stockQuantity: true },
  });
  if (products.length === 0) return;

  const qtyByProduct = sumQuantityByProduct(items);

  for (const product of products) {
    const soldQty = qtyByProduct.get(product.id) ?? 0;
    if (soldQty <= 0) continue;
    const nextQuantity = Math.max(0, (product.stockQuantity ?? 0) - soldQty);
    await prisma.product.update({ where: { id: product.id }, data: { stockQuantity: nextQuantity } });
  }
}

/**
 * Descuenta del inventario el insumo de envase de cada producto vendido con
 * packagingMode = INVENTORY. Igual que las otras deducciones: solo aplica en
 * DELIVERY/PICKUP, se llama una sola vez al marcar SERVED, nunca baja de 0.
 */
async function deductPackagingStock(
  restaurantId: string,
  channel: OrderChannel,
  items: { productId: string | null; quantity: number }[],
) {
  if (channel !== 'DELIVERY' && channel !== 'PICKUP') return;
  const qtyByProduct = sumQuantityByProduct(items);
  if (qtyByProduct.size === 0) return;

  const products = await prisma.product.findMany({
    where: {
      id: { in: [...qtyByProduct.keys()] },
      restaurantId,
      packagingMode: 'INVENTORY',
      packagingItemId: { not: null },
    },
    select: { id: true, packagingItemId: true },
  });
  if (products.length === 0) return;

  const usedByItem = new Map<string, number>();
  for (const p of products) {
    const qty = qtyByProduct.get(p.id) ?? 0;
    if (qty <= 0 || !p.packagingItemId) continue;
    usedByItem.set(p.packagingItemId, (usedByItem.get(p.packagingItemId) ?? 0) + qty);
  }
  if (usedByItem.size === 0) return;

  // Ver la nota de deductModifierStock: en modo compartido el envase vive en la raíz del grupo.
  const inventoryRestaurantId = await resolveInventoryScopeById(restaurantId);
  let deducted = false;
  for (const [inventoryItemId, used] of usedByItem) {
    const item = await prisma.inventoryItem.findFirst({
      where: { id: inventoryItemId, restaurantId: inventoryRestaurantId },
    });
    if (!item) continue;
    const nextQuantity = Prisma.Decimal.max(0, toDecimal(item.quantity).sub(used));
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { quantity: nextQuantity } });
    deducted = true;
  }

  if (deducted) {
    notifyStockChanged(restaurantId);
  }
}

/**
 * Devuelve al inventario lo que las cuatro `deduct*Stock` de arriba descontaron al marcar
 * SERVED, cuando ese pedido se cancela o se borra después — sin esto, un pedido servido
 * por error (o cancelado tras servirse) dejaba la existencia descontada para siempre, sin
 * haberse vendido nada. Mismo criterio que movementService.remove() revirtiendo un
 * reabastecimiento: usa `increment` (no hace falta clamp al subir), y como el descuento
 * original sí se clampeaba en 0, un pedido que agotó el insumo por completo puede devolver
 * de más — imprecisión aceptada, igual que en movement.service.ts.
 */
async function restoreRecipeStock(restaurantId: string, items: RecipeStockItem[]) {
  const deltas = await computeRecipeStockDeltas(restaurantId, items);
  for (const [inventoryItemId, used] of deltas) {
    await prisma.inventoryItem
      .update({ where: { id: inventoryItemId }, data: { quantity: { increment: used } } })
      .catch(() => undefined); // el insumo pudo haberse borrado desde entonces
  }
}

async function restoreModifierStock(
  restaurantId: string,
  items: { productId: string | null; variantName: string | null; quantity: number; modifiers: { modifierId: string | null; quantity: number }[] }[],
) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { modifierInventoryLinkEnabled: true },
  });
  if (!restaurant?.modifierInventoryLinkEnabled) return;

  const usedByInventoryItem = new Map<string, Prisma.Decimal>();
  const modifierIds = [
    ...new Set(items.flatMap((i) => i.modifiers.map((m) => m.modifierId).filter((id): id is string => Boolean(id)))),
  ];
  if (modifierIds.length === 0) return;

  const modifiers = await prisma.modifier.findMany({
    where: { id: { in: modifierIds }, restaurantId, OR: [{ inventoryItemId: { not: null } }, { preparationId: { not: null } }] },
    select: { id: true, categoryId: true, inventoryItemId: true, preparationId: true, inventoryQuantity: true },
  });
  if (modifiers.length === 0) return;
  const byModifierId = new Map(modifiers.map((m) => [m.id, m]));
  // Consumo propio por VARIANTE (los gramos cambian con el tamaño): el override se resuelve
  // por nombre de variante porque el pedido congela variantName, no variantId.
  const variantOverrides = await prisma.modifierVariantPrice.findMany({
    where: { modifierId: { in: modifiers.map((m) => m.id) }, inventoryQuantity: { not: null } },
    select: { modifierId: true, inventoryQuantity: true, variant: { select: { name: true, productId: true } } },
  });
  const overrideQtyFor = (modifierId: string, productId: string | null, variantName: string | null) =>
    variantOverrides.find(
      (o) => o.modifierId === modifierId && o.variant.productId === productId && o.variant.name === variantName,
    )?.inventoryQuantity ?? null;
  const coveredByItem = await loadRecipeCoveredModifiersByItem(restaurantId, items);
  const graph = await buildCostGraph(prisma, restaurantId);

  items.forEach((item, index) => {
    const covered = coveredByItem[index];
    for (const chosen of item.modifiers) {
      if (!chosen.modifierId) continue;
      const link = byModifierId.get(chosen.modifierId);
      if (!link || (!link.inventoryItemId && !link.preparationId)) continue;
      const qtyPorUnidad = overrideQtyFor(chosen.modifierId, item.productId, item.variantName) ?? link.inventoryQuantity;
      if (!qtyPorUnidad) continue;
      if (covered.has(chosen.modifierId)) continue;
      const used = toDecimal(qtyPorUnidad).mul(chosen.quantity).mul(item.quantity);
      resolveConsumedInventoryItems(graph, { inventoryItemId: link.inventoryItemId, preparationId: link.preparationId }, used, usedByInventoryItem);
    }
  });

  for (const [inventoryItemId, used] of usedByInventoryItem) {
    await prisma.inventoryItem
      .update({ where: { id: inventoryItemId }, data: { quantity: { increment: used } } })
      .catch(() => undefined);
  }
}

async function restoreProductStock(restaurantId: string, items: { productId: string | null; quantity: number }[]) {
  const productIds = items.map((i) => i.productId).filter((id): id is string => Boolean(id));
  if (productIds.length === 0) return;

  const products = await prisma.product.findMany({
    where: { restaurantId, id: { in: productIds }, stockControlEnabled: true },
    select: { id: true, stockQuantity: true },
  });
  if (products.length === 0) return;

  const qtyByProduct = sumQuantityByProduct(items);
  for (const product of products) {
    const soldQty = qtyByProduct.get(product.id) ?? 0;
    if (soldQty <= 0) continue;
    await prisma.product.update({
      where: { id: product.id },
      data: { stockQuantity: (product.stockQuantity ?? 0) + soldQty },
    });
  }
}

async function restorePackagingStock(
  restaurantId: string,
  channel: OrderChannel,
  items: { productId: string | null; quantity: number }[],
) {
  if (channel !== 'DELIVERY' && channel !== 'PICKUP') return;
  const qtyByProduct = sumQuantityByProduct(items);
  if (qtyByProduct.size === 0) return;

  const products = await prisma.product.findMany({
    where: {
      id: { in: [...qtyByProduct.keys()] },
      restaurantId,
      packagingMode: 'INVENTORY',
      packagingItemId: { not: null },
    },
    select: { id: true, packagingItemId: true },
  });
  if (products.length === 0) return;

  const usedByItem = new Map<string, number>();
  for (const p of products) {
    const qty = qtyByProduct.get(p.id) ?? 0;
    if (qty <= 0 || !p.packagingItemId) continue;
    usedByItem.set(p.packagingItemId, (usedByItem.get(p.packagingItemId) ?? 0) + qty);
  }

  for (const [inventoryItemId, used] of usedByItem) {
    await prisma.inventoryItem
      .update({ where: { id: inventoryItemId }, data: { quantity: { increment: used } } })
      .catch(() => undefined);
  }
}

/** Corre las cuatro reversiones de una — llamarla cuando un pedido que ya estaba SERVED se cancela o se borra. */
async function restoreServedOrderStock(
  restaurantId: string,
  order: {
    channel: OrderChannel;
    items: { productId: string | null; variantName: string | null; quantity: number; modifiers: { modifierId: string | null; quantity: number }[] }[];
  },
) {
  await restoreRecipeStock(restaurantId, order.items);
  await restoreProductStock(restaurantId, order.items);
  await restoreModifierStock(restaurantId, order.items);
  await restorePackagingStock(restaurantId, order.channel, order.items);
}

/** Inicio del período usado por getSalesStats/getSalesStatsUserOrders (semana o mes en curso) — debe coincidir en ambos para que los totales no se desalineen. */
/**
 * Emite el ORDER_UPDATED tras un pedido pasar a KITCHEN, sea por aceptación manual
 * (acceptOrder) o automática (autoAcceptAfterPaymentApproved). Delivery manda el
 * pedido completo (lo usa la Estación de Impresión para imprimir la comanda de
 * delivery recién ahora que se aceptó); el resto solo notifica el cambio de status.
 */
async function emitOrderAccepted(restaurantId: string, order: { id: string; channel: OrderChannel; status: string }) {
  if (order.channel === 'DELIVERY') {
    const full = await prisma.order.findUnique({
      where: { id: order.id },
      include: { items: { include: { modifiers: true } } },
    });
    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, {
      orderId: order.id,
      status: order.status,
      channel: full!.channel,
      orderNumber: full!.orderNumber,
      customerName: full!.customerName,
      customerPhone: full!.customerPhone,
      customerAddress: full!.customerAddress,
      customerNote: full!.customerNote,
      paymentMethod: full!.paymentMethod,
      deliveryFeeBase: full!.deliveryFeeBase,
      items: full!.items.map((i) => ({
        name: i.productName,
        variantName: i.variantName,
        quantity: i.quantity,
        unitPrice: i.unitPrice.toString(),
        lineTotal: i.lineTotal.toString(),
        modifiers: i.modifiers.map((m) => ({ name: m.name, priceBase: m.priceBase.toString(), quantity: m.quantity })),
        note: i.note,
        kitchenName: i.kitchenName,
      })),
      subtotalBase: full!.subtotalBase,
      serviceChargeBase: full!.serviceChargeBase,
      ivaBase: full!.ivaBase,
      totalBase: full!.totalBase,
      currency: full!.currency,
      exchangeRate: full!.exchangeRate,
      totalBs: full!.totalBs,
      createdAt: full!.createdAt,
    });
  } else {
    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, { orderId: order.id, status: order.status });
  }
}

function salesStatsPeriodStart(range: 'week' | 'month', now: Date): Date {
  return range === 'week' ? startOfWeekCaracas() : new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Push (FCM) de "pedido nuevo" a los dispositivos registrados del restaurante (app de
 * escritorio/Android) — a diferencia del socket en vivo (emitToKitchen), esto SÍ llega aunque
 * la app esté minimizada/cerrada en Android, que es el caso que el socket no puede cubrir.
 * No hace nada (ni tira error) si Firebase no está configurado o no hay dispositivos
 * registrados todavía — el negocio tiene que poder vender igual sin esto configurado.
 */
async function sendNewOrderPush(restaurantId: string, order: { orderNumber: number; channel: OrderChannel }) {
  const CHANNEL_LABEL: Record<OrderChannel, string> = { DINE_IN: 'Mesa', DELIVERY: 'Delivery', PICKUP: 'Pick-up', BAR: 'Barra', EXPRESS: 'Express' };
  await sendPushToRestaurant(restaurantId, {
    title: `Nuevo pedido #${order.orderNumber}`,
    body: CHANNEL_LABEL[order.channel],
  });
}

/**
 * Tramo desde–hasta de Estadísticas (fechas "YYYY-MM-DD", hora de Caracas, ambas inclusivas).
 * Si solo viene una de las dos, la otra se completa con hoy. Devuelve null si no vino ninguna.
 */
function resolveCustomPeriod(from?: string, to?: string): { start: Date; end: Date } | null {
  if (!from && !to) return null;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const start = from ? startOfDayCaracas(from) : startOfTodayCaracas();
  const end = to ? new Date(startOfDayCaracas(to).getTime() + DAY_MS) : new Date(startOfTodayCaracas().getTime() + DAY_MS);
  // Fechas invertidas: se ordenan solas en vez de devolver un rango vacío.
  return start <= end ? { start, end } : { start: end, end: start };
}

export const orderService = {
  /**
   * -------------------------------------------------------------------------
   *  CANAL EN MESA (DINE_IN)
   *  Persiste la comanda y emite el evento de WebSocket para dejarla
   *  "lista para imprimir" en la cola de la cocina.
   * -------------------------------------------------------------------------
   */
  async checkoutDineIn(input: DineInCheckoutInput) {
    // La mesa (y por tanto el tenant) se resuelve desde el token del QR.
    const table = await prisma.table.findUnique({
      where: { qrToken: input.qrToken },
      include: {
        restaurant: {
          select: {
            id: true,
            baseCurrency: true,
            isActive: true,
            orderingEnabled: true,
            requireOrderConfirmation: true,
            serviceChargeEnabled: true,
            ivaEnabled: true,
          },
        },
      },
    });
    if (!table || !table.isActive || !table.restaurant.isActive) {
      throw notFound('Mesa no válida.');
    }
    if (!table.restaurant.orderingEnabled) {
      throw badRequest('Este restaurante no está aceptando pedidos en este momento.');
    }
    await assertRestaurantOpen(table.restaurantId);

    const restaurantId = table.restaurantId;
    // Si esta mesa está unida a otra, la cuenta (y por tanto el pedido) va a la principal:
    // el grupo entero consume y paga una sola cuenta. Ver src/utils/table-merge.ts.
    const accountTableId = primaryTableIdOf(table);
    const currency = table.restaurant.baseCurrency;
    const rate = await exchangeRateService.getRate(currency, restaurantId);

    const lines = await priceCart(restaurantId, input.items);
    const subtotalBase = sumSubtotal(lines);
    const { serviceChargeBase, ivaBase, totalBase } = calculateCharges(subtotalBase, table.restaurant);
    const totalBs = baseToBs(totalBase, rate.rateBs);

    const order = await prisma.$transaction(async (tx) => {
      // Mientras la mesa esté "abierta", todos sus pedidos se acumulan en la
      // misma cuenta (TableSession). Solo el primer pedido pide nombre/cédula.
      const openSessions = await tx.tableSession.findMany({ where: { tableId: accountTableId, status: 'OPEN' } });
      // Con varias cuentas abiertas a la vez, el autopedido público no puede saber a cuál
      // atribuir el pedido — eso queda para el mesero (ver CreateOrderDialog/TableOrdersPage).
      if (openSessions.length > 1) {
        throw conflict('Esta mesa tiene varias cuentas abiertas — pide ayuda al mesero para tu pedido.');
      }
      let session = openSessions[0] ?? null;

      // Si la cuenta ya existe (no es el primer pedido) y está protegida con
      // clave, hay que validarla antes de aceptar el pedido nuevo.
      if (session) {
        await tableSessionService.verifyPin(session, input.pin);
      }

      if (!session) {
        if (!input.customerName || !input.customerIdNumber || !input.customerPhone) {
          throw badRequest('Faltan tus datos de facturación (nombre, cédula y teléfono).');
        }
        session = await tx.tableSession.create({
          data: {
            restaurantId,
            tableId: accountTableId,
            customerName: input.customerName,
            customerIdNumber: input.customerIdNumber,
            customerPhone: input.customerPhone,
          },
        });
      }

      const orderNumber = await nextOrderNumber(tx, restaurantId);
      return tx.order.create({
        data: {
          restaurantId,
          orderNumber,
          channel: 'DINE_IN',
          // Todo pedido que llega solo desde el cliente (menú público/QR de mesa) espera
          // a que Mesero/Caja/Admin/Dueño lo acepte antes de que llegue a cocina.
          status: 'NEEDS_CONFIRMATION',
          tableId: accountTableId,
          tableSessionId: session.id,
          customerName: session.customerName,
          customerIdNumber: session.customerIdNumber,
          customerPhone: session.customerPhone,
          currency,
          subtotalBase,
          serviceChargeBase,
          ivaBase,
          totalBase,
          tipBase: input.tipBase ?? 0,
          exchangeRate: rate.rateBs,
          totalBs,
          items: {
            create: lines.map((l) => buildOrderItemCreateData(l)),
          },
        },
        include: {
          items: { include: { modifiers: true } },
          table: { select: { number: true, zone: { select: { name: true } } } },
          placedByUser: { select: { name: true } },
        },
      });
    });

    await customerService.upsertFromOrder(restaurantId, {
      name: order.customerName,
      phone: order.customerPhone,
      idNumber: order.customerIdNumber,
    });

    // Empuja el aviso en tiempo real: si necesita confirmación el mesero la ve
    // en "Órdenes de Mesa"; si no, entra directo a la cola de cocina.
    void sendNewOrderPush(restaurantId, order);
    emitToKitchen(restaurantId, SocketEvents.ORDER_NEW, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      channel: order.channel,
      // Sin `status` la Estación de Impresión daba por confirmada la comanda y la imprimía
      // antes de que nadie la aceptara (todo pedido por QR nace en NEEDS_CONFIRMATION).
      status: order.status,
      tableId: order.tableId,
      table: order.table ? { number: order.table.number, zoneName: order.table.zone?.name ?? null } : null,
      placedByUser: order.placedByUser?.name ?? null,
      customerName: order.customerName,
      items: order.items.map((i) => ({
        name: i.productName,
        variantName: i.variantName,
        quantity: i.quantity,
        // Congelados en el pedido: la Estación de Impresión los usa para mostrar
        // el monto de cada ítem en el recibo (la comanda de cocina los ignora).
        unitPrice: i.unitPrice.toString(),
        lineTotal: i.lineTotal.toString(),
        modifiers: i.modifiers.map((m) => ({ name: m.name, priceBase: m.priceBase.toString(), quantity: m.quantity })),
        note: i.note,
        // Estación de cocina de este producto (snapshot congelado al crear el pedido):
        // la Estación de Impresión la usa para mandar cada comanda a la impresora
        // que el usuario asignó a esa cocina.
        kitchenName: i.kitchenName,
      })),
      subtotalBase: order.subtotalBase,
      serviceChargeBase: order.serviceChargeBase,
      ivaBase: order.ivaBase,
      totalBase: order.totalBase,
      currency: order.currency,
      exchangeRate: order.exchangeRate,
      totalBs: order.totalBs,
      createdAt: order.createdAt,
    });

    return order;
  },

  /**
   * -------------------------------------------------------------------------
   *  PEDIDO MANUAL (staff, ej. Mesero, desde "Órdenes de Mesa")
   *  Mismo motor que checkoutDineIn, pero el tenant ya se conoce por el JWT
   *  (no por qrToken) y no se valida `orderingEnabled`: ese flag pausa el
   *  autoservicio del cliente, no aplica a que el staff cargue un pedido.
   * -------------------------------------------------------------------------
   */
  async createManualOrder(restaurantId: string, input: ManualOrderInput, placedByUserId?: string, placedByRole?: string) {
    // Pedido generado por el kiosco de autoservicio (rol Comanda): no hay cajero presente
    // para cobrar en el momento, así que el pedido espera confirmación de pago antes de
    // llegar a cocina (ver `addPayment`, que lo pasa a KITCHEN al saldarse por completo).
    const isKioskOrder = placedByRole === 'COMANDA';
    // Un pedido que el propio staff carga a mano (Mesero/Cajero/Admin/Dueño) ya fue
    // verificado por quien lo tomó — entra directo a cocina, sin esperar que alguien
    // más lo acepte (a diferencia de los pedidos que llegan solos desde el cliente).
    const isStaffPlaced = !!placedByUserId && !isKioskOrder;
    await assertRestaurantOpen(restaurantId);
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        baseCurrency: true,
        serviceChargeEnabled: true,
        ivaEnabled: true,
        deliveryPricingMode: true,
        deliveryOriginLat: true,
        deliveryOriginLng: true,
        deliveryBaseFee: true,
        deliveryPricePerKm: true,
      },
    });
    if (!restaurant) throw notFound('Restaurante no encontrado.');

    // Cliente elegido del directorio (wizard → paso Clientes): sus datos rellenan
    // los campos de contacto que no vinieron sueltos en el formulario.
    const resolvedCustomer = input.customerId
      ? await prisma.customer.findFirst({ where: { id: input.customerId, restaurantId } })
      : null;
    // El kiosco no captura estos datos del cliente — mismos valores genéricos que ya
    // se usan para Barra/Pickup cargados desde Comanda, para no bloquear la apertura
    // de la cuenta de mesa cuando "Comer Aquí" abre una mesa nueva.
    const customerName = input.customerName || resolvedCustomer?.name || (isKioskOrder ? 'Autoservicio (kiosco)' : undefined);
    const customerPhone = input.customerPhone || resolvedCustomer?.phone || (isKioskOrder ? '0000000000' : undefined);
    const customerIdNumber =
      input.customerIdNumber || resolvedCustomer?.idNumber || (isKioskOrder ? 'AUTOSERVICIO' : undefined);
    const customerAddress = input.customerAddress || resolvedCustomer?.address || undefined;

    const currency = restaurant.baseCurrency;
    const rate = await exchangeRateService.getRate(currency, restaurantId);

    const lines = await priceCart(restaurantId, input.items);
    const subtotalBase = sumSubtotal(lines);
    const { serviceChargeBase, ivaBase } = calculateCharges(subtotalBase, restaurant);

    const customerPoint =
      input.channel === 'DELIVERY' && input.customerLat != null && input.customerLng != null
        ? { lat: input.customerLat, lng: input.customerLng }
        : null;
    // El staff puede escribir el envío a mano (pedido por teléfono sin GPS, dirección fuera de
    // toda zona, o restaurante que nunca configuró tarifas). Si viene, manda sobre el cálculo
    // automático; si no, se cotiza como siempre.
    const deliveryFeeIsManual = input.channel === 'DELIVERY' && input.deliveryFeeBase != null;
    const deliveryFeeBase = deliveryFeeIsManual
      ? round2(toDecimal(input.deliveryFeeBase!))
      : await computeDeliveryFee({ id: restaurantId, ...restaurant }, customerPoint, true);
    const envaseFeeBase = await computeEnvaseFee(restaurantId, input.channel, input.items);
    const totalBase = round2(subtotalBase.add(serviceChargeBase).add(ivaBase).add(deliveryFeeBase).add(envaseFeeBase));
    const totalBs = baseToBs(totalBase, rate.rateBs);

    const itemsCreate = lines.map((l) => buildOrderItemCreateData(l));

    const order =
      input.channel === 'DINE_IN'
        ? await (async () => {
            const table = await prisma.table.findFirst({ where: { id: input.tableId, restaurantId } });
            if (!table || !table.isActive) throw notFound('Mesa no válida.');
            // Mesa unida: la cuenta vive en la principal, así el grupo paga una sola.
            const accountTableId = primaryTableIdOf(table);

            return prisma.$transaction(async (tx) => {
              let session: { id: string; customerName: string; customerIdNumber: string; customerPhone: string | null } | null = null;

              if (input.sessionId) {
                // Agregar a una cuenta específica (mesa con varias cuentas abiertas).
                session = await tx.tableSession.findFirst({
                  where: { id: input.sessionId, tableId: accountTableId, restaurantId, status: 'OPEN' },
                });
                if (!session) throw badRequest('Esa cuenta no existe o ya no está abierta.');
              } else if (!input.openNewAccount) {
                // Comportamiento de siempre: reusa la única cuenta abierta de la mesa, si la tiene.
                session = await tx.tableSession.findFirst({ where: { tableId: accountTableId, status: 'OPEN' } });
              }

              if (!session) {
                if (!customerName || !customerIdNumber || !customerPhone) {
                  throw badRequest('Faltan los datos de facturación (nombre, cédula y teléfono) para abrir la cuenta.');
                }
                session = await tx.tableSession.create({
                  data: {
                    restaurantId,
                    tableId: accountTableId,
                    customerName,
                    customerIdNumber,
                    customerPhone,
                    label: input.accountLabel,
                  },
                });
              }

              const orderNumber = await nextOrderNumber(tx, restaurantId);
              return tx.order.create({
                data: {
                  restaurantId,
                  orderNumber,
                  channel: 'DINE_IN',
                  // Cargado por staff: entra directo a cocina. Un pedido de kiosco (Comanda)
                  // en cambio espera confirmación de pago primero.
                  status: isKioskOrder ? 'NEEDS_PAYMENT' : isStaffPlaced ? 'KITCHEN' : 'PENDING',
                  tableId: accountTableId,
                  tableSessionId: session.id,
                  customerName: session.customerName,
                  customerIdNumber: session.customerIdNumber,
                  customerPhone: session.customerPhone,
                  placedByUserId,
                  currency,
                  subtotalBase,
                  serviceChargeBase,
                  ivaBase,
                  deliveryFeeBase,
                  envaseFeeBase,
                  totalBase,
                  exchangeRate: rate.rateBs,
                  totalBs,
                  awaitingPayment: input.paymentIntent === 'DEBT',
                  paymentMethod: input.paymentMethod,
                  items: { create: itemsCreate },
                },
                include: {
                  items: { include: { modifiers: true } },
                  table: { select: { number: true, zone: { select: { name: true } } } },
                  placedByUser: { select: { name: true } },
                },
              });
            });
          })()
        : // DELIVERY / PICKUP cargado a mano (ej. pedido por teléfono): sin mesa, PENDING hasta aceptarlo.
          await prisma.$transaction(async (tx) => {
            const orderNumber = await nextOrderNumber(tx, restaurantId);
            return tx.order.create({
              data: {
                restaurantId,
                orderNumber,
                channel: input.channel,
                // Cargado por staff: entra directo a cocina. Un pedido de kiosco (Comanda)
                // en cambio espera confirmación de pago primero.
                status: isKioskOrder ? 'NEEDS_PAYMENT' : isStaffPlaced ? 'KITCHEN' : 'PENDING',
                customerName,
                customerPhone,
                customerAddress: input.channel === 'DELIVERY' ? customerAddress : undefined,
                customerLat: input.channel === 'DELIVERY' ? input.customerLat : undefined,
                customerLng: input.channel === 'DELIVERY' ? input.customerLng : undefined,
                awaitingPayment: input.paymentIntent === 'DEBT',
                paymentMethod: input.paymentMethod,
                customerNote: input.customerNote,
                placedByUserId,
                currency,
                subtotalBase,
                serviceChargeBase,
                ivaBase,
                deliveryFeeBase,
                deliveryFeeManual: deliveryFeeIsManual,
                envaseFeeBase,
                totalBase,
                exchangeRate: rate.rateBs,
                totalBs,
                items: { create: itemsCreate },
              },
              include: {
                items: { include: { modifiers: true } },
                table: { select: { number: true, zone: { select: { name: true } } } },
                placedByUser: { select: { name: true } },
              },
            });
          });

    await customerService.upsertFromOrder(restaurantId, {
      name: order.customerName,
      phone: order.customerPhone,
      idNumber: order.customerIdNumber,
      address: order.customerAddress,
    });

    // Un pedido de kiosco recién creado (NEEDS_PAYMENT) no debe imprimirse en cocina
    // todavía — solo el ticket de "Número de orden" para que el cliente vaya a pagar.
    // La comanda real se dispara desde `addPayment` cuando caja lo salda por completo.
    if (isKioskOrder) {
      emitToKitchen(restaurantId, SocketEvents.PRINT_REQUEST, {
        type: 'orden-numero',
        orderId: order.id,
        orderNumber: order.orderNumber,
        channel: order.channel,
        paymentMethod: order.paymentMethod,
      });
    }

    void sendNewOrderPush(restaurantId, order);
    emitToKitchen(restaurantId, SocketEvents.ORDER_NEW, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      channel: order.channel,
      status: order.status,
      tableId: order.tableId,
      table: order.table ? { number: order.table.number, zoneName: order.table.zone?.name ?? null } : null,
      placedByUser: order.placedByUser?.name ?? null,
      customerName: order.customerName,
      items: order.items.map((i) => ({
        name: i.productName,
        variantName: i.variantName,
        quantity: i.quantity,
        // Congelados en el pedido: la Estación de Impresión los usa para mostrar
        // el monto de cada ítem en el recibo (la comanda de cocina los ignora).
        unitPrice: i.unitPrice.toString(),
        lineTotal: i.lineTotal.toString(),
        modifiers: i.modifiers.map((m) => ({ name: m.name, priceBase: m.priceBase.toString(), quantity: m.quantity })),
        note: i.note,
        // Estación de cocina de este producto (snapshot congelado al crear el pedido):
        // la Estación de Impresión la usa para mandar cada comanda a la impresora
        // que el usuario asignó a esa cocina.
        kitchenName: i.kitchenName,
      })),
      subtotalBase: order.subtotalBase,
      serviceChargeBase: order.serviceChargeBase,
      ivaBase: order.ivaBase,
      totalBase: order.totalBase,
      currency: order.currency,
      exchangeRate: order.exchangeRate,
      totalBs: order.totalBs,
      createdAt: order.createdAt,
    });

    return order;
  },

  /**
   * -------------------------------------------------------------------------
   *  CANAL DELIVERY / PICKUP (WhatsApp)
   *  Persiste la comanda y devuelve el enlace `wa.me` con el pedido
   *  formateado listo para enviar al WhatsApp del restaurante.
   * -------------------------------------------------------------------------
   */
  /**
   * Cotización en vivo del costo de envío (sin crear el pedido): el checkout
   * la llama apenas el cliente comparte su ubicación, para mostrarla antes
   * de enviar el pedido.
   */
  async getDeliveryQuote(restaurantSlug: string, lat: number, lng: number) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: restaurantSlug },
      select: {
        id: true,
        isActive: true,
        baseCurrency: true,
        deliveryPricingMode: true,
        deliveryOriginLat: true,
        deliveryOriginLng: true,
        deliveryBaseFee: true,
        deliveryPricePerKm: true,
      },
    });
    if (!restaurant || !restaurant.isActive) throw notFound('Restaurante no encontrado.');

    const feeBase = await computeDeliveryFee(restaurant, { lat, lng });
    const rate = await exchangeRateService.getRate(restaurant.baseCurrency, restaurant.id);
    const feeBs = baseToBs(feeBase, rate.rateBs);

    return { feeBase: feeBase.toFixed(2), feeBs: feeBs.toFixed(2), currency: restaurant.baseCurrency };
  },

  async checkoutDelivery(restaurantSlug: string, input: DeliveryCheckoutInput) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: restaurantSlug },
      select: {
        id: true,
        name: true,
        baseCurrency: true,
        whatsappPhone: true,
        isActive: true,
        orderingEnabled: true,
        serviceChargeEnabled: true,
        ivaEnabled: true,
        deliveryPricingMode: true,
        deliveryOriginLat: true,
        deliveryOriginLng: true,
        deliveryBaseFee: true,
        deliveryPricePerKm: true,
        whatsappBotEnabled: true,
        whatsappBotNotifyReceived: true,
        whatsappBotPaymentVerifierPhone: true,
        whatsappOrderMode: true,
        paymentMethodsConfig: true,
      },
    });
    if (!restaurant || !restaurant.isActive) throw notFound('Restaurante no encontrado.');
    if (!restaurant.orderingEnabled) {
      throw badRequest('Este restaurante no está aceptando pedidos en este momento.');
    }
    if (!restaurant.whatsappPhone) {
      throw badRequest('El restaurante no tiene un número de WhatsApp configurado.');
    }
    await assertRestaurantOpen(restaurant.id);

    const restaurantId = restaurant.id;
    const rate = await exchangeRateService.getRate(restaurant.baseCurrency, restaurantId);
    const lines = await priceCart(restaurantId, input.items);
    const subtotalBase = sumSubtotal(lines);
    const { serviceChargeBase, ivaBase } = calculateCharges(subtotalBase, restaurant);

    const customerPoint =
      input.mode === 'DELIVERY' && input.customer.lat != null && input.customer.lng != null
        ? { lat: input.customer.lat, lng: input.customer.lng }
        : null;
    const deliveryFeeBase = await computeDeliveryFee(restaurant, customerPoint, true);
    const envaseFeeBase = await computeEnvaseFee(restaurantId, input.mode, input.items);
    const totalBase = round2(subtotalBase.add(serviceChargeBase).add(ivaBase).add(deliveryFeeBase).add(envaseFeeBase));
    const totalBs = baseToBs(totalBase, rate.rateBs);

    const order = await prisma.$transaction(async (tx) => {
      const orderNumber = await nextOrderNumber(tx, restaurantId);
      return tx.order.create({
        data: {
          restaurantId,
          orderNumber,
          channel: input.mode, // DELIVERY | PICKUP
          status: 'PENDING',
          currency: restaurant.baseCurrency,
          subtotalBase,
          serviceChargeBase,
          ivaBase,
          deliveryFeeBase,
          envaseFeeBase,
          totalBase,
          exchangeRate: rate.rateBs,
          totalBs,
          customerName: input.customer.name,
          customerPhone: input.customer.phone,
          customerAddress: input.customer.locationUrl
            ? [input.customer.address, input.customer.locationUrl].filter(Boolean).join(' — ')
            : input.customer.address,
          customerLat: customerPoint?.lat,
          customerLng: customerPoint?.lng,
          paymentMethod: input.customer.paymentMethod,
          customerNote: input.customer.note,
          items: {
            create: lines.map((l) => buildOrderItemCreateData(l)),
          },
        },
        include: { items: { include: { modifiers: true } } },
      });
    });

    await customerService.upsertFromOrder(restaurantId, {
      name: order.customerName,
      phone: order.customerPhone,
      idNumber: order.customerIdNumber,
      address: order.customerAddress,
    });

    // Notifica en vivo a la sección Delivery (y a Cocina, que también lista todos los canales).
    // Incluye teléfono/dirección/método de pago: la Estación de Impresión los usa para armar
    // la comanda de delivery (nombre + monto + descripción + ubicación, todo junto) cuando el
    // restaurante acepte el pedido (ver acceptOrder más abajo — ahí es cuando se imprime).
    void sendNewOrderPush(restaurantId, order);
    emitToKitchen(restaurantId, SocketEvents.ORDER_NEW, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      channel: order.channel,
      status: order.status,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerAddress: order.customerAddress,
      customerNote: order.customerNote,
      paymentMethod: order.paymentMethod,
      deliveryFeeBase: order.deliveryFeeBase,
      items: order.items.map((i) => ({
        name: i.productName,
        variantName: i.variantName,
        quantity: i.quantity,
        // Congelados en el pedido: la Estación de Impresión los usa para mostrar
        // el monto de cada ítem en el recibo (la comanda de cocina los ignora).
        unitPrice: i.unitPrice.toString(),
        lineTotal: i.lineTotal.toString(),
        modifiers: i.modifiers.map((m) => ({ name: m.name, priceBase: m.priceBase.toString(), quantity: m.quantity })),
        note: i.note,
        // Estación de cocina de este producto (snapshot congelado al crear el pedido):
        // la Estación de Impresión la usa para mandar cada comanda a la impresora
        // que el usuario asignó a esa cocina.
        kitchenName: i.kitchenName,
      })),
      subtotalBase: order.subtotalBase,
      serviceChargeBase: order.serviceChargeBase,
      ivaBase: order.ivaBase,
      totalBase: order.totalBase,
      currency: order.currency,
      exchangeRate: order.exchangeRate,
      totalBs: order.totalBs,
      createdAt: order.createdAt,
    });

    // El teléfono del cliente se captura en formato local venezolano (ej. "0424-1234567", sin
    // código de país) en el checkout — hay que normalizarlo a internacional antes de armar el
    // JID de WhatsApp (toJid solo limpia dígitos, no agrega el 58), o el bot manda el mensaje a
    // un contacto inexistente y falla en silencio.
    const customerWhatsapp = order.customerPhone ? formatVenezuelanWhatsappPhone(order.customerPhone) : null;

    // Chatbot de WhatsApp (vinculado por QR, ver whatsapp-bot.service.ts): avisa solo al
    // cliente que su pedido llegó — no reemplaza el enlace wa.me de abajo (ese lo manda el
    // cliente al restaurante), es un mensaje aparte que sale DEL restaurante hacia el cliente.
    if ((restaurant.whatsappBotEnabled || (await whatsappLinkService.vinculado(restaurant.id))) && restaurant.whatsappBotNotifyReceived) {
      whatsappBotService
        .sendMessage(
          restaurant.id,
          customerWhatsapp,
          frase(
            `✅ *${restaurant.name}*\n\nRecibimos tu pedido #${order.orderNumber}. ¡Ya lo estamos preparando!`,
            `✅ *${restaurant.name}*\n\n¡Listo! Tu pedido #${order.orderNumber} entró a cocina.`,
            `✅ *${restaurant.name}*\n\nTu pedido #${order.orderNumber} quedó registrado y ya está en preparación.`,
          ),
        )
        .catch(() => undefined);
    }

    // Chatbot: dos modos posibles (Restaurant.whatsappOrderMode), mutuamente excluyentes.
    // FULL_ORDER: manda el pedido completo al propio WhatsApp del negocio
    // (whatsappBotPaymentVerifierPhone) para CUALQUIER método de pago, y espera que el
    // negocio confirme "Aprobado" a mano (sin pedirle comprobante al cliente). PAYMENT_
    // VERIFICATION (default): si el método exige comprobante (Pago Móvil/Zelle/Binance/
    // PayPal/Transferencia), manda los datos de pago al cliente y espera su foto. Ambos
    // casos reutilizan la misma verificación (ver order-payment-verification.service.ts)
    // para que, al aprobarse, el pedido pase solo a cocina.
    // Los dos modos de verificación abren también con el WhatsApp VINCULADO (Evolution): la
    // ida sale por sendMessage/sendImage y la vuelta —el "Aprobado" del verificador, la foto
    // del cliente— entra por el webhook (ver whatsapp-link.service.procesarMensajeEntrante).
    const canalActivo = restaurant.whatsappBotEnabled || (await whatsappLinkService.vinculado(restaurantId));
    if (canalActivo && customerWhatsapp && restaurant.whatsappBotPaymentVerifierPhone && restaurant.whatsappOrderMode === 'FULL_ORDER') {
      const { shouldForwardNow } = await orderPaymentVerificationService.createAwaitingVerifierOrQueue(
        restaurantId,
        order.id,
        customerWhatsapp,
      );
      if (shouldForwardNow) {
        const fullOrder = await prisma.order.findUnique({ where: { id: order.id }, include: { items: true } });
        if (fullOrder) {
          whatsappBotService
            .sendMessage(restaurant.id, restaurant.whatsappBotPaymentVerifierPhone, whatsappBotService.buildFullOrderCaption(fullOrder))
            .catch(() => undefined);
        }
      }
    } else if (
      canalActivo &&
      customerWhatsapp &&
      order.paymentMethod &&
      PROOF_REQUIRED_PAYMENT_METHODS.includes(order.paymentMethod)
    ) {
      const methodConfig = (restaurant.paymentMethodsConfig as Record<string, Record<string, unknown>> | null)?.[
        order.paymentMethod
      ];
      const text = renderPaymentInstructions({
        restaurantName: restaurant.name,
        methodLabel: PAYMENT_LABELS[order.paymentMethod],
        methodConfig,
        totalBase: order.totalBase.toString(),
        totalBs: order.totalBs.toString(),
        currencySymbol: CURRENCY_SYMBOLS[restaurant.baseCurrency],
      });
      whatsappBotService.sendMessage(restaurant.id, customerWhatsapp, text).catch(() => undefined);
      orderPaymentVerificationService.create(restaurantId, order.id, customerWhatsapp).catch(() => undefined);
    }

    // Construye el enlace de WhatsApp con el pedido ya congelado.
    const whatsapp = buildWhatsappCheckoutUrl({
      restaurantName: restaurant.name,
      whatsappPhone: restaurant.whatsappPhone,
      currencySymbol: CURRENCY_SYMBOLS[restaurant.baseCurrency],
      exchangeRate: rate.rateBs.toString(),
      mode: input.mode,
      items: lines.map((l) => ({
        name: l.productName,
        variantName: l.variantName ?? undefined,
        quantity: l.quantity,
        unitPrice: l.unitPrice.toString(),
        modifiers: l.modifiers.map((m) => ({ name: m.name, priceBase: m.priceBase.toString(), quantity: m.quantity })),
        note: l.note,
      })),
      customer: input.customer,
      serviceChargeBase: serviceChargeBase.toString(),
      ivaBase: ivaBase.toString(),
      deliveryFeeBase: deliveryFeeBase.toString(),
      envaseFeeBase: envaseFeeBase.toString(),
    });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      subtotalBase: order.subtotalBase,
      totalBs: order.totalBs,
      whatsappUrl: whatsapp.url,
    };
  },

  /** Cola de comandas de la cocina (panel del restaurante). */
  async listKitchenQueue(restaurantId: string) {
    return prisma.order.findMany({
      where: { restaurantId, status: { in: ['PENDING', 'KITCHEN'] } },
      orderBy: { createdAt: 'asc' },
      include: { items: { include: { modifiers: true } }, table: { select: { number: true } } },
    });
  },

  /** Cola de la sección Delivery: solo pedidos DELIVERY/PICKUP (WhatsApp) activos. */
  async listDeliveryQueue(restaurantId: string) {
    return prisma.order.findMany({
      where: { restaurantId, channel: { in: ['DELIVERY', 'PICKUP'] }, status: { in: ['PENDING', 'KITCHEN'] } },
      orderBy: { createdAt: 'asc' },
      include: { items: { include: { modifiers: true } } },
    });
  },

  /** Edita cantidades de un pedido ya creado (Delivery). quantity: 0 quita el ítem del pedido. */
  async updateItems(restaurantId: string, orderId: string, updates: UpdateOrderItemsInput['items']) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: { items: { include: { modifiers: true } } },
    });
    if (!order) throw notFound('Comanda no encontrada.');
    if (order.status === 'SERVED' || order.status === 'CANCELLED') {
      throw badRequest('No se puede editar un pedido ya finalizado o cancelado.');
    }

    const itemById = new Map(order.items.map((i) => [i.id, i]));
    for (const u of updates) {
      const item = itemById.get(u.orderItemId);
      if (!item) throw badRequest('Uno de los productos no pertenece a este pedido.');
      // No se puede reducir/quitar un producto por debajo de lo que ya se cobró (fraccionado por ítems)
      // — la plata ya cobrada quedaría sin producto que la respalde.
      if (u.quantity < item.paidQuantity) {
        throw badRequest(`No se puede reducir "${item.productName}" por debajo de lo ya cobrado (${item.paidQuantity}).`);
      }
    }

    const updateQty = new Map(updates.map((u) => [u.orderItemId, u.quantity]));
    const remaining = order.items
      .map((it) => ({ ...it, quantity: updateQty.get(it.id) ?? it.quantity }))
      .filter((it) => it.quantity > 0);

    if (remaining.length === 0) {
      throw badRequest('El pedido debe tener al menos un producto.');
    }

    const subtotalBase = round2(
      remaining.reduce((acc, it) => acc.add(it.unitPrice.mul(it.quantity)), toDecimal(0)),
    );
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { serviceChargeEnabled: true, ivaEnabled: true },
    });
    const { serviceChargeBase, ivaBase } = calculateCharges(subtotalBase, restaurant!);
    const envaseFeeBase = await computeEnvaseFee(restaurantId, order.channel, remaining);
    const totalBase = round2(subtotalBase.add(serviceChargeBase).add(ivaBase).add(order.deliveryFeeBase).add(envaseFeeBase));
    const totalBs = baseToBs(totalBase, order.exchangeRate);

    await prisma.$transaction(async (tx) => {
      for (const u of updates) {
        if (u.quantity <= 0) {
          await tx.orderItem.delete({ where: { id: u.orderItemId } });
        } else {
          const original = itemById.get(u.orderItemId)!;
          await tx.orderItem.update({
            where: { id: u.orderItemId },
            data: { quantity: u.quantity, lineTotal: round2(original.unitPrice.mul(u.quantity)) },
          });
        }
      }
      await tx.order.update({
        where: { id: orderId },
        data: { subtotalBase, serviceChargeBase, ivaBase, envaseFeeBase, totalBase, totalBs },
      });
    });

    const updated = await prisma.order.findUnique({ where: { id: orderId }, include: { items: { include: { modifiers: true } } } });
    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, { orderId, status: updated!.status });
    return updated;
  },

  /** "Entregado": el mesero lo marca cuando de verdad lleva el producto a la mesa/cliente —
   * aparte de kitchenReadyAt (que solo dice que cocina ya lo tiene listo). Es la condición que
   * usa returnItem para pedir motivo: bajar algo que nunca se marcó entregado es una simple
   * corrección, no una devolución. */
  async markItemDelivered(restaurantId: string, orderId: string, orderItemId: string, delivered: boolean) {
    const item = await prisma.orderItem.findFirst({
      where: { id: orderItemId, order: { id: orderId, restaurantId } },
      include: { order: { select: { status: true } } },
    });
    if (!item) throw notFound('Producto no encontrado en este pedido.');
    const updated = await prisma.orderItem.update({
      where: { id: orderItemId },
      data: { deliveredAt: delivered ? new Date() : null },
    });
    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, { orderId, status: item.order.status });
    return updated;
  },

  /** Quitar/reducir un ítem YA entregado: a diferencia del "−" de siempre (updateItems, una
   * corrección antes de que salga), esto es una devolución — pide motivo y lo deja registrado
   * en Merma (WasteRecord, reason=CUSTOMER_RETURN/PREPARATION/DAMAGED/OTHER) para que aparezca
   * en su propia estadística (Inventario → Merma, agrupado por motivo) en vez de perderse como
   * un simple ajuste de cantidad. No repone inventario: lo que se cocinó ya consumió sus
   * insumos y no vuelve a la nevera por devolverse — es pérdida, igual que cualquier merma. */
  async returnItem(restaurantId: string, orderId: string, orderItemId: string, userId: string | undefined, input: ReturnOrderItemInput) {
    const item = await prisma.orderItem.findFirst({ where: { id: orderItemId, order: { id: orderId, restaurantId } } });
    if (!item) throw notFound('Producto no encontrado en este pedido.');
    if (!item.deliveredAt) {
      throw badRequest('Solo se pide motivo al quitar algo que ya se marcó "Entregado" — para lo demás, usa +/−.');
    }
    if (!item.productId) {
      throw badRequest('Este producto ya no existe en el catálogo; no se puede registrar la devolución.');
    }
    if (input.quantity > item.quantity - item.paidQuantity) {
      throw badRequest(`Solo puedes devolver hasta ${item.quantity - item.paidQuantity} de "${item.productName}" (lo demás ya está cobrado).`);
    }

    // Primero el asiento de merma (así si falla, el producto sigue completo en el pedido —
    // nunca se "pierde" una línea sin dejar el motivo registrado); recién con eso hecho se
    // reduce/quita la línea con la misma lógica de updateItems (recalcula subtotal/servicio/IVA/total).
    await wasteService.create(restaurantId, userId, {
      productId: item.productId,
      quantity: input.quantity,
      reason: input.reason,
      note: input.note,
      adjustStock: false,
    });
    return this.updateItems(restaurantId, orderId, [{ orderItemId, quantity: item.quantity - input.quantity }]);
  },

  /** Añade un producto nuevo a un pedido ya creado (panel de Pedidos en vivo). */
  // Nota: a diferencia de checkoutDineIn/checkoutDelivery/createManualOrder (que SÍ
  // exigen que el restaurante esté abierto para arrancar un pedido nuevo), este método
  // solo AÑADE una línea a un pedido que ya existe — el horario público no debe bloquear
  // que el staff termine de editar una comanda ya en curso.
  async addItem(restaurantId: string, orderId: string, input: AddOrderItemInput) {
    const order = await prisma.order.findFirst({ where: { id: orderId, restaurantId }, include: { items: { include: { modifiers: true } } } });
    if (!order) throw notFound('Comanda no encontrada.');
    if (order.status === 'SERVED' || order.status === 'CANCELLED') {
      throw badRequest('No se puede editar un pedido ya finalizado o cancelado.');
    }

    const [line] = await priceCart(restaurantId, [
      { productId: input.productId, quantity: input.quantity, variantId: input.variantId, modifierIds: input.modifierIds, note: input.note },
    ]);

    const subtotalBase = round2(
      order.items
        .reduce((acc, it) => acc.add(it.unitPrice.mul(it.quantity)), toDecimal(0))
        .add(line.lineTotal),
    );
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { serviceChargeEnabled: true, ivaEnabled: true },
    });
    const { serviceChargeBase, ivaBase } = calculateCharges(subtotalBase, restaurant!);
    const envaseFeeBase = await computeEnvaseFee(restaurantId, order.channel, [
      ...order.items,
      { productId: line.productId, quantity: line.quantity },
    ]);
    const totalBase = round2(subtotalBase.add(serviceChargeBase).add(ivaBase).add(order.deliveryFeeBase).add(envaseFeeBase));
    const totalBs = baseToBs(totalBase, order.exchangeRate);

    await prisma.$transaction([
      prisma.orderItem.create({
        data: { orderId, ...buildOrderItemCreateData(line) },
      }),
      prisma.order.update({
        where: { id: orderId },
        data: { subtotalBase, serviceChargeBase, ivaBase, envaseFeeBase, totalBase, totalBs },
      }),
    ]);

    const updated = await prisma.order.findUnique({ where: { id: orderId }, include: { items: { include: { modifiers: true } } } });
    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, { orderId, status: updated!.status });
    return updated;
  },

  /** Edita los datos del cliente de un pedido ya creado (nombre, teléfono, dirección, nota). */
  async updateCustomer(restaurantId: string, orderId: string, input: UpdateOrderCustomerInput) {
    const existing = await prisma.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!existing) throw notFound('Comanda no encontrada.');
    if (existing.status === 'SERVED' || existing.status === 'CANCELLED') {
      throw badRequest('No se puede editar un pedido ya finalizado o cancelado.');
    }

    // Mover la ubicación de un delivery cambia lo que cuesta llevarlo: si la dirección pasa a
    // otra zona (o a otra distancia) hay que recotizar y rehacer el total. Sin esto el pedido se
    // quedaba con el envío de la dirección vieja — el restaurante perdía la diferencia al alejarse
    // y le cobraba de más al cliente al acercarse. El envío manual (deliveryFeeManual) se respeta:
    // si alguien lo fijó a mano, mover el pin no se lo pisa.
    const movedLocation =
      existing.channel === 'DELIVERY' &&
      !existing.deliveryFeeManual &&
      (input.customerLat !== undefined || input.customerLng !== undefined);

    let recalculated: { deliveryFeeBase: Prisma.Decimal; totalBase: Prisma.Decimal; totalBs: Prisma.Decimal } | null = null;
    if (movedLocation) {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          id: true,
          deliveryPricingMode: true,
          deliveryOriginLat: true,
          deliveryOriginLng: true,
          deliveryBaseFee: true,
          deliveryPricePerKm: true,
        },
      });
      const lat = input.customerLat ?? existing.customerLat;
      const lng = input.customerLng ?? existing.customerLng;
      const customerPoint = lat != null && lng != null ? { lat, lng } : null;
      const deliveryFeeBase = await computeDeliveryFee(restaurant!, customerPoint, true);
      const totalBase = round2(
        existing.subtotalBase
          .add(existing.serviceChargeBase)
          .add(existing.ivaBase)
          .add(deliveryFeeBase)
          .add(existing.envaseFeeBase),
      );
      recalculated = { deliveryFeeBase, totalBase, totalBs: baseToBs(totalBase, existing.exchangeRate) };
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { ...input, ...(recalculated ?? {}) },
    });
    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, { orderId, status: updated.status });
    return updated;
  },

  /** Cambia el tipo (canal) de un pedido ya creado, ej. de Mesa a Delivery o viceversa. */
  async changeChannel(restaurantId: string, orderId: string, input: ChangeChannelInput) {
    const existing = await prisma.order.findFirst({ where: { id: orderId, restaurantId }, include: { items: true } });
    if (!existing) throw notFound('Comanda no encontrada.');
    if (existing.status === 'SERVED' || existing.status === 'CANCELLED') {
      throw badRequest('No se puede editar un pedido ya finalizado o cancelado.');
    }
    if (input.channel === existing.channel) return existing;

    let tableId: string | null = null;
    let tableSessionId: string | null = null;
    let deliveryFeeBase = toDecimal(0);
    let customerAddress: string | null = existing.customerAddress;
    let customerLat: number | null = existing.customerLat;
    let customerLng: number | null = existing.customerLng;

    if (input.channel === 'DINE_IN') {
      const table = await prisma.table.findFirst({ where: { id: input.tableId, restaurantId } });
      if (!table || !table.isActive) throw notFound('Mesa no válida.');
      // Mesa unida: la cuenta vive en la principal, así el grupo paga una sola.
      const accountTableId = primaryTableIdOf(table);

      const openSessions = await tableSessionService.listOpenForTable(accountTableId);
      if (openSessions.length > 1) {
        throw conflict('Esta mesa tiene varias cuentas abiertas — usa "Generar orden" desde Mesas para elegir a cuál agregarlo.');
      }
      if (openSessions.length === 1) {
        tableSessionId = openSessions[0].id;
      } else {
        if (!existing.customerName || !existing.customerIdNumber || !existing.customerPhone) {
          throw badRequest(
            'Faltan los datos de facturación (nombre, cédula y teléfono) del cliente para abrir la cuenta en esta mesa. Edítalos primero en "Datos del cliente".',
          );
        }
        const session = await prisma.tableSession.create({
          data: {
            restaurantId,
            tableId: accountTableId,
            customerName: existing.customerName,
            customerIdNumber: existing.customerIdNumber,
            customerPhone: existing.customerPhone,
          },
        });
        tableSessionId = session.id;
      }
      tableId = accountTableId;
      customerAddress = null;
      customerLat = null;
      customerLng = null;
    } else if (input.channel === 'DELIVERY') {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { id: true, deliveryPricingMode: true, deliveryOriginLat: true, deliveryOriginLng: true, deliveryBaseFee: true, deliveryPricePerKm: true },
      });
      const customerPoint = input.customerLat != null && input.customerLng != null ? { lat: input.customerLat, lng: input.customerLng } : null;
      deliveryFeeBase = await computeDeliveryFee(restaurant!, customerPoint, true);
      customerAddress = input.customerAddress!;
      customerLat = input.customerLat ?? null;
      customerLng = input.customerLng ?? null;
    } else {
      // PICKUP / BAR: sin mesa ni envío.
      customerAddress = null;
      customerLat = null;
      customerLng = null;
    }

    const envaseFeeBase = await computeEnvaseFee(restaurantId, input.channel, existing.items);
    const totalBase = round2(
      existing.subtotalBase.add(existing.serviceChargeBase).add(existing.ivaBase).add(deliveryFeeBase).add(envaseFeeBase),
    );
    const totalBs = baseToBs(totalBase, existing.exchangeRate);

    const updated = await prisma.$transaction(async (tx) => {
      return tx.order.update({
        where: { id: orderId },
        data: {
          channel: input.channel,
          tableId,
          tableSessionId,
          customerAddress,
          customerLat,
          customerLng,
          deliveryFeeBase,
          // Cambiar de canal siempre recotiza el envío, así que deja de ser un monto manual —
          // si no, un pedido que fue a Pickup y volvió a Delivery quedaría marcado como manual
          // con un monto que en realidad calculó el sistema.
          deliveryFeeManual: false,
          envaseFeeBase,
          totalBase,
          totalBs,
        },
      });
    });

    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, { orderId, status: updated.status });
    return updated;
  },

  /** Cambia el estado de una comanda y notifica a la cocina. */
  async updateStatus(restaurantId: string, orderId: string, status: 'PENDING' | 'KITCHEN' | 'SERVED' | 'CANCELLED') {
    const existing = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: { items: { include: { modifiers: true } }, placedByUser: { select: { role: true } } },
    });
    if (!existing) throw notFound('Comanda no encontrada.');

    // Transición atómica en vez de leer-y-luego-escribir: si dos clientes marcan el
    // mismo pedido SERVED a la vez (la tablet de cocina y el teléfono del mesero, o
    // un doble toque), ambos leerían el estado viejo y el inventario se descontaría
    // dos veces. Con el updateMany condicionado al estado anterior, solo uno cuenta.
    const transition = await prisma.order.updateMany({
      where: { id: orderId, restaurantId, status: { not: status } },
      data: { status },
    });
    const statusChanged = transition.count > 0;
    const order = await prisma.order.findFirstOrThrow({ where: { id: orderId, restaurantId } });

    // Descuenta el inventario por receta y el stock simple por producto, la primera vez que se marca SERVED.
    if (status === 'SERVED' && statusChanged) {
      await deductRecipeStock(restaurantId, existing.items);
      await deductProductStock(restaurantId, existing.items);
      await deductModifierStock(restaurantId, existing.items);
      await deductPackagingStock(restaurantId, existing.channel, existing.items);
    }

    // Se cancela un pedido que YA había sido servido (se descontó inventario y nunca se
    // vendió de verdad): se devuelve, si no quedaba descontado para siempre sin razón.
    if (status === 'CANCELLED' && statusChanged && existing.status === 'SERVED') {
      await restoreServedOrderStock(restaurantId, existing);
    }

    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, {
      orderId: order.id,
      status: order.status,
    });

    // Avisa al cliente que escaneó el QR de la mesa que su pedido está listo.
    if (order.status === 'SERVED' && order.channel === 'DINE_IN' && order.tableId) {
      emitToTable(order.tableId, SocketEvents.ORDER_READY, {
        orderId: order.id,
        orderNumber: order.orderNumber,
      });
    }

    // Avisa a Caja (para despachar delivery) y al rol Numero (Autoservicio/Pickup)
    // que este pedido ya está listo — un pedido, un aviso, sin importar el canal.
    if (order.status === 'SERVED' && statusChanged) {
      emitToKitchen(restaurantId, SocketEvents.ORDER_READY_STAFF, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        channel: order.channel,
        placedByRole: existing.placedByUser?.role ?? null,
      });

      // Chatbot de WhatsApp: Pickup no pasa por dispatchToCourier (no hay repartidor), así que
      // "listo" se avisa acá — Delivery ya recibe su "en camino" al despachar con un repartidor.
      if (order.channel === 'PICKUP') {
        const restaurant = await prisma.restaurant.findUnique({
          where: { id: restaurantId },
          select: { name: true, whatsappBotEnabled: true, whatsappBotNotifyReady: true },
        });
        if ((restaurant?.whatsappBotEnabled || (await whatsappLinkService.vinculado(restaurantId))) && restaurant?.whatsappBotNotifyReady && order.customerPhone) {
          whatsappBotService
            .sendMessage(
              restaurantId,
              formatVenezuelanWhatsappPhone(order.customerPhone),
              frase(
                `✅ *${restaurant.name}*\n\n¡Tu pedido #${order.orderNumber} ya está listo para retirar!`,
                `🛍️ *${restaurant.name}*\n\nTu pedido #${order.orderNumber} te está esperando. ¡Pasa a buscarlo cuando quieras!`,
                `✅ *${restaurant.name}*\n\nYa puedes pasar por tu pedido #${order.orderNumber}.`,
              ),
            )
            .catch(() => undefined);
        }
      }
    }

    return order;
  },

  /**
   * Una estación de cocina marca lista su parte de la comanda (los ítems con
   * ese kitchenName, o sin cocina asignada si kitchenName es null). El pedido
   * completo pasa a SERVED (con sus mismos efectos: descuento de inventario,
   * aviso al cliente) solo cuando TODAS sus estaciones ya marcaron listo.
   */
  async markKitchenReady(restaurantId: string, orderId: string, kitchenName: string | null) {
    const existing = await prisma.order.findFirst({ where: { id: orderId, restaurantId }, include: { items: { include: { modifiers: true } } } });
    if (!existing) throw notFound('Comanda no encontrada.');
    if (existing.status !== 'PENDING' && existing.status !== 'KITCHEN') {
      throw badRequest('Este pedido ya no está en cocina.');
    }

    await prisma.orderItem.updateMany({
      where: { orderId, kitchenName, kitchenReadyAt: null },
      data: { kitchenReadyAt: new Date() },
    });

    const items = await prisma.orderItem.findMany({ where: { orderId } });
    const allReady = items.every((it) => it.kitchenReadyAt !== null);

    if (allReady) {
      return this.updateStatus(restaurantId, orderId, 'SERVED');
    }

    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, { orderId, status: existing.status });
    return prisma.order.findUnique({ where: { id: orderId }, include: { items: { include: { modifiers: true } }, table: { select: { number: true } } } });
  },

  /**
   * Una estación marca su parte de la comanda como "En proceso": solo pinta la tarjeta
   * (para que el cocinero sepa qué ya arrancó) sin cambiar el estado del pedido ni tocar
   * inventario. Sella kitchenStartedAt en los ítems de esa cocina que aún no lo tenían;
   * el aviso por socket sincroniza las demás pantallas de cocina.
   */
  async markKitchenStarted(restaurantId: string, orderId: string, kitchenName: string | null) {
    const existing = await prisma.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!existing) throw notFound('Comanda no encontrada.');
    if (existing.status !== 'PENDING' && existing.status !== 'KITCHEN') {
      throw badRequest('Este pedido ya no está en cocina.');
    }

    await prisma.orderItem.updateMany({
      where: { orderId, kitchenName, kitchenStartedAt: null, kitchenReadyAt: null },
      data: { kitchenStartedAt: new Date() },
    });

    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, { orderId, status: existing.status });
    return prisma.order.findUnique({ where: { id: orderId }, include: { items: { include: { modifiers: true } }, table: { select: { number: true } } } });
  },

  /**
   * Acepta un pedido que llegó solo (sin staff detrás) en NEEDS_CONFIRMATION/PENDING:
   * recién ahí llega a cocina. Cocina nunca puede aceptar — solo cocina lo que ya está
   * aceptado. Delivery/Pickup, además, solo lo puede aceptar Caja/Admin/Dueño (nunca
   * Mesero), porque implica coordinar cobro/despacho antes de mandarlo a cocina.
   */
  async acceptOrder(restaurantId: string, orderId: string, acceptedByUserId?: string, acceptedByRole?: string) {
    const existing = await prisma.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!existing) throw notFound('Comanda no encontrada.');
    if (existing.status !== 'NEEDS_CONFIRMATION' && existing.status !== 'PENDING') {
      throw badRequest('Este pedido ya fue aceptado o no está pendiente.');
    }
    if (acceptedByRole === 'KITCHEN') {
      throw forbidden('Cocina no puede aceptar pedidos.');
    }
    if (
      (existing.channel === 'DELIVERY' || existing.channel === 'PICKUP') &&
      acceptedByRole &&
      !(ADMIN_CASHIER_ROLES as readonly string[]).includes(acceptedByRole)
    ) {
      // Un Cajero con `cashierFullAccess` cuenta como Caja completa: es exactamente a quien el
      // panel le habilita el botón (isAdminCashier en web/src/utils/roles.ts). Sin esto el
      // botón se veía activo y el clic siempre respondía 403.
      const cashierAllowed =
        acceptedByRole === 'CASHIER' &&
        acceptedByUserId != null &&
        (await prisma.user.findUnique({ where: { id: acceptedByUserId }, select: { cashierFullAccess: true } }))
          ?.cashierFullAccess === true;
      if (!cashierAllowed) {
        throw forbidden(
          'Solo Administrador, Dueño o un Cajero con acceso completo pueden aceptar pedidos de delivery/pickup.',
        );
      }
    }

    // Registra quién aceptó el pedido del cliente (mesa/QR): junto con
    // placedByUserId, define qué pedidos ve el rol Mesero en el Dashboard.
    const shouldSetAcceptedBy = !existing.placedByUserId;
    // Condicionado al estado anterior: si dos cajeros aceptan el mismo pedido a la vez
    // (o uno acepta justo cuando el bot aprueba el pago), solo el primero pasa de aquí
    // y la comanda se imprime y se despacha una sola vez.
    const accepted = await prisma.order.updateMany({
      where: { id: orderId, restaurantId, status: { in: ['NEEDS_CONFIRMATION', 'PENDING'] } },
      data: { status: 'KITCHEN', acceptedByUserId: shouldSetAcceptedBy ? acceptedByUserId : undefined },
    });
    if (accepted.count === 0) throw badRequest('Este pedido ya fue aceptado o no está pendiente.');
    const order = await prisma.order.findFirstOrThrow({ where: { id: orderId, restaurantId } });

    // Mesa sin mesero asignado: el primero que acepta un pedido de esa mesa
    // se la queda de forma permanente (Equipo → "Asignar mesas" la puede
    // reasignar después a mano).
    if (shouldSetAcceptedBy && acceptedByUserId && existing.tableId) {
      await prisma.table.updateMany({
        where: { id: existing.tableId, assignedWaiterId: null },
        data: { assignedWaiterId: acceptedByUserId },
      });
    }

    await emitOrderAccepted(restaurantId, order);

    // Ajustes → Delivery: "asignar repartidor automáticamente al aceptar" — no debe
    // tumbar la aceptación del pedido si el despacho falla (sin repartidores activos,
    // WhatsApp caído, etc.), por eso es best-effort y no se espera con await.
    if (order.channel === 'DELIVERY') {
      prisma.restaurant
        .findUnique({ where: { id: restaurantId }, select: { deliveryAutoAssignOnAccept: true } })
        .then((r) => {
          if (r?.deliveryAutoAssignOnAccept) return this.autoDispatchToCourier(restaurantId, order.id);
        })
        .catch(() => undefined);
    }

    return order;
  },

  /**
   * PENDING -> KITCHEN disparado por el propio chatbot cuando el verificador de pagos
   * responde "Aprobado" (ver order-payment-verification.service.ts). A diferencia de
   * acceptOrder, no hay un humano detrás: sin guard de roles, sin asignación de mesa
   * (este flujo es exclusivo de DELIVERY/PICKUP, que nunca tienen mesa). Si el pedido
   * ya no está en PENDING (por ejemplo porque un cajero ya lo aceptó a mano viendo el
   * pago en su banco antes de que llegara el "Aprobado"), es un no-op silencioso —
   * la aprobación de pago y la aceptación manual pueden competir, no es un error.
   */
  async autoAcceptAfterPaymentApproved(restaurantId: string, orderId: string) {
    const existing = await prisma.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!existing || existing.status !== 'PENDING') return null;
    // Igual que en acceptOrder: la transición decide quién gana la carrera contra la
    // aceptación manual, para no imprimir la comanda dos veces.
    const accepted = await prisma.order.updateMany({
      where: { id: orderId, restaurantId, status: 'PENDING' },
      data: { status: 'KITCHEN' },
    });
    if (accepted.count === 0) return null;
    const order = await prisma.order.findFirstOrThrow({ where: { id: orderId, restaurantId } });
    await emitOrderAccepted(restaurantId, order);
    return order;
  },

  /**
   * "Cancelar" desde el panel de Pedidos en vivo: borra el pedido, no queda registrado.
   * Un Mesero necesita el código de 6 dígitos que Dueño/Admin crean en Ajustes — el resto
   * de los roles (Dueño/Admin/Cajero) puede eliminar directo, sin código.
   */
  async deleteOrderHard(restaurantId: string, orderId: string, role: string, pin?: string, userId?: string) {
    // Solo Dueño/Admin/Caja borran directo y el Mesero con el código. El resto (Cocina,
    // Pantalla, Comanda, Número, Cancha, Coach) no tenía ningún control: la ruta no exige rol,
    // así que cualquiera de esas sesiones podía borrar comandas sin código y sin dejar rastro.
    const canDeleteDirect = ['OWNER', 'ADMIN', 'CASHIER', 'STAFF'].includes(role);
    if (!canDeleteDirect && role !== 'WAITER') {
      throw forbidden('No tienes permiso para eliminar comandas.');
    }
    if (role === 'WAITER') {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { deleteOrderPinHash: true },
      });
      if (!restaurant?.deleteOrderPinHash) {
        throw badRequest('El dueño o administrador debe crear un código de 6 dígitos en Ajustes antes de poder eliminar comandas.');
      }
      if (!pin || !(await bcrypt.compare(pin, restaurant.deleteOrderPinHash))) {
        throw badRequest('Código incorrecto.');
      }
    }
    const existing = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: { items: { include: { modifiers: true } }, table: { select: { number: true } } },
    });
    if (!existing) throw notFound('Comanda no encontrada.');

    // Quién borró, con nombre: el rol solo no identifica a la persona.
    const deleter = userId
      ? await prisma.user.findFirst({ where: { id: userId, restaurantId }, select: { name: true, email: true } })
      : null;

    // Inalterabilidad fiscal: un pedido con documento fiscal emitido NO se puede
    // eliminar. La corrección va por Nota de Crédito, nunca por borrado — y el
    // intento queda registrado en la pista de auditoría.
    if (await fiscalInvoicingService.hasLiveFiscalDocument(orderId)) {
      await writeFiscalAudit({
        restaurantId,
        orderId,
        event: 'DELETE_BLOCKED',
        actor: { actorType: 'USER', actorId: undefined, actorName: role },
        detail: { orderNumber: existing.orderNumber },
      });
      throw conflict(
        'Este pedido ya tiene una factura fiscal emitida y no se puede eliminar. Para reversarlo hay que emitir una nota de crédito.',
      );
    }

    // Se borra un pedido que YA había sido servido (ver "Cancelar" en Pedidos en vivo, que
    // en realidad borra): el inventario que se descontó al servirlo se devuelve, si no queda
    // perdido para siempre por algo que nunca se cobró.
    if (existing.status === 'SERVED') {
      await restoreServedOrderStock(restaurantId, existing);
    }

    // Borrar un pedido YA COBRADO arrastraba sus OrderPayment (cascade) pero dejaba vivo el
    // asiento bancario del cobro y el canje de promoción: el banco quedaba con dinero que la
    // caja ya no espera, y la promo contaba un canje de una venta que no existe.
    await prisma.$transaction(async (tx) => {
      await bankLedgerService.reverseBySourceRef(tx, restaurantId, orderId);
      await tx.promotionRedemption.deleteMany({ where: { restaurantId, sourceRef: orderId } });
      // El rastro queda ANTES de borrar, en la misma transacción: o se borra con
      // registro, o no se borra. Esta tabla no tiene endpoint de borrado — el
      // registro es permanente y solo Dueño/Admin pueden consultarlo.
      await tx.orderDeletionLog.create({
        data: {
          restaurantId,
          orderNumber: existing.orderNumber,
          channel: existing.channel,
          status: existing.status,
          tableName: existing.table?.number ?? null,
          customerName: existing.customerName,
          totalBase: existing.totalBase,
          items: existing.items.map((it) => ({
            name: it.productName,
            quantity: it.quantity,
            unitPrice: Number(it.unitPrice),
            variantName: it.variantName,
            modifiers: it.modifiers.map((m) => ({ name: m.name, quantity: m.quantity })),
          })),
          deletedByName: deleter?.name || deleter?.email || 'Desconocido',
          deletedByRole: role,
        },
      });
      await tx.order.delete({ where: { id: orderId } });
    });
    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, { orderId, status: 'DELETED' });
    return { deleted: true };
  },

  /** Registro de comandas eliminadas — solo Dueño/Admin (ver rutas). No hay forma de borrarlo. */
  async listDeletionLog(restaurantId: string) {
    const rows = await prisma.orderDeletionLog.findMany({
      where: { restaurantId },
      orderBy: { deletedAt: 'desc' },
      take: 300,
    });
    return rows.map((r) => ({ ...r, totalBase: Number(r.totalBase) }));
  },

  /**
   * Todos los pedidos activos (no servidos ni cancelados), de cualquier
   * canal, para el panel "Pedidos" del Dashboard del restaurante.
   *
   * `clearedAt: null` deja fuera las comandas que ya se saldaron en un turno
   * cerrado (ver cash-session.service.ts): el turno nuevo arranca con la
   * pantalla limpia y solo con lo que quedó por cobrar. Siguen completas en
   * Administración, no se borra nada.
   *
   * SERVED con saldo pendiente TAMBIÉN entra: cocina marca "Listo" y el pedido pasa a
   * SERVED, casi siempre antes de que el comensal pague. Filtrando solo por estado, esa
   * comanda desaparecía de Pedidos, de "Comandas y deudas" y de Órdenes de Mesa — y ya no
   * había forma de cobrarla desde ninguna pantalla.
   *
   * Sin corte por antigüedad, a propósito: una cuenta sin pagar no puede desaparecer de
   * Pedidos aunque tenga meses, ni aunque el restaurante no registre sus cobros aquí — eso
   * es justo la plata que no se debe perder de vista. El costo es que un restaurante que
   * nunca cierra sus cuentas ahí ve crecer esta lista sin límite; es la contraparte aceptada
   * de no volver a esconder deuda en silencio (ver incidente del 2026-08-14 en el historial).
   */
  /**
   * Qué canales tiene sentido ofrecerle a ESTE restaurante al crear un pedido.
   *
   * No hay una configuración de "hago delivery" en ninguna parte, así que se deduce del uso
   * real. Mesa depende de tener mesas cargadas, que es un hecho y no una suposición: sin
   * mesas el canal ni siquiera se puede usar, porque exige un tableId.
   *
   * Delivery mira tres cosas y le basta una: zonas dibujadas, repartidores cargados, o haber
   * despachado un delivery alguna vez. Las dos primeras son la configuración; la tercera es
   * el resguardo — un restaurante que reparte sin zonas ni repartidores cargados perdería el
   * botón sin entender por qué, y su historial demuestra que sí lo usa.
   *
   * Barra, Express y Pick-up no dependen de nada, así que siempre se ofrecen.
   */
  async availableChannels(restaurantId: string) {
    const [mesas, zonas, repartidores, deliveriesPrevios] = await Promise.all([
      prisma.table.count({ where: { restaurantId } }),
      prisma.deliveryZone.count({ where: { restaurantId } }),
      prisma.deliveryCourier.count({ where: { restaurantId } }),
      prisma.order.count({ where: { restaurantId, channel: 'DELIVERY' } }),
    ]);
    return {
      DINE_IN: mesas > 0,
      BAR: true,
      EXPRESS: true,
      DELIVERY: zonas > 0 || repartidores > 0 || deliveriesPrevios > 0,
      PICKUP: true,
    };
  },

  async listLiveOrders(restaurantId: string) {
    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        clearedAt: null,
        status: { not: 'CANCELLED' },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        items: { include: { modifiers: true } },
        table: { select: { number: true, assignedWaiterId: true } },
        payments: true,
        placedByUser: { select: { id: true, name: true } },
      },
    });
    // Del lado servido solo quedan las que todavía deben algo (el saldo no se puede calcular
    // en SQL: hay que sumar los pagos con sus descuentos, igual que en addPayment).
    return orders.filter((o) => {
      if (o.status !== 'SERVED') return true;
      const settled = o.payments.reduce(
        (acc, p) => acc.add(p.amountBase).add(p.discountBase ?? toDecimal(0)).add(p.serviceChargeDiscountBase ?? toDecimal(0)),
        toDecimal(0),
      );
      return round2(o.totalBase.sub(settled)).gt(0.01);
    });
  },

  /** Registra un cobro (botones "Pagar" / "Pago Fraccionado"). Si con esto se cubre el total, cierra la cuenta abierta.
   * Si `input.items` viene (fraccionar por ítems), el monto lo calcula esta función a partir de esas
   * líneas — el `amountBase` que mande el cliente se ignora en ese caso. */
  async addPayment(restaurantId: string, orderId: string, input: RecordPaymentInput) {
    return prisma.$transaction(async (tx) => {
      // Candado por PEDIDO durante toda la transacción: dos cajeros cobrando la misma
      // comanda a la vez (o un doble toque del botón) leían los dos el saldo completo y
      // ambos pasaban la validación de abajo — la cuenta terminaba cobrada dos veces.
      //
      // Es `try_lock` y no el bloqueante: si el candado está tomado, se responde al toque
      // en vez de hacer cola. Esperando, las transacciones en espera se pasaban del límite
      // de 5 s de Prisma y morían con un error técnico feo en vez de un aviso entendible.
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtext(${'order-payment:' + orderId})) AS locked
      `;
      if (!locked) throw badRequest('Se está registrando otro cobro de esta cuenta. Espera un momento y vuelve a intentar.');

      const order = await tx.order.findFirst({
        where: { id: orderId, restaurantId },
        include: { payments: true, items: true },
      });
      if (!order) throw notFound('Comanda no encontrada.');
      if (order.status === 'CANCELLED') throw badRequest('No se puede registrar un cobro en un pedido cancelado.');

      // "Saldado" cuenta lo cobrado en efectivo/transferencia MÁS los descuentos y ajustes de
      // servicio ya otorgados (perdonan esa parte de la deuda, no quedan pendientes).
      const alreadySettled = order.payments.reduce(
        (acc, p) => acc.add(p.amountBase).add(p.discountBase ?? toDecimal(0)).add(p.serviceChargeDiscountBase ?? toDecimal(0)),
        toDecimal(0),
      );
      const balance = round2(order.totalBase.sub(alreadySettled));

      // Propina: plata aparte del saldo del pedido (ver Order.tipBase), nunca cuenta para
      // "saldado" ni se descuenta del monto cobrado. `collectedTipsSoFar` es lo ya cobrado en
      // pagos anteriores de esta misma cuenta (fraccionado); si este cobro suma más de lo que
      // el pedido tenía declarado (ej. nunca se eligió propina al pedir y el cliente decide dejar
      // una acá, o decide dejar más), Order.tipBase sube para reflejar lo realmente cobrado.
      const collectedTipsSoFar = order.payments.reduce((acc, p) => acc.add(p.tipBase ?? toDecimal(0)), toDecimal(0));
      const tipBase = input.tipBase != null ? round2(toDecimal(input.tipBase)) : undefined;
      const tipBaseForOrder =
        tipBase && round2(collectedTipsSoFar.add(tipBase)).gt(order.tipBase)
          ? round2(collectedTipsSoFar.add(tipBase))
          : undefined;

      let amountBase: Prisma.Decimal;
      if (input.items?.length) {
        const itemById = new Map(order.items.map((i) => [i.id, i]));
        amountBase = toDecimal(0);
        for (const picked of input.items) {
          const item = itemById.get(picked.orderItemId);
          if (!item) throw badRequest('Uno de los productos no pertenece a este pedido.');
          const remaining = item.quantity - item.paidQuantity;
          if (picked.quantity > remaining) {
            throw badRequest(`Solo quedan ${remaining} sin cobrar de "${item.productName}".`);
          }
          amountBase = amountBase.add(item.unitPrice.mul(picked.quantity));
        }
        amountBase = round2(amountBase);
      } else {
        amountBase = toDecimal(input.amountBase!);
      }

      if (amountBase.gt(balance.add(0.01))) {
        throw badRequest(`El monto excede el saldo pendiente (${balance.toFixed(2)}).`);
      }

      let discountBase =
        input.discountAmount != null
          ? toDecimal(input.discountAmount)
          : input.discountPercent
            ? round2(balance.mul(input.discountPercent).div(100))
            : undefined;

      // Código de promoción (CRM): valida lista/vigencia/canjes, suma su descuento al
      // del cajero (los dos condonan deuda) y deja el canje registrado en esta misma
      // transacción — o quedan cobro y canje juntos, o no queda nada.
      let promoRedeem: { promotionId: string; customerId: string | null; discount: Prisma.Decimal } | null = null;
      if (input.promoCode) {
        const { promotion, customerId } = await resolvePromotionForRedeem(
          tx,
          restaurantId,
          input.promoCode,
          order.customerPhone,
        );
        const promoDiscount = promotionDiscountOf(promotion, balance);
        if (promoDiscount.lte(0)) throw badRequest('El descuento de la promoción no aplica a este saldo.');
        discountBase = round2((discountBase ?? toDecimal(0)).add(promoDiscount));
        promoRedeem = { promotionId: promotion.id, customerId, discount: promoDiscount };
      }

      if (discountBase && discountBase.gt(balance.add(0.01))) {
        throw badRequest('El descuento no puede superar el saldo pendiente.');
      }
      // Cada uno por separado cabía en el saldo, pero sumados podían pasarse: cobrar el total
      // y además descontarlo dejaba el pedido "saldado" dos veces.
      if (amountBase.add(discountBase ?? toDecimal(0)).gt(balance.add(0.01))) {
        throw badRequest(`El cobro más el descuento exceden el saldo pendiente (${balance.toFixed(2)}).`);
      }

      const serviceChargeDiscountBase =
        input.serviceChargeDiscountAmount != null
          ? toDecimal(input.serviceChargeDiscountAmount)
          : input.serviceChargeDiscountPercent
            ? round2(order.serviceChargeBase.mul(input.serviceChargeDiscountPercent).div(100))
            : undefined;
      if (serviceChargeDiscountBase && serviceChargeDiscountBase.gt(order.serviceChargeBase.add(0.01))) {
        throw badRequest('El ajuste de servicio no puede superar el cargo de servicio del pedido.');
      }

      // Vuelto: lo que entregó el cliente menos lo que se le acredita. Nunca negativo (si dio
      // menos de lo que se acredita, simplemente no hay vuelto y no se guarda nada de esto).
      let amountReceivedBase: Prisma.Decimal | undefined;
      let changeBase: Prisma.Decimal | undefined;
      let changeMethod: PaymentMethod | undefined;
      if (input.amountReceived != null) {
        const received = round2(toDecimal(input.amountReceived));
        if (received.gt(amountBase.add(0.001))) {
          amountReceivedBase = received;
          changeBase = round2(received.sub(amountBase));
          changeMethod = input.changeMethod ?? input.method;
        }
      }

      await tx.orderPayment.create({
        data: {
          orderId,
          amountBase,
          method: input.method,
          discountPercent: input.discountPercent,
          discountBase,
          serviceChargeDiscountPercent: input.serviceChargeDiscountPercent,
          serviceChargeDiscountBase,
          tipBase,
          referenceNumber: input.referenceNumber,
          proofImageUrl: input.proofImageUrl,
          amountReceivedBase,
          changeBase,
          changeMethod,
          changeReferenceNumber: changeBase ? input.changeReferenceNumber?.trim() || null : null,
        },
      });

      if (promoRedeem) {
        await recordPromotionRedemption(tx, {
          restaurantId,
          promotionId: promoRedeem.promotionId,
          customerId: promoRedeem.customerId,
          sourceRef: order.id,
          amountBase: promoRedeem.discount,
        });
      }

      // Cuentas bancarias: el cobro suma a la cuenta vinculada al método. Solo lo COBRADO
      // (descuentos/ajustes condonan deuda, no mueven dinero). Para cuentas en Bs se usa la
      // tasa congelada del pedido — la misma que vio el cliente al pagar.
      // Con vuelto por OTRO método (pagó en dólares, se le devolvió Bs por Pago Móvil): entra el
      // efectivo completo a su cuenta y sale el vuelto de la cuenta del otro método — así ambas
      // cuadran con lo que físicamente pasó. Vuelto en el mismo efectivo: neto, como siempre.
      const changeViaOtherMethod = changeBase && changeMethod && changeMethod !== input.method;
      await bankLedgerService.applyMethodPayment(tx, {
        restaurantId,
        method: input.method,
        direction: 'CREDIT',
        // La propina entra físicamente junto con el cobro, por el mismo método — se suma acá
        // para que la cuenta bancaria (y el arqueo de caja) cuadren con lo que de verdad entró.
        amountBase: (changeViaOtherMethod ? amountReceivedBase! : amountBase).add(tipBase ?? toDecimal(0)),
        rateBs: order.exchangeRate,
        bankAccountId: input.bankAccountId,
        description: tipBase ? `Cobro pedido #${order.orderNumber} (incl. propina)` : `Cobro pedido #${order.orderNumber}`,
        sourceRef: order.id,
      });
      if (changeViaOtherMethod) {
        await bankLedgerService.applyMethodPayment(tx, {
          restaurantId,
          method: changeMethod!,
          direction: 'DEBIT',
          amountBase: changeBase!,
          rateBs: order.exchangeRate,
          description: `Vuelto pedido #${order.orderNumber}`,
          sourceRef: order.id,
        });
      }

      if (input.items?.length) {
        for (const picked of input.items) {
          await tx.orderItem.update({
            where: { id: picked.orderItemId },
            data: { paidQuantity: { increment: picked.quantity } },
          });
        }
      }

      // Sin margen de tolerancia: hasta el último centavo debe quedar cobrado (o condonado
      // explícitamente vía descuento/ajuste de servicio) antes de dar por saldada la cuenta.
      const settledBase = round2(
        alreadySettled.add(amountBase).add(discountBase ?? toDecimal(0)).add(serviceChargeDiscountBase ?? toDecimal(0)),
      );
      const fullyPaid = settledBase.gte(order.totalBase);
      // Pedido de kiosco (Comanda): esperaba el pago para entrar a cocina — ya se saldó,
      // así que pasa directo a KITCHEN (nunca por "Aceptar", cocina solo verá "Listo").
      const releaseToKitchen = fullyPaid && order.status === 'NEEDS_PAYMENT';
      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          ...(fullyPaid ? { awaitingPayment: false, ...(releaseToKitchen ? { status: 'KITCHEN' } : {}) } : {}),
          ...(tipBaseForOrder != null ? { tipBase: tipBaseForOrder } : {}),
        },
        include: { items: { include: { modifiers: true } }, table: { select: { number: true } }, payments: true },
      });

      emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, { orderId, status: updated.status });
      return { order: updated, releaseToKitchen, fullyPaid };
    }).then(async ({ order: updated, releaseToKitchen, fullyPaid }) => {
      // La comanda real (con ítems) recién se imprime ahora que el pedido está pagado —
      // fuera de la transacción para no bloquear el cobro si la Estación de Impresión
      // (un simple evento de socket) tarda o falla.
      if (releaseToKitchen) await this.printComanda(restaurantId, orderId);
      // Facturación fiscal (SENIAT, vía Unidigital): dispara después de confirmar el
      // pago, nunca dentro de la transacción — issueForOrder() nunca lanza (ver
      // fiscal-invoicing.service.ts), pero el .catch es una segunda red de seguridad
      // para que un fallo de red jamás afecte la respuesta de este cobro.
      if (fullyPaid) fiscalInvoicingService.issueForOrder(restaurantId, orderId).catch(() => undefined);
      return updated;
    });
  },

  /**
   * "Delivery": arma el enlace de WhatsApp para el repartidor con el resumen
   * de la comanda (sin precios) y los datos de contacto/ubicación del
   * cliente, para que pueda llamarlo o ubicarlo.
   */
  /**
   * "Despacho automático al cobrar" (Ajustes → Delivery): elige repartidor por
   * rotación — el activo que lleva más tiempo sin recibir un pedido, y los que
   * nunca recibieron ninguno primero. Así el reparto se distribuye solo en vez
   * de caerle siempre al primero de la lista.
   *
   * Devuelve null (sin lanzar) si el restaurante no tiene repartidores activos:
   * esto corre justo después de confirmar un cobro y jamás debe romperlo.
   */
  async autoDispatchToCourier(restaurantId: string, orderId: string) {
    // Puede dispararse tanto al aceptar (deliveryAutoAssignOnAccept) como al cobrar
    // (deliveryAutoAssignOnPaid) — si ya tiene repartidor asignado (por el otro
    // interruptor, o a mano), no lo vuelve a despachar.
    const current = await prisma.order.findFirst({ where: { id: orderId, restaurantId }, select: { deliveryCourierId: true } });
    if (current?.deliveryCourierId) return null;

    const couriers = await prisma.deliveryCourier.findMany({
      where: { restaurantId, isActive: true },
      select: { id: true },
    });
    if (couriers.length === 0) return null;

    const lastDispatches = await prisma.order.groupBy({
      by: ['deliveryCourierId'],
      where: { restaurantId, deliveryCourierId: { in: couriers.map((c) => c.id) } },
      _max: { deliveryDispatchedAt: true },
    });
    const lastByCourier = new Map(
      lastDispatches.map((d) => [d.deliveryCourierId as string, d._max.deliveryDispatchedAt?.getTime() ?? 0]),
    );

    const chosen = couriers.reduce((best, c) =>
      (lastByCourier.get(c.id) ?? 0) < (lastByCourier.get(best.id) ?? 0) ? c : best,
    );
    return this.dispatchToCourier(restaurantId, orderId, chosen.id);
  },

  async dispatchToCourier(restaurantId: string, orderId: string, courierId: string) {
    const [order, courier] = await Promise.all([
      prisma.order.findFirst({ where: { id: orderId, restaurantId }, include: { items: { include: { modifiers: true } } } }),
      prisma.deliveryCourier.findFirst({ where: { id: courierId, restaurantId } }),
    ]);
    if (!order) throw notFound('Comanda no encontrada.');
    if (!courier) throw notFound('Repartidor no encontrado.');

    const parts: string[] = [];
    parts.push(`*🛵 Pedido para entregar — #${order.orderNumber}*`);
    parts.push('━━━━━━━━━━━━━━━━━━━━');
    parts.push('*Comanda:*');
    for (const item of order.items) {
      parts.push(`• ${item.quantity}x ${item.productName}${item.variantName ? ` (${item.variantName})` : ''}`);
      for (const mod of item.modifiers) parts.push(`     ↳ ${mod.name}`);
      if (item.note) parts.push(`     📝 ${item.note}`);
    }
    parts.push('━━━━━━━━━━━━━━━━━━━━');
    parts.push('*Datos del cliente:*');
    if (order.customerName) parts.push(`👤 ${order.customerName}`);
    if (order.customerPhone) parts.push(`📞 ${order.customerPhone}`);
    if (order.customerAddress) parts.push(`📍 ${order.customerAddress}`);
    if (order.customerLat != null && order.customerLng != null) {
      parts.push(`🗺️ https://www.google.com/maps?q=${order.customerLat},${order.customerLng}`);
    }
    if (order.customerNote) parts.push(`🗒️ Nota: ${order.customerNote}`);
    parts.push('━━━━━━━━━━━━━━━━━━━━');
    parts.push('_Enviado desde QuickTap.club_');

    const message = parts.join('\n');
    const url = buildWhatsappUrl(courier.whatsappPhone, message);

    // Queda registrado quién se lleva la comanda, para el movimiento por repartidor en Administración.
    await prisma.order.update({
      where: { id: orderId },
      data: { deliveryCourierId: courierId, deliveryDispatchedAt: new Date() },
    });

    // Manda la comanda al repartidor por la sesión vinculada de este restaurante — si no está
    // conectada, `sent: false` y el frontend cae al enlace wa.me de siempre (`url`).
    const sent = await whatsappBotService.sendMessage(restaurantId, courier.whatsappPhone, message);

    // Chatbot de WhatsApp: al cliente le avisa que su pedido salió — mensaje aparte del de arriba
    // (ese va al repartidor, no al cliente).
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true, whatsappBotEnabled: true, whatsappBotNotifyReady: true },
    });
    if ((restaurant?.whatsappBotEnabled || (await whatsappLinkService.vinculado(restaurantId))) && restaurant?.whatsappBotNotifyReady && order.customerPhone) {
      whatsappBotService
        .sendMessage(
          restaurantId,
          formatVenezuelanWhatsappPhone(order.customerPhone),
          frase(
            `🛵 *${restaurant.name}*\n\n¡Tu pedido #${order.orderNumber} va en camino!`,
            `🛵 *${restaurant.name}*\n\nTu pedido #${order.orderNumber} acaba de salir. ¡Llega pronto!`,
            `🛵 *${restaurant.name}*\n\n¡Salió tu pedido #${order.orderNumber}! Ya va hacia ti.`,
          ),
        )
        .catch(() => undefined);
    }

    return { sent, url };
  },

  /**
   * Botón "Enviar vía WhatsApp" en el detalle de un pedido: arma el enlace
   * con el resumen de la comanda (mismos datos que "Imprimir comanda") y lo
   * envía al teléfono del cliente registrado en el pedido.
   */
  async sendComandaWhatsapp(restaurantId: string, orderId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        items: { include: { modifiers: true } },
        table: { select: { number: true } },
        restaurant: { select: { name: true, whatsappOrderMessageTemplate: true } },
      },
    });
    if (!order) throw notFound('Comanda no encontrada.');
    if (!order.customerPhone) {
      throw badRequest('Este pedido no tiene un teléfono de cliente registrado.');
    }

    const symbol = CURRENCY_SYMBOLS[order.currency];

    let header = `*🧾 Comanda #${order.orderNumber} — ${order.restaurant.name}*`;
    if (order.table) header += `\n🪑 Mesa ${order.table.number}`;

    const itemLines: string[] = [];
    for (const item of order.items) {
      itemLines.push(
        `• ${item.quantity}x ${item.productName}${item.variantName ? ` (${item.variantName})` : ''} — ${formatMoney(item.lineTotal, symbol)}`,
      );
      for (const mod of item.modifiers) itemLines.push(`     ↳ ${mod.name}`);
      if (item.note) itemLines.push(`     📝 ${item.note}`);
    }

    const totalesLines: string[] = [`Subtotal: ${formatMoney(order.subtotalBase, symbol)}`];
    if (Number(order.serviceChargeBase) > 0) totalesLines.push(`Servicio: ${formatMoney(order.serviceChargeBase, symbol)}`);
    if (Number(order.ivaBase) > 0) totalesLines.push(`IVA: ${formatMoney(order.ivaBase, symbol)}`);
    if (Number(order.deliveryFeeBase) > 0) totalesLines.push(`Envío: ${formatMoney(order.deliveryFeeBase, symbol)}`);
    if (Number(order.envaseFeeBase) > 0) totalesLines.push(`Envase: ${formatMoney(order.envaseFeeBase, symbol)}`);
    if (Number(order.tipBase) > 0) totalesLines.push(`Propina: ${formatMoney(order.tipBase, symbol)}`);
    totalesLines.push(`*Total: ${formatMoney(order.totalBase, symbol)}*`);
    totalesLines.push(`_Equivalente: ${formatBs(order.totalBs)}_`);

    // Los datos del pedido (ítems y totales) se calculan siempre desde la BD
    // y se insertan como bloques ya formateados; el restaurante solo puede
    // personalizar el texto alrededor (encabezado, cierre, branding).
    const template = order.restaurant.whatsappOrderMessageTemplate || DEFAULT_COMANDA_WHATSAPP_TEMPLATE;
    const message = renderWhatsappTemplate(template, {
      header,
      items: itemLines.join('\n'),
      totales: totalesLines.join('\n'),
    });

    // El teléfono del cliente se captura como número local venezolano (ej.
    // "0424-1234567", sin código de país) en los formularios de checkout/mesa,
    // a diferencia de restaurant.whatsappPhone que ya guarda el código de
    // marcación elegido en el registro.
    const customerWhatsapp = formatVenezuelanWhatsappPhone(order.customerPhone);
    const sent = await whatsappBotService.sendMessage(restaurantId, customerWhatsapp, message);
    return { sent, url: buildWhatsappUrl(customerWhatsapp, message) };
  },

  /** Botón "Imprimir" del panel: reenvía la comanda a la estación de impresión (misma room de
   * cocina que recibe las comandas nuevas) para que la imprima en las impresoras conectadas. */
  async printComanda(restaurantId: string, orderId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        items: { include: { modifiers: true } },
        table: { select: { number: true, zone: { select: { name: true } } } },
        placedByUser: { select: { name: true } },
      },
    });
    if (!order) throw notFound('Comanda no encontrada.');

    emitToKitchen(restaurantId, SocketEvents.PRINT_REQUEST, {
      type: 'comanda',
      orderId: order.id,
      orderNumber: order.orderNumber,
      channel: order.channel,
      table: order.table ? { number: order.table.number, zoneName: order.table.zone?.name ?? null } : null,
      placedByUser: order.placedByUser?.name ?? null,
      customerName: order.customerName,
      items: order.items.map((i) => ({
        name: i.productName,
        variantName: i.variantName,
        quantity: i.quantity,
        modifiers: i.modifiers.map((m) => ({ name: m.name, quantity: m.quantity })),
        note: i.note,
        kitchenName: i.kitchenName,
      })),
      totalBase: order.totalBase,
      currency: order.currency,
      createdAt: order.createdAt,
    });

    return { sent: true };
  },

  /** POST /api/v1/orders/:id/print-receipt — "¿Desea imprimir la cuenta?" al saldar el pedido: reenvía a la impresora de Caja. */
  async printReceipt(restaurantId: string, orderId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        items: { include: { modifiers: true } },
        table: { select: { number: true, zone: { select: { name: true } } } },
        placedByUser: { select: { name: true } },
      },
    });
    if (!order) throw notFound('Pedido no encontrado.');

    emitToKitchen(restaurantId, SocketEvents.PRINT_REQUEST, {
      type: 'recibo',
      orderId: order.id,
      orderNumber: order.orderNumber,
      channel: order.channel,
      table: order.table ? { number: order.table.number, zoneName: order.table.zone?.name ?? null } : null,
      placedByUser: order.placedByUser?.name ?? null,
      customerName: order.customerName,
      items: order.items.map((i) => ({
        name: i.productName,
        variantName: i.variantName,
        quantity: i.quantity,
        unitPrice: i.unitPrice.toString(),
        lineTotal: i.lineTotal.toString(),
        modifiers: i.modifiers.map((m) => ({ name: m.name, quantity: m.quantity })),
        note: i.note,
        kitchenName: i.kitchenName,
      })),
      subtotalBase: order.subtotalBase,
      serviceChargeBase: order.serviceChargeBase,
      ivaBase: order.ivaBase,
      deliveryFeeBase: order.deliveryFeeBase,
      // Sin esto, la nota de entrega impresa no cuadraba: las líneas sumaban menos que el TOTAL.
      envaseFeeBase: order.envaseFeeBase,
      totalBase: order.totalBase,
      exchangeRate: order.exchangeRate,
      totalBs: order.totalBs,
      currency: order.currency,
      createdAt: order.createdAt,
    });

    return { sent: true };
  },

  /** Resumen de ventas del día (hora de Caracas) para el Dashboard del restaurante. */
  async getTodaySummary(restaurantId: string) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { baseCurrency: true },
    });
    const currency = restaurant?.baseCurrency ?? 'USD';
    const rate = await exchangeRateService.getRate(currency, restaurantId);

    const [orders, movements, latePayments] = await Promise.all([
      prisma.order.findMany({
        where: { restaurantId, createdAt: { gte: startOfTodayCaracas() }, status: { not: 'CANCELLED' } },
        select: { channel: true, totalBase: true, totalBs: true, currency: true, tipBase: true, createdAt: true },
      }),
      prisma.movement.findMany({
        where: { restaurantId, createdAt: { gte: startOfTodayCaracas() } },
        select: { type: true, amountBase: true },
      }),
      // Cuentas de días anteriores que se terminan de cobrar hoy: el dinero entró hoy aunque
      // la comanda sea vieja, así que ese cobro cuenta para el Balance de hoy (no para "ventas
      // de hoy" — eso sigue siendo solo lo creado hoy, para no inflar el conteo de pedidos).
      prisma.orderPayment.findMany({
        where: {
          createdAt: { gte: startOfTodayCaracas() },
          order: { restaurantId, createdAt: { lt: startOfTodayCaracas() }, status: { not: 'CANCELLED' } },
        },
        select: { amountBase: true },
      }),
    ]);

    const totalBase = round2(orders.reduce((acc, o) => acc.add(o.totalBase), toDecimal(0)));
    const totalBs = round2(orders.reduce((acc, o) => acc.add(o.totalBs), toDecimal(0)));
    const byChannel: Record<OrderChannel, number> = { DINE_IN: 0, DELIVERY: 0, PICKUP: 0, BAR: 0, EXPRESS: 0 };
    for (const o of orders) byChannel[o.channel]++;

    const tipBase = round2(orders.reduce((acc, o) => acc.add(o.tipBase), toDecimal(0)));
    const avgTicketBase = orders.length > 0 ? round2(totalBase.div(orders.length)) : round2(toDecimal(0));

    // Ventas por hora (hora de Caracas): solo se devuelven las horas con al menos un pedido,
    // ordenadas cronológicamente — el rango de operación varía por restaurante.
    const byHourMap = new Map<number, { totalBase: Prisma.Decimal; ordersCount: number }>();
    for (const o of orders) {
      const hour = hourCaracas(o.createdAt);
      const bucket = byHourMap.get(hour) ?? { totalBase: toDecimal(0), ordersCount: 0 };
      bucket.totalBase = bucket.totalBase.add(o.totalBase);
      bucket.ordersCount++;
      byHourMap.set(hour, bucket);
    }
    const byHour = Array.from(byHourMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([hour, b]) => ({ hour, totalBase: round2(b.totalBase).toFixed(2), ordersCount: b.ordersCount }));

    // Ingresos = ventas del día + ingresos manuales (propinas sueltas, etc.).
    // Egresos = gastos del día (módulo de Gastos). Balance = ingresos - egresos.
    const incomeMovementsBase = round2(
      movements.filter((m) => m.type === 'INCOME').reduce((acc, m) => acc.add(m.amountBase), toDecimal(0)),
    );
    const egresosBase = round2(
      movements.filter((m) => m.type === 'EXPENSE').reduce((acc, m) => acc.add(m.amountBase), toDecimal(0)),
    );
    const latePaymentsBase = round2(latePayments.reduce((acc, p) => acc.add(p.amountBase), toDecimal(0)));
    const ingresosBase = round2(totalBase.add(incomeMovementsBase).add(latePaymentsBase));
    const balanceBase = round2(ingresosBase.sub(egresosBase));

    return {
      ordersCount: orders.length,
      totalBase: totalBase.toFixed(2),
      totalBs: totalBs.toFixed(2),
      currency: orders[0]?.currency ?? currency,
      byChannel,
      ingresosBase: ingresosBase.toFixed(2),
      ingresosBs: baseToBs(ingresosBase, rate.rateBs).toFixed(2),
      egresosBase: egresosBase.toFixed(2),
      egresosBs: baseToBs(egresosBase, rate.rateBs).toFixed(2),
      balanceBase: balanceBase.toFixed(2),
      balanceBs: baseToBs(balanceBase, rate.rateBs).toFixed(2),
      tipBase: tipBase.toFixed(2),
      tipBs: baseToBs(tipBase, rate.rateBs).toFixed(2),
      avgTicketBase: avgTicketBase.toFixed(2),
      avgTicketBs: baseToBs(avgTicketBase, rate.rateBs).toFixed(2),
      byHour,
    };
  },

  /** Agrega/edita a mano la propina de un pedido, desde Administración. */
  async setTip(restaurantId: string, orderId: string, tipBase: number) {
    const existing = await prisma.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!existing) throw notFound('Comanda no encontrada.');
    return prisma.order.update({ where: { id: orderId }, data: { tipBase } });
  },

  /** Botón del reloj en Pedidos: activa/desactiva la cuenta abierta pendiente por cobrar. */
  async setAwaitingPayment(restaurantId: string, orderId: string, awaitingPayment: boolean) {
    const existing = await prisma.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!existing) throw notFound('Comanda no encontrada.');
    if (existing.status === 'SERVED' || existing.status === 'CANCELLED') {
      throw badRequest('No se puede marcar como pendiente por pagar un pedido ya finalizado o cancelado.');
    }
    const updated = await prisma.order.update({ where: { id: orderId }, data: { awaitingPayment } });
    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, { orderId, status: updated.status });
    return updated;
  },

  /** Filtro Prisma común del historial de pedidos (listado, totales y exportación a Excel). */
  historyWhere(restaurantId: string, query: OrderHistoryQuery): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {
      restaurantId,
      status: { not: 'CANCELLED' },
      createdAt: resolveDateFilter({ range: query.range, date: query.date, from: query.from, to: query.to }),
    };
    if (query.channel) where.channel = query.channel;
    else if (query.channels?.length) where.channel = { in: query.channels };
    if (query.paymentMethod) where.paymentMethod = query.paymentMethod;
    // Autoservicio (tablet Comanda) también tiene placedByUserId, así que "staff" excluye ese rol.
    if (query.placedBy === 'staff') where.placedByUser = { role: { not: 'COMANDA' } };
    if (query.placedBy === 'customer') where.placedByUserId = null;
    if (query.placedBy === 'kiosk') where.placedByUser = { role: 'COMANDA' };
    if (query.placedByUserId) where.placedByUserId = query.placedByUserId;
    if (query.productId) where.items = { some: { productId: query.productId } };
    return where;
  },

  /** Historial de pedidos con filtros (Administración, solo Premium). Incluye el desglose completo de cada venta. */
  async getOrderHistory(restaurantId: string, query: OrderHistoryQuery) {
    const where = this.historyWhere(restaurantId, query);

    const [total, orders, totalsAgg] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          orderNumber: true,
          channel: true,
          status: true,
          paymentMethod: true,
          subtotalBase: true,
          serviceChargeBase: true,
          ivaBase: true,
          deliveryFeeBase: true,
          totalBase: true,
          totalBs: true,
          tipBase: true,
          currency: true,
          customerName: true,
          createdAt: true,
          table: { select: { number: true } },
          placedByUser: { select: { name: true, role: true } },
          items: { select: { productId: true, productName: true, quantity: true, unitPrice: true, lineTotal: true } },
          payments: {
            select: { method: true, referenceNumber: true, amountBase: true, discountBase: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      prisma.order.aggregate({ where, _sum: { totalBase: true, totalBs: true, tipBase: true } }),
    ]);

    const historyTotalBase = round2(toDecimal(totalsAgg._sum.totalBase ?? 0));

    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalBase: historyTotalBase.toFixed(2),
      totalBs: round2(toDecimal(totalsAgg._sum.totalBs ?? 0)).toFixed(2),
      totalTipBase: round2(toDecimal(totalsAgg._sum.tipBase ?? 0)).toFixed(2),
      avgTicketBase: total > 0 ? round2(historyTotalBase.div(total)).toFixed(2) : '0.00',
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        channel: o.channel,
        status: o.status,
        paymentMethod: o.paymentMethod,
        subtotalBase: o.subtotalBase.toFixed(2),
        serviceChargeBase: o.serviceChargeBase.toFixed(2),
        ivaBase: o.ivaBase.toFixed(2),
        deliveryFeeBase: o.deliveryFeeBase.toFixed(2),
        totalBase: o.totalBase.toFixed(2),
        totalBs: o.totalBs.toFixed(2),
        tipBase: o.tipBase.toFixed(2),
        currency: o.currency,
        customerName: o.customerName,
        placedByName: o.placedByUser?.name ?? null,
        placedByRole: o.placedByUser?.role ?? null,
        // Origen legible del pedido: autoservicio (tablet Comanda), mesero/cajero o el propio cliente.
        source: o.placedByUser ? (o.placedByUser.role === 'COMANDA' ? 'KIOSK' : 'STAFF') : 'CUSTOMER',
        table: o.table?.number ?? null,
        createdAt: o.createdAt,
        items: o.items.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice.toFixed(2),
          lineTotal: i.lineTotal.toFixed(2),
        })),
        payments: o.payments.map((p) => ({
          method: p.method,
          referenceNumber: p.referenceNumber,
          amountBase: p.amountBase.toFixed(2),
          discountBase: p.discountBase?.toFixed(2) ?? null,
          createdAt: p.createdAt,
        })),
      })),
    };
  },

  /** Lista el personal que ha cargado al menos un pedido (para el filtro "Mesero" del historial). */
  async listWaiters(restaurantId: string) {
    return prisma.user.findMany({
      where: { restaurantId, placedOrders: { some: {} } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, role: true },
    });
  },

  /** Reporte de productos más/menos vendidos, con filtro de rango o fecha exacta. Cada variante de precio cuenta como su propia fila. */
  async getProductReport(restaurantId: string, range: ReportRange, date?: string) {
    const items = await prisma.orderItem.findMany({
      where: { order: { restaurantId, status: { not: 'CANCELLED' }, createdAt: resolveDateFilter({ range, date }) } },
      select: { productId: true, productName: true, variantName: true, quantity: true, lineTotal: true },
    });

    const byProduct = new Map<
      string,
      { productId: string | null; name: string; quantity: number; revenueBase: Prisma.Decimal }
    >();
    for (const item of items) {
      const name = item.variantName ? `${item.productName} (${item.variantName})` : item.productName;
      const key = `${item.productId ?? `name:${item.productName}`}:${item.variantName ?? ''}`;
      const existing = byProduct.get(key);
      if (existing) {
        existing.quantity += item.quantity;
        existing.revenueBase = existing.revenueBase.add(item.lineTotal);
      } else {
        byProduct.set(key, {
          productId: item.productId,
          name,
          quantity: item.quantity,
          revenueBase: toDecimal(item.lineTotal),
        });
      }
    }

    return Array.from(byProduct.values())
      .map((r) => ({ productId: r.productId, name: r.name, quantity: r.quantity, revenueBase: r.revenueBase.toFixed(2) }))
      .sort((a, b) => b.quantity - a.quantity);
  },

  /** Movimiento por repartidor (pedidos despachados y su valor), para Administración → Delivery. */
  async getCourierStats(restaurantId: string, range: ReportRange, date?: string) {
    const couriers = await prisma.deliveryCourier.findMany({ where: { restaurantId }, orderBy: { name: 'asc' } });
    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        deliveryCourierId: { not: null },
        status: { not: 'CANCELLED' },
        deliveryDispatchedAt: resolveDateFilter({ range, date }),
      },
      select: { deliveryCourierId: true, totalBase: true, totalBs: true, tipBase: true },
    });

    return couriers.map((c) => {
      const own = orders.filter((o) => o.deliveryCourierId === c.id);
      return {
        courierId: c.id,
        name: c.name,
        whatsappPhone: c.whatsappPhone,
        isActive: c.isActive,
        deliveries: own.length,
        totalBase: round2(own.reduce((acc, o) => acc.add(o.totalBase), toDecimal(0))).toFixed(2),
        totalBs: round2(own.reduce((acc, o) => acc.add(o.totalBs), toDecimal(0))).toFixed(2),
        totalTipBase: round2(own.reduce((acc, o) => acc.add(o.tipBase), toDecimal(0))).toFixed(2),
      };
    });
  },

  /**
   * Movimiento por método de pago, para Administración.
   *
   * Se cuenta lo COBRADO de verdad (`OrderPayment`), no el método que se declaró al tomar el
   * pedido: una cuenta fraccionada mitad efectivo/mitad pago móvil se cargaba entera a un solo
   * método, y un descuento se contaba como dinero que entró. Los pedidos sin ningún cobro
   * registrado siguen contándose por su método declarado — hay restaurantes que no usan el
   * botón "Pagar" y sin eso el informe les daría casi vacío.
   */
  async getPaymentMethodStats(restaurantId: string, range: ReportRange, date?: string, from?: string, to?: string) {
    const orders = await prisma.order.findMany({
      where: { restaurantId, status: { not: 'CANCELLED' }, createdAt: resolveDateFilter({ range, date, from, to }) },
      select: {
        paymentMethod: true,
        totalBase: true,
        totalBs: true,
        exchangeRate: true,
        payments: { select: { method: true, amountBase: true } },
      },
    });

    const byMethod = new Map<string, { count: number; totalBase: Prisma.Decimal; totalBs: Prisma.Decimal }>();
    const add = (key: string, base: Prisma.Decimal, bs: Prisma.Decimal) => {
      const entry = byMethod.get(key);
      if (entry) {
        entry.count += 1;
        entry.totalBase = entry.totalBase.add(base);
        entry.totalBs = entry.totalBs.add(bs);
      } else {
        byMethod.set(key, { count: 1, totalBase: toDecimal(base), totalBs: toDecimal(bs) });
      }
    };
    for (const o of orders) {
      if (o.payments.length > 0) {
        // Bs con la tasa congelada del pedido: la misma que vio el cliente al pagar.
        for (const p of o.payments) add(p.method, toDecimal(p.amountBase), baseToBs(toDecimal(p.amountBase), o.exchangeRate));
      } else {
        add(o.paymentMethod ?? 'SIN_METODO', toDecimal(o.totalBase), toDecimal(o.totalBs));
      }
    }

    return Array.from(byMethod.entries())
      .map(([method, v]) => ({
        method,
        count: v.count,
        totalBase: round2(v.totalBase).toFixed(2),
        totalBs: round2(v.totalBs).toFixed(2),
      }))
      .sort((a, b) => b.count - a.count);
  },

  /**
   * Estadísticas de ventas para el botón "Estadísticas" de Administración: total del
   * período (semana o mes en curso) vs. el mismo período inmediatamente anterior
   * (para el % de variación), más el desglose de ventas por usuario que cargó el pedido.
   */
  async getSalesStats(restaurantId: string, range: 'week' | 'month', from?: string, to?: string) {
    const now = new Date();
    // Con un tramo desde–hasta explícito, el período anterior es el mismo número de días
    // inmediatamente antes; sin él, el preset de semana/mes en curso vs. el anterior.
    const custom = resolveCustomPeriod(from, to);
    const currentStart = custom?.start ?? salesStatsPeriodStart(range, now);
    const currentEnd = custom?.end ?? null;
    const previousStart = custom
      ? new Date(custom.start.getTime() - (custom.end.getTime() - custom.start.getTime()))
      : range === 'week'
        ? new Date(currentStart.getTime() - 7 * 24 * 60 * 60 * 1000)
        : new Date(currentStart.getFullYear(), currentStart.getMonth() - 1, 1);

    const currentFilter = { gte: currentStart, ...(currentEnd ? { lt: currentEnd } : {}) };

    const [currentOrders, previousOrders] = await Promise.all([
      prisma.order.findMany({
        where: { restaurantId, status: { not: 'CANCELLED' }, createdAt: currentFilter },
        select: {
          totalBase: true,
          totalBs: true,
          tipBase: true,
          placedByUserId: true,
          placedByUser: { select: { name: true } },
        },
      }),
      prisma.order.findMany({
        where: { restaurantId, status: { not: 'CANCELLED' }, createdAt: { gte: previousStart, lt: currentStart } },
        select: { totalBase: true },
      }),
    ]);

    const totalBase = round2(currentOrders.reduce((acc, o) => acc.add(o.totalBase), toDecimal(0)));
    const totalBs = round2(currentOrders.reduce((acc, o) => acc.add(o.totalBs), toDecimal(0)));
    const previousTotalBase = round2(previousOrders.reduce((acc, o) => acc.add(o.totalBase), toDecimal(0)));
    const changePercent =
      Number(previousTotalBase) > 0
        ? round2(totalBase.sub(previousTotalBase).div(previousTotalBase).mul(100)).toFixed(1)
        : null;

    const byUser = new Map<string, { name: string; count: number; totalBase: Prisma.Decimal }>();
    for (const o of currentOrders) {
      const key = o.placedByUserId ?? 'CUSTOMER';
      const name = o.placedByUser?.name ?? 'Cliente (auto-servicio)';
      const entry = byUser.get(key);
      if (entry) {
        entry.count += 1;
        entry.totalBase = entry.totalBase.add(o.totalBase);
      } else {
        byUser.set(key, { name, count: 1, totalBase: toDecimal(o.totalBase) });
      }
    }

    const avgTicketBase = currentOrders.length > 0 ? round2(totalBase.div(currentOrders.length)) : toDecimal(0);
    const avgTicketBs = currentOrders.length > 0 ? round2(totalBs.div(currentOrders.length)) : toDecimal(0);
    const previousAvgTicketBase =
      previousOrders.length > 0 ? round2(previousTotalBase.div(previousOrders.length)) : toDecimal(0);
    const totalTipBase = round2(currentOrders.reduce((acc, o) => acc.add(o.tipBase), toDecimal(0)));

    return {
      range,
      periodStart: currentStart.toISOString(),
      periodEnd: currentEnd?.toISOString() ?? null,
      custom: !!custom,
      ordersCount: currentOrders.length,
      totalBase: totalBase.toFixed(2),
      totalBs: totalBs.toFixed(2),
      avgTicketBase: avgTicketBase.toFixed(2),
      avgTicketBs: avgTicketBs.toFixed(2),
      previousAvgTicketBase: previousAvgTicketBase.toFixed(2),
      totalTipBase: totalTipBase.toFixed(2),
      previousTotalBase: previousTotalBase.toFixed(2),
      previousOrdersCount: previousOrders.length,
      changePercent,
      byUser: Array.from(byUser.entries())
        .map(([userId, v]) => ({ userId, name: v.name, count: v.count, totalBase: round2(v.totalBase).toFixed(2) }))
        .sort((a, b) => Number(b.totalBase) - Number(a.totalBase)),
    };
  },

  /**
   * Detalle de ventas dentro del mismo período que getSalesStats, para los drill-down de
   * Administración → Estadísticas: cada venta con su comanda completa y sus pagos.
   * userId acepta un id de usuario real, "CUSTOMER" (bucket de autoservicio) o "ALL"
   * (todas las ventas del período, sin filtrar por quién la cargó).
   */
  async getSalesStatsUserOrders(restaurantId: string, range: 'week' | 'month', userId: string, from?: string, to?: string) {
    const custom = resolveCustomPeriod(from, to);
    const currentStart = custom?.start ?? salesStatsPeriodStart(range, new Date());

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        status: { not: 'CANCELLED' },
        createdAt: { gte: currentStart, ...(custom ? { lt: custom.end } : {}) },
        ...(userId === 'ALL' ? {} : { placedByUserId: userId === 'CUSTOMER' ? null : userId }),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        channel: true,
        status: true,
        paymentMethod: true,
        totalBase: true,
        totalBs: true,
        currency: true,
        customerName: true,
        createdAt: true,
        table: { select: { number: true } },
        items: { select: { productName: true, variantName: true, quantity: true, unitPrice: true, lineTotal: true } },
        payments: {
          select: { method: true, referenceNumber: true, amountBase: true, discountBase: true, createdAt: true },
        },
      },
    });

    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      channel: o.channel,
      status: o.status,
      paymentMethod: o.paymentMethod,
      totalBase: o.totalBase.toFixed(2),
      totalBs: o.totalBs.toFixed(2),
      currency: o.currency,
      customerName: o.customerName,
      table: o.table?.number ?? null,
      createdAt: o.createdAt,
      items: o.items.map((i) => ({
        productName: i.variantName ? `${i.productName} (${i.variantName})` : i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice.toFixed(2),
        lineTotal: i.lineTotal.toFixed(2),
      })),
      payments: o.payments.map((p) => ({
        method: p.method,
        referenceNumber: p.referenceNumber,
        amountBase: p.amountBase.toFixed(2),
        discountBase: p.discountBase?.toFixed(2) ?? null,
        createdAt: p.createdAt,
      })),
    }));
  },
};
