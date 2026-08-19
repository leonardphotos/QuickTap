import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { toDecimal } from '../../utils/money';
import { branchService } from '../branches/branch.service';
import { emitToKitchen, SocketEvents } from '../../sockets';
import { rootRestaurantId } from './inventory-scope';
import { CreateTransferInput } from './inventory-transfer.dto';

type LocationScope = 'LOCAL' | 'CASA_MATRIZ';

/** Restaurantid efectivo de una ubicación DENTRO del grupo cuya raíz ya se conoce (a
 * diferencia de inventory-scope.ts#resolveInventoryScope, que resuelve la sesión actual —
 * acá `locationRestaurantId` puede ser CUALQUIER sede del grupo, no solo la propia). */
function effectiveIdForLocation(rootId: string, sharedMode: boolean, locationRestaurantId: string, scope: LocationScope): string {
  if (scope === 'CASA_MATRIZ') return rootId;
  return sharedMode ? rootId : locationRestaurantId;
}

/**
 * Transferencias de insumos entre sedes de un mismo grupo (sede principal + sucursales),
 * o entre Casa Matriz y una sede. Cada movimiento queda registrado como snapshot en
 * InventoryTransfer (mismo criterio que Order congela productName: el historial no debe
 * cambiar si el insumo o la sede se renombran/borran después).
 */
