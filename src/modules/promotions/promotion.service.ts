import { Prisma, Promotion } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, conflict, notFound } from '../../utils/http-error';
import { round2, toDecimal } from '../../utils/money';
import { customerService } from '../customers/customer.service';
import { CreatePromotionInput, UpdatePromotionInput } from './promotion.dto';

type Tx = Prisma.TransactionClient;

/** Fecha "YYYY-MM-DD" → mediodía local, para que el huso no la corra de día. */
function atNoon(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(`${value}T12:00:00`);
}

/** El fin de vigencia cubre TODO ese día: se guarda al final del día, no a mediodía. */
function atEndOfDay(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(`${value}T23:59:59`);
}

function generateCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin O/0 ni I/1, que se confunden dictados
  let out = 'PROMO-';
  for (let i = 0; i < 5; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/** El descuento que otorga la promo sobre un saldo dado, nunca mayor que el saldo. */
export function promotionDiscountOf(
  promotion: Pick<Promotion, 'discountType' | 'discountValue'>,
  baseAmount: Prisma.Decimal,
): Prisma.Decimal {
  const discount =
    promotion.discountType === 'PERCENT'
      ? round2(baseAmount.mul(promotion.discountValue).div(100))
      : round2(toDecimal(promotion.discountValue));
  return Prisma.Decimal.min(discount, baseAmount);
}

/**
 * Resuelve un código para canjearlo: existe, está activo, está vigente, y (si la
 * promo es solo para su lista) el teléfono pertenece a un cliente incluido que no
 * agotó sus canjes. Lanza badRequest con el motivo exacto — es lo que ve el cajero.
 *
 * Corre dentro de la MISMA transacción del cobro, para que el canje quede
 * registrado junto con el pago o no quede nada.
 */
export async function resolvePromotionForRedeem(
  tx: Tx,
  restaurantId: string,
  code: string,
  customerPhone: string | null | undefined,
): Promise<{ promotion: Promotion; customerId: string | null }> {
  const promotion = await tx.promotion.findUnique({
    where: { restaurantId_code: { restaurantId, code: code.trim().toUpperCase() } },
  });
  if (!promotion) throw badRequest('Ese código de promoción no existe.');
  if (!promotion.isActive) throw badRequest('Esa promoción está desactivada.');
  const now = new Date();
  if (promotion.startsAt && now < promotion.startsAt) throw badRequest('Esa promoción todavía no empieza.');
  if (promotion.endsAt && now > promotion.endsAt) throw badRequest('Esa promoción ya venció.');

  const customer = customerPhone
    ? await tx.customer.findUnique({ where: { restaurantId_phone: { restaurantId, phone: customerPhone } } })
    : null;

  if (promotion.restrictToTargets) {
    if (!customer) {
      throw badRequest('Esta promoción es solo para clientes de su lista — el cobro no tiene un cliente identificable.');
    }
    const target = await tx.promotionTarget.findUnique({
      where: { promotionId_customerId: { promotionId: promotion.id, customerId: customer.id } },
    });
    if (!target) throw badRequest(`${customer.name} no está en la lista de esta promoción.`);
  }

  if (promotion.maxPerCustomer > 0 && customer) {
    const used = await tx.promotionRedemption.count({
      where: { promotionId: promotion.id, customerId: customer.id },
    });
    if (used >= promotion.maxPerCustomer) {
      throw badRequest(`${customer.name} ya canjeó esta promoción (${used} de ${promotion.maxPerCustomer}).`);
    }
  }

  return { promotion, customerId: customer?.id ?? null };
}

/** Deja el canje registrado. Mismo tx que el cobro: o quedan los dos o ninguno. */
export async function recordPromotionRedemption(
  tx: Tx,
  input: {
    restaurantId: string;
    promotionId: string;
    customerId: string | null;
    sourceRef: string | null;
    amountBase: Prisma.Decimal;
    redeemedByUserId?: string | null;
  },
): Promise<void> {
  await tx.promotionRedemption.create({
    data: {
      restaurantId: input.restaurantId,
      promotionId: input.promotionId,
      customerId: input.customerId,
      sourceRef: input.sourceRef,
      amountBase: round2(input.amountBase),
      redeemedByUserId: input.redeemedByUserId ?? null,
    },
  });
}

export const promotionService = {
  /**
   * Crea la campaña y congela su lista de clientes (PromotionTarget) a partir del
   * segmento del CRM elegido — la lista NO se recalcula después: la promo se le
   * prometió a esa gente, no a la que califique el mes que viene.
   */
  async create(restaurantId: string, input: CreatePromotionInput) {
    const code = (input.code ?? generateCode()).toUpperCase();
    const existing = await prisma.promotion.findUnique({
      where: { restaurantId_code: { restaurantId, code } },
    });
    if (existing) throw conflict(`Ya existe una promoción con el código ${code}.`);

    // La lista destino: el segmento resuelto ahora + los elegidos a mano.
    const ids = new Set<string>(input.customerIds ?? []);
    if (input.segment !== 'MANUAL') {
      const { customers } = await customerService.list(restaurantId, { segment: input.segment });
      for (const c of customers) ids.add(c.id);
    }
    if (ids.size === 0) {
      throw badRequest('La lista quedó vacía: ese segmento no tiene clientes todavía.');
    }
    // Solo clientes del tenant — customerIds llega del cliente y no se confía en él.
    const valid = await prisma.customer.findMany({
      where: { restaurantId, id: { in: [...ids] } },
      select: { id: true },
    });

    return prisma.promotion.create({
      data: {
        restaurantId,
        name: input.name,
        message: input.message ?? null,
        code,
        discountType: input.discountType,
        discountValue: input.discountValue,
        startsAt: atNoon(input.startsAt) ?? null,
        endsAt: atEndOfDay(input.endsAt) ?? null,
        segment: input.segment,
        maxPerCustomer: input.maxPerCustomer,
        restrictToTargets: input.restrictToTargets,
        targets: { create: valid.map((c) => ({ customerId: c.id })) },
      },
      include: { _count: { select: { targets: true } } },
    });
  },

  /** Todas las campañas con sus números: lista, enviados, canjes y descuento otorgado. */
  async list(restaurantId: string) {
    const promotions = await prisma.promotion.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { targets: true, redemptions: true } },
        targets: { where: { sentAt: { not: null } }, select: { id: true } },
        redemptions: { select: { amountBase: true } },
      },
    });
    const now = new Date();
    return promotions.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      message: p.message,
      discountType: p.discountType,
      discountValue: p.discountValue.toFixed(2),
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      isActive: p.isActive,
      expired: p.endsAt != null && now > p.endsAt,
      segment: p.segment,
      maxPerCustomer: p.maxPerCustomer,
      restrictToTargets: p.restrictToTargets,
      createdAt: p.createdAt,
      targetCount: p._count.targets,
      sentCount: p.targets.length,
      redemptionCount: p._count.redemptions,
      redeemedBase: round2(p.redemptions.reduce((acc, r) => acc.add(r.amountBase), toDecimal(0))).toFixed(2),
    }));
  },

  /** El detalle para la pantalla de envío: cada cliente de la lista con su estado. */
  async detail(restaurantId: string, id: string) {
    const promotion = await prisma.promotion.findFirst({
      where: { id, restaurantId },
      include: {
        targets: {
          include: { customer: { select: { id: true, name: true, phone: true } } },
          orderBy: { customer: { name: 'asc' } },
        },
        redemptions: {
          orderBy: { createdAt: 'desc' },
          include: { customer: { select: { name: true } } },
        },
      },
    });
    if (!promotion) throw notFound('Promoción no encontrada.');
    return {
      ...promotion,
      discountValue: promotion.discountValue.toFixed(2),
      targets: promotion.targets.map((t) => ({
        customerId: t.customer.id,
        name: t.customer.name,
        phone: t.customer.phone,
        sentAt: t.sentAt,
      })),
      redemptions: promotion.redemptions.map((r) => ({
        id: r.id,
        customerName: r.customer?.name ?? 'Sin cliente',
        amountBase: r.amountBase.toFixed(2),
        sourceRef: r.sourceRef,
        createdAt: r.createdAt,
      })),
    };
  },

  async update(restaurantId: string, id: string, input: UpdatePromotionInput) {
    const existing = await prisma.promotion.findFirst({ where: { id, restaurantId }, select: { id: true } });
    if (!existing) throw notFound('Promoción no encontrada.');
    return prisma.promotion.update({
      where: { id },
      data: {
        ...input,
        startsAt: atNoon(input.startsAt),
        endsAt: atEndOfDay(input.endsAt),
      },
    });
  },

  async remove(restaurantId: string, id: string) {
    const existing = await prisma.promotion.findFirst({ where: { id, restaurantId }, select: { id: true } });
    if (!existing) throw notFound('Promoción no encontrada.');
    await prisma.promotion.delete({ where: { id } });
    return { deleted: true };
  },

  /** Marca que a este cliente ya se le envió el WhatsApp de la campaña. */
  async markSent(restaurantId: string, promotionId: string, customerId: string) {
    const promotion = await prisma.promotion.findFirst({ where: { id: promotionId, restaurantId }, select: { id: true } });
    if (!promotion) throw notFound('Promoción no encontrada.');
    await prisma.promotionTarget.update({
      where: { promotionId_customerId: { promotionId, customerId } },
      data: { sentAt: new Date() },
    });
    return { sent: true };
  },

  /**
   * Validación desde caja, ANTES de cobrar: dice si el código aplica y cuánto
   * descuenta, sin registrar nada. El canje real ocurre dentro del cobro.
   */
  async validate(restaurantId: string, code: string, phone: string | undefined) {
    const { promotion, customerId } = await resolvePromotionForRedeem(prisma, restaurantId, code, phone ?? null);
    const customer = customerId
      ? await prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } })
      : null;
    return {
      id: promotion.id,
      name: promotion.name,
      code: promotion.code,
      discountType: promotion.discountType,
      discountValue: promotion.discountValue.toFixed(2),
      customerName: customer?.name ?? null,
    };
  },
};
