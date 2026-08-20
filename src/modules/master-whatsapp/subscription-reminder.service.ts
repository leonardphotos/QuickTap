import { BillingCycle, SubscriptionPlan } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { formatVenezuelanWhatsappPhone } from '../../utils/whatsapp';
import { formatBs } from '../../utils/money';
import { currencySymbolFor, platformSettingsService, PurchasablePlan, renderTemplate } from '../platform-settings/platform-settings.service';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
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
  const currency = await platformSettingsService.getSubscriptionCurrency();
  const symbol = currencySymbolFor(currency);
  const chargesTotal = opts.pendingCharges.reduce((acc, c) => acc + Number(c.amountUsd), 0);
  const total = (opts.monthlyAmount ?? 0) + chargesTotal;

  // Sin tasa cacheada el mensaje se manda igual, solo sin el equivalente en Bs — no vale la
  // pena bloquear el cobro entero por un problema aparte (fuente BCV caída, etc.).
  let rateBs: number | null = null;
  try {
    rateBs = Number((await exchangeRateService.getRate(currency)).rateBs);
  } catch {
    // sigue sin conversión
  }
  const bsFor = (amount: number) => (rateBs ? ` (${formatBs(amount * rateBs)})` : '');

  const amountLine =
    opts.monthlyAmount != null
      ? `💰 Monto a cancelar: ${symbol}${total.toFixed(2)}${bsFor(total)}${chargesTotal > 0 ? ` (mensualidad ${symbol}${opts.monthlyAmount.toFixed(2)} + cargos pendientes)` : ''}`
      : '💰 Escríbenos si tienes dudas sobre el monto a cancelar.';

  // Cargos puntuales sin cobrar (ej. instalación, QR NFC) — si no se pagaron aparte, se suman acá
  // a la próxima mensualidad; se marcan cobrados solos al aprobarse este mismo pago (ver
  // applyActivation() en plan-request.service.ts).
  let chargesBlock = '';
  if (opts.pendingCharges.length > 0) {
    const lines = ['🧾 *Cargos pendientes (incluidos en el monto de arriba):*'];
    for (const c of opts.pendingCharges) {
      const amount = Number(c.amountUsd);
      lines.push(`• ${c.description}: ${symbol}${amount.toFixed(2)}${bsFor(amount)}`);
    }
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

/** Lo que necesitan buildReminderMessage y el envío. Compartido por el barrido automático y
 * por el botón "Enviar cobro" del Dashboard maestro, para que los dos manden exactamente el
 * mismo mensaje al mismo número. */
const REMINDER_SELECT = {
  id: true,
  name: true,
  billingPhone: true,
  whatsappPhone: true,
  periodEnd: true,
  subscriptionPlan: true,
  billingCycle: true,
  customMonthlyPriceUsd: true,
} as const;

type ReminderRestaurant = {
  id: string;
  name: string;
  billingPhone: string | null;
  whatsappPhone: string | null;
  periodEnd: Date;
  subscriptionPlan: SubscriptionPlan | null;
  billingCycle: BillingCycle | null;
  customMonthlyPriceUsd: unknown;
};

/** A dónde se cobra: el número de cobranza si está cargado, si no el WhatsApp del negocio
 * (destino único antes de que existiera `billingPhone`). Devuelve solo dígitos. */
function billingDestination(restaurant: { billingPhone: string | null; whatsappPhone: string | null }): string | null {
  const raw = restaurant.billingPhone ?? restaurant.whatsappPhone;
  if (!raw) return null;
  return formatVenezuelanWhatsappPhone(raw).replace(/\D/g, '');
}

/**
 * Arma y manda el recordatorio de mensualidad al número de cobranza, y deja abierta la
 * verificación en AWAITING_PROOF para poder matchear el comprobante que llegue de vuelta.
 *
 * `markPeriod` separa los dos usos: el barrido automático marca siempre (es EL recordatorio de
 * este vencimiento y no debe repetirse en cada tick), mientras que el botón manual solo marca
 * si ya estamos dentro de la ventana de 3 días — un cobro adelantado a mano no debe consumir
 * el recordatorio automático que todavía falta por mandar.
 */
async function sendReminderFor(
  restaurant: ReminderRestaurant,
  opts: { markPeriod: 'always' | 'ifWithinWindow' },
): Promise<{ sent: boolean; phone: string; reason?: 'NOT_ON_WHATSAPP' | 'BOT_DISCONNECTED' }> {
  const phone = billingDestination(restaurant);
  if (!phone) throw badRequest('Este restaurante no tiene número de cobranza ni WhatsApp registrado.');
  if (!restaurant.subscriptionPlan) throw badRequest('Este restaurante no tiene un plan activo que cobrar.');

  // Se verifica ANTES de armar el mensaje y solo si el bot está conectado: sock.sendMessage() a
  // un número que no existe en WhatsApp no lanza ningún error — la promesa resuelve igual — así
  // que sin esto el botón decía "enviado" aunque el mensaje nunca hubiera salido de verdad. Si
  // el número no existe, no tiene sentido ni armar el mensaje ni abrir una verificación que
  // espera un comprobante que jamás puede llegar de ese número.
  if (masterWhatsappBotService.getStatus().status === 'connected') {
    const registered = await masterWhatsappBotService.checkRegistered(phone);
    if (!registered.exists) return { sent: false, phone, reason: 'NOT_ON_WHATSAPP' };
  }

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

  const paymentMethods = await platformSettingsService.getPaymentMethods();
  const pagoMovil = (paymentMethods as { pagoMovil?: { banco?: string; telefono?: string; cedula?: string; titular?: string } })
    .pagoMovil;

  const message = await buildReminderMessage({
    restaurantName: restaurant.name,
    periodEndLabel,
    monthlyAmount: amount,
    pendingCharges,
    pagoMovil: pagoMovil ?? null,
  });

  const sent = await masterWhatsappBotService.sendMessage(phone, message);

  // La verificación se abre aunque el envío falle (bot desconectado): dejar la fila lista evita
  // que un comprobante que igual llegue por otra vía se pierda.
  await subscriptionPaymentVerificationService.createOrRefresh(
    restaurant.id,
    phone,
    restaurant.subscriptionPlan,
    restaurant.billingCycle ?? 'MONTHLY',
    amount != null ? amount + chargesTotal : undefined,
  );

  const withinWindow = restaurant.periodEnd.getTime() - Date.now() <= REMINDER_DAYS_BEFORE * 24 * 60 * 60 * 1000;
  // Solo se marca como avisado si el mensaje SALIÓ. Marcándolo igual, un barrido con el bot
  // maestro desconectado (pasa en cada reinicio nocturno de PM2 hasta que se re-vincula)
  // quemaba el recordatorio de ese vencimiento: el restaurante no se enteraba nunca.
  if (sent && (opts.markPeriod === 'always' || withinWindow)) {
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { subscriptionReminderForPeriodEnd: restaurant.periodEnd },
    });
  }

  return { sent, phone };
}

