import { prisma } from '../config/prisma';
import { getMessaging } from './firebase-admin';

/**
 * Push (FCM) a todos los dispositivos registrados de un restaurante.
 *
 * A diferencia del socket en vivo (`emitToKitchen`), esto llega aunque la app esté minimizada o
 * cerrada del todo en Android — que es justo el caso que el socket no puede cubrir, porque
 * Android congela el JavaScript del WebView para ahorrar batería.
 *
 * Nunca tira error ni bloquea a quien lo llama: si Firebase no está configurado
 * (FIREBASE_SERVICE_ACCOUNT_JSON) o todavía no hay dispositivos registrados, simplemente no
 * hace nada. El negocio tiene que poder seguir vendiendo sin esto.
 */
export async function sendPushToRestaurant(
  restaurantId: string,
  payload: { title: string; body: string },
): Promise<void> {
  const messaging = getMessaging();
  if (!messaging) return;

  const tokens = await prisma.deviceToken.findMany({ where: { restaurantId }, select: { token: true } });
  if (tokens.length === 0) return;
  const list = tokens.map((t) => t.token);

  try {
    const res = await messaging.sendEachForMulticast({
      tokens: list,
      notification: payload,
      android: { priority: 'high' },
    });

    // Los tokens mueren solos (app desinstalada, datos borrados). Si no se limpian, la tabla
    // crece para siempre y cada aviso desperdicia envíos contra teléfonos que ya no existen.
    const dead = res.responses
      .map((r, i) => (!r.success && isDeadToken(r.error?.code) ? list[i] : null))
      .filter((t): t is string => t !== null);
    if (dead.length > 0) {
      await prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
    }
  } catch {
    // Un push que no sale nunca debe tumbar la operación que lo disparó (un pedido, un llamado).
  }
}

function isDeadToken(code: string | undefined): boolean {
  return code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token';
}

/**
 * Insumos por los que YA se avisó que están bajos, por restaurante. Evita repetir el aviso en
 * cada movimiento de stock: sin esto, un insumo bajo dispararía un push por cada venta que lo
 * consume. Se limpia solo cuando el insumo vuelve a estar por encima de su mínimo (o sea, al
 * reponerlo), así el próximo bajón sí vuelve a avisar.
 *
 * Vive en memoria a propósito: perderlo al reiniciar solo cuesta, como mucho, un aviso repetido.
 */
const notifiedLowStock = new Map<string, Set<string>>();

/**
 * Avisa por push de los insumos que ACABAN de quedar por debajo de su mínimo (o en cero).
 * Se llama después de cualquier movimiento de stock; decide solo si hay algo nuevo que contar.
 */
/**
 * Push a TODOS los aparatos del Wallet de un cliente final, buscado por teléfono canónico.
 * Misma filosofía que sendPushToRestaurant: jamás tira error ni bloquea — sin Firebase o sin
 * aparatos registrados, simplemente no pasa nada.
 */
export async function sendPushToWalletPhone(phone: string, payload: { title: string; body: string }): Promise<void> {
  const messaging = getMessaging();
  if (!messaging) return;
  const cola = phone.replace(/\D/g, '').slice(-10);
  if (!cola) return;
  const tokens = await prisma.walletDeviceToken.findMany({ where: { phone: cola }, select: { token: true } });
  if (tokens.length === 0) return;
  const list = tokens.map((t) => t.token);
  try {
    const res = await messaging.sendEachForMulticast({ tokens: list, notification: payload, android: { priority: 'high' } });
    const dead = res.responses
      .map((r, i) => (!r.success && isDeadToken(r.error?.code) ? list[i] : null))
      .filter((t): t is string => t !== null);
    if (dead.length > 0) await prisma.walletDeviceToken.deleteMany({ where: { token: { in: dead } } });
  } catch {
    // El recordatorio es un extra: si FCM falla, el portal sigue mostrando la cuota igual.
  }
}

export async function pushLowStockCrossings(restaurantId: string): Promise<void> {
  if (!getMessaging()) return;

  const items = await prisma.inventoryItem.findMany({
    where: { restaurantId },
    select: { id: true, name: true, quantity: true, minQuantity: true },
  });

  const already = notifiedLowStock.get(restaurantId) ?? new Set<string>();
  const fresh: { name: string; out: boolean }[] = [];

  for (const item of items) {
    const qty = Number(item.quantity);
    const min = Number(item.minQuantity);
    // Mismo criterio que la pantalla de Inventario: agotado manda sobre "por agotarse".
    const isLow = qty <= 0 || qty < min;

    if (!isLow) {
      already.delete(item.id);
      continue;
    }
    if (already.has(item.id)) continue;
    already.add(item.id);
    fresh.push({ name: item.name, out: qty <= 0 });
  }

  notifiedLowStock.set(restaurantId, already);
  if (fresh.length === 0) return;

  const [first] = fresh;
  const title = fresh.length === 1 ? (first.out ? 'Insumo agotado' : 'Insumo por agotarse') : 'Insumos por agotarse';
  const body =
    fresh.length === 1
      ? `${first.name} ${first.out ? 'se agotó' : 'está por agotarse'}`
      : `${fresh.map((f) => f.name).slice(0, 3).join(', ')}${fresh.length > 3 ? ` y ${fresh.length - 3} más` : ''}`;

  await sendPushToRestaurant(restaurantId, { title, body });
}
