import { customAlphabet } from 'nanoid';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';

/**
 * Entradas de los eventos de un local (ShopProduct.isEvent).
 *
 * Se emiten con el pago YA verificado: una venta del POS, o un pedido de la tienda que el local
 * confirmó. Los dos caminos terminan en shopService.recordSale, así que la emisión se engancha
 * ahí y no hay dos lugares que puedan quedar desalineados.
 *
 * El QR lleva un token opaco, mismo criterio que Table.qrToken y ClubBooking.accessToken: no
 * codifica los datos del boleto, solo lo identifica. Quien lo tenga puede mostrarlo en la
 * puerta, pero no puede deducir el de otro ni fabricarse uno.
 */

// Alfabeto sin caracteres que se confunden al leer o dictar (0/O, 1/I/l).
const nuevoToken = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', 16);

/**
 * Emite las entradas de las líneas de un ticket que sean eventos.
 *
 * Corre DENTRO de la transacción de la venta: si la venta se cae, no quedan boletos sueltos de
 * una compra que nunca existió.
 */
export async function emitirEntradas(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  params: {
    shopSaleId: string;
    shopOrderId?: string | null;
    holderName?: string | null;
    holderPhone?: string | null;
    items: { productId?: string | null; name: string; qty: number; price: number }[];
  },
) {
  const ids = [...new Set(params.items.map((i) => i.productId).filter((v): v is string => !!v))];
  if (ids.length === 0) return [];

  const eventos = await tx.shopProduct.findMany({
    where: { id: { in: ids }, restaurantId, isEvent: true },
    select: { id: true, name: true, eventDate: true, eventTime: true },
  });
  if (eventos.length === 0) return [];
  const porId = new Map(eventos.map((e) => [e.id, e]));

  const emitidos: {
    id: string;
    accessToken: string;
    seatNumber: number;
    eventName: string;
    eventDate: string | null;
    eventTime: string | null;
    price: number;
    holderName: string | null;
  }[] = [];

  for (const item of params.items) {
    const evento = item.productId ? porId.get(item.productId) : null;
    if (!evento) continue;

    // Una entrada por puesto vendido: 3 entradas = 3 boletos, cada uno con su QR. Un solo QR
    // para 3 personas no se podría verificar en la puerta (entra el primero y los otros dos
    // quedan sin poder marcar, o peor, el mismo código sirve tres veces).
    const cuantas = Math.max(1, Math.round(item.qty));

    // Candado por evento: dos cajas vendiendo a la vez leerían el mismo último puesto y
    // chocarían contra el índice único (productId, seatNumber).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'shop-ticket:' + evento.id}))`;
    const ultimo = await tx.shopTicket.findFirst({
      where: { productId: evento.id },
      orderBy: { seatNumber: 'desc' },
      select: { seatNumber: true },
    });
    let siguiente = (ultimo?.seatNumber ?? 0) + 1;

    for (let i = 0; i < cuantas; i += 1) {
      const creado = await tx.shopTicket.create({
        data: {
          restaurantId,
          productId: evento.id,
          shopSaleId: params.shopSaleId,
          shopOrderId: params.shopOrderId ?? null,
          accessToken: nuevoToken(),
          // Congelados: corregir el evento después no reescribe un boleto ya entregado.
          eventName: evento.name,
          eventDate: evento.eventDate,
          eventTime: evento.eventTime,
          price: item.price,
          holderName: params.holderName ?? null,
          holderPhone: params.holderPhone ?? null,
          seatNumber: siguiente,
        },
        // Los mismos campos que quedaron congelados: la imagen descargable del boleto (ver
        // TicketDownloadRig en el frontend) los necesita completos, no solo el token.
        select: {
          id: true,
          accessToken: true,
          seatNumber: true,
          eventName: true,
          eventDate: true,
          eventTime: true,
          price: true,
          holderName: true,
        },
      });
      emitidos.push(creado);
      siguiente += 1;
    }
  }

  return emitidos;
}

