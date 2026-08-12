import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { DEMO_LIVE_TOKENS, refreshClubDemo } from '../../utils/club-demo';
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

/**
 * Id de la tienda propia del club en el catálogo de la tablet. No es el id del
 * club a propósito: en `ClubTabOrder.kitchenRestaurantId` esa tienda se guarda
 * como `null` ("no hay tienda externa que prepare esto"), y usar un centinela
 * evita confundirla con una tienda vinculada que casualmente fuera el club.
 */
const CLUB_STORE_ID = 'CLUB';

/** Una línea del catálogo, venga de la tienda del club o de una vinculada. Las
 *  dos comparten forma para que la tablet las pinte con el mismo componente. */
interface CatalogItem {
  source: 'CLUB_STORE' | 'RESTAURANT';
  storeId: string;
  id: string;
  name: string;
  category: string;
  priceBase: string;
  photoUrl: string | null;
  /** Solo la tienda del club lleva stock; el menú de un restaurante no. */
  stock: number | null;
}

/** Lo consumido en una reserva, sumando solo lo que no está cancelado. */
function consumoOf(tabOrders: { totalBase: Prisma.Decimal; status: string }[]): Prisma.Decimal {
  return round2(
    tabOrders.filter((o) => o.status !== 'CANCELLED').reduce((acc, o) => acc.add(o.totalBase), toDecimal(0)),
  );
}

/** La cancha a la que está atornillada esta tablet. Dueño/Admin/Cajero entran sin
 * cancha asignada (prueban la pantalla desde el panel) y no se les filtra. */
async function tabletCourtIdOf(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, clubCourtId: true } });
  return user?.role === 'CANCHA' ? user.clubCourtId : null;
}

/**
 * Lo que vende una tienda vinculada, ya normalizado. Un restaurante vende de su
 * Menú (`Product`, con precio de promo vigente) y un local de su Tienda
 * (`ShopProduct`, con existencia real). Sin esta bifurcación, vincular un local
 * mostraba una tienda vacía y nadie entendía por qué.
 */
