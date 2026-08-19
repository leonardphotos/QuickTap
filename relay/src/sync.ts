import { relayDb } from './db.js';

/**
 * Sube a la nube lo que se creó durante un corte.
 *
 * Se llama cuando vuelve el internet. Manda las cuentas y pedidos que todavía tienen
 * `syncedToCloud = false`, y solo los marca como subidos cuando la nube confirma — si la
 * conexión se corta a mitad, en el próximo intento se reenvían los mismos y la nube los
 * reconoce por su id sin duplicarlos.
 *
 * **Fusión en caliente**: no hace falta cerrar las mesas antes de sincronizar. Una cuenta que
 * sigue abierta se sube igual y queda abierta también en la nube; los pedidos que se sigan
 * agregando después viajan en la siguiente tanda.
 */

/** Tamaño de tanda: un corte largo se sube de a poco, no en una petición gigante. */
const BATCH = 50;

export interface SyncResult {
  sent: number;
  ordersCreated: number;
  ordersSkipped: number;
  served: number;
  assigned: { id: string; offlineTicketRef: string; orderNumber: number }[];
}

export async function syncPendingToCloud(cloudUrl: string, token: string): Promise<SyncResult> {
  const db = relayDb();

  const pending = await db.order.findMany({
    where: { syncedToCloud: false },
    orderBy: { createdAt: 'asc' },
    take: BATCH,
    include: { items: { include: { modifiers: true } } },
  });

  if (pending.length === 0) {
    return { sent: 0, ordersCreated: 0, ordersSkipped: 0, served: 0, assigned: [] };
  }

  // Las cuentas que esos pedidos referencian y que todavía no subieron.
  const sessionIds = [...new Set(pending.map((o) => o.tableSessionId).filter((id): id is string => !!id))];
  const sessions = await db.tableSession.findMany({
    where: { id: { in: sessionIds }, syncedToCloud: false },
  });

  const body = {
    sessions: sessions.map((s) => ({
      id: s.id,
      tableId: s.tableId,
      customerName: s.customerName,
      customerIdNumber: s.customerIdNumber,
      customerPhone: s.customerPhone,
      label: s.label,
      status: s.status,
      openedAt: s.openedAt.toISOString(),
      closedAt: s.closedAt?.toISOString() ?? null,
    })),
    orders: pending.map((o) => ({
      id: o.id,
      offlineTicketRef: o.offlineTicketRef,
      // La nube solo admite estos dos: el resto del ciclo no existe offline.
      status: o.status === 'SERVED' ? ('SERVED' as const) : ('KITCHEN' as const),
      tableId: o.tableId,
      tableSessionId: o.tableSessionId,
      currency: o.currency,
      subtotalBase: o.subtotalBase.toString(),
      serviceChargeBase: o.serviceChargeBase.toString(),
      ivaBase: o.ivaBase.toString(),
      totalBase: o.totalBase.toString(),
      exchangeRate: o.exchangeRate.toString(),
      totalBs: o.totalBs.toString(),
      tipBase: o.tipBase.toString(),
      customerName: o.customerName,
      customerIdNumber: o.customerIdNumber,
      customerPhone: o.customerPhone,
      placedByUserId: o.placedByUserId,
      createdAt: o.createdAt.toISOString(),
      items: o.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        variantName: i.variantName,
        unitPrice: i.unitPrice.toString(),
        quantity: i.quantity,
        lineTotal: i.lineTotal.toString(),
        note: i.note,
        kitchenName: i.kitchenName,
        modifiers: i.modifiers.map((m) => ({
          id: m.id,
          modifierId: m.modifierId,
          name: m.name,
          priceBase: m.priceBase.toString(),
          quantity: m.quantity,
        })),
      })),
    })),
  };

  const res = await fetch(`${cloudUrl}/api/v1/offline/sync-orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`La nube rechazó la sincronización (${res.status}): ${detail.slice(0, 200)}`);
  }

  const { data } = (await res.json()) as { data: Omit<SyncResult, 'sent'> };

  // Recién ahora se marcan como subidos: si algo falló arriba, se reintentan tal cual.
  await db.$transaction([
    db.tableSession.updateMany({
      where: { id: { in: sessions.map((s) => s.id) } },
      data: { syncedToCloud: true },
    }),
    db.order.updateMany({
      where: { id: { in: pending.map((o) => o.id) } },
      data: { syncedToCloud: true },
    }),
  ]);

  return { sent: pending.length, ...data };
}

/** Cuántos pedidos quedan por subir — para mostrarlo en pantalla. */
export async function pendingCount(): Promise<number> {
  return relayDb().order.count({ where: { syncedToCloud: false } });
}
