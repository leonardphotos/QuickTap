import { prisma } from '../../config/prisma';
import { notFound } from '../../utils/http-error';
import { round2, toDecimal } from '../../utils/money';
import { CreateQuoteInput, MarkQuoteConvertedInput } from './quote.dto';

/**
 * Cotizaciones/presupuestos: un total para aprobar (catering, pedido grande, venta al mayor) sin
 * cobrar ni tocar cocina/inventario todavía. Sirve tanto para restaurantes como para Locales
 * Comerciales — ver Quote en schema.prisma. No hay "convertir automáticamente" a un pedido/venta
 * real: eso implicaría resolver cada línea contra el catálogo vivo (precio actual, stock,
 * modificadores) y validar todo de nuevo, lo mismo que ya hace el flujo normal de pedido/venta.
 * En vez de duplicar esa lógica, "convertida" es una marca manual que deja el rastro de qué
 * pedido/venta real nació de esta cotización.
 */
export const quoteService = {
  async list(restaurantId: string) {
    return prisma.quote.findMany({ where: { restaurantId }, orderBy: { createdAt: 'desc' } });
  },

  async create(restaurantId: string, input: CreateQuoteInput) {
    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { baseCurrency: true } });
    if (!restaurant) throw notFound('Restaurante no encontrado.');

    const totalBase = round2(
      input.items.reduce((acc, i) => acc.add(toDecimal(i.unitPrice).mul(i.qty)), toDecimal(0)),
    );

    return prisma.quote.create({
      data: {
        restaurantId,
        customerName: input.customerName || null,
        customerPhone: input.customerPhone || null,
        note: input.note || null,
        items: input.items,
        totalBase,
        currency: restaurant.baseCurrency,
      },
    });
  },

  async markConverted(restaurantId: string, id: string, input: MarkQuoteConvertedInput) {
    const existing = await prisma.quote.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Cotización no encontrada.');
    return prisma.quote.update({ where: { id }, data: { convertedToId: input.convertedToId } });
  },

  async remove(restaurantId: string, id: string) {
    const existing = await prisma.quote.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Cotización no encontrada.');
    await prisma.quote.delete({ where: { id } });
    return { deleted: true };
  },
};
