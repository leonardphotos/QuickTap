import { Capacitor } from '@capacitor/core';

/**
 * A quién le habla la app: a la nube, o al relé local de la PC del restaurante.
 *
 * Mientras hay internet todo va a la nube, como siempre. Si se cae, y el restaurante configuró
 * un relé, la app se pasa sola a él para que el salón siga tomando pedidos e imprimiendo.
 *
 * ## Por qué no basta con `navigator.onLine`
 *
 * Ese flag solo dice si hay *una interfaz de red levantada*. En el caso que nos importa —el WiFi
 * del local funciona pero el proveedor de internet está caído— dice `true` y no sirve de nada.
 * Por eso se comprueba de verdad, pidiéndole algo a la nube.
 *
 * ## Por qué con histéresis
 *
 * Una conexión inestable puede fallar un segundo y volver. Cambiar de destino en ese primer
 * tropiezo haría que la app rebote entre nube y relé, y cada rebote reconecta sockets y puede
 * perder eventos. Por eso hace falta que falle varias veces seguidas para irse al relé, y que
 * responda varias veces seguidas para volver.
 */

export type ConnectivityState =
  /** Todo normal: la nube responde. */
  | 'online'
  /** La nube no responde, pero el relé del local sí — el salón sigue trabajando. */
  | 'relay'
  /** Ni la nube ni el relé. No se puede tomar pedidos. */
  | 'offline';

const CLOUD_ORIGIN = Capacitor.isNativePlatform()
  ? (import.meta.env.VITE_DESKTOP_API_ORIGIN ?? 'https://quicktap.club')
  : '';

const RELAY_KEY = 'quicktap_relay_url';

/** Cuántos fallos seguidos hacen falta para dar la nube por caída. */
const FAILS_TO_LEAVE_CLOUD = 3;
/** Cuántos éxitos seguidos hacen falta para volver a la nube. */
const OKS_TO_RETURN_CLOUD = 2;
const PROBE_INTERVAL_MS = 5000;
const PROBE_TIMEOUT_MS = 3000;

/**
 * Dirección del relé, guardada EN EL PROPIO dispositivo (no en el restaurante): dos tablets
 * pueden estar en redes distintas y necesitar direcciones distintas.
 */
export function getRelayUrl(): string | null {
  return localStorage.getItem(RELAY_KEY);
}

export function setRelayUrl(url: string | null): void {
  if (url && url.trim()) localStorage.setItem(RELAY_KEY, url.trim().replace(/\/+$/, ''));
  else localStorage.removeItem(RELAY_KEY);
  // Cambiar el relé obliga a reevaluar: puede que ahora sí haya a dónde ir.
  void probeNow();
}

let state: ConnectivityState = 'online';
let consecutiveFails = 0;
let consecutiveOks = 0;
let timer: ReturnType<typeof setInterval> | null = null;

type Listener = (s: ConnectivityState) => void;
const listeners = new Set<Listener>();

export function getConnectivity(): ConnectivityState {
  return state;
}

/** El origen al que hay que pegarle AHORA. Cadena vacía = mismo origen (navegador normal). */
export function currentOrigin(): string {
  return state === 'relay' ? (getRelayUrl() ?? CLOUD_ORIGIN) : CLOUD_ORIGIN;
}

export function onConnectivityChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setState(next: ConnectivityState) {
  if (next === state) return;
  state = next;
  listeners.forEach((fn) => fn(next));
}

async function reachable(origin: string, path: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${origin}${path}`, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return false;
    // No basta con un 200: en producción Nginx sirve el panel como estáticos y manda al
    // catch-all del SPA cualquier ruta que no proxea, así que una ruta equivocada devuelve
    // el HTML del panel con 200 y el sondeo daría "hay internet" con la API caída.
    // Solo cuenta como vivo si responde el JSON que esta ruta promete.
    const body = (await res.json()) as { ok?: boolean };
    return body?.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/** Una ronda de comprobación. Exportada para poder forzarla (ej. al cambiar la config). */
export async function probeNow(): Promise<ConnectivityState> {
  // `/api/v1/ping` y no `/health`: en producción Nginx solo proxea `/api/`, así que `/health`
  // —aunque exista en Express— nunca llega al backend y lo contesta el SPA. Ver src/routes/index.ts.
  const cloudOk = await reachable(CLOUD_ORIGIN, '/api/v1/ping');

  if (cloudOk) {
    consecutiveFails = 0;
    consecutiveOks += 1;
    // Ya en la nube, no hay nada que decidir. Si estamos en el relé, hacen falta varios
    // éxitos seguidos para volver, para no rebotar con una conexión intermitente.
    if (state === 'online' || consecutiveOks >= OKS_TO_RETURN_CLOUD) setState('online');
    return state;
  }

  consecutiveOks = 0;
  consecutiveFails += 1;
  if (consecutiveFails < FAILS_TO_LEAVE_CLOUD) return state;

  const relay = getRelayUrl();
  if (!relay) {
    setState('offline');
    return state;
  }
  setState((await reachable(relay, '/api/v1/relay/health')) ? 'relay' : 'offline');
  return state;
}

/** Arranca la vigilancia. Idempotente: llamarla dos veces no duplica el temporizador. */
export function startConnectivityWatch(): void {
  if (timer) return;
  void probeNow();
  timer = setInterval(() => void probeNow(), PROBE_INTERVAL_MS);
  // Volver a la app tras tenerla en segundo plano: comprobar ya, sin esperar el ciclo.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void probeNow();
    });
  }
}

export function stopConnectivityWatch(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
