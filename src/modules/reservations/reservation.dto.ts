import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (usa YYYY-MM-DD).');
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (usa HH:mm).');

// Botón "Mesa" de la barra flotante del menú público: el cliente elige día,
// hora, cuántas personas y cuántas mesas, y deja sus datos de contacto.
export const createReservationSchema = z.object({
  date: dateString,
  time: timeString,
  partySize: z.coerce.number().int().min(1).max(100),
  tableIds: z.array(z.string().min(1)).min(1, 'Elige al menos una mesa.'),
  customerName: z.string().min(1, 'El nombre es obligatorio.').max(120),
  customerIdNumber: z.string().min(1, 'La cédula es obligatoria.').max(30),
  customerPhone: z.string().min(7, 'El teléfono es obligatorio.').max(30),
});

/**
 * "+ Nueva reserva" desde el panel: la toma el propio restaurante (por teléfono, en persona),
 * así que nace CONFIRMED — no tiene sentido que el staff se acepte una reserva a sí mismo.
 * La cédula es opcional acá: por teléfono rara vez se pide, y el menú público sí la exige.
 */
export const createStaffReservationSchema = createReservationSchema.extend({
  customerIdNumber: z.string().max(30).optional(),
  note: z.string().max(300).optional(),
});

/** Reprogramar o corregir una reserva ya cargada. Todo opcional: se manda solo lo que cambió. */
export const updateReservationSchema = z.object({
  date: dateString.optional(),
  time: timeString.optional(),
  partySize: z.coerce.number().int().min(1).max(100).optional(),
  tableIds: z.array(z.string().min(1)).min(1).optional(),
  customerName: z.string().min(1).max(120).optional(),
  customerIdNumber: z.string().max(30).optional(),
  customerPhone: z.string().min(7).max(30).optional(),
  note: z.string().max(300).nullable().optional(),
});

/**
 * "Sentar": el grupo llegó y se le abre la cuenta en la mesa indicada. `tableId` puede no ser
 * ninguna de las mesas reservadas — el salón mueve gente todo el tiempo.
 */
export const seatReservationSchema = z.object({
  tableId: z.string().min(1),
});

/** Consulta de la barra lateral de Sala: las reservas de UN día concreto. */
export const listReservationsQuerySchema = z.object({
  date: dateString.optional(),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;
export type CreateStaffReservationInput = z.infer<typeof createStaffReservationSchema>;
export type UpdateReservationInput = z.infer<typeof updateReservationSchema>;
export type SeatReservationInput = z.infer<typeof seatReservationSchema>;
export type ListReservationsQuery = z.infer<typeof listReservationsQuerySchema>;
