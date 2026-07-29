import { BillingCycle, PlanRequestKind, PlanRequestStatus, SubscriptionPlan } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { badRequest, forbidden, notFound } from '../../utils/http-error';
import { nextPeriodEnd } from '../../utils/subscription';
import { buildWhatsappUrl } from '../../utils/whatsapp';
import { promoCodeService } from '../promo-codes/promo-code.service';
import { platformSettingsService } from '../platform-settings/platform-settings.service';
import { ramblayClient } from '../ramblay/ramblay.client';
import {
  ActivateRestaurantInput,
  AddPlanRequestPaymentInput,
  CreateInstallmentPlanRequestInput,
  CreatePlanRequestInput,
  CreateRamblayCheckoutInput,
  UpdatePlanRequestInput,
} from './plan-request.dto';

/** Referencia fija en el registro padre de un "pago fraccionado" — el método/número real de
 * cada abono vive en PlanRequestPayment, no acá (ver createInstallment/addPayment abajo). */
const INSTALLMENT_PLACEHOLDER_REFERENCE = 'Pago fraccionado';

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  TRIAL: 'Prueba Gratuita',
  STARTER: 'Plan Inicial',
  PRO: 'Plan Pro / Restaurante',
  PREMIUM: 'Plan Premium',
  DELIVERY: 'Plan Solo Delivery',
  CUSTOM: 'Plan Personalizado',
  SUCURSALES: 'Plan Sucursales',
  DELIVERY_SUCURSALES: 'Plan Delivery Sucursales',
};

// Beneficios breves para el mensaje de bienvenida por WhatsApp al activar la cuenta.
const PLAN_BENEFITS: Record<SubscriptionPlan, string> = {
  TRIAL: 'Mesas y códigos QR ilimitados durante tu prueba.',
  STARTER: 'Hasta 5-6 mesas, 500 pedidos al mes y 4 usuarios de tu equipo.',
  PRO: 'Todos los beneficios: mesas y pedidos ilimitados, usuarios ilimitados, Administración, Estadísticas, Inventario por receta, Gastos y Cuentas por pagar.',
  PREMIUM: 'Mesas y pedidos ilimitados, hasta 20 usuarios, Administración e Inventario por receta.',
  DELIVERY: 'Productos, Cocinas, sección de Delivery y pedidos ilimitados. Hasta 6 usuarios de tu equipo.',
  CUSTOM: 'Tu plan armado a la medida de tu restaurante.',
  SUCURSALES: 'Todos los beneficios del Plan Pro, más hasta 5 sucursales con reporte consolidado de ventas, inventario y equipo.',
  DELIVERY_SUCURSALES: 'Todos los beneficios del Plan Solo Delivery, más hasta 5 sucursales con reporte consolidado de ventas, inventario y equipo.',
};

function buildAcceptedMessage(plan: SubscriptionPlan): string {
  return [
    '✅ *Pago aceptado*',
    `Tu ${PLAN_LABELS[plan]} en QuickTap ya está activo. ¡Bienvenido/a!`,
    `${PLAN_BENEFITS[plan]}`,
    'Cualquier duda, aquí estamos para ayudarte. 🙌',
  ].join('\n\n');
}

function buildRejectedMessage(): string {
  return [
    '❌ *Su pago fue rechazado*',
    'No pudimos validar tu pago. Verifica en tu banco o plataforma que la transacción se haya realizado correctamente y vuelve a enviarnos el número de referencia cuando puedas.',
  ].join('\n\n');
}

function buildPaymentNotReceivedMessage(): string {
  return [
    '⚠️ *Pago no recibido*',
    'Aún no hemos recibido tu pago. Por favor verifica en tu banco si la transacción se completó y, si hay algún problema, vuelve a intentarlo o contáctanos.',
  ].join('\n\n');
}

export type PurchasablePlan = 'DELIVERY' | 'PRO' | 'SUCURSALES' | 'DELIVERY_SUCURSALES';