/**
 * Barrido periódico (ver server.ts): manda el recordatorio de renovación a cada restaurante
 * cuyo `periodEnd` cae en 3 días o menos. `subscriptionReminderForPeriodEnd` evita reenviarlo
 * en cada tick mientras siga siendo el mismo vencimiento.
 */
async function checkExpiring(): Promise<{ sent: number }> {
  const now = new Date();
  const cutoff = new Date(now.getTime() + REMINDER_DAYS_BEFORE * 24 * 60 * 60 * 1000);

  const candidates = await prisma.restaurant.findMany({
    where: {
      isDemo: false,
      parentRestaurantId: null, // las sucursales no tienen suscripción propia (ver applyActivation)
      // Alcanza con tener uno de los dos: billingDestination() se queda con el de cobranza y
      // se cae al WhatsApp del negocio si no hay.
      OR: [{ billingPhone: { not: null } }, { whatsappPhone: { not: null } }],
      periodEnd: { gt: now, lte: cutoff },
    },
    select: { ...REMINDER_SELECT, subscriptionReminderForPeriodEnd: true },
  });

  // Prisma no permite comparar dos columnas de la misma fila dentro de un where — se trae todo
  // el rango de fecha y se filtra el dedup (¿ya se mandó para ESTE periodEnd?) acá en memoria.
  const pending = candidates.filter(
    (r) => !r.subscriptionReminderForPeriodEnd || r.subscriptionReminderForPeriodEnd.getTime() !== r.periodEnd.getTime(),
  );

  let sent = 0;
  for (const restaurant of pending) {
    // Un restaurante sin plan o sin ningún teléfono no frena el barrido de los demás.
    try {
      const result = await sendReminderFor(restaurant, { markPeriod: 'always' });
      if (result.sent) sent += 1;
    } catch {
      // Se reintenta en el próximo tick.
    }
  }

  return { sent };
}