export const shopTicketsService = {
  /** Un boleto por su token, para la página pública que ve el asistente. */
  async porToken(accessToken: string) {
    const t = await prisma.shopTicket.findUnique({
      where: { accessToken },
      include: {
        restaurant: { select: { name: true, logoUrl: true, whatsappPhone: true } },
        // El arte del boleto se lee EN VIVO del evento, no se congela como el resto: si el
        // local sube una imagen mejor (o corrige una mal cortada), las entradas ya entregadas
        // se actualizan solas. Nombre, fecha y precio sí quedan congelados — esos son el trato.
        product: { select: { photoUrl: true } },
      },
    });
    if (!t) throw notFound('Esta entrada no existe.');
    return {
      accessToken: t.accessToken,
      negocio: t.restaurant.name,
      logoUrl: t.restaurant.logoUrl,
      imagen: t.product?.photoUrl ?? null,
      evento: t.eventName,
      fecha: t.eventDate,
      hora: t.eventTime,
      puesto: t.seatNumber,
      precio: t.price,
      titular: t.holderName,
      usada: t.checkedInAt != null,
      usadaEl: t.checkedInAt,
      emitida: t.createdAt,
    };
  },

  /** Entradas de un evento, para la lista de asistentes del local. */
  async listar(restaurantId: string, productId: string) {
    const tickets = await prisma.shopTicket.findMany({
      where: { restaurantId, productId },
      orderBy: { seatNumber: 'asc' },
    });
    return {
      total: tickets.length,
      verificadas: tickets.filter((t) => t.checkedInAt).length,
      tickets: tickets.map((t) => ({
        id: t.id,
        accessToken: t.accessToken,
        puesto: t.seatNumber,
        titular: t.holderName,
        telefono: t.holderPhone,
        precio: t.price,
        usada: t.checkedInAt != null,
        usadaEl: t.checkedInAt,
      })),
    };
  },

  /** Los eventos del local que ya tienen entradas emitidas, para elegir cuál se verifica. */
  async eventosConEntradas(restaurantId: string) {
    const eventos = await prisma.shopProduct.findMany({
      where: { restaurantId, isEvent: true },
      select: { id: true, name: true, eventDate: true, eventTime: true, eventSeats: true },
      orderBy: { eventDate: 'asc' },
    });
    const conteos = await prisma.shopTicket.groupBy({
      by: ['productId'],
      where: { restaurantId },
      _count: { _all: true },
    });
    const verificadas = await prisma.shopTicket.groupBy({
      by: ['productId'],
      where: { restaurantId, checkedInAt: { not: null } },
      _count: { _all: true },
    });
    const emitidasPor = new Map(conteos.map((c) => [c.productId, c._count._all]));
    const verificadasPor = new Map(verificadas.map((c) => [c.productId, c._count._all]));

    return eventos.map((e) => ({
      id: e.id,
      nombre: e.name,
      fecha: e.eventDate,
      hora: e.eventTime,
      cupo: e.eventSeats,
      emitidas: emitidasPor.get(e.id) ?? 0,
      verificadas: verificadasPor.get(e.id) ?? 0,
    }));
  },

  /**
   * Marca una entrada como usada en la puerta.
   *
   * Es lo que impide las entradas duplicadas: la segunda vez que se escane el mismo código, en
   * vez de dejar pasar responde que YA se usó y cuándo. No se lanza error —el verificador tiene
   * que ver en pantalla qué pasó, no un fallo—, se devuelve el resultado.
   */
  async verificar(restaurantId: string, accessToken: string, userId?: string) {
    const t = await prisma.shopTicket.findUnique({ where: { accessToken } });
    if (!t || t.restaurantId !== restaurantId) {
      // Mismo mensaje para "no existe" y "es de otro local": distinguirlos le diría a quien
      // prueba códigos al azar cuándo acertó uno real.
      return { resultado: 'INVALIDA' as const, mensaje: 'Esta entrada no es de este evento.' };
    }

    if (t.checkedInAt) {
      return {
        resultado: 'REPETIDA' as const,
        mensaje: `Puesto ${t.seatNumber} ya entró.`,
        ticket: { evento: t.eventName, puesto: t.seatNumber, titular: t.holderName, usadaEl: t.checkedInAt },
      };
    }

    const actualizado = await prisma.shopTicket.update({
      where: { id: t.id },
      data: { checkedInAt: new Date(), checkedInByUserId: userId ?? null },
    });
    return {
      resultado: 'OK' as const,
      mensaje: `Puesto ${actualizado.seatNumber} verificado.`,
      ticket: {
        evento: actualizado.eventName,
        puesto: actualizado.seatNumber,
        titular: actualizado.holderName,
        usadaEl: actualizado.checkedInAt,
      },
    };
  },

  /** Deshacer una verificación hecha por error. */
  async desmarcar(restaurantId: string, id: string) {
    const t = await prisma.shopTicket.findFirst({ where: { id, restaurantId } });
    if (!t) throw notFound('Entrada no encontrada.');
    if (!t.checkedInAt) throw badRequest('Esa entrada todavía no se había verificado.');
    return prisma.shopTicket.update({
      where: { id },
      data: { checkedInAt: null, checkedInByUserId: null },
    });
  },
};
