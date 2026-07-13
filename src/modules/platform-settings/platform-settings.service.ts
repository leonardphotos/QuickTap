import { prisma } from '../../config/prisma';
import { UpdatePaymentMethodsInput } from './platform-settings.dto';

const SINGLETON_ID = 'singleton';

export const platformSettingsService = {
  /** Datos de pago mostrados en la pasarela manual (landing + billing autenticado). Público: sin secretos. */
  async getPaymentMethods() {
    const row = await prisma.platformSettings.findUnique({ where: { id: SINGLETON_ID } });
    return row?.paymentMethods ?? {};
  },

  async updatePaymentMethods(input: UpdatePaymentMethodsInput) {
    const row = await prisma.platformSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, paymentMethods: input },
      update: { paymentMethods: input },
    });
    return row.paymentMethods;
  },
};
