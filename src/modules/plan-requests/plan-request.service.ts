import { BillingCycle, PlanRequestKind, PlanRequestStatus, SubscriptionPlan } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { nextPeriodEnd } from '../../utils/subscription';
import { buildWhatsappUrl } from '../../utils/whatsapp';
import { promoCodeService } from '../promo-codes/promo-code.service';
import { ActivateRestaurantInput, CreatePlanRequestInput } from './plan-request.dto';

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  TRIAL: 'Prueba Gratuita',
  STARTER: 'Plan Inicial',
  PRO: 'Plan Pro / Restaurante',
  PREMIUM: 'Plan Premium',
  DELIVERY: 'Plan Solo Delivery',
  CUSTOM: 'Plan Personalizado',
};

// Beneficios breves para el mensaje de bienvenida por WhatsApp al activar la cuenta.
const PLAN_BENEFITS: Record<SubscriptionPlan, string> = {
  TRIAL: 'Mesas y códigos QR ilimitados durante tu prueba.',
  STARTER: 'Hasta 5-6 mesas, 200 pedidos al mes y 4 usuarios de tu equipo.',
  PRO: 'Hasta 20 mesas, 450 pedidos al mes, 8 usuarios de tu equipo, Administración, Inventario y Cuentas por pagar.',
  PREMIUM: 'Mesas y pedidos ilimitados, hasta 20 usuarios, Administración e Inventario por receta.',
  DELIVERY: 'Acceso directo a Cocina, 250 pedidos al mes y 3 usuarios de tu equipo.',
  CUSTOM: 'Tu plan armado a la medida de tu restaurante.',
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
    'No pudimos validar tu comprobante. Verifica en tu banco o plataforma que la transacción se haya realizado correctamente y vuelve a enviarnos tu comprobante cuando puedas.',
  ].join('\n\n');
}

function buildPaymentNotReceivedMessage(): string {
  return [
    '⚠️ *Pago no recibido*',
    'Aún no hemos recibido tu pago. Por favor verifica en tu banco si la transacción se completó y, si hay algún problema, vuelve a intentarlo o contáctanos.',
  ].join('\n\n');
}

/**
 * Precios fijos por plan y ciclo de facturación (USD/mes). Única fuente de
 * verdad: el precio que llega del cliente NUNCA se usa, siempre se recalcula
 * aquí para evitar manipulación.
 */
const FIXED_PLAN_PRICES: Record<'DELIVERY' | 'STARTER' | 'PRO' | 'PREMIUM', Record<BillingCycle, number>> = {
  DELIVERY: { MONTHLY: 18.75, QUARTERLY: 15, SEMIANNUAL: 11.25 },
  STARTER: { MONTHLY: 25, QUARTERLY: 18.75, SEMIANNUAL: 12.5 },
  PRO: { MONTHLY: 43.75, QUARTERLY: 37.5, SEMIANNUAL: 31.25 },
  PREMIUM: { MONTHLY: 62.5, QUARTERLY: 56.25, SEMIANNUAL: 50 },
};

// Fórmula del plan personalizado: base + mesas + usuarios (desde el 3ro) + pedidos
// (por cada 100) + adicionales (Administración/Inventario/Cuentas por pagar).
const CUSTOM_BASE_USD = 12.5;
const CUSTOM_PRICE_PER_TABLE = 1.25;
const CUSTOM_FREE_USERS = 2;
const CUSTOM_PRICE_PER_USER = 1.88;
const CUSTOM_PRICE_PER_100_ORDERS = 2.5;
// Precio mensual de cada adicional del plan personalizado.
const CUSTOM_ADDON_PRICES = {
  administration: 8,
  inventoryBasic: 5,
  inventoryRecipe: 12,
  accountsPayable: 4,
} as const;

export interface CustomAddons {
  administration?: boolean;
  inventoryBasic?: boolean;
  inventoryRecipe?: boolean;
  accountsPayable?: boolean;
}

