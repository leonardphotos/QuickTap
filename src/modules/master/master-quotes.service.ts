import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { formatVenezuelanWhatsappPhone } from '../../utils/whatsapp';
import { masterWhatsappBotService } from '../master-whatsapp/master-whatsapp-bot.service';
import { CreatePlatformQuoteInput, PlatformQuoteItem } from './master-quotes.dto';

/**
 * Cotizaciones del equipo QuickTap para futuros clientes (Master → Cotizaciones).
 * Flujo: crear (PENDING) → enviar por WhatsApp (SENT, por el bot de la plataforma o a
 * mano con el enlace wa.me de respaldo) → aprobar (APPROVED) cuando el cliente acepta.
 */

function money(n: Prisma.Decimal | number): string {
  return `$${Number(n).toFixed(2)}`;
}

/** Texto que recibe el cliente por WhatsApp. */
function buildQuoteMessage(q: {
  quoteNumber: number;
  clientName: string;
  businessName: string | null;
  planName: string;
  planPriceUsd: Prisma.Decimal;
  planCycle: string;
  items: Prisma.JsonValue;
  totalUsd: Prisma.Decimal;
  note: string | null;
}): string {
  const items = (q.items as PlatformQuoteItem[] | null) ?? [];
  const lines = [
    `🧾 *Cotización QuickTap* N.º ${q.quoteNumber}`,
    '',
    `Hola ${q.clientName} 👋 Gracias por tu interés en QuickTap${q.businessName ? ` para *${q.businessName}*` : ''}. Este es tu presupuesto:`,
    '',
    `📦 Plan *${q.planName}*: ${money(q.planPriceUsd)} (${q.planCycle.toLowerCase()})`,
  ];
  for (const item of items) {
    lines.push(`➕ ${item.label}: ${money(item.amountUsd)} (pago único)`);
  }
  lines.push('', `💰 *Pago inicial: ${money(q.totalUsd)}*`);
  // Términos estándar de instalación: 50% para comenzar, 50% a los 15 días.
  const half = Number(q.totalUsd) / 2;
  lines.push(`📋 Para comenzar: 50% (${money(half)}) — el 50% restante (${money(half)}) a los 15 días.`);
  if (items.length > 0) {
    lines.push(`🔁 Luego solo el plan: ${money(q.planPriceUsd)} ${q.planCycle.toLowerCase()}`);
  }
  if (q.note) lines.push('', q.note);
  lines.push('', 'Incluye 15 días de prueba gratis, sin tarjeta. Cualquier duda, respóndenos por aquí 🙌');
  return lines.join('\n');
}

export const masterQuotesService = {
  async list(status: 'open' | 'approved') {
    return prisma.platformQuote.findMany({
      where: status === 'approved' ? { status: 'APPROVED' } : { status: { in: ['PENDING', 'SENT'] } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  },

  async create(input: CreatePlatformQuoteInput) {
    const itemsTotal = input.items.reduce((acc, i) => acc + i.amountUsd, 0);
    return prisma.platformQuote.create({
      data: {
        clientName: input.clientName,
        clientPhone: input.clientPhone,
        businessName: input.businessName ?? null,
        planName: input.planName,
        planPriceUsd: new Prisma.Decimal(input.planPriceUsd),
        planCycle: input.planCycle,
        items: input.items as unknown as Prisma.InputJsonValue,
        totalUsd: new Prisma.Decimal(input.planPriceUsd + itemsTotal),
        note: input.note ?? null,
      },
    });
  },

  /**
   * Edita una cotización existente — solo tiene sentido antes de aprobarse (una vez
   * aprobada, el presupuesto ya se cerró con el cliente). No toca `status`/`sentAt`:
   * si ya se había enviado, sigue en SENT y hay que reenviarla a mano tras el cambio.
   */
  async update(id: string, input: CreatePlatformQuoteInput) {
    const quote = await prisma.platformQuote.findUnique({ where: { id } });
    if (!quote) throw notFound('Cotización no encontrada.');
    if (quote.status === 'APPROVED') throw badRequest('No se puede editar una cotización ya aprobada.');

    const itemsTotal = input.items.reduce((acc, i) => acc + i.amountUsd, 0);
    return prisma.platformQuote.update({
      where: { id },
      data: {
        clientName: input.clientName,
        clientPhone: input.clientPhone,
        businessName: input.businessName ?? null,
        planName: input.planName,
        planPriceUsd: new Prisma.Decimal(input.planPriceUsd),
        planCycle: input.planCycle,
        items: input.items as unknown as Prisma.InputJsonValue,
        totalUsd: new Prisma.Decimal(input.planPriceUsd + itemsTotal),
        note: input.note ?? null,
      },
    });
  },

  /**
   * Envía la cotización por el bot de WhatsApp de la plataforma. Si el bot no está
   * conectado (o el número no tiene WhatsApp), devuelve `sent: false` y el frontend
   * abre el enlace wa.me con el mismo texto para mandarlo a mano — en ambos casos la
   * cotización pasa a SENT (queda en la pestaña de enviadas).
   */
  async send(id: string) {
    const quote = await prisma.platformQuote.findUnique({ where: { id } });
    if (!quote) throw notFound('Cotización no encontrada.');

    const message = buildQuoteMessage(quote);
    const phoneDigits = formatVenezuelanWhatsappPhone(quote.clientPhone).replace(/\D/g, '');
    const sent = await masterWhatsappBotService.sendMessage(phoneDigits, message);

    await prisma.platformQuote.update({
      where: { id },
      data: { status: quote.status === 'APPROVED' ? 'APPROVED' : 'SENT', sentAt: new Date() },
    });

    return {
      sent,
      waLink: `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`,
    };
  },

  async approve(id: string) {
    const quote = await prisma.platformQuote.findUnique({ where: { id } });
    if (!quote) throw notFound('Cotización no encontrada.');
    return prisma.platformQuote.update({
      where: { id },
      data: { status: 'APPROVED', approvedAt: new Date() },
    });
  },

  /** Devuelve una aprobada a la pestaña de enviadas (se aprobó por error). */
  async unapprove(id: string) {
    const quote = await prisma.platformQuote.findUnique({ where: { id } });
    if (!quote) throw notFound('Cotización no encontrada.');
    return prisma.platformQuote.update({
      where: { id },
      data: { status: quote.sentAt ? 'SENT' : 'PENDING', approvedAt: null },
    });
  },

  async remove(id: string) {
    await prisma.platformQuote.delete({ where: { id } }).catch(() => {
      throw notFound('Cotización no encontrada.');
    });
    return { deleted: true };
  },
};
