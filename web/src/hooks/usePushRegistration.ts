import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { api } from '@/api/client';

/**
 * Registra este dispositivo Android para recibir push (FCM) de "pedido nuevo" — a diferencia
 * del socket en vivo, esto llega aunque la app esté minimizada/cerrada del todo. No hace nada
 * en navegador/Electron (ahí el aviso lo cubre el socket + notificación nativa, ver
 * NewOrderAlert.tsx). Requiere que el backend tenga FIREBASE_SERVICE_ACCOUNT_JSON configurado
 * y este build tenga google-services.json — sin eso, el registro simplemente no logra nada
 * (no rompe la app).
 */
export function usePushRegistration() {
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let removeListeners: (() => void) | undefined;

    import('@capacitor/push-notifications').then(async ({ PushNotifications }) => {
      const { receive } = await PushNotifications.requestPermissions().catch(() => ({ receive: 'denied' as const }));
      if (receive !== 'granted') return;

      const registrationHandle = await PushNotifications.addListener('registration', (token) => {
        api.post('/push-tokens', { token: token.value, platform: 'android' }).catch(() => undefined);
      });
      const errorHandle = await PushNotifications.addListener('registrationError', () => undefined);

      await PushNotifications.register();
      removeListeners = () => {
        registrationHandle.remove();
        errorHandle.remove();
      };
    });

    return () => removeListeners?.();
  }, []);
}
