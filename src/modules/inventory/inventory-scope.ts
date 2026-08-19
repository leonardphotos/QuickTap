import { prisma } from '../../config/prisma';

/**
 * Resuelve a qué `restaurantId` le pega de verdad una operación de inventario "LOCAL"
 * (insumos normales, nunca Casa Matriz — esa siempre vive en la raíz del grupo, ver
 * inventory-transfer.service.ts). En modo "PER_BRANCH" (de siempre) cada sede sigue
 * usando su propio restaurantId; en modo "SHARED" todas las sedes del grupo (sede
 * principal + sucursales) leen y escriben las mismas filas de InventoryItem, resueltas
 * a la raíz del grupo. `parentRestaurantId` viaja directo en el JWT de una sesión de
 * sucursal (ver auth.middleware.ts AuthPayload), así que no hace falta una consulta
 * extra para saber si el restaurantId actual es o no la raíz.
 */
export async function resolveInventoryScope(restaurantId: string, parentRestaurantId?: string | null): Promise<string> {
  const rootId = parentRestaurantId ?? restaurantId;
  const root = await prisma.restaurant.findUnique({ where: { id: rootId }, select: { inventoryMode: true } });
  return root?.inventoryMode === 'SHARED' ? rootId : restaurantId;
}

/** Id de la sede principal del grupo (self si esta sesión ya es la principal). */
export function rootRestaurantId(restaurantId: string, parentRestaurantId?: string | null): string {
  return parentRestaurantId ?? restaurantId;
}

/**
 * Resuelve el restaurantId "efectivo" contra el que de verdad hay que leer/escribir
 * InventoryItem, según el scope pedido. "CASA_MATRIZ" siempre vive en la raíz del grupo
 * (sin importar el modo compartido/por sede — Casa Matriz no se comparte "más", ya es
 * una sola bolsa central por definición). "LOCAL" pasa por resolveInventoryScope.
 */
export async function effectiveInventoryRestaurantId(
  restaurantId: string,
  parentRestaurantId: string | null | undefined,
  locationScope: 'LOCAL' | 'CASA_MATRIZ',
): Promise<string> {
  if (locationScope === 'CASA_MATRIZ') return rootRestaurantId(restaurantId, parentRestaurantId);
  return resolveInventoryScope(restaurantId, parentRestaurantId);
}

/**
 * Igual que `resolveInventoryScope` pero resolviendo el padre contra la base, para el código
 * que no viene de una petición y por tanto no tiene el JWT a mano (el descuento de stock al
 * marcar SERVED un pedido, por ejemplo). Sin esto, en modo compartido una sucursal buscaba el
 * insumo con su propio restaurantId, no lo encontraba y NO descontaba — pero al cancelar sí lo
 * devolvía (esa consulta va por id), así que el stock se inflaba solo.
 */
export async function resolveInventoryScopeById(restaurantId: string): Promise<string> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { parentRestaurantId: true },
  });
  return resolveInventoryScope(restaurantId, restaurant?.parentRestaurantId);
}
