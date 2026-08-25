import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { api } from '@/api/client';
import { getWalletToken } from './walletSession';

/**
 * Registra este teléfono para los push del Wallet (recordatorios de cuota, 3 días antes).
 *
 * Gemelo de usePushRegistration, pero contra la ruta del Wallet y con SU token: el del panel
 * registra el aparato de un miembro del staff bajo su restaurante; acá el dueño del aparato
 * es un cliente final sin usuario en ningún negocio. Solo actúa dentro de la app instalada —
 * en el navegador no hay puente de Capacitor y el hook no hace nada.
 */
export function useWalletPush() {
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    if (!getWalletToken()) return;
    let quitar: (() => void) | undefined;

    import('@capacitor/push-notifications').then(async ({ PushNotifications }) => {
      const { receive } = await PushNotifications.requestPermissions().catch(() => ({ receive: 'denied' as const }));
      if (receive !== 'granted') return;
      const alta = await PushNotifications.addListener('registration', (token) => {
        api
          .post(
            '/public/wallet/push-tokens',
            { token: token.value, platform: 'android' },
            { headers: { Authorization: `Bearer ${getWalletToken()}` } },
          )
          .catch(() => undefined);
      });
      const err = await PushNotifications.addListener('registrationError', () => undefined);
      await PushNotifications.register();
      quitar = () => {
        alta.remove();
        err.remove();
      };
    });

    return () => quitar?.();
  }, []);
}
