import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

/** Captura solo solicitudes imprimibles, no cada actualización del pedido. */
export function printableEvent(event: string, payload: any) {
  if (!payload?.items || !payload.orderId) return null;
  if (event === 'print:request' && ['comanda', 'comanda-adicion', 'recibo'].includes(payload.type)) return { kind: payload.type, automatic: false };
  if (event === 'order:new' && !['PENDING', 'NEEDS_CONFIRMATION', 'NEEDS_PAYMENT', 'CANCELLED'].includes(payload.status)) return { kind: 'comanda', automatic: true };
  if (event === 'order:updated' && payload.printOnAccept === true && payload.status === 'KITCHEN') return { kind: 'comanda', automatic: true };
  return null;
}
export async function recordPrintJob(restaurantId: string, event: string, payload: any) {
  const info = printableEvent(event, payload);
  if (!info) return null;
  if (payload._kitchenOnly) info.kind = 'comanda-adicion';
  const autoId = `auto:${restaurantId}:${payload.orderId}${payload._kitchenOnly ? ":kitchen" : ""}`;
  const data = { restaurantId, orderId: payload.orderId, orderNumber: payload.orderNumber, ...info, payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue };
  if (info.automatic) return prisma.restaurantPrintJob.upsert({ where: { id: autoId }, create: { id: autoId, ...data }, update: {} });
  return prisma.restaurantPrintJob.create({ data });
}
