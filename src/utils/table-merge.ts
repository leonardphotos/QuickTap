import { prisma } from '../config/prisma';

/**
 * Mesas unidas: quién lleva la cuenta.
 *
 * Cuando el salón junta dos o tres mesas para un grupo grande, una de ellas queda como
 * PRINCIPAL y las demás apuntan a ella con `Table.mergedIntoTableId`. La principal es la única
 * que puede tener `TableSession` abierta, así que todo el grupo consume y paga una sola cuenta
 * sin que el modelo de pedidos, cobros o impresión se entere de que hay una unión.
 *
 * El precio de ese diseño es que cualquier código que resuelva "en qué mesa estoy" —el QR que
 * escanea el comensal, el pedido que carga un mesero, la campanita de "llamar al mesero"— tiene
 * que preguntar primero si esa mesa está unida a otra. Eso es lo que hacen estas funciones.
 *
 * La unión es de UN SOLO NIVEL (una miembro nunca es principal de otra), regla que valida
 * `tableService.merge`, así que una sola indirección siempre alcanza.
 */

/** Devuelve el id de la mesa que lleva la cuenta: la principal si `table` está unida a otra,
 * o su propio id si está suelta. */
export function primaryTableIdOf(table: { id: string; mergedIntoTableId: string | null }): string {
  return table.mergedIntoTableId ?? table.id;
}

/**
 * Deshace la unión de las mesas que colgaban de `primaryTableId` y las devuelve a la posición
 * que tenían en el plano antes de juntarse.
 *
 * @returns cuántas mesas se separaron (0 si no había ninguna).
 */
export async function unmergeGroup(restaurantId: string, primaryTableId: string): Promise<number> {
  const members = await prisma.table.findMany({
    where: { restaurantId, mergedIntoTableId: primaryTableId },
    select: { id: true, preMergePlanX: true, preMergePlanY: true, planX: true, planY: true },
  });
  if (members.length === 0) return 0;

  await prisma.$transaction(
    members.map((m) =>
      prisma.table.update({
        where: { id: m.id },
        data: {
          mergedIntoTableId: null,
          mergedAt: null,
          // Si se unieron sin mover nada (unión solo visual), preMergePlan* viene vacío y la
          // mesa se queda donde está en vez de saltar al centro.
          planX: m.preMergePlanX ?? m.planX,
          planY: m.preMergePlanY ?? m.planY,
          preMergePlanX: null,
          preMergePlanY: null,
        },
      }),
    ),
  );
  return members.length;
}

/**
 * Separa el grupo solo si ya no le queda ninguna cuenta abierta a la mesa principal. Se llama al
 * cerrar una cuenta: mientras quede otra cuenta viva en la misma mesa, el grupo sigue junto.
 */
export async function unmergeIfGroupFreed(restaurantId: string, primaryTableId: string): Promise<number> {
  const stillOpen = await prisma.tableSession.count({
    where: { restaurantId, tableId: primaryTableId, status: 'OPEN' },
  });
  if (stillOpen > 0) return 0;
  return unmergeGroup(restaurantId, primaryTableId);
}
