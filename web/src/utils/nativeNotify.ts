import { Capacitor } from '@capacitor/core';
import { notifyDesktop } from './electronBridge';

let androidChannelReady = false;

async function ensureAndroidChannel() {
  if (androidChannelReady) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  // Android 13+ (API 33) exige permiso explícito para notificaciones — sin esto, se
  // programan "bien" pero nunca aparecen, en silencio.
  await LocalNotifications.requestPermissions().catch(() => undefined);
  await LocalNotifications.createChannel({
    id: 'orders',
    name: 'Pedidos nuevos',
    // IMPORTANCE_HIGH: popup + sonido, no solo la barra de estado — un pedido nuevo no
    // puede pasar desapercibido.
    importance: 5,
    visibility: 1,
    vibration: true,
  }).catch(() => undefined);
  androidChannelReady = true;
}

/**
 * Notificación nativa del sistema operativo — Windows (Electron, vía electronBridge) o Android
 * (Capacitor LocalNotifications). En Android esto SOLO dispara mientras la app tiene su JS vivo
 * (primer plano o recién minimizada) — para el caso "con la app cerrada del todo" hace falta el
 * push real (FCM), ver usePushRegistration.ts + sendNewOrderPush en order.service.ts.
 */
export async function notifyNative(payload: { title: string; body: string }) {
  if (Capacitor.getPlatform() === 'android') {
    await ensureAndroidChannel();
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Date.now() % 2147483647,
          title: payload.title,
          body: payload.body,
          channelId: 'orders',
        },
      ],
    }).catch(() => undefined);
    return;
  }
  notifyDesktop(payload);
}
