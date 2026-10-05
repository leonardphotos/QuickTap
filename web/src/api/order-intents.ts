import type { InternalAxiosRequestConfig } from 'axios';

const pending = new Map<string, string>();
const prefix = 'quicktap_order_intent_v1:';
function eligible(config: InternalAxiosRequestConfig) {
  return config.method === 'post' && (/^\/orders\/manual$/.test(config.url ?? '') || /^\/orders\/[^/]+\/payments$/.test(config.url ?? '') || /^\/public\/checkout\/(dine-in|delivery\/[^/]+)$/.test(config.url ?? ''));
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([k,v]) => k !== 'requestKey' && v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
type IntentConfig = InternalAxiosRequestConfig & { orderIntentStorageKey?: string };
function actor(header: unknown): string {
  try {
    const token = String(header).replace(/^Bearer /, '');
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    return `${payload.restaurantId ?? ''}:${payload.userId ?? ''}`;
  } catch { return 'public'; }
}
function fallbackDigest(raw: string) {
  // Solo índice local (la autoridad compara SHA-256 en el servidor), compatible con LAN HTTP.
  let a = 2166136261, b = 5381;
  for (let i = 0; i < raw.length; i++) { a = Math.imul(a ^ raw.charCodeAt(i), 16777619); b = Math.imul(b,33) ^ raw.charCodeAt(i); }
  return `${a >>> 0}-${b >>> 0}-${raw.length}`;
}
export async function attachOrderIntent(config: InternalAxiosRequestConfig) {
  if (!eligible(config) || !config.data || typeof config.data !== 'object' || config.data.requestKey) return;
  // Digest, nunca datos personales o el token completo en el almacenamiento del intento.
  const raw = `${config.baseURL}:${config.url}:${actor(config.headers.Authorization)}:${canonical(config.data)}`;
  const digest = crypto.subtle ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))].map(n => n.toString(16).padStart(2,'0')).join('') : fallbackDigest(raw);
  const storageKey = prefix + digest;
  let key = pending.get(storageKey);
  if (!key) { try { key = localStorage.getItem(storageKey) ?? undefined; } catch { /* memoria disponible */ } }
  key ??= [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2,'0')).join('');
  pending.set(storageKey, key);
  try { localStorage.setItem(storageKey, key); } catch { /* pestaña actual conserva el intento */ }
  config.data = { ...config.data, requestKey: key };
  (config as IntentConfig).orderIntentStorageKey = storageKey;
}
export function finishOrderIntent(config: InternalAxiosRequestConfig | undefined) {
  const storageKey = (config as IntentConfig | undefined)?.orderIntentStorageKey;
  if (!storageKey) return;
  pending.delete(storageKey);
  try { localStorage.removeItem(storageKey); } catch { /* almacenamiento no disponible */ }
}
