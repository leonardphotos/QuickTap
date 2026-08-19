import { relayDb } from './db.js';

/**
 * Ingesta del snapshot de catálogo que manda la nube (`GET /api/v1/offline/catalog-snapshot`).
 *
 * Se corre cada pocos minutos MIENTRAS HAY internet, para que el relé esté listo el día que se
 * caiga. Es idempotente: siempre pisa lo que había con lo que llegó, así el catálogo local
 * nunca se desvía del real.
 *
 * Incluye el stock de insumos: acá se PISA a propósito con el valor de la nube. Si durante un
 * corte el relé descontó de más o de menos, ese error se corrige solo en la próxima
 * sincronización en vez de acumularse.
 */

export interface CatalogSnapshot {
  generatedAt: string;
  restaurant: {
    id: string;
    name: string;
    baseCurrency: 'USD' | 'EUR';
    serviceChargeEnabled: boolean;
    ivaEnabled: boolean;
    exchangeRate: string;
  };
  zones: { id: string; name: string; priority: number }[];
  tables: {
    id: string;
    zoneId: string | null;
    number: string;
    qrToken: string;
    seats: number;
    mergedIntoTableId: string | null;
  }[];
  kitchens: { id: string; name: string; priority: number }[];
  products: {
    id: string;
    kitchenId: string | null;
    name: string;
    price: string;
    isAvailable: boolean;
    pricingMode: string;
    priority: number;
    categoryName: string | null;
    variants: {
      id: string;
      name: string;
      priceBase: string;
      packagingFeeBase: string;
      discountBase: string;
      isAvailable: boolean;
      priority: number;
    }[];
    modifierCategoryIds: { modifierCategoryId: string; maxSelectionsOverride: number | null }[];
  }[];
  modifierCategories: {
    id: string;
    name: string;
    isRequired: boolean;
    allowMultiple: boolean;
    maxSelections: number | null;
    minSelections: number | null;
    priority: number;
    modifiers: {
      id: string;
      name: string;
      priceBase: string;
      discountBase: string;
      isAvailable: boolean;
      maxQuantity: number | null;
      priority: number;
      variantPrices: { variantId: string; priceBase: string }[];
    }[];
  }[];
  openSessions: {
    id: string;
    tableId: string;
    customerName: string;
    customerIdNumber: string;
    customerPhone: string | null;
    label: string | null;
    openedAt: string;
  }[];
  inventoryItems: { id: string; name: string; unit: string; quantity: string; minQuantity: string }[];
  productConsumption: { productId: string; variantName: string | null; inventoryItemId: string; quantity: string }[];
  modifierConsumption: { modifierId: string; inventoryItemId: string; quantity: string }[];
}

