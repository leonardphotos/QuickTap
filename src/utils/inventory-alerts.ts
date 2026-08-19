import { emitToKitchen, SocketEvents } from '../sockets';
import { pushLowStockCrossings } from './push';

/**
 * Cambió el stock de un restaurante: refresca los avisos de agotamiento en las pantallas
 * abiertas (socket) y, si algún insumo ACABA de cruzar por debajo de su mínimo, manda el push
 * para que se entere quien no tenga la app abierta.
 *
 * Se usa en vez de emitir `INVENTORY_LOW_STOCK` a mano, para que ningún movimiento de stock
 * quede avisando solo por un lado.
 */
export function notifyStockChanged(restaurantId: string): void {
  emitToKitchen(restaurantId, SocketEvents.INVENTORY_LOW_STOCK, {});
  // Sin await: un push lento no puede demorar el pedido o el traslado que lo disparó.
  void pushLowStockCrossings(restaurantId);
}
