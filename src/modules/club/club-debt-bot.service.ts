import fs from 'fs';
import path from 'path';
import { PaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { UPLOADS_DIR } from '../../middlewares/upload.middleware';
import { formatVenezuelanWhatsappPhone, PAYMENT_LABELS } from '../../utils/whatsapp';
import { CURRENCY_SYMBOLS, formatBs, formatMoney, round2 } from '../../utils/money';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import { clubStatsService } from './club-stats.service';
import { clubService } from './club.service';
import { clubAcademyMoneyService } from '../club-academy/club-academy-money.service';
import { shopService } from '../shop/shop.service';
import { whatsappBotService } from '../whatsapp-bot/whatsapp-bot.service';

/**
 * Cobranza de deudas del club por WhatsApp — sobre el mismo chatbot vinculado por QR.
 *
 * Flujo completo:
 * 1. Barrido periódico (server.ts): a los 3 días de una deuda le recuerda al cliente el
 *    monto por WhatsApp; si sigue sin pagar, repite cada 7 días (dedup en
 *    ClubDebtReminder). Cadencia baja a propósito: insistir más arriesga que WhatsApp
 *    marque el número del club como spam.
 * 2. El cliente responde con la FOTO de su comprobante: se matchea su teléfono contra
 *    las deudas abiertas (club-stats debts()), se guarda el comprobante y se reenvía al
 *    número verificador del club (whatsappBotPaymentVerifierPhone) — con cola de a uno,
 *    igual que la verificación de pagos de pedidos.
 * 3. El verificador responde "Aprobado" (opcional: el método — "Aprobado zelle",
 *    "Aprobado efectivo"...; sin método se asume Pago Móvil) o "Rechazado". Al aprobar
 *    se registra el pago REAL en su fuente (ClubBookingPayment / ShopSalePayment /
 *    ClubAcademyPayment) — que es exactamente lo que suma Administración por método.
 */

export type ClubDebtSource = 'bookings' | 'store' | 'academy';

const SOURCE_LABEL: Record<ClubDebtSource, string> = {
  bookings: 'Reserva de cancha',
  store: 'Consumo en tienda',
  academy: 'Mensualidad de academia',
};

/** 3 días para el primer recordatorio; 7 entre repeticiones. */
const FIRST_REMINDER_MS = 3 * 24 * 60 * 60 * 1000;
const REPEAT_REMINDER_MS = 7 * 24 * 60 * 60 * 1000;

interface DebtRow {
  id: string;
  studentId?: string;
  name: string;
  phone: string | null;
  detail: string;
  since: string;
  balanceBase: string;
}

/** Solo dígitos en formato internacional (58414...), comparable con el JID de WhatsApp. */
function phoneDigitsOf(phone: string | null): string | null {
  if (!phone) return null;
  const digits = formatVenezuelanWhatsappPhone(phone).replace(/\D/g, '');
  return digits.length >= 10 ? digits : null;
}

/** Todas las deudas abiertas del club, aplanadas con su fuente. */
async function openDebtRows(restaurantId: string): Promise<{ source: ClubDebtSource; row: DebtRow }[]> {
  const debts = await clubStatsService.debts(restaurantId);
  return [
    ...debts.bookings.map((row) => ({ source: 'bookings' as const, row })),
    ...debts.store.map((row) => ({ source: 'store' as const, row })),
    ...debts.academy.map((row) => ({ source: 'academy' as const, row })),
  ];
}

/** Interpreta la respuesta del verificador: método de pago opcional tras "Aprobado". */
function parseVerifierMethod(text: string): PaymentMethod {
  const t = text.toLowerCase();
  if (t.includes('zelle')) return 'ZELLE';
  if (t.includes('binance')) return 'BINANCE';
  if (t.includes('paypal')) return 'PAYPAL';
  if (t.includes('transfer')) return 'TRANSFER';
  if (t.includes('punto') || t.includes('tarjeta')) return 'CARD';
  if (t.includes('efectivo $') || t.includes('efectivo usd') || t.includes('divisa')) return 'CASH_USD';
  if (t.includes('efectivo')) return 'CASH';
  // Lo más común en Venezuela — y lo que implica un comprobante por foto.
  return 'MOBILE_PAYMENT';
}

export const clubDebtBotService = {
  /**
   * ¿Este teléfono le debe algo al club? Devuelve la deuda de MAYOR saldo si tiene
   * varias — el comprobante casi siempre corresponde a la cuenta grande, y el
   * verificador ve el detalle antes de aprobar.
   */
  async matchDebtByPhone(restaurantId: string, phoneDigits: string) {
    const rows = await openDebtRows(restaurantId);
    const mine = rows.filter((r) => phoneDigitsOf(r.row.phone) === phoneDigits);
    if (mine.length === 0) return null;
    mine.sort((a, b) => Number(b.row.balanceBase) - Number(a.row.balanceBase));
    return mine[0];
  },

  /**
   * Guarda el comprobante recibido y decide si va directo al verificador o a la cola
   * (solo una verificación AWAITING_VERIFIER a la vez por club, para que "Aprobado"
   * nunca sea ambiguo).
   */
  async createVerification(
    restaurantId: string,
    source: ClubDebtSource,
    row: DebtRow,
    customerPhone: string,
    proofImageUrl: string,
  ) {
    const active = await prisma.clubDebtPaymentVerification.findFirst({
      where: { restaurantId, status: 'AWAITING_VERIFIER' },
    });
    const shouldForwardNow = !active;
    const verification = await prisma.clubDebtPaymentVerification.create({
      data: {
        restaurantId,
        source,
        refId: row.id,
        studentId: row.studentId ?? null,
        customerName: row.name,
        customerPhone,
        amountBase: new Prisma.Decimal(row.balanceBase),
        proofImageUrl,
        status: shouldForwardNow ? 'AWAITING_VERIFIER' : 'PENDING_FORWARD',
      },
    });
    return { verification, shouldForwardNow };
  },

  /** Pie de foto que recibe el verificador junto al comprobante de la deuda. */
  async buildVerifierCaption(verification: {
    restaurantId: string;
    source: string;
    customerName: string;
    customerPhone: string;
    amountBase: Prisma.Decimal;
  }): Promise<string> {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: verification.restaurantId },
      select: { baseCurrency: true },
    });
    const symbol = CURRENCY_SYMBOLS[restaurant?.baseCurrency ?? 'USD'];
    const rate = await exchangeRateService.getRate(restaurant?.baseCurrency ?? 'USD', verification.restaurantId);
    const bs = round2(verification.amountBase.mul(rate.rateBs));
    return [
      '📄 Comprobante de pago — Deuda',
      `👤 Cliente: ${verification.customerName}`,
      `📞 ${verification.customerPhone}`,
      `🧾 Concepto: ${SOURCE_LABEL[verification.source as ClubDebtSource] ?? verification.source}`,
      `💰 Monto a verificar: ${formatBs(bs)} (${formatMoney(verification.amountBase, symbol)})`,
      '',
      'Responde *Aprobado* (puedes indicar el método: "Aprobado zelle", "Aprobado efectivo"...) o *Rechazado*.',
    ].join('\n');
  },

  /**
   * Respuesta del verificador del club. Devuelve `handled: false` si no hay ninguna
   * verificación de deuda esperando — el caller cae entonces al flujo de pedidos.
   */
  async resolveVerifierReply(restaurantId: string, text: string) {
    const verification = await prisma.clubDebtPaymentVerification.findFirst({
      where: { restaurantId, status: 'AWAITING_VERIFIER' },
      orderBy: { createdAt: 'asc' },
    });
    if (!verification) return { handled: false as const };

    const t = text.trim().toLowerCase();
    const approved = /aprob|apruebo|confirmad|✅|listo|ok\b|sí\b|si\b/.test(t) && !/rechaz|no\b/.test(t);
    const rejected = /rechaz|negad|❌|falso/.test(t);
    if (!approved && !rejected) return { handled: false as const };

    if (rejected) {
      await prisma.clubDebtPaymentVerification.update({
        where: { id: verification.id },
        data: { status: 'REJECTED', resolvedAt: new Date() },
      });
      return { handled: true as const, action: 'reject' as const, verification };
    }

    const method = parseVerifierMethod(t);
    await this.settle(verification, method);
    await prisma.clubDebtPaymentVerification.update({
      where: { id: verification.id },
      data: { status: 'APPROVED', method, resolvedAt: new Date() },
    });
    return { handled: true as const, action: 'approve' as const, verification, method };
  },

  /**
   * Registra el pago real en la fuente de la deuda. El saldo se RECALCULA al momento de
   * aprobar (pudo cambiar desde que llegó el comprobante); si la deuda ya no existe
   * (la cobraron a mano en el medio), no se duplica el pago.
   */
  async settle(
    verification: { restaurantId: string; source: string; refId: string; studentId: string | null; amountBase: Prisma.Decimal; proofImageUrl: string },
    method: PaymentMethod,
  ): Promise<void> {
    const rows = await openDebtRows(verification.restaurantId);
    const current = rows.find((r) => r.source === verification.source && r.row.id === verification.refId);
    if (!current) return; // Ya la saldaron por otra vía.

    const amount = Math.min(Number(verification.amountBase), Number(current.row.balanceBase));
    if (amount <= 0) return;
    const reference = 'Comprobante por WhatsApp (verificado)';

    if (verification.source === 'bookings') {
      await clubService.addBookingPayment(verification.restaurantId, verification.refId, {
        amountBase: amount,
        method,
        referenceNumber: reference,
        proofImageUrl: verification.proofImageUrl,
      });
    } else if (verification.source === 'academy') {
      if (!verification.studentId) return;
      await clubAcademyMoneyService.recordPayment(verification.restaurantId, {
        studentId: verification.studentId,
        kind: 'MONTHLY',
        chargeId: verification.refId,
        amountBase: amount,
        method,
        referenceNumber: reference,
        proofImageUrl: verification.proofImageUrl,
      });
    } else {
      // La venta fiada corre sobre el backend de Tienda, que guarda el método como
      // texto libre — mismo criterio que el diálogo de cobro de Deudas.
      await shopService.addSalePayment(verification.restaurantId, verification.refId, {
        amount,
        method: PAYMENT_LABELS[method],
      });
    }
  },

  /** Siguiente comprobante en cola → AWAITING_VERIFIER; devuelve la fila y el buffer de su foto. */
  async dequeueNext(restaurantId: string) {
    const next = await prisma.clubDebtPaymentVerification.findFirst({
      where: { restaurantId, status: 'PENDING_FORWARD' },
      orderBy: { createdAt: 'asc' },
    });
    if (!next) return null;
    await prisma.clubDebtPaymentVerification.update({
      where: { id: next.id },
      data: { status: 'AWAITING_VERIFIER' },
    });
    let image: Buffer | null = null;
    try {
      image = fs.readFileSync(path.join(UPLOADS_DIR, next.proofImageUrl.replace(/^\/uploads\//, '')));
    } catch {
      image = null;
    }
    return { verification: next, image };
  },

  /**
   * Barrido de recordatorios (server.ts, cada 6h): clubes con el bot conectado y el
   * interruptor activado. Nunca lanza — un club con la sesión caída simplemente se
   * salta hasta el próximo barrido.
   */
  async sweepReminders(): Promise<void> {
    const clubs = await prisma.restaurant.findMany({
      where: {
        businessType: 'SPORTS_CLUB',
        isActive: true,
        whatsappBotEnabled: true,
        whatsappBotDebtRemindersEnabled: true,
      },
      select: { id: true, name: true, baseCurrency: true, paymentMethodsConfig: true },
    });

    const now = Date.now();
    for (const club of clubs) {
      if (whatsappBotService.getStatus(club.id).status !== 'connected') continue;

      const rows = await openDebtRows(club.id).catch(() => [] as { source: ClubDebtSource; row: DebtRow }[]);
      if (rows.length === 0) continue;

      const rate = await exchangeRateService.getRate(club.baseCurrency, club.id).catch(() => null);
      const symbol = CURRENCY_SYMBOLS[club.baseCurrency];

      for (const { source, row } of rows) {
        const phone = phoneDigitsOf(row.phone);
        if (!phone) continue;
        if (now - new Date(row.since).getTime() < FIRST_REMINDER_MS) continue;

        const reminder = await prisma.clubDebtReminder.findUnique({
          where: { restaurantId_source_refId: { restaurantId: club.id, source, refId: row.id } },
        });
        if (reminder && now - reminder.lastReminderAt.getTime() < REPEAT_REMINDER_MS) continue;

        const bs = rate ? `${formatBs(round2(new Prisma.Decimal(row.balanceBase).mul(rate.rateBs)))} · ` : '';
        const lines = [
          `Hola ${row.name} 👋 Te escribimos de *${club.name}*.`,
          '',
          `Tienes un saldo pendiente por *${SOURCE_LABEL[source].toLowerCase()}* (${row.detail}):`,
          `💰 *${bs}${formatMoney(row.balanceBase, symbol)}*`,
        ];
        const pm = (club.paymentMethodsConfig as any)?.MOBILE_PAYMENT;
        if (pm?.enabled && pm?.telefono) {
          lines.push(
            '',
            'Puedes pagar por Pago Móvil:',
            `🏦 ${pm.banco ?? ''}  📞 ${pm.telefono}  🪪 ${pm.cedula ?? ''}`.trim(),
          );
        }
        lines.push('', 'Cuando pagues, responde a este chat con la *foto de tu comprobante* y lo confirmamos. ¡Gracias!');

        const sent = await whatsappBotService.sendMessage(club.id, phone, lines.join('\n'));
        if (sent) {
          await prisma.clubDebtReminder.upsert({
            where: { restaurantId_source_refId: { restaurantId: club.id, source, refId: row.id } },
            create: { restaurantId: club.id, source, refId: row.id, lastReminderAt: new Date() },
            update: { lastReminderAt: new Date() },
          });
        }
      }
    }
  },
};