/**
 * Precios fijos por plan y ciclo de facturación (USD/mes). Única fuente de
 * verdad: el precio que llega del cliente NUNCA se usa, siempre se recalcula
 * aquí para evitar manipulación. Cuatro planes vigentes: Delivery y Pro (los
 * de siempre) más Sucursales y Delivery Sucursales (mismos beneficios que
 * Pro/Delivery respectivamente, más hasta 5 sucursales — ver MAX_BRANCHES en
 * src/utils/subscription.ts). 20%/40% de descuento en trimestral/semestral,
 * igual que los dos planes originales.
 */
const FIXED_PLAN_PRICES: Record<PurchasablePlan, Record<BillingCycle, number>> = {
  DELIVERY: { MONTHLY: 18.99, QUARTERLY: 16.99, SEMIANNUAL: 14.99 },
  PRO: { MONTHLY: 28.99, QUARTERLY: 24.99, SEMIANNUAL: 20.99 },
  SUCURSALES: { MONTHLY: 78.99, QUARTERLY: 64.99, SEMIANNUAL: 50.99 },
  DELIVERY_SUCURSALES: { MONTHLY: 38.99, QUARTERLY: 32.99, SEMIANNUAL: 26.99 },
};

export interface CustomAddons {
  administration?: boolean;
  inventoryBasic?: boolean;
  inventoryRecipe?: boolean;
  accountsPayable?: boolean;
}

/**
 * Activa/extiende la suscripción de un restaurante. Único punto que toca
 * estos campos. `addons` solo aplica (y solo se persiste) cuando plan =
 * CUSTOM; para el resto de los planes el acceso a cada función ya lo decide
 * hasFeature() según el plan fijo, así que no hace falta tocar estos campos.
 */
async function applyActivation(
  restaurantId: string,
  plan: SubscriptionPlan,
  billingCycle: BillingCycle,
  addons?: CustomAddons,
) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { periodEnd: true, subscriptionPlan: true },
  });
  if (!restaurant) throw notFound('Restaurante no encontrado.');

  const customFlags =
    plan === 'CUSTOM' && addons
      ? {
          customAdministration: !!addons.administration,
          customInventoryBasic: !!addons.inventoryBasic,
          customInventoryRecipe: !!addons.inventoryRecipe,
          customAccountsPayable: !!addons.accountsPayable,
        }
      : {};

  const updated = await prisma.restaurant.update({
    where: { id: restaurantId },
    data: {
      subscriptionStatus: 'ACTIVE',
      subscriptionPlan: plan,
      billingCycle,
      periodEnd: nextPeriodEnd(billingCycle, restaurant.periodEnd),
      // Primera activación o cambio de plan (no una renovación del mismo
      // plan): marca que falta mostrar la pantalla de bienvenida una vez.
      ...(restaurant.subscriptionPlan !== plan ? { pendingWelcomePlan: plan } : {}),
      ...customFlags,
    },
  });

  // Las sucursales (Restaurant.parentRestaurantId, ver src/modules/branches/)
  // no tienen suscripción propia: heredan plan/ciclo/adicionales de la sede
  // principal apenas esta se activa o cambia de plan.
  await prisma.restaurant.updateMany({
    where: { parentRestaurantId: restaurantId },
    data: { subscriptionPlan: plan, billingCycle, ...customFlags },
  });

  return updated;
}

/** Precio final del plan tras aplicar el código promocional, si hay uno válido. */
async function resolvePrice(plan: PurchasablePlan, billingCycle: BillingCycle, promoCode?: string) {
  // Fuente de verdad real: lo editado desde el Dashboard maestro (platform_settings.planContent),
  // con FIXED_PLAN_PRICES como respaldo si por lo que sea la fila no tuviera nada cargado aún.
  let priceUsd: number = await platformSettingsService.getPlanPrice(plan, billingCycle);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) priceUsd = FIXED_PLAN_PRICES[plan][billingCycle];
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    throw badRequest('No se pudo calcular el precio del plan.');
  }

  const promo = await promoCodeService.tryApply(promoCode);
  if (promoCode && !promo) throw badRequest('Código de descuento inválido.');
  if (promo) priceUsd = Math.round(priceUsd * (1 - promo.discountPercent / 100) * 100) / 100;

  return { priceUsd, promo };
}

