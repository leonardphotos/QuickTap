import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging as getFirebaseMessaging, type Messaging } from 'firebase-admin/messaging';

let app: App | null | undefined;

/**
 * Cliente de Firebase Admin para mandar push (FCM) a la app de escritorio/Android. Requiere
 * la variable de entorno FIREBASE_SERVICE_ACCOUNT_JSON (el JSON de la cuenta de servicio,
 * descargado de la consola de Firebase, como un solo string). Sin esa variable, `getMessaging`
 * devuelve null — quien llama debe tratarlo como "push no disponible todavía", no como error:
 * el negocio tiene que poder seguir vendiendo aunque nadie haya configurado Firebase.
 */
function getApp(): App | null {
  if (app !== undefined) return app;
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) {
    app = null;
    return app;
  }
  try {
    app = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(json)) });
  } catch {
    app = null;
  }
  return app;
}

export function getMessaging(): Messaging | null {
  const a = getApp();
  return a ? getFirebaseMessaging(a) : null;
}