export async function applySnapshot(snap: CatalogSnapshot): Promise<{ appliedAt: Date }> {
  const db = relayDb();
  const restaurantId = snap.restaurant.id;

  await db.$transaction(async (tx) => {
    await tx.restaurant.upsert({
      where: { id: restaurantId },
      create: {
        id: restaurantId,
        name: snap.restaurant.name,
        baseCurrency: snap.restaurant.baseCurrency,
        serviceChargeEnabled: snap.restaurant.serviceChargeEnabled,
        ivaEnabled: snap.restaurant.ivaEnabled,
        exchangeRate: snap.restaurant.exchangeRate,
        syncedAt: new Date(),
      },
      update: {
        name: snap.restaurant.name,
        baseCurrency: snap.restaurant.baseCurrency,
        serviceChargeEnabled: snap.restaurant.serviceChargeEnabled,
        ivaEnabled: snap.restaurant.ivaEnabled,
        exchangeRate: snap.restaurant.exchangeRate,
        syncedAt: new Date(),
      },
    });

    for (const z of snap.zones) {
      await tx.zone.upsert({
        where: { id: z.id },
        create: { id: z.id, restaurantId, name: z.name, priority: z.priority },
        update: { name: z.name, priority: z.priority },
      });
    }

    for (const t of snap.tables) {
      await tx.table.upsert({
        where: { id: t.id },
        create: {
          id: t.id,
          restaurantId,
          zoneId: t.zoneId,
          number: t.number,
          qrToken: t.qrToken,
          seats: t.seats,
          mergedIntoTableId: t.mergedIntoTableId,
        },
        update: {
          zoneId: t.zoneId,
          number: t.number,
          qrToken: t.qrToken,
          seats: t.seats,
          mergedIntoTableId: t.mergedIntoTableId,
        },
      });
    }

    for (const k of snap.kitchens) {
      await tx.kitchen.upsert({
        where: { id: k.id },
        create: { id: k.id, restaurantId, name: k.name, priority: k.priority },
        update: { name: k.name, priority: k.priority },
      });
    }

    // Categorías y modificadores antes que los productos: los vínculos los referencian.
    for (const c of snap.modifierCategories) {
      await tx.modifierCategory.upsert({
        where: { id: c.id },
        create: {
          id: c.id,
          restaurantId,
          name: c.name,
          isRequired: c.isRequired,
          allowMultiple: c.allowMultiple,
          maxSelections: c.maxSelections,
          minSelections: c.minSelections,
          priority: c.priority,
        },
        update: {
          name: c.name,
          isRequired: c.isRequired,
          allowMultiple: c.allowMultiple,
          maxSelections: c.maxSelections,
          minSelections: c.minSelections,
          priority: c.priority,
        },
      });
      for (const m of c.modifiers) {
        await tx.modifier.upsert({
          where: { id: m.id },
          create: {
            id: m.id,
            categoryId: c.id,
            name: m.name,
            priceBase: m.priceBase,
            discountBase: m.discountBase,
            isAvailable: m.isAvailable,
            maxQuantity: m.maxQuantity,
            priority: m.priority,
          },
          update: {
            categoryId: c.id,
            name: m.name,
            priceBase: m.priceBase,
            discountBase: m.discountBase,
            isAvailable: m.isAvailable,
            maxQuantity: m.maxQuantity,
            priority: m.priority,
          },
        });
      }
    }

    for (const p of snap.products) {
      await tx.product.upsert({
        where: { id: p.id },
        create: {
          id: p.id,
          restaurantId,
          kitchenId: p.kitchenId,
          name: p.name,
          price: p.price,
          isAvailable: p.isAvailable,
          pricingMode: p.pricingMode,
          categoryName: p.categoryName,
          priority: p.priority,
        },
        update: {
          kitchenId: p.kitchenId,
          name: p.name,
          price: p.price,
          isAvailable: p.isAvailable,
          pricingMode: p.pricingMode,
          categoryName: p.categoryName,
          priority: p.priority,
        },
      });
      for (const v of p.variants) {
        await tx.productVariant.upsert({
          where: { id: v.id },
          create: {
            id: v.id,
            productId: p.id,
            name: v.name,
            priceBase: v.priceBase,
            packagingFeeBase: v.packagingFeeBase,
            discountBase: v.discountBase,
            isAvailable: v.isAvailable,
            priority: v.priority,
          },
          update: {
            name: v.name,
            priceBase: v.priceBase,
            packagingFeeBase: v.packagingFeeBase,
            discountBase: v.discountBase,
            isAvailable: v.isAvailable,
            priority: v.priority,
          },
        });
      }
      // Vínculos producto <-> categoría: se reemplazan enteros, así un vínculo quitado en la
      // nube también desaparece acá.
      await tx.productModifierLink.deleteMany({ where: { productId: p.id } });
      for (const l of p.modifierCategoryIds) {
        await tx.productModifierLink.create({
          data: {
            id: `${p.id}:${l.modifierCategoryId}`,
            productId: p.id,
            modifierCategoryId: l.modifierCategoryId,
            maxSelectionsOverride: l.maxSelectionsOverride,
          },
        });
      }
    }

    // Precios de modificador por variante: se rearman completos.
    await tx.modifierVariantPrice.deleteMany({});
    for (const c of snap.modifierCategories) {
      for (const m of c.modifiers) {
        for (const vp of m.variantPrices) {
          await tx.modifierVariantPrice.create({
            data: {
              id: `${m.id}:${vp.variantId}`,
              modifierId: m.id,
              variantId: vp.variantId,
              priceBase: vp.priceBase,
            },
          });
        }
      }
    }

    // Cuentas ya abiertas en la nube: se traen para que, si el internet se cae con mesas
    // ocupadas, el relé siga sumando pedidos a ESA cuenta en vez de abrir una nueva.
    // Ya sincronizadas por definición — vinieron de la nube.
    for (const os of snap.openSessions ?? []) {
      await tx.tableSession.upsert({
        where: { id: os.id },
        create: {
          id: os.id,
          restaurantId,
          tableId: os.tableId,
          customerName: os.customerName,
          customerIdNumber: os.customerIdNumber,
          customerPhone: os.customerPhone,
          label: os.label,
          status: 'OPEN',
          openedAt: new Date(os.openedAt),
          syncedToCloud: true,
        },
        update: { status: 'OPEN', syncedToCloud: true },
      });
    }

    // Stock: se pisa con el de la nube a propósito (ver nota de arriba).
    for (const i of snap.inventoryItems) {
      await tx.inventoryItem.upsert({
        where: { id: i.id },
        create: {
          id: i.id,
          restaurantId,
          name: i.name,
          unit: i.unit,
          quantity: i.quantity,
          minQuantity: i.minQuantity,
        },
        update: { name: i.name, unit: i.unit, quantity: i.quantity, minQuantity: i.minQuantity },
      });
    }

    // Mapas de consumo: se reemplazan enteros, son derivados puros del catálogo.
    await tx.productConsumption.deleteMany({ where: { restaurantId } });
    for (const c of snap.productConsumption) {
      await tx.productConsumption.create({
        data: {
          restaurantId,
          productId: c.productId,
          variantName: c.variantName,
          inventoryItemId: c.inventoryItemId,
          quantity: c.quantity,
        },
      });
    }
    await tx.modifierConsumption.deleteMany({ where: { restaurantId } });
    for (const c of snap.modifierConsumption) {
      await tx.modifierConsumption.create({
        data: {
          restaurantId,
          modifierId: c.modifierId,
          inventoryItemId: c.inventoryItemId,
          quantity: c.quantity,
        },
      });
    }
  }, { timeout: 120000 });

  return { appliedAt: new Date() };
}
