import { Prisma } from '../node_modules/.prisma/relay-client/index.js';

/**
 * Motor de precios del relé — port 1:1 de `priceCart`/`calculateCharges` de
 * `src/modules/orders/order.service.ts`.
 *
 * Se copia en vez de importarse porque el backend real vive en otro paquete, con otro cliente
 * de Prisma y otras dependencias. La regla al tocar esto: **si cambia el cálculo en producción,
 * cambia acá también** — un pedido tomado sin conexión tiene que costar exactamente lo mismo
 * que uno tomado con conexión, o la cuenta no cuadra al reconectar.
 *
 * Lo que SÍ se simplificó a propósito, por estar fuera del alcance offline acordado:
 *  - precios de promoción por horario (`effectiveProductPrice`): el relé usa el precio normal.
 *  - envases/packaging por producto: solo se respeta el de la variante, que ya viene congelado.
 */

const round2 = (d: Prisma.Decimal) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const toDecimal = (n: number | string) => new Prisma.Decimal(n);

export interface CartItemInput {
  productId: string;
  variantId?: string;
  modifierIds?: string[];
  quantity: number;
  note?: string;
}

export interface PricedLineModifier {
  modifierId: string;
  name: string;
  priceBase: Prisma.Decimal;
  quantity: number;
}

export interface PricedLine {
  productId: string;
  productName: string;
  variantName: string | null;
  unitPrice: Prisma.Decimal;
  quantity: number;
  lineTotal: Prisma.Decimal;
  modifiers: PricedLineModifier[];
  note?: string;
  kitchenName: string | null;
}

/** Error de negocio: se traduce a HTTP 400 con el mismo mensaje que daría la nube. */
export class PricingError extends Error {}

/** Forma que necesita `priceCart` — la arma la consulta de `orders.ts`. */
export interface CatalogProduct {
  id: string;
  name: string;
  price: Prisma.Decimal;
  isAvailable: boolean;
  pricingMode: string;
  kitchen: { name: string } | null;
  variants: {
    id: string;
    name: string;
    priceBase: Prisma.Decimal;
    packagingFeeBase: Prisma.Decimal;
    discountBase: Prisma.Decimal;
    isAvailable: boolean;
  }[];
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
        priceBase: Prisma.Decimal;
        discountBase: Prisma.Decimal;
        isAvailable: boolean;
        maxQuantity: number | null;
        variantPrices: { variantId: string; priceBase: Prisma.Decimal }[];
      }[];
    };
  }[];
}

/**
 * Congela el precio de cada línea del carrito leyendo SIEMPRE del catálogo local —
 * nunca se confía en el precio que manda el cliente, igual que en producción.
 */
export function priceCart(items: CartItemInput[], products: CatalogProduct[]): PricedLine[] {
  const byId = new Map(products.map((p) => [p.id, p]));

  return items.map((item) => {
    const product = byId.get(item.productId);
    if (!product) throw new PricingError(`El producto ${item.productId} no existe en este restaurante.`);
    if (!product.isAvailable) throw new PricingError(`"${product.name}" no está disponible en este momento.`);

    let basePrice = product.price;
    let variantName: string | null = null;
    let variantId: string | null = null;

    if (product.pricingMode === 'VARIANTS') {
      const variant = product.variants.find((v) => v.id === item.variantId);
      if (!variant) throw new PricingError(`Elige una variante para "${product.name}".`);
      if (!variant.isAvailable) throw new PricingError(`"${variant.name}" no está disponible en este momento.`);
      basePrice = round2(variant.priceBase.add(variant.packagingFeeBase).sub(variant.discountBase));
      variantName = variant.name;
      variantId = variant.id;
    }

    // `modifierIds` es un multiset: el mismo id repetido N veces = "xN".
    const idCounts = new Map<string, number>();
    for (const id of item.modifierIds ?? []) {
      idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    }

    const modifierLines: PricedLineModifier[] = [];
    for (const link of product.modifierCategories) {
      const category = link.modifierCategory;
      const chosen = category.modifiers.filter((m) => idCounts.has(m.id));
      const totalSelected = chosen.reduce((acc, m) => acc + (idCounts.get(m.id) ?? 0), 0);

      // isRequired manda: una categoría opcional nunca bloquea el carrito aunque
      // arrastre un minSelections viejo.
      const effectiveMin = category.isRequired ? (category.minSelections ?? 1) : 0;
      if (totalSelected < effectiveMin) {
        throw new PricingError(
          effectiveMin <= 1
            ? `Elige una opción de "${category.name}" para "${product.name}".`
            : `Elige al menos ${effectiveMin} opciones de "${category.name}" para "${product.name}".`,
        );
      }

      const effectiveMax =
        link.maxSelectionsOverride ?? category.maxSelections ?? (category.allowMultiple ? Infinity : 1);
      if (totalSelected > effectiveMax) {
        throw new PricingError(`Elige como máximo ${effectiveMax} opciones de "${category.name}" para "${product.name}".`);
      }

      for (const m of chosen) {
        if (!m.isAvailable) throw new PricingError(`"${m.name}" no está disponible en este momento.`);
        const chosenQty = idCounts.get(m.id) ?? 1;
        if (m.maxQuantity != null && chosenQty > m.maxQuantity) {
          throw new PricingError(`Elige como máximo ${m.maxQuantity} de "${m.name}" en "${product.name}".`);
        }
        const variantOverride = variantId ? m.variantPrices.find((vp) => vp.variantId === variantId) : undefined;
        const effectivePriceBase = variantOverride?.priceBase ?? m.priceBase;
        modifierLines.push({
          modifierId: m.id,
          name: m.name,
          priceBase: round2(effectivePriceBase.sub(m.discountBase)),
          quantity: chosenQty,
        });
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

export function sumSubtotal(lines: PricedLine[]): Prisma.Decimal {
  return round2(lines.reduce((acc, l) => acc.add(l.lineTotal), toDecimal(0)));
}

// Mismos porcentajes fijos que producción: el restaurante los activa o no, pero no los cambia.
const SERVICE_CHARGE_RATE = 0.1;
const IVA_RATE = 0.16;

export function calculateCharges(
  subtotalBase: Prisma.Decimal,
  restaurant: { serviceChargeEnabled: boolean; serviceChargeChannels: string[]; ivaEnabled: boolean },
  channel: string,
) {
  const serviceChargeBase = restaurant.serviceChargeEnabled && restaurant.serviceChargeChannels.includes(channel)
    ? round2(subtotalBase.mul(SERVICE_CHARGE_RATE))
    : toDecimal(0);
  const ivaBase = restaurant.ivaEnabled ? round2(subtotalBase.mul(IVA_RATE)) : toDecimal(0);
  const totalBase = round2(subtotalBase.add(serviceChargeBase).add(ivaBase));
  return { serviceChargeBase, ivaBase, totalBase };
}

export function baseToBs(totalBase: Prisma.Decimal, rateBs: Prisma.Decimal): Prisma.Decimal {
  return totalBase.mul(rateBs).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
