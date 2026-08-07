import { BillingCycle, SubscriptionPlan } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { formatVenezuelanWhatsappPhone } from '../../utils/whatsapp';
import { platformSettingsService, PurchasablePlan, renderTemplate } from '../platform-settings/platform-settings.service';
import { subscriptionPaymentVerificationService } from './subscription-payment-verification.service';
import { masterWhatsappBotService } from './master-whatsapp-bot.service';

const REMINDER_DAYS_BEFORE = 3;
const PURCHASABLE_PLANS: readonly SubscriptionPlan[] = ['DELIVERY', 'PRO', 'ELITE'];

/** Precio de referencia a mostrar en el recordatorio — null si no hay forma de calcularlo
 * (plan legado/personalizado sin tarifa acordada), en cuyo caso el mensaje solo pide el
 * comprobante sin un monto exacto (ver buildReminderMessage). */
async function resolveMonthlyPrice(restaurant: {
  subscriptionPlan: SubscriptionPlan | null;
  billingCycle: BillingCycle | null;
  customMonthlyPriceUsd: unknown;
}): Promise<number | null> {
  if (restaurant.customMonthlyPriceUsd != null && Number(restaurant.customMonthlyPriceUsd) > 0) {
    return Number(restaurant.customMonthlyPriceUsd);
  }
  if (restaurant.subscriptionPlan && PURCHASABLE_PLANS.includes(restaurant.subscriptionPlan)) {
    const price = await platformSettingsService.getPlanPrice(
      restaurant.subscriptionPlan as PurchasablePlan,
      restaurant.billingCycle ?? 'MONTHLY',
    );
    return Number.isFinite(price) && price > 0 ? price : null;
  }
  return null;
}

async function buildReminderMessage(opts: {
  restaurantName: string;
  periodEndLabel: string;
  monthlyAmount: number | null;
  pendingCharges: { description: string; amountUsd: unknown }[];
  pagoMovil: { banco?: string; telefono?: string; cedula?: string; titular?: string } | null;
}): Promise<string> {
  const chargesTotal = opts.pendingCharges.reduce((acc, c) => acc + Number(c.amountUsd), 0);
  const total = (opts.monthlyAmount ?? 0) + chargesTotal;

  const amountLine =
    opts.monthlyAmount != null
      ? `💰 Monto a cancelar: $${total.toFixed(2)}${chargesTotal > 0 ? ` (mensualidad $${opts.monthlyAmount.toFixed(2)} + cargos pendientes)` : ''}`
      : '💰 Escríbenos si tienes dudas sobre el monto a cancelar.';

  // Cargos puntuales sin cobrar (ej. instalación, QR NFC) — si no se pagaron aparte, se suman acá
  // a la próxima mensualidad; se marcan cobrados solos al aprobarse este mismo pago (ver
  // applyActivation() en plan-request.service.ts).
  let chargesBlock = '';
  if (opts.pendingCharges.length > 0) {
    const lines = ['🧾 *Cargos pendientes (incluidos en el monto de arriba):*'];
    for (const c of opts.pendingCharges) lines.push(`• ${c.description}: $${Number(c.amountUsd).toFixed(2)}`);
    chargesBlock = lines.join('\n');
  }

  let pagoMovilBlock = '';
  if (opts.pagoMovil?.banco || opts.pagoMovil?.telefono) {
    const lines = ['📱 *Pago Móvil:*'];
    if (opts.pagoMovil.banco) lines.push(`Banco: ${opts.pagoMovil.banco}`);
    if (opts.pagoMovil.telefono) lines.push(`Teléfono: ${opts.pagoMovil.telefono}`);
    if (opts.pagoMovil.cedula) lines.push(`Cédula/RIF: ${opts.pagoMovil.cedula}`);
    if (opts.pagoMovil.titular) lines.push(`Titular: ${opts.pagoMovil.titular}`);
    pagoMovilBlock = lines.join('\n');
  }

  const templates = await platformSettingsService.getMessageTemplates();
  return renderTemplate(templates.reminderMessage, {
    restaurantName: opts.restaurantName,
    periodEndLabel: opts.periodEndLabel,
    amountLine,
    chargesBlock,
    pagoMovilBlock,
  });
}