export function calculateCustomPriceUsd(tables: number, users: number, orders: number, addons: CustomAddons = {}): number {
  const billableUsers = Math.max(0, users - CUSTOM_FREE_USERS);
  const addonsTotal =
    (addons.administration ? CUSTOM_ADDON_PRICES.administration : 0) +
    (addons.inventoryBasic ? CUSTOM_ADDON_PRICES.inventoryBasic : 0) +
    (addons.inventoryRecipe ? CUSTOM_ADDON_PRICES.inventoryRecipe : 0) +
    (addons.accountsPayable ? CUSTOM_ADDON_PRICES.accountsPayable : 0);
  const price =
    CUSTOM_BASE_USD +
    tables * CUSTOM_PRICE_PER_TABLE +
    billableUsers * CUSTOM_PRICE_PER_USER +
    (orders / 100) * CUSTOM_PRICE_PER_100_ORDERS +
    addonsTotal;
  return Math.round(price * 100) / 100;
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
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { periodEnd: true } });
  if (!restaurant) throw notFound('Restaurante no encontrado.');

  return prisma.restaurant.update({
    where: { id: restaurantId },
    data: {
      subscriptionStatus: 'ACTIVE',
      subscriptionPlan: plan,
      billingCycle,
      periodEnd: nextPeriodEnd(billingCycle, restaurant.periodEnd),
      ...(plan === 'CUSTOM' && addons
        ? {
            customAdministration: !!addons.administration,
            customInventoryBasic: !!addons.inventoryBasic,
            customInventoryRecipe: !!addons.inventoryRecipe,
            customAccountsPayable: !!addons.accountsPayable,
          }
        : {}),
    },
  });
}

export const planRequestService = {
  /** Crea la solicitud de plan; el comprobante ya fue guardado en disco por el middleware de upload. */
  async create(
    input: CreatePlanRequestInput,
    proofUrl: string,
    opts: { kind: PlanRequestKind; restaurantId?: string },
  ) {
    let priceUsd: number;
    const addons: CustomAddons = {
      administration: input.customAdministration,
      inventoryBasic: input.customInventoryBasic,
      inventoryRecipe: input.customInventoryRecipe,
      accountsPayable: input.customAccountsPayable,
    };

    if (input.plan === 'CUSTOM') {
      const tables = input.customTables ?? 0;
      const users = input.customUsers ?? 0;
      const orders = input.customOrders ?? 0;
      priceUsd = calculateCustomPriceUsd(tables, users, orders, addons);
    } else {
      priceUsd = FIXED_PLAN_PRICES[input.plan][input.billingCycle];
    }

    if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
      throw badRequest('No se pudo calcular el precio del plan.');
    }

    const promo = await promoCodeService.tryApply(input.promoCode);
    if (input.promoCode && !promo) throw badRequest('Código de descuento inválido.');
    if (promo) priceUsd = Math.round(priceUsd * (1 - promo.discountPercent / 100) * 100) / 100;

    return prisma.planRequest.create({
      data: {
        kind: opts.kind,
        restaurantId: opts.restaurantId,
        plan: input.plan as SubscriptionPlan,
        billingCycle: input.billingCycle,
        customTables: input.plan === 'CUSTOM' ? input.customTables ?? 0 : null,
        customUsers: input.plan === 'CUSTOM' ? input.customUsers ?? 0 : null,
        customOrders: input.plan === 'CUSTOM' ? input.customOrders ?? 0 : null,
        customAdministration: input.plan === 'CUSTOM' ? !!addons.administration : false,
        customInventoryBasic: input.plan === 'CUSTOM' ? !!addons.inventoryBasic : false,
        customInventoryRecipe: input.plan === 'CUSTOM' ? !!addons.inventoryRecipe : false,
        customAccountsPayable: input.plan === 'CUSTOM' ? !!addons.accountsPayable : false,
        promoCode: promo?.code,
        discountPercent: promo?.discountPercent,
        priceUsd,
        paymentMethod: input.paymentMethod,
        proofUrl,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        restaurantName: input.restaurantName,
      },
    });
  },

  /** Dashboard maestro: comprobantes de inscripción o de mensualidad, más recientes primero. */
  async listByKind(kind: PlanRequestKind, status?: PlanRequestStatus) {
    return prisma.planRequest.findMany({
      where: { kind, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { restaurant: { select: { id: true, name: true, slug: true } } },
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
  async remove(id: string) {
    const request = await prisma.planRequest.findUnique({ where: { id } });
    if (!request) throw notFound('Solicitud no encontrada.');
    if (request.status === 'APPROVED') {
      throw badRequest('No se puede eliminar un comprobante ya activado.');
    }
    await prisma.planRequest.delete({ where: { id } });
  },

  /** Activación manual desde el detalle del restaurante en el Dashboard maestro (sin comprobante). */
  async activateRestaurant(restaurantId: string, input: ActivateRestaurantInput) {
    return applyActivation(restaurantId, input.plan as SubscriptionPlan, input.billingCycle);
  },
};
