import { z } from 'zod';

/**
 * Alta en la lista de espera: gente que ya está en la puerta. A diferencia de una reserva, no
 * lleva día ni hora — lleva desde cuándo espera, que es lo que el salón necesita ver.
 */
export const createWaitlistEntrySchema = z.object({
  customerName: z.string().min(1, 'El nombre es obligatorio.').max(120),
  customerPhone: z.string().min(7).max(30).optional(),
  customerIdNumber: z.string().max(30).optional(),
  partySize: z.coerce.number().int().min(1).max(100),
  zoneId: z.string().min(1).optional(),
  note: z.string().max(300).optional(),
  // Lo que se le prometió al cliente ("como 20 minutos"), para contrastarlo con la espera real.
  quotedMinutes: z.coerce.number().int().min(0).max(600).optional(),
});

export const updateWaitlistEntrySchema = z.object({
  customerName: z.string().min(1).max(120).optional(),
  customerPhone: z.string().min(7).max(30).nullable().optional(),
  partySize: z.coerce.number().int().min(1).max(100).optional(),
  zoneId: z.string().min(1).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
  quotedMinutes: z.coerce.number().int().min(0).max(600).nullable().optional(),
});

/** "Sentar": se le abre la cuenta en la mesa indicada y sale de la lista. */
export const seatWaitlistEntrySchema = z.object({
  tableId: z.string().min(1),
  // La cuenta exige cédula; en la puerta rara vez se pide, así que puede venir acá o quedar en "S/C".
  customerIdNumber: z.string().max(30).optional(),
});

export type CreateWaitlistEntryInput = z.infer<typeof createWaitlistEntrySchema>;
export type UpdateWaitlistEntryInput = z.infer<typeof updateWaitlistEntrySchema>;
export type SeatWaitlistEntryInput = z.infer<typeof seatWaitlistEntrySchema>;
