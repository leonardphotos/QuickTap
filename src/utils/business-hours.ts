import { prisma } from '../config/prisma';
import { badRequest } from './http-error';
import { nowPartsCaracas } from './timezone';

interface OpenStatus {
  open: boolean;
  reason?: string;
}

/**
 * Estado actual del horario configurado (Ajustes → Horario), sin lanzar
 * error. Si el restaurante no tiene fila para el día de hoy, se considera
 * siempre abierto (retrocompatible con restaurantes que nunca configuraron
 * horario). No maneja horarios que cruzan la medianoche (ej. abre 18:00,
 * cierra 02:00) — closeTime siempre se asume del mismo día.
 */
export async function getRestaurantOpenStatus(restaurantId: string): Promise<OpenStatus> {
  const { dayOfWeek, hhmm } = nowPartsCaracas();
  const schedule = await prisma.restaurantSchedule.findUnique({
    where: { restaurantId_dayOfWeek: { restaurantId, dayOfWeek } },
  });
  if (!schedule) return { open: true };
  if (schedule.isClosed) return { open: false, reason: 'El restaurante está cerrado hoy.' };
  if (schedule.openTime && hhmm < schedule.openTime) {
    return { open: false, reason: `El restaurante todavía no abre. Abre a las ${schedule.openTime}.` };
  }
  if (schedule.closeTime && hhmm >= schedule.closeTime) {
    return { open: false, reason: `El restaurante ya cerró. Cierra a las ${schedule.closeTime}.` };
  }
  return { open: true };
}

/** Lanza un error si el restaurante está fuera de su horario configurado. */
export async function assertRestaurantOpen(restaurantId: string): Promise<void> {
  const status = await getRestaurantOpenStatus(restaurantId);
  if (!status.open) throw badRequest(status.reason ?? 'El restaurante está cerrado.');
}