/** Botón "Enviar cobro" del Dashboard maestro → Cobro: manda el mismo mensaje del recordatorio
 * automático, en el momento, sin esperar a la ventana de 3 días. */
async function sendNow(
  restaurantId: string,
): Promise<{ sent: boolean; phone: string; reason?: 'NOT_ON_WHATSAPP' | 'BOT_DISCONNECTED' }> {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: REMINDER_SELECT });
  if (!restaurant) throw notFound('Restaurante no encontrado.');
  return sendReminderFor(restaurant, { markPeriod: 'ifWithinWindow' });
}

/**
 * Botón "Copiar mensaje" del Dashboard maestro → Cobro: arma exactamente el mismo mensaje que
 * mandaría el bot, pero lo devuelve para pegarlo a mano en WhatsApp en vez de enviarlo.
 *
 * Es el puente mientras la cuenta del bot no puede entregar (ver el diagnóstico del 20/08:
 * WhatsApp acepta la conexión pero nunca acusa recibo de los envíos). Cobrar no puede quedar
 * detenido esperando la migración a la API oficial.
 *
 * Abre la verificación igual que un envío real, y eso es a propósito: el comprobante que
 * responda el cliente se empareja buscando una verificación AWAITING_PROOF de ESE teléfono
 * (ver subscription-payment-verification.service.ts#findByPhone). Sin abrirla, la foto llegaría
 * y el bot no sabría de qué cobro es.
 *
 * No marca `subscriptionReminderForPeriodEnd`: copiar no es haber enviado, y marcarlo apagaría
 * el recordatorio automático de ese vencimiento sin que nadie haya recibido nada.
 */
async function previewMessage(restaurantId: string): Promise<{ message: string; phone: string }> {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: REMINDER_SELECT });
  if (!restaurant) throw notFound('Restaurante no encontrado.');

  const phone = billingDestination(restaurant);
  if (!phone) throw badRequest('Este restaurante no tiene número de cobranza ni WhatsApp registrado.');
  if (!restaurant.subscriptionPlan) throw badRequest('Este restaurante no tiene un plan activo que cobrar.');

  const amount = await resolveMonthlyPrice(restaurant);
  const pendingCharges = await prisma.additionalCharge.findMany({
    where: { restaurantId: restaurant.id, chargedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { description: true, amountUsd: true },
  });
  const chargesTotal = pendingCharges.reduce((acc, c) => acc + Number(c.amountUsd), 0);
  const periodEndLabel = restaurant.periodEnd.toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' });

  const paymentMethods = await platformSettingsService.getPaymentMethods();
  const pagoMovil = (paymentMethods as { pagoMovil?: { banco?: string; telefono?: string; cedula?: string; titular?: string } })
    .pagoMovil;

  const message = await buildReminderMessage({
    restaurantName: restaurant.name,
    periodEndLabel,
    monthlyAmount: amount,
    pendingCharges,
    pagoMovil: pagoMovil ?? null,
  });

  await subscriptionPaymentVerificationService.createOrRefresh(
    restaurant.id,
    phone,
    restaurant.subscriptionPlan,
    restaurant.billingCycle ?? 'MONTHLY',
    amount != null ? amount + chargesTotal : undefined,
  );

  return { message, phone };
}

export const subscriptionReminderService = { checkExpiring, sendNow, previewMessage };
