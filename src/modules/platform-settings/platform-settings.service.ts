import { prisma } from '../../config/prisma';
import { UpdatePaymentMethodsInput } from './platform-settings.dto';

const SINGLETON_ID = 'singleton';

export const platformSettingsService = {
  /**
   * Datos de pago mostrados en la pasarela (landing + billing autenticado),
   * más los interruptores globales de Ramblay/pago manual. Público: sin secretos.
   */
  async getPaymentMethods() {
    const row = await prisma.platformSettings.findUnique({ where: { id: SINGLETON_ID } });
    return {
      ...((row?.paymentMethods as object) ?? {}),
      ramblayEnabled: row?.ramblayEnabled ?? true,
      manualPaymentEnabled: row?.manualPaymentEnabled ?? true,
    };
  },

  async updatePaymentMethods(input: UpdatePaymentMethodsInput) {
    const { ramblayEnabled, manualPaymentEnabled, ...methods } = input;
    const row = await prisma.platformSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, paymentMethods: methods, ramblayEnabled, manualPaymentEnabled },
      update: {
        paymentMethods: methods,
        ...(ramblayEnabled !== undefined ? { ramblayEnabled } : {}),
        ...(manualPaymentEnabled !== undefined ? { manualPaymentEnabled } : {}),
      },
    });
    return { ...((row.paymentMethods as object) ?? {}), ramblayEnabled: row.ramblayEnabled, manualPaymentEnabled: row.manualPaymentEnabled };
  },

  /** Único punto de verdad para saber si un método de pago está habilitado a nivel plataforma. */
  async getPaymentTogglesOrDefault() {
    const row = await prisma.platformSettings.findUnique({
      where: { id: SINGLETON_ID },
      select: { ramblayEnabled: true, manualPaymentEnabled: true },
    });
    return { ramblayEnabled: row?.ramblayEnabled ?? true, manualPaymentEnabled: row?.manualPaymentEnabled ?? true };
  },
};
