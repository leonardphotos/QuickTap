import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { round2, toDecimal } from '../../utils/money';
import { effectiveProductPrice } from '../../utils/promo-price';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import { clubLinkService } from '../club-link/club-link.service';
import { emitToKitchen, SocketEvents } from '../../sockets';
import type { CreateTabOrderInput } from './club-tablet.dto';

/**
 * Ventana en la que el QR de una reserva abre la tablet. Antes de empezar se
 * permite entrar un rato (el jugador llega temprano y ya quiere pedir); después
 * de terminar se sigue permitiendo un rato más, que es justo cuando la tablet
 * tiene que mostrar el total y mandarlo a caja.
 */
const OPEN_BEFORE_MINUTES = 30;
const OPEN_AFTER_MINUTES = 60;

/** Lo consumido en una reserva, sumando solo lo que no está cancelado. */
function consumoOf(tabOrders: { totalBase: Prisma.Decimal; status: string }[]): Prisma.Decimal {
  return round2(
    tabOrders.filter((o) => o.status !== 'CANCELLED').reduce((acc, o) => acc.add(o.totalBase), toDecimal(0)),
  );
}

async function loadSession(clubId: string, accessToken: string) {
  const booking = await prisma.clubBooking.findUnique({
    where: { accessToken },
    include: {
      block: { include: { court: { select: { id: true, name: true } } } },
      payments: { select: { amountBase: true } },
      tabOrders: {
        where: { status: { not: 'CANCELLED' } },
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      },
    },
  });

  // Mismo criterio que el check-in de recepción: un token de otro club no existe
  // para este tenant.
  if (!booking || booking.restaurantId !== clubId) throw notFound('Esta reserva no existe.');
  if (booking.status === 'CANCELLED') throw badRequest('Esta reserva fue cancelada.');

  return booking;
}