export const planRequestService = {
  /** Crea la solicitud de plan a partir del número de referencia que escribió el restaurante. */
  async create(input: CreatePlanRequestInput, opts: { kind: PlanRequestKind; restaurantId?: string }) {
    const { manualPaymentEnabled } = await platformSettingsService.getPaymentTogglesOrDefault();
    if (!manualPaymentEnabled) {
      throw badRequest('El pago manual está deshabilitado por ahora. Intenta con Ramblay o contáctanos.');
    }

    const { priceUsd, promo } = await resolvePrice(input.plan, input.billingCycle, input.promoCode);

    return prisma.planRequest.create({
      data: {
        kind: opts.kind,
        restaurantId: opts.restaurantId,
        plan: input.plan as SubscriptionPlan,
        billingCycle: input.billingCycle,
        customTables: null,
        customUsers: null,
        customOrders: null,
        customAdministration: false,
        customInventoryBasic: false,
        customInventoryRecipe: false,
        customAccountsPayable: false,
        promoCode: promo?.code,
        discountPercent: promo?.discountPercent,
        priceUsd,
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        restaurantName: input.restaurantName,
      },
    });
  },

  /**
   * "Pago fraccionado" (solo pago manual, ya autenticado): registra la intención de pago sin
   * pedir todavía un método/referencia — esos se van agregando abono por abono con addPayment().
   * priceUsd queda fijo desde este momento (igual que en create()), así el código promocional no
   * se re-evalúa ni se re-consume en cada abono.
   */
  async createInstallment(input: CreateInstallmentPlanRequestInput, opts: { kind: PlanRequestKind; restaurantId?: string }) {
    const { manualPaymentEnabled } = await platformSettingsService.getPaymentTogglesOrDefault();
    if (!manualPaymentEnabled) {
      throw badRequest('El pago manual está deshabilitado por ahora. Intenta con Ramblay o contáctanos.');
    }

    const { priceUsd, promo } = await resolvePrice(input.plan, input.billingCycle, input.promoCode);

    return prisma.planRequest.create({
      data: {
        kind: opts.kind,
        restaurantId: opts.restaurantId,
        plan: input.plan as SubscriptionPlan,
        billingCycle: input.billingCycle,
        customTables: null,
        customUsers: null,
        customOrders: null,
        customAdministration: false,
        customInventoryBasic: false,
        customInventoryRecipe: false,
        customAccountsPayable: false,
        promoCode: promo?.code,
        discountPercent: promo?.discountPercent,
        priceUsd,
        paymentMethod: 'PAGO_MOVIL',
        paymentReference: INSTALLMENT_PLACEHOLDER_REFERENCE,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        restaurantName: input.restaurantName,
      },
      include: { payments: true },
    });
  },

  /** El restaurante retoma su "pago fraccionado" pendiente (si tiene uno) al volver a la
   * pantalla de facturación, en vez de crear uno nuevo cada vez. */
  async getPendingInstallment(restaurantId: string) {
    return prisma.planRequest.findFirst({
      where: { restaurantId, status: 'PENDING', paymentReference: INSTALLMENT_PLACEHOLDER_REFERENCE },
      orderBy: { createdAt: 'desc' },
      include: { payments: { orderBy: { createdAt: 'asc' } } },
    });
  },

  /**
   * Registra un abono del pago fraccionado: su propio monto, método y comprobante. Se puede
   * llamar varias veces hasta cubrir priceUsd — "Activar cuenta" sigue siendo una decisión manual
   * del equipo QuickTap (approve() no cambia), que revisa la suma de abonos antes de aprobar.
   */
  async addPayment(planRequestId: string, restaurantId: string, input: AddPlanRequestPaymentInput, proofImageUrl: string) {
    const request = await prisma.planRequest.findUnique({ where: { id: planRequestId } });
    if (!request) throw notFound('Solicitud no encontrada.');
    if (request.restaurantId !== restaurantId) throw forbidden('Esta solicitud no pertenece a tu restaurante.');
    if (request.status !== 'PENDING') throw badRequest('Esta solicitud ya fue procesada, no se pueden agregar más abonos.');

    return prisma.planRequestPayment.create({
      data: {
        planRequestId,
        amountUsd: input.amountUsd,
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference,
        proofImageUrl,
      },
    });
  },

  /**
   * Crea la solicitud de plan y, de una vez, la sesión de pago en Ramblay
   * (C2P / Binance Pay): el restaurante no escribe ningún número de
   * referencia, paga en el checkout de Ramblay y el webhook activa el plan
   * solo (ver ramblayWebhookService). Si Ramblay falla al crear el pago, no
   * dejamos una solicitud huérfana en PENDING sin forma de completarse.
   */
  async createRamblayCheckout(input: CreateRamblayCheckoutInput, opts: { kind: PlanRequestKind; restaurantId?: string }) {
    const { ramblayEnabled } = await platformSettingsService.getPaymentTogglesOrDefault();
    if (!ramblayEnabled) {
      throw badRequest('El pago con Ramblay está deshabilitado por ahora. Intenta con el pago manual.');
    }

    const { priceUsd, promo } = await resolvePrice(input.plan, input.billingCycle, input.promoCode);

    const planRequest = await prisma.planRequest.create({
      data: {
        kind: opts.kind,
        restaurantId: opts.restaurantId,
        plan: input.plan as SubscriptionPlan,
        billingCycle: input.billingCycle,
        customTables: null,
        customUsers: null,
        customOrders: null,
        customAdministration: false,
        customInventoryBasic: false,
        customInventoryRecipe: false,
        customAccountsPayable: false,
        promoCode: promo?.code,
        discountPercent: promo?.discountPercent,
        priceUsd,
        paymentMethod: 'RAMBLAY',
        // Placeholder hasta que Ramblay responda con su id de pago (abajo).
        paymentReference: 'Ramblay: pendiente',
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        restaurantName: input.restaurantName,
      },
    });

    try {
      const payment = await ramblayClient.createPayment({
        amount: priceUsd,
        productName: `QuickTap · ${PLAN_LABELS[input.plan as SubscriptionPlan]}`,
        productDescription: `Ciclo ${input.billingCycle}`,
        clientReferenceId: planRequest.id,
        successUrl: `${env.appUrl}/admin/billing?ramblay=success`,
        cancelUrl: `${env.appUrl}/admin/billing?ramblay=cancel`,
      });

      await prisma.planRequest.update({
        where: { id: planRequest.id },
        data: { ramblayPaymentId: payment.payframeId, paymentReference: payment.payframeId },
      });

      return { planRequestId: planRequest.id, checkoutUrl: payment.checkoutUrl };
    } catch (err) {
      await prisma.planRequest.delete({ where: { id: planRequest.id } });
      throw err;
    }
  },

  /** Dashboard maestro: comprobantes de inscripción o de mensualidad, más recientes primero. */
  async listByKind(kind: PlanRequestKind, status?: PlanRequestStatus) {
    return prisma.planRequest.findMany({
      where: { kind, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        restaurant: { select: { id: true, name: true, slug: true } },
        payments: { orderBy: { createdAt: 'asc' } },
      },
    });
  },

  /**
   * "Activar cuenta": aprueba la solicitud y activa/extiende la suscripción
   * del restaurante. Para SIGNUP sin restaurantId todavía, el admin debe
   * indicar a qué restaurante vincularla (ya registrado en /admin/register).
   * Devuelve también el enlace de WhatsApp con el aviso de "pago aceptado"
   * listo para que el admin lo envíe al contacto del comprobante.
   */
  async approve(id: string, restaurantIdOverride?: string) {
    const request = await prisma.planRequest.findUnique({ where: { id } });
    if (!request) throw notFound('Solicitud no encontrada.');
    if (request.status === 'APPROVED') throw badRequest('Esta solicitud ya fue activada.');

    const restaurantId = restaurantIdOverride ?? request.restaurantId;
    if (!restaurantId) {
      throw badRequest('Indica a qué restaurante pertenece esta solicitud antes de activarla.');
    }

    const restaurant = await applyActivation(restaurantId, request.plan, request.billingCycle, {
      administration: request.customAdministration,
      inventoryBasic: request.customInventoryBasic,
      inventoryRecipe: request.customInventoryRecipe,
      accountsPayable: request.customAccountsPayable,
    });

    await prisma.planRequest.update({
      where: { id },
      data: { status: 'APPROVED', restaurantId },
    });

    const whatsappUrl = request.contactPhone
      ? buildWhatsappUrl(request.contactPhone, buildAcceptedMessage(request.plan))
      : null;

    return { restaurant, whatsappUrl };
  },

  /** "Rechazar" o "Pago no recibido": no activa nada, solo cambia el estado y arma el aviso de WhatsApp. */
  async reject(id: string, status: 'REJECTED' | 'PAYMENT_NOT_RECEIVED') {
    const request = await prisma.planRequest.findUnique({ where: { id } });
    if (!request) throw notFound('Solicitud no encontrada.');
    if (request.status === 'APPROVED') throw badRequest('Esta solicitud ya fue activada, no se puede rechazar.');

    const updated = await prisma.planRequest.update({ where: { id }, data: { status } });

    const message = status === 'REJECTED' ? buildRejectedMessage() : buildPaymentNotReceivedMessage();
    const whatsappUrl = request.contactPhone ? buildWhatsappUrl(request.contactPhone, message) : null;

    return { request: updated, whatsappUrl };
  },

  /** Rearma el enlace de WhatsApp para una solicitud ya decidida (reenviar el aviso sin cambiar nada). */
  async getWhatsappLink(id: string) {
    const request = await prisma.planRequest.findUnique({ where: { id } });
    if (!request) throw notFound('Solicitud no encontrada.');
    if (!request.contactPhone) return { whatsappUrl: null };

    const message =
      request.status === 'APPROVED'
        ? buildAcceptedMessage(request.plan)
        : request.status === 'REJECTED'
          ? buildRejectedMessage()
          : request.status === 'PAYMENT_NOT_RECEIVED'
            ? buildPaymentNotReceivedMessage()
            : null;
    if (!message) return { whatsappUrl: null };

    return { whatsappUrl: buildWhatsappUrl(request.contactPhone, message) };
  },

  /** Elimina el comprobante (no se permite si ya activó una cuenta, para no perder el historial). */
  /**
   * También permite borrar solicitudes ya APPROVED: la activación del plan
   * (`applyActivation`, en `approve()`) ya quedó grabada en el propio
   * `Restaurant` en su momento, así que borrar este registro solo quita la
   * fila del reporte de ingresos — no revierte la suscripción activa. Es lo
   * que usa el drill-down de "Ingresos de QuickTap" para corregir un error
   * de carga (monto/referencia mal puestos, duplicados, etc).
   */
  async remove(id: string) {
    const request = await prisma.planRequest.findUnique({ where: { id } });
    if (!request) throw notFound('Solicitud no encontrada.');
    await prisma.planRequest.delete({ where: { id } });
  },

  /** Corrige el monto o el número de referencia de una solicitud ya cargada. */
  async update(id: string, input: UpdatePlanRequestInput) {
    const request = await prisma.planRequest.findUnique({ where: { id } });
    if (!request) throw notFound('Solicitud no encontrada.');
    return prisma.planRequest.update({
      where: { id },
      data: {
        ...(input.priceUsd !== undefined ? { priceUsd: input.priceUsd } : {}),
        ...(input.paymentReference !== undefined ? { paymentReference: input.paymentReference } : {}),
      },
    });
  },

  /** Activación manual desde el detalle del restaurante en el Dashboard maestro (sin comprobante). */
  async activateRestaurant(restaurantId: string, input: ActivateRestaurantInput) {
    return applyActivation(restaurantId, input.plan as SubscriptionPlan, input.billingCycle);
  },
};
