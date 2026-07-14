import { BillingCycle, PlanRequestKind, SubscriptionPlan } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { nextPeriodEnd } from '../../utils/subscription';
import { promoCodeService } from '../promo-codes/promo-code.service';
import { ActivateRestaurantInput, CreatePlanRequestInput } from './plan-request.dto';

/**
 * Precios fijos por plan y ciclo de facturación (USD/mes). Única fuente de
 * verdad: el precio que llega del cliente NUNCA se usa, siempre se recalcula
 * aquí para evitar manipulación.
 */
const FIXED_PLAN_PRICES: Record<'DELIVERY' | 'STARTER' | 'PRO' | 'PREMIUM', Record<BillingCycle, number>> = {
  DELIVERY: { MONTHLY: 15, QUARTERLY: 12, SEMIANNUAL: 9 },
  STARTER: { MONTHLY: 20, QUARTERLY: 15, SEMIANNUAL: 10 },
  PRO: { MONTHLY: 35, QUARTERLY: 30, SEMIANNUAL: 25 },
  PREMIUM: { MONTHLY: 50, QUARTERLY: 45, SEMIANNUAL: 40 },
};

// Fórmula del plan personalizado: base + mesas + usuarios (desde el 3ro) + pedidos (por cada 100).
const CUSTOM_BASE_USD = 10;
const CUSTOM_PRICE_PER_TABLE = 1;
const CUSTOM_FREE_USERS = 2;
const CUSTOM_PRICE_PER_USER = 1.5;
const CUSTOM_PRICE_PER_100_ORDERS = 2;

export function calculateCustomPriceUsd(tables: number, users: number, orders: number): number {
  const billableUsers = Math.max(0, users - CUSTOM_FREE_USERS);
  const price =
    CUSTOM_BASE_USD +
    tables * CUSTOM_PRICE_PER_TABLE +
    billableUsers * CUSTOM_PRICE_PER_USER +
    (orders / 100) * CUSTOM_PRICE_PER_100_ORDERS;
  return Math.round(price * 100) / 100;
}

/** Activa/extiende la suscripción de un restaurante. Único punto que toca estos campos. */
async function applyActivation(restaurantId: string, plan: SubscriptionPlan, billingCycle: BillingCycle) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { periodEnd: true } });
  if (!restaurant) throw notFound('Restaurante no encontrado.');

  return prisma.restaurant.update({
    where: { id: restaurantId },
    data: {
      subscriptionStatus: 'ACTIVE',
      subscriptionPlan: plan,
      billingCycle,
      periodEnd: nextPeriodEnd(billingCycle, restaurant.periodEnd),
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

    if (input.plan === 'CUSTOM') {
      const tables = input.customTables ?? 0;
      const users = input.customUsers ?? 0;
      const orders = input.customOrders ?? 0;
      priceUsd = calculateCustomPriceUsd(tables, users, orders);
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
  async listByKind(kind: PlanRequestKind, status?: 'PENDING' | 'APPROVED') {
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
   */
  async approve(id: string, restaurantIdOverride?: string) {
    const request = await prisma.planRequest.findUnique({ where: { id } });
    if (!request) throw notFound('Solicitud no encontrada.');
    if (request.status === 'APPROVED') throw badRequest('Esta solicitud ya fue activada.');

    const restaurantId = restaurantIdOverride ?? request.restaurantId;
    if (!restaurantId) {
      throw badRequest('Indica a qué restaurante pertenece esta solicitud antes de activarla.');
    }

    const restaurant = await applyActivation(restaurantId, request.plan, request.billingCycle);

    await prisma.planRequest.update({
      where: { id },
      data: { status: 'APPROVED', restaurantId },
    });

    return restaurant;
  },

  /** Activación manual desde el detalle del restaurante en el Dashboard maestro (sin comprobante). */
  async activateRestaurant(restaurantId: string, input: ActivateRestaurantInput) {
    return applyActivation(restaurantId, input.plan as SubscriptionPlan, input.billingCycle);
  },
};