export const clubTabletService = {
  /**
   * Abre la sesión de la tablet a partir del QR del jugador. Devuelve todo lo
   * que la pantalla necesita: a quién saludar, cuánto tiempo queda y qué lleva
   * consumido.
   */
  async getSession(clubId: string, accessToken: string) {
    const booking = await loadSession(clubId, accessToken);

    const now = Date.now();
    const startsAt = booking.block.startsAt.getTime();
    const endsAt = booking.block.endsAt.getTime();
    if (now < startsAt - OPEN_BEFORE_MINUTES * 60_000) {
      throw badRequest('Tu reserva todavía no empieza. Vuelve unos minutos antes de tu hora.');
    }
    if (now > endsAt + OPEN_AFTER_MINUTES * 60_000) {
      throw badRequest('Esta reserva ya terminó. Acércate a caja si tienes algo pendiente.');
    }

    const consumoBase = consumoOf(booking.tabOrders);
    const paidBase = round2(booking.payments.reduce((acc, p) => acc.add(p.amountBase), toDecimal(0)));
    const dueBase = round2(booking.totalBase.add(consumoBase));

    return {
      booking: {
        id: booking.id,
        accessToken: booking.accessToken,
        playerName: booking.playerName,
        playerCount: booking.playerCount,
        courtName: booking.block.court.name,
        startsAt: booking.block.startsAt,
        endsAt: booking.block.endsAt,
        remainingMinutes: Math.max(0, Math.round((endsAt - now) / 60_000)),
        finished: now >= endsAt,
      },
      money: {
        courtBase: booking.totalBase.toFixed(2),
        consumoBase: consumoBase.toFixed(2),
        dueBase: dueBase.toFixed(2),
        paidBase: paidBase.toFixed(2),
        balanceBase: round2(Prisma.Decimal.max(0, dueBase.sub(paidBase))).toFixed(2),
        exchangeRate: booking.exchangeRate.toFixed(4),
      },
      orders: booking.tabOrders.map((o) => ({
        id: o.id,
        status: o.status,
        totalBase: o.totalBase.toFixed(2),
        createdAt: o.createdAt,
        items: o.items.map((i) => ({ productName: i.productName, quantity: i.quantity, lineTotal: i.lineTotal.toFixed(2) })),
      })),
    };
  },

  /**
   * Catálogo que ve el jugador: la tienda del club y el menú del restaurante
   * vinculado, en una sola lista. La lectura al otro tenant está autorizada por
   * el vínculo (ClubRestaurantLink), que es lo único que la habilita.
   */
  async getCatalog(clubId: string) {
    const kitchen = await clubLinkService.resolveKitchenFor(clubId);

    const [shopProducts, menu] = await Promise.all([
      prisma.shopProduct.findMany({
        where: { restaurantId: clubId },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        include: { variants: true },
      }),
      kitchen
        ? prisma.product.findMany({
            where: { restaurantId: kitchen.id, isAvailable: true, category: { isActive: true } },
            orderBy: [{ category: { priority: 'asc' } }, { name: 'asc' }],
            include: { category: { select: { name: true } } },
          })
        : Promise.resolve([]),
    ]);

    const now = new Date();

    const clubItems = shopProducts
      .map((p) => {
        const stock = p.variants.reduce((acc, v) => acc + v.stock, 0);
        return {
          source: 'CLUB_STORE' as const,
          id: p.id,
          name: p.name,
          category: p.category || 'Tienda',
          priceBase: p.price.toFixed(2),
          photoUrl: p.photoUrl,
          stock,
        };
      })
      .filter((p) => p.stock > 0);

    const menuItems = menu
      .filter((p) => !(p.stockControlEnabled && (p.stockQuantity ?? 0) <= 0))
      .map((p) => ({
        source: 'RESTAURANT' as const,
        id: p.id,
        name: p.name,
        category: p.category?.name ?? 'Menú',
        priceBase: effectiveProductPrice(p, now).toFixed(2),
        photoUrl: p.photoUrl,
        stock: null as number | null,
      }));

    return {
      kitchen: kitchen ? { id: kitchen.id, name: kitchen.name, logoUrl: kitchen.logoUrl } : null,
      items: [...menuItems, ...clubItems],
    };
  },

  /**
   * El jugador manda su pedido desde la cancha. Los precios se resuelven acá
   * (nunca se confía en el cliente) y el total se congela, igual que en Order.
   */
  async createOrder(clubId: string, input: CreateTabOrderInput) {
    const booking = await loadSession(clubId, input.accessToken);
    if (Date.now() > booking.block.endsAt.getTime()) {
      throw badRequest('Tu tiempo de cancha terminó. Pasa por caja para cerrar tu cuenta.');
    }

    const kitchen = await clubLinkService.resolveKitchenFor(clubId);

    const clubIds = input.items.filter((i) => i.source === 'CLUB_STORE').map((i) => i.productId);
    const menuIds = input.items.filter((i) => i.source === 'RESTAURANT').map((i) => i.productId);

    if (menuIds.length > 0 && !kitchen) {
      throw badRequest('Este club no tiene un restaurante vinculado en este momento.');
    }

    const [shopProducts, menuProducts] = await Promise.all([
      clubIds.length
        ? prisma.shopProduct.findMany({ where: { id: { in: clubIds }, restaurantId: clubId }, include: { variants: true } })
        : Promise.resolve([]),
      menuIds.length && kitchen
        ? prisma.product.findMany({ where: { id: { in: menuIds }, restaurantId: kitchen.id, isAvailable: true } })
        : Promise.resolve([]),
    ]);

    const now = new Date();
    const lines: Prisma.ClubTabItemCreateWithoutOrderInput[] = [];
    // Varias líneas del mismo producto de tienda tienen que descontar stock
    // sumado, no cada una por su lado.
    const stockToDrop = new Map<string, { variantV1: string; quantity: number }>();

    for (const item of input.items) {
      if (item.source === 'CLUB_STORE') {
        const product = shopProducts.find((p) => p.id === item.productId);
        if (!product) throw badRequest('Uno de los productos ya no está disponible.');
        const variant = product.variants[0];
        if (!variant) throw badRequest(`"${product.name}" no tiene stock configurado.`);

        const prev = stockToDrop.get(product.id);
        const wanted = (prev?.quantity ?? 0) + item.quantity;
        if (wanted > variant.stock) throw badRequest(`No queda suficiente stock de "${product.name}".`);
        stockToDrop.set(product.id, { variantV1: variant.v1, quantity: wanted });

        const unitPrice = round2(product.price);
        lines.push({
          source: 'CLUB_STORE',
          sourceProductId: product.id,
          variantV1: variant.v1,
          productName: product.name,
          unitPrice,
          quantity: item.quantity,
          lineTotal: round2(unitPrice.mul(item.quantity)),
        });
      } else {
        const product = menuProducts.find((p) => p.id === item.productId);
        if (!product) throw badRequest('Uno de los productos del menú ya no está disponible.');
        const unitPrice = round2(effectiveProductPrice(product, now));
        lines.push({
          source: 'RESTAURANT',
          sourceProductId: product.id,
          productName: product.name,
          unitPrice,
          quantity: item.quantity,
          lineTotal: round2(unitPrice.mul(item.quantity)),
        });
      }
    }

    const totalBase = round2(lines.reduce((acc, l) => acc.add(l.lineTotal as Prisma.Decimal), toDecimal(0)));
    const club = await prisma.restaurant.findUniqueOrThrow({ where: { id: clubId }, select: { baseCurrency: true } });
    const rate = await exchangeRateService.getRate(club.baseCurrency, clubId);

    const hasKitchenLines = lines.some((l) => l.source === 'RESTAURANT');

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.clubTabOrder.create({
        data: {
          restaurantId: clubId,
          bookingId: booking.id,
          courtName: booking.block.court.name,
          totalBase,
          exchangeRate: rate.rateBs,
          totalBs: round2(totalBase.mul(rate.rateBs)),
          // Solo se le manda al restaurante si de verdad tiene algo que preparar.
          kitchenRestaurantId: hasKitchenLines ? kitchen!.id : null,
          items: { create: lines },
        },
        include: { items: true },
      });

      for (const [productId, drop] of stockToDrop) {
        await tx.shopProductVariant.updateMany({
          where: { productId, v1: drop.variantV1 },
          data: { stock: { decrement: drop.quantity } },
        });
      }

      return created;
    });

    // El club refresca su Caja; el restaurante, su cola de comandas.
    emitToKitchen(clubId, SocketEvents.CLUB_TAB_ORDER_NEW, { id: order.id, bookingId: booking.id });
    if (hasKitchenLines) {
      emitToKitchen(kitchen!.id, SocketEvents.CLUB_TAB_ORDER_NEW, { id: order.id, courtName: order.courtName });
    }

    return {
      id: order.id,
      totalBase: order.totalBase.toFixed(2),
      totalBs: order.totalBs.toFixed(2),
      items: order.items.map((i) => ({ productName: i.productName, quantity: i.quantity, lineTotal: i.lineTotal.toFixed(2) })),
    };
  },
};