async function readStoreCatalog(store: { id: string }) {
  const info = await prisma.restaurant.findUniqueOrThrow({
    where: { id: store.id },
    select: { businessType: true },
  });

  if (info.businessType === 'SHOP') {
    const products = await prisma.shopProduct.findMany({
      where: { restaurantId: store.id },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: { variants: true },
    });
    return products
      .filter((p) => p.variants.reduce((acc, v) => acc + v.stock, 0) > 0)
      .map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category || 'Tienda',
        priceBase: p.price.toFixed(2),
        photoUrl: p.photoUrl,
      }));
  }

  const now = new Date();
  const menu = await prisma.product.findMany({
    where: { restaurantId: store.id, isAvailable: true, category: { isActive: true } },
    orderBy: [{ category: { priority: 'asc' } }, { name: 'asc' }],
    include: { category: { select: { name: true } } },
  });
  return menu
    .filter((p) => !(p.stockControlEnabled && (p.stockQuantity ?? 0) <= 0))
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category?.name ?? 'Menú',
      priceBase: effectiveProductPrice(p, now).toFixed(2),
      photoUrl: p.photoUrl,
    }));
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
  async getSession(clubId: string, userId: string, accessToken: string) {
    // La demo desliza sus reservas en vivo para que el QR nunca caduque; si no se
    // refrescara acá, escanear en la tablet sin haber abierto antes el panel
    // devolvería "esta reserva ya terminó". Con un token de demo se fuerza,
    // saltándose el throttle: escanear justo dentro de esa ventana no puede
    // devolver un error.
    await refreshClubDemo(clubId, DEMO_LIVE_TOKENS.includes(accessToken));
    const booking = await loadSession(clubId, accessToken);

    // La tablet de la Cancha 2 no abre el QR de una reserva de la Cancha 1: el
    // jugador se llevaría los pedidos a la cancha equivocada.
    const tabletCourtId = await tabletCourtIdOf(userId);
    if (tabletCourtId && booking.block.courtId !== tabletCourtId) {
      const own = await prisma.clubCourt.findUnique({ where: { id: tabletCourtId }, select: { name: true } });
      throw badRequest(
        `Esta reserva es de ${booking.block.court.name}. Esta tablet es de ${own?.name ?? 'otra cancha'}.`,
      );
    }

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
        // Para prellenar el torneo desde esta pantalla si el jugador ya confirmó
        // los nombres al reservar (ver createBookingSchema.tournamentPlayerNames).
        tournamentPlayerNames: (booking.tournamentPlayerNames as string[] | null) ?? null,
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
   * La cancha donde está montada esta tablet, para la portada de inicio.
   * Dueño/Admin/Cajero entran sin cancha asignada (prueban la pantalla desde el
   * panel) y reciben null: la portada cae al nombre del club.
   */
  async getOwnCourt(clubId: string, userId: string) {
    const courtId = await tabletCourtIdOf(userId);
    if (!courtId) return null;
    return prisma.clubCourt.findFirst({
      where: { id: courtId, restaurantId: clubId },
      select: { id: true, name: true, courtType: true },
    });
  },

  /**
   * Catálogo que ve el jugador, AGRUPADO POR TIENDA: primero la tienda propia
   * del club, después cada tienda vinculada (hasta 4). Cada una es un icono en
   * la tablet y una cuenta aparte.
   *
   * La lectura a los otros tenants está autorizada por el vínculo
   * (ClubRestaurantLink), que es lo único que la habilita.
   */
  async getCatalog(clubId: string) {
    const [club, kitchens] = await Promise.all([
      prisma.restaurant.findUniqueOrThrow({ where: { id: clubId }, select: { name: true, logoUrl: true } }),
      clubLinkService.resolveKitchensFor(clubId),
    ]);

    const [shopProducts, storeCatalogs] = await Promise.all([
      prisma.shopProduct.findMany({
        where: { restaurantId: clubId },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        include: { variants: true },
      }),
      // Una tienda vinculada puede ser un restaurante (vende de su Menú) o un
      // local (vende de su Tienda). Se lee lo que corresponda, si no una tienda
      // recién vinculada aparecería vacía sin explicación.
      Promise.all(kitchens.map((k) => readStoreCatalog(k))),
    ]);

    const clubItems: CatalogItem[] = shopProducts
      .map((p) => {
        const stock = p.variants.reduce((acc, v) => acc + v.stock, 0);
        return {
          source: 'CLUB_STORE' as const,
          storeId: CLUB_STORE_ID,
          id: p.id,
          name: p.name,
          category: p.category || 'Tienda',
          priceBase: p.price.toFixed(2),
          photoUrl: p.photoUrl,
          stock,
        };
      })
      .filter((p) => (p.stock ?? 0) > 0);

    const stores: { id: string; name: string; logoUrl: string | null; items: CatalogItem[] }[] = [
      // La tienda del club va primero y siempre existe, aunque esté vacía: es la
      // que despacha agua y pelotas sin depender de nadie.
      {
        id: CLUB_STORE_ID,
        name: 'Tienda del club',
        logoUrl: club.logoUrl,
        items: clubItems,
      },
      ...kitchens.map((k, i) => ({
        id: k.id,
        name: k.name,
        logoUrl: k.logoUrl,
        items: storeCatalogs[i].map((p) => ({
          // 'RESTAURANT' acá significa "de una tienda vinculada", sea restaurante
          // o local: es lo que separa esas líneas de las de la tienda del club.
          source: 'RESTAURANT' as const,
          storeId: k.id,
          id: p.id,
          name: p.name,
          category: p.category,
          priceBase: p.priceBase,
          photoUrl: p.photoUrl,
          stock: null as number | null,
        })),
      })),
    ].filter((s) => s.items.length > 0);

    return { stores };
  },

  /**
   * El jugador manda su pedido desde la cancha. Una comanda es SIEMPRE de una
   * sola tienda (`input.storeId`): así cada una cobra lo suyo y recibe solo lo
   * que ella prepara. Los precios se resuelven acá (nunca se confía en el
   * cliente) y el total se congela, igual que en Order.
   */
  async createOrder(clubId: string, userId: string, input: CreateTabOrderInput) {
    const booking = await loadSession(clubId, input.accessToken);

    const tabletCourtId = await tabletCourtIdOf(userId);
    if (tabletCourtId && booking.block.courtId !== tabletCourtId) {
      throw badRequest('Esta reserva no es de esta cancha.');
    }

    if (Date.now() > booking.block.endsAt.getTime()) {
      throw badRequest('Tu tiempo de cancha terminó. Pasa por caja para cerrar tu cuenta.');
    }

    const isClubStore = input.storeId === CLUB_STORE_ID;
    // La tienda tiene que estar vinculada AHORA. Es lo que autoriza a leerle los
    // productos y a mandarle la comanda; sin esta comprobación un storeId
    // inventado por el cliente alcanzaría para pedirle a cualquier tenant.
    const kitchen = isClubStore
      ? null
      : (await clubLinkService.resolveKitchensFor(clubId)).find((k) => k.id === input.storeId) ?? null;
    if (!isClubStore && !kitchen) {
      throw badRequest('Esa tienda ya no está vinculada a este club.');
    }

    const productIds = input.items.map((i) => i.productId);

    const [shopProducts, storeCatalog] = await Promise.all([
      isClubStore
        ? prisma.shopProduct.findMany({ where: { id: { in: productIds }, restaurantId: clubId }, include: { variants: true } })
        : Promise.resolve([]),
      // Se valida contra el MISMO catálogo que se le mostró al jugador, así el
      // precio cobrado es exactamente el que vio (y un producto retirado del
      // menú deja de poder pedirse aunque el cliente mande su id).
      kitchen ? readStoreCatalog(kitchen) : Promise.resolve([]),
    ]);

    const lines: Prisma.ClubTabItemCreateWithoutOrderInput[] = [];
    // Varias líneas del mismo producto de tienda tienen que descontar stock
    // sumado, no cada una por su lado.
    const stockToDrop = new Map<string, { variantV1: string; quantity: number }>();

    for (const item of input.items) {
      if (isClubStore) {
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
        const product = storeCatalog.find((p) => p.id === item.productId);
        if (!product) throw badRequest('Uno de los productos ya no está disponible.');
        const unitPrice = round2(toDecimal(product.priceBase));
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

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.clubTabOrder.create({
        data: {
          restaurantId: clubId,
          bookingId: booking.id,
          courtName: booking.block.court.name,
          totalBase,
          exchangeRate: rate.rateBs,
          totalBs: round2(totalBase.mul(rate.rateBs)),
          // null = la tienda propia del club; si no, la tienda que prepara y cobra.
          kitchenRestaurantId: kitchen?.id ?? null,
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

    // El club refresca su Caja; la tienda, su cola de comandas.
    emitToKitchen(clubId, SocketEvents.CLUB_TAB_ORDER_NEW, { id: order.id, bookingId: booking.id });
    if (kitchen) {
      emitToKitchen(kitchen.id, SocketEvents.CLUB_TAB_ORDER_NEW, { id: order.id, courtName: order.courtName });
    }

    return {
      id: order.id,
      totalBase: order.totalBase.toFixed(2),
      totalBs: order.totalBs.toFixed(2),
      items: order.items.map((i) => ({ productName: i.productName, quantity: i.quantity, lineTotal: i.lineTotal.toFixed(2) })),
    };
  },
};
