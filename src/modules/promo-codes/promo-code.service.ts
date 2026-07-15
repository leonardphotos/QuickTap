import { PromoCodeDurationUnit } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { CreatePromoCodeInput, UpdatePromoCodeInput } from './promo-code.dto';

const MS_BY_UNIT: Record<PromoCodeDurationUnit, number> = {
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  MONTH: 30 * 24 * 60 * 60 * 1000,
  YEAR: 365 * 24 * 60 * 60 * 1000,
};

function isExpired(promo: { expiresAt: Date | null }): boolean {
  return Boolean(promo.expiresAt && promo.expiresAt.getTime() < Date.now());
}

export const promoCodeService = {
  async list() {
    return prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
  },

  async create(input: CreatePromoCodeInput) {
    const { durationValue, durationUnit, ...rest } = input;
    const expiresAt =
      durationValue && durationUnit ? new Date(Date.now() + durationValue * MS_BY_UNIT[durationUnit]) : null;

    return prisma.promoCode.create({
      data: { ...rest, durationValue: durationValue ?? null, durationUnit: durationUnit ?? null, expiresAt },
    });
  },

  async update(id: string, input: UpdatePromoCodeInput) {
    const existing = await prisma.promoCode.findUnique({ where: { id } });
    if (!existing) throw notFound('Código no encontrado.');
    return prisma.promoCode.update({ where: { id }, data: input });
  },

  async remove(id: string) {
    const existing = await prisma.promoCode.findUnique({ where: { id } });
    if (!existing) throw notFound('Código no encontrado.');
    await prisma.promoCode.delete({ where: { id } });
    return { deleted: true };
  },

  /** Valida un código para previsualizar el descuento (no lo consume ni lo confirma). */
  async validate(code: string) {
    const promo = await prisma.promoCode.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!promo || !promo.isActive || isExpired(promo)) throw badRequest('Código de descuento inválido.');
    return { code: promo.code, discountPercent: promo.discountPercent };
  },

  /** Igual que validate, pero no lanza: usado al calcular el precio final de una solicitud de plan. */
  async tryApply(code: string | undefined | null): Promise<{ code: string; discountPercent: number } | null> {
    if (!code) return null;
    const promo = await prisma.promoCode.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!promo || !promo.isActive || isExpired(promo)) return null;
    return { code: promo.code, discountPercent: promo.discountPercent };
  },
};