/**
 * Barrido periódico (ver server.ts): manda el recordatorio de renovación a cada restaurante
 * cuyo `periodEnd` cae en 3 días o menos, y abre una SubscriptionPaymentVerification en
 * AWAITING_PROOF para poder matchear la foto que mande de vuelta. `subscriptionReminderForPeriodEnd`
 * evita reenviarlo en cada tick mientras siga siendo el mismo vencimiento.
 */
async function checkExpiring(): Promise<{ sent: number }> {
  const now = new Date();
  const cutoff = new Date(now.getTime() + REMINDER_DAYS_BEFORE * 24 * 60 * 60 * 1000);

  const candidates = await prisma.restaurant.findMany({
    where: {
      isDemo: false,
      parentRestaurantId: null, // las sucursales no tienen suscripción propia (ver applyActivation)
      whatsappPhone: { not: null },
      periodEnd: { gt: now, lte: cutoff },
    },
    select: {
      id: true,
      name: true,
      whatsappPhone: true,
      periodEnd: true,
      subscriptionPlan: true,
      billingCycle: true,
      customMonthlyPriceUsd: true,
      subscriptionReminderForPeriodEnd: true,
    },
  });

  // Prisma no permite comparar dos columnas de la misma fila dentro de un where — se trae todo
  // el rango de fecha y se filtra el dedup (¿ya se mandó para ESTE periodEnd?) acá en memoria.
  const pending = candidates.filter(
    (r) => !r.subscriptionReminderForPeriodEnd || r.subscriptionReminderForPeriodEnd.getTime() !== r.periodEnd.getTime(),
  );
  if (pending.length === 0) return { sent: 0 };

  const paymentMethods = await platformSettingsService.getPaymentMethods();
  const pagoMovil = (paymentMethods as { pagoMovil?: { banco?: string; telefono?: string; cedula?: string; titular?: string } })
    .pagoMovil;

  let sent = 0;
  for (const restaurant of pending) {
    if (!restaurant.subscriptionPlan || !restaurant.whatsappPhone) continue;

    const amount = await resolveMonthlyPrice(restaurant);
    // Cargos puntuales (instalación, QR NFC, etc.) que todavía no se cobraron en ninguna
    // mensualidad — se muestran acá para que no se olviden hasta que el restaurante pague.
    const pendingCharges = await prisma.additionalCharge.findMany({
      where: { restaurantId: restaurant.id, chargedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { description: true, amountUsd: true },
    });
    const chargesTotal = pendingCharges.reduce((acc, c) => acc + Number(c.amountUsd), 0);
    const periodEndLabel = restaurant.periodEnd.toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' });
    const message = await buildReminderMessage({
      restaurantName: restaurant.name,
      periodEndLabel,
      monthlyAmount: amount,
      pendingCharges,
      pagoMovil: pagoMovil ?? null,
    });

    const ownerPhone = formatVenezuelanWhatsappPhone(restaurant.whatsappPhone).replace(/\D/g, '');
    const wasSent = await masterWhatsappBotService.sendMessage(ownerPhone, message);

    // Se marca como "recordado" y se abre la verificación aunque el envío falle (bot
    // desconectado): reintentar cada tick a un restaurante sin bot activo no logra nada, y
    // dejar la fila lista evita que un comprobante que igual llegue por otra vía se pierda.
    await subscriptionPaymentVerificationService.create(
      restaurant.id,
      ownerPhone,
      restaurant.subscriptionPlan,
      restaurant.billingCycle ?? 'MONTHLY',
      amount != null ? amount + chargesTotal : undefined,
    );
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { subscriptionReminderForPeriodEnd: restaurant.periodEnd },
    });
    if (wasSent) sent += 1;
  }

  return { sent };
}

export const subscriptionReminderService = { checkExpiring };
