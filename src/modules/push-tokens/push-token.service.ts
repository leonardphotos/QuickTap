import { prisma } from '../../config/prisma';
import type { RegisterDeviceTokenInput } from './push-token.dto';

/**
 * Tokens de push (FCM) por dispositivo — app de escritorio (Windows/Electron) y Android
 * (Capacitor). Cada usuario puede tener varios (celular + PC de la caja, por ejemplo); al
 * mandar un push se manda a todos los suyos. El token es único globalmente (lo entrega
 * Firebase, no nosotros), así que un mismo dispositivo reinstalado/relogueado simplemente
 * actualiza a quién pertenece en vez de duplicar la fila.
 */
export const pushTokenService = {
  async register(restaurantId: string, userId: string, input: RegisterDeviceTokenInput) {
    return prisma.deviceToken.upsert({
      where: { token: input.token },
      update: { restaurantId, userId, platform: input.platform },
      create: { restaurantId, userId, token: input.token, platform: input.platform },
    });
  },

  async unregister(userId: string, token: string) {
    await prisma.deviceToken.deleteMany({ where: { userId, token } });
    return { deleted: true };
  },
};
