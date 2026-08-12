import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, conflict, forbidden, notFound } from '../../utils/http-error';
import { emitToKitchen, SocketEvents } from '../../sockets';

/** El código vive 1 hora, como pidió el negocio: suficiente para llamar al club
 * por teléfono y dictárselo, corto como para que no quede uno viejo dando vueltas. */
const CLUB_LINK_CODE_TTL_MINUTES = 60;

/** Sin 0/O/1/I/L: el código se dicta por teléfono y se teclea en una tablet. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function randomCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Cuántas tiendas puede vincular un club. El tope existe por la tablet: cada
 * tienda es un icono en la pantalla de la cancha, y más de cuatro dejan de
 * entrar de un vistazo (más la tienda propia del club, que siempre está).
 */
const MAX_LINKED_STORES = 4;

/** Tiendas vinculadas a un club, en el orden en que se muestran en la tablet. */
async function findLinksForClub(clubId: string) {
  return prisma.clubRestaurantLink.findMany({
    where: { clubId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: { restaurant: { select: { id: true, name: true, slug: true, logoUrl: true } } },
  });
}

export const clubLinkService = {
  // ------------------------------------------------- Lado restaurante: código

  /**
   * Genera un código nuevo e invalida los anteriores sin usar: en cualquier
   * momento hay como mucho un código válido por restaurante, así nadie se
   * confunde con uno viejo que todavía no venció.
   */
  async createCode(restaurantId: string) {
    const restaurant = await prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { businessType: true },
    });
    if (restaurant.businessType === 'SPORTS_CLUB') {
      throw badRequest('Un club no genera el código: lo genera el restaurante que le prepara los pedidos.');
    }

    const expiresAt = new Date(Date.now() + CLUB_LINK_CODE_TTL_MINUTES * 60_000);

    return prisma.$transaction(async (tx) => {
      await tx.clubLinkCode.deleteMany({ where: { restaurantId, usedAt: null } });

      // El @unique de `code` puede chocar con el de otro restaurante; con 31^6
      // combinaciones es rarísimo, pero reintentar es barato.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          return await tx.clubLinkCode.create({
            data: { restaurantId, code: randomCode(), expiresAt },
            select: { code: true, expiresAt: true, createdAt: true },
          });
        } catch (err) {
          const isDuplicate = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
          if (!isDuplicate || attempt === 4) throw err;
        }
      }
      throw conflict('No se pudo generar un código. Intenta de nuevo.');
    });
  },

  /** Estado del lado restaurante: el código vigente (si hay) y los clubes vinculados. */
  async getRestaurantState(restaurantId: string) {
    const now = new Date();
    const [code, links] = await Promise.all([
      prisma.clubLinkCode.findFirst({
        where: { restaurantId, usedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: 'desc' },
        select: { code: true, expiresAt: true },
      }),
      prisma.clubRestaurantLink.findMany({
        where: { restaurantId },
        orderBy: { createdAt: 'asc' },
        include: { club: { select: { id: true, name: true, slug: true, logoUrl: true } } },
      }),
    ]);

    return {
      activeCode: code,
      clubs: links.map((l) => ({ ...l.club, linkedAt: l.createdAt })),
    };
  },

  /** El restaurante corta el vínculo con uno de sus clubes. */
  async unlinkClub(restaurantId: string, clubId: string) {
    const link = await prisma.clubRestaurantLink.findFirst({ where: { clubId, restaurantId } });
    if (!link) throw notFound('Ese club no está vinculado a tu restaurante.');
    await prisma.clubRestaurantLink.delete({ where: { id: link.id } });
    return { ok: true };
  },

  // ------------------------------------------------------- Lado club: canjear

  async redeemCode(clubId: string, code: string) {
    const found = await prisma.clubLinkCode.findUnique({
      where: { code },
      include: { restaurant: { select: { id: true, name: true, slug: true, logoUrl: true, businessType: true, isActive: true } } },
    });

    if (!found || found.usedAt) throw notFound('Ese código no existe o ya se usó.');
    if (found.expiresAt.getTime() <= Date.now()) {
      throw badRequest('Ese código ya venció. Pídele al restaurante que genere uno nuevo.');
    }
    if (found.restaurantId === clubId) throw badRequest('No puedes vincular un club consigo mismo.');
    if (!found.restaurant.isActive) throw badRequest('Ese restaurante no está disponible.');
    if (found.restaurant.businessType === 'SPORTS_CLUB') {
      throw badRequest('Ese código es de otro club, no de un restaurante.');
    }

    const existing = await prisma.clubRestaurantLink.findMany({
      where: { clubId },
      select: { restaurantId: true },
    });
    if (existing.some((l) => l.restaurantId === found.restaurantId)) {
      throw conflict('Ya estás vinculado con esa tienda.');
    }
    if (existing.length >= MAX_LINKED_STORES) {
      throw conflict(
        `Ya tienes ${MAX_LINKED_STORES} tiendas vinculadas, que es el máximo. Desvincula una para agregar otra.`,
      );
    }

    await prisma.$transaction(async (tx) => {
      // Canjear un código SUMA una tienda. Antes reemplazaba a la anterior en
      // silencio (el club solo podía tener una); ahora se acumulan hasta
      // MAX_LINKED_STORES y salir de una es explícito, con "Desvincular".
      await tx.clubRestaurantLink.create({
        data: { clubId, restaurantId: found.restaurantId, sortOrder: existing.length },
      });
      await tx.clubLinkCode.update({
        where: { id: found.id },
        data: { usedAt: new Date(), usedByClubId: clubId },
      });
    });

    return { restaurant: { id: found.restaurant.id, name: found.restaurant.name, slug: found.restaurant.slug, logoUrl: found.restaurant.logoUrl } };
  },

  /** Las tiendas del club, para Ajustes. */
  async getClubLink(clubId: string) {
    const links = await findLinksForClub(clubId);
    return {
      stores: links.map((l) => ({ ...l.restaurant, linkedAt: l.createdAt })),
      maxStores: MAX_LINKED_STORES,
    };
  },

  /** El club corta el vínculo con UNA de sus tiendas. */
  async unlinkFromClub(clubId: string, restaurantId: string) {
    const link = await prisma.clubRestaurantLink.findFirst({ where: { clubId, restaurantId } });
    if (!link) throw notFound('Esa tienda no está vinculada a tu club.');
    await prisma.clubRestaurantLink.delete({ where: { id: link.id } });
    return { ok: true };
  },

  /**
   * Usado por el módulo de la tablet: a qué tiendas se les pueden mandar
   * comandas. Devuelve un array — una comanda va siempre a UNA sola de ellas.
   */
  async resolveKitchensFor(clubId: string) {
    const links = await findLinksForClub(clubId);
    return links.map((l) => l.restaurant);
  },

  // --------------------------------- Lado restaurante: comandas de las canchas

  /**
   * Las comandas que las canchas le mandaron a ESTE restaurante. Viven en el
   * tenant del club, pero `kitchenRestaurantId` lo escribe el servidor desde el
   * vínculo — nunca llega del cliente —, así que filtrar por él es seguro.
   */
  async listKitchenOrders(restaurantId: string, includeDelivered: boolean) {
    const orders = await prisma.clubTabOrder.findMany({
      where: {
        kitchenRestaurantId: restaurantId,
        status: includeDelivered ? { not: 'CANCELLED' } : { in: ['PENDING', 'PREPARING'] },
        // Entregados de hoy nada más: la pestaña es una cola de trabajo, no un histórico.
        ...(includeDelivered ? { createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      include: {
        items: true,
        restaurant: { select: { id: true, name: true } },
        booking: {
          select: {
            id: true,
            playerName: true,
            playerPhone: true,
            playerCount: true,
            block: { select: { startsAt: true, endsAt: true } },
          },
        },
      },
    });

    return orders.map((o) => ({
      id: o.id,
      courtName: o.courtName,
      status: o.status,
      totalBase: o.totalBase.toFixed(2),
      totalBs: o.totalBs.toFixed(2),
      createdAt: o.createdAt,
      deliveredAt: o.deliveredAt,
      club: o.restaurant,
      player: {
        name: o.booking.playerName,
        phone: o.booking.playerPhone,
        count: o.booking.playerCount,
        startsAt: o.booking.block.startsAt,
        endsAt: o.booking.block.endsAt,
      },
      // Al restaurante solo le interesan las líneas que él prepara; las de la
      // tienda del club (agua, pelotas) las despacha el propio club.
      items: o.items
        .filter((i) => i.source === 'RESTAURANT')
        .map((i) => ({ id: i.id, productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice.toFixed(2) })),
      clubItemCount: o.items.filter((i) => i.source === 'CLUB_STORE').length,
    }));
  },

  async setKitchenOrderStatus(restaurantId: string, orderId: string, status: 'PREPARING' | 'DELIVERED' | 'CANCELLED') {
    const order = await prisma.clubTabOrder.findFirst({
      where: { id: orderId, kitchenRestaurantId: restaurantId },
      select: { id: true, restaurantId: true, status: true },
    });
    if (!order) throw notFound('Esa comanda no existe o no es de tu restaurante.');
    if (order.status === 'CANCELLED') throw badRequest('Esa comanda ya fue cancelada.');

    const updated = await prisma.clubTabOrder.update({
      where: { id: orderId },
      data: { status, deliveredAt: status === 'DELIVERED' ? new Date() : null },
      select: { id: true, status: true, restaurantId: true },
    });

    // Los dos paneles miran la misma comanda: el club (para su Caja) y el
    // restaurante (para su cola).
    emitToKitchen(updated.restaurantId, SocketEvents.CLUB_TAB_ORDER_UPDATED, { id: updated.id });
    emitToKitchen(restaurantId, SocketEvents.CLUB_TAB_ORDER_UPDATED, { id: updated.id });
    return { id: updated.id, status: updated.status };
  },
};

export { CLUB_LINK_CODE_TTL_MINUTES };

/** Guard fino: el feed de comandas solo tiene sentido si hay al menos un club vinculado. */
export async function assertHasLinkedClubs(restaurantId: string): Promise<void> {
  const count = await prisma.clubRestaurantLink.count({ where: { restaurantId } });
  if (count === 0) throw forbidden('Tu restaurante no tiene canchas vinculadas.');
}
