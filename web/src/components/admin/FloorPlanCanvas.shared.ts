import { api } from '@/api/client';
import type { FloorPlanTable } from '@/types';


/**
 * Planimetría del salón: dibuja las mesas de una zona donde de verdad están en el local.
 *
 * Las posiciones se guardan en PORCENTAJE del lienzo (0-100), no en píxeles: el mismo plano
 * se ve igual en el celular del mesero y en el monitor de caja. En modo edición las mesas se
 * arrastran, cambian de forma (redonda/cuadrada) y de tamaño; en modo normal se comportan
 * como los botones de siempre — un toque abre la mesa.
 *
 * Es un componente CONTROLADO: los cambios sin guardar viven en la pantalla que lo usa, no acá.
 * Así no se pierden al desmontar el lienzo (ej. al cambiar de pestaña de zona) mientras el botón
 * "Guardar plano" sigue marcado como sucio.
 */

export interface FloorPlanPatch {
  id: string;
  planX: number | null;
  planY: number | null;
  planShape?: 'ROUND' | 'SQUARE' | 'RECTANGLE';
  planSize?: number;
  seats?: number;
}


/** Estado de una mesa, en abstracto. El color concreto lo pone quien la dibuja (claro/oscuro). */
export type TableToneKey = 'call' | 'multi' | 'occupied' | 'reserved' | 'vacant';


/** Estado de la mesa — mismo criterio que la vista de lista. */
export function tableToneKey(t: FloorPlanTable): TableToneKey {
  if (t.serviceRequest) return 'call';
  if (t.sessions.length > 1) return 'multi';
  if (t.sessions.length === 1) return 'occupied';
  if (t.reserved) return 'reserved';
  return 'vacant';
}


export function tableToneLabel(t: FloorPlanTable): string {
  switch (tableToneKey(t)) {
    case 'call':
      return 'Cuenta';
    case 'multi':
      return `${t.sessions.length} cuentas`;
    case 'occupied':
      return 'Ocupada';
    case 'reserved':
      return 'Reservada';
    default:
      return 'Libre';
  }
}


/** Guarda en el backend los cambios de plano acumulados de todas las zonas. */
export async function saveFloorPlan(patches: FloorPlanPatch[]) {
  if (patches.length === 0) return;
  await api.patch('/tables/floor-plan', { tables: patches });
}