export const inventoryTransferService = {
  /** Ubicaciones disponibles para el picker de Origen/Destino: sede principal + cada
   * sucursal (colapsadas en una sola fila "LOCAL" si el grupo tiene inventario compartido
   * — no tiene sentido transferir entre sedes que ya comparten la misma bolsa de stock),
   * más Casa Matriz si está activada. */
  async listLocations(restaurantId: string, parentRestaurantId: string | null | undefined) {
    const rootId = rootRestaurantId(restaurantId, parentRestaurantId);
    const [root, scope] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: rootId }, select: { name: true, inventoryMode: true, casaMatrizEnabled: true } }),
      branchService.resolveScope(rootId),
    ]);
    if (!root) throw notFound('Restaurante no encontrado.');

    const locations: { restaurantId: string; scope: LocationScope; name: string; isMain: boolean }[] = [];
    if (root.inventoryMode === 'SHARED') {
      locations.push({ restaurantId: rootId, scope: 'LOCAL', name: `${root.name} (inventario compartido)`, isMain: true });
    } else {
      for (const id of scope.ids) {
        locations.push({ restaurantId: id, scope: 'LOCAL', name: scope.names.get(id) ?? id, isMain: id === scope.mainId });
      }
    }
    if (root.casaMatrizEnabled) {
      locations.push({ restaurantId: rootId, scope: 'CASA_MATRIZ', name: 'Casa Matriz', isMain: false });
    }
    return locations;
  },

  /** Insumos disponibles en una ubicación puntual del grupo (para el select "Insumo" del
   * formulario, una vez elegido el Origen — que puede ser una sede distinta a la sesión
   * actual). */
  async listItemsForLocation(
    restaurantId: string,
    parentRestaurantId: string | null | undefined,
    targetRestaurantId: string,
    scope: LocationScope,
  ) {
    const rootId = rootRestaurantId(restaurantId, parentRestaurantId);
    const [root, groupIds] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: rootId }, select: { inventoryMode: true } }),
      branchService.resolveScope(rootId).then((s) => s.ids),
    ]);
    if (!root) throw notFound('Restaurante no encontrado.');

    const groupOk = scope === 'CASA_MATRIZ' ? targetRestaurantId === rootId : groupIds.includes(targetRestaurantId);
    if (!groupOk) throw badRequest('Esa ubicación no pertenece a este grupo de sedes.');

    const effectiveId = effectiveIdForLocation(rootId, root.inventoryMode === 'SHARED', targetRestaurantId, scope);
    return prisma.inventoryItem.findMany({
      where: { restaurantId: effectiveId, locationScope: scope },
      orderBy: { name: 'asc' },
    });
  },

  /** Historial de transferencias del grupo completo. */
  async listTransfers(restaurantId: string, parentRestaurantId: string | null | undefined) {
    const rootId = rootRestaurantId(restaurantId, parentRestaurantId);
    return prisma.inventoryTransfer.findMany({ where: { groupId: rootId }, orderBy: { createdAt: 'desc' }, take: 200 });
  },

  async transfer(
    restaurantId: string,
    parentRestaurantId: string | null | undefined,
    actorUserId: string | undefined,
    input: CreateTransferInput,
  ) {
    const rootId = rootRestaurantId(restaurantId, parentRestaurantId);
    const [root, { ids: groupIds, names: groupNames }] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: rootId }, select: { inventoryMode: true } }),
      branchService.resolveScope(rootId),
    ]);
    if (!root) throw notFound('Restaurante no encontrado.');
    const sharedMode = root.inventoryMode === 'SHARED';

    // Origen y destino deben pertenecer al mismo grupo que el actor — evita transferir
    // insumos de/hacia un restaurante ajeno.
    const fromGroupOk =
      input.fromScope === 'CASA_MATRIZ' ? input.fromRestaurantId === rootId : groupIds.includes(input.fromRestaurantId);
    const toGroupOk = input.toScope === 'CASA_MATRIZ' ? input.toRestaurantId === rootId : groupIds.includes(input.toRestaurantId);
    if (!fromGroupOk || !toGroupOk) throw badRequest('El origen o el destino no pertenecen a este grupo de sedes.');

    // El scope LOCAL puede resolver a un restaurantId distinto del pedido si el grupo tiene
    // inventario compartido (ver inventory-scope.ts).
    const fromEffectiveId = effectiveIdForLocation(rootId, sharedMode, input.fromRestaurantId, input.fromScope);
    const toEffectiveId = effectiveIdForLocation(rootId, sharedMode, input.toRestaurantId, input.toScope);

    const sourceItem = await prisma.inventoryItem.findFirst({
      where: { id: input.itemId, restaurantId: fromEffectiveId, locationScope: input.fromScope },
    });
    if (!sourceItem) throw notFound('El insumo de origen no existe.');

    const quantity = toDecimal(input.quantity);
    if (quantity.gt(sourceItem.quantity)) {
      throw badRequest('No tienes suficiente stock para transferir esa cantidad.');
    }

    const fromLocationName =
      input.fromScope === 'CASA_MATRIZ' ? 'Casa Matriz' : (groupNames.get(input.fromRestaurantId) ?? input.fromRestaurantId);
    const toLocationName =
      input.toScope === 'CASA_MATRIZ' ? 'Casa Matriz' : (groupNames.get(input.toRestaurantId) ?? input.toRestaurantId);

    const transfer = await prisma.$transaction(async (tx) => {
      await tx.inventoryItem.update({
        where: { id: sourceItem.id },
        data: { quantity: sourceItem.quantity.sub(quantity) },
      });

      // Busca un insumo con el mismo nombre + unidad en el destino; si no existe, lo crea.
      const destItem = await tx.inventoryItem.findFirst({
        where: {
          restaurantId: toEffectiveId,
          locationScope: input.toScope,
          unit: sourceItem.unit,
          name: { equals: sourceItem.name, mode: 'insensitive' },
        },
      });

      if (destItem) {
        await tx.inventoryItem.update({ where: { id: destItem.id }, data: { quantity: destItem.quantity.add(quantity) } });
      } else {
        // La categoría es de la sede ORIGEN: copiarla tal cual dejaba el insumo con un
        // categoryId que el destino no lista, y la pantalla de Insumos (que agrupa por las
        // categorías del propio restaurante) no lo mostraba en ninguna parte — parecía que la
        // transferencia no había llegado. Se busca/crea la misma categoría por nombre allá.
        let destCategoryId: string | null = null;
        if (sourceItem.categoryId && toEffectiveId !== sourceItem.restaurantId) {
          const sourceCategory = await tx.inventoryCategory.findUnique({ where: { id: sourceItem.categoryId } });
          if (sourceCategory) {
            const existing = await tx.inventoryCategory.findFirst({
              where: { restaurantId: toEffectiveId, name: { equals: sourceCategory.name, mode: 'insensitive' } },
            });
            destCategoryId =
              existing?.id ??
              (
                await tx.inventoryCategory.create({
                  data: { restaurantId: toEffectiveId, name: sourceCategory.name, priority: sourceCategory.priority },
                })
              ).id;
          }
        } else {
          destCategoryId = sourceItem.categoryId;
        }
        await tx.inventoryItem.create({
          data: {
            restaurantId: toEffectiveId,
            locationScope: input.toScope,
            name: sourceItem.name,
            unit: sourceItem.unit,
            categoryId: destCategoryId,
            pricePerUnitBase: sourceItem.pricePerUnitBase,
            quantity,
          },
        });
      }

      return tx.inventoryTransfer.create({
        data: {
          groupId: rootId,
          fromRestaurantId: input.fromRestaurantId,
          fromScope: input.fromScope,
          fromLocationName,
          toRestaurantId: input.toRestaurantId,
          toScope: input.toScope,
          toLocationName,
          itemName: sourceItem.name,
          unit: sourceItem.unit,
          quantity,
          createdByUserId: actorUserId,
        },
      });
    });

    emitToKitchen(fromEffectiveId, SocketEvents.INVENTORY_LOW_STOCK, {});
    if (toEffectiveId !== fromEffectiveId) emitToKitchen(toEffectiveId, SocketEvents.INVENTORY_LOW_STOCK, {});

    return transfer;
  },
};
