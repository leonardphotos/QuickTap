import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { CreatePromoCodeInput, UpdatePromoCodeInput } from './promo-code.dto';

export const promoCodeService = {
  async list() {
    return prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
  },

  async create(input: CreatePromoCodeInput) {
    return prisma.promoCode.create({ data: input });
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
    if (!promo || !promo.isActive) throw badRequest('Código de descuento inválido.');
    return { code: promo.code, discountPercent: promo.discountPercent };
  },

  /** Igual que validate, pero no lanza: usado al calcular el precio final de una solicitud de plan. */
  async tryApply(code: string | undefined | null): Promise<{ code: string; discountPercent: number } | null> {
    if (!code) return null;
    const promo = await prisma.promoCode.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!promo || !promo.isActive) return null;
    return { code: promo.code, discountPercent: promo.discountPercent };
  },
};
