import { z } from 'zod';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const YYYYMMDD = /^\d{4}-\d{2}-\d{2}$/;

const hhmm = z.string().regex(HHMM, 'La hora debe tener formato HH:mm.');
const dateStr = z.string().regex(YYYYMMDD, 'La fecha debe tener formato YYYY-MM-DD.');

export const createCourtSchema = z.object({
  name: z.string().min(1).max(60),
  sport: z.enum(['PADEL', 'TENIS', 'FUTBOL', 'BASQUET', 'OTRO']).optional().default('PADEL'),
  indoor: z.boolean().optional().default(false),
  sortOrder: z.number().int().min(0).max(999).optional(),
});
export const updateCourtSchema = createCourtSchema.partial().extend({
  active: z.boolean().optional(),
});

/**
 * Franja horaria con precio. La "hora pico" no es un modo aparte: es otra franja
 * del mismo día con `isPeak` y otro precio. `courtId` null = todas las canchas.
 */
export const createScheduleSchema = z
  .object({
    courtId: z.string().cuid().nullable().optional(),
    weekday: z.number().int().min(0).max(6),
    startTime: hhmm,
    endTime: hhmm,
    slotMinutes: z.number().int().min(30).max(240).optional().default(90),
    priceBase: z.number().nonnegative(),
    isPeak: z.boolean().optional().default(false),
  })
  .refine((v) => v.startTime < v.endTime, {
    message: 'La hora de cierre debe ser posterior a la de apertura.',
    path: ['endTime'],
  });

export const updateScheduleSchema = z.object({
  priceBase: z.number().nonnegative().optional(),
  isPeak: z.boolean().optional(),
  active: z.boolean().optional(),
  slotMinutes: z.number().int().min(30).max(240).optional(),
});

/** Disponibilidad de un día: qué franjas quedan libres por cancha. */
export const availabilityQuerySchema = z.object({
  date: dateStr,
  courtId: z.string().cuid().optional(),
});

/** Reserva creada desde el panel (recepción) o desde la página pública del jugador. */
export const createBookingSchema = z.object({
  courtId: z.string().cuid(),
  date: dateStr,
  startTime: hhmm,
  // Se manda explícita para que el servidor valide que el hueco pedido coincide
  // con una franja real, en vez de confiar en una duración implícita.
  durationMinutes: z.number().int().min(30).max(240),
  playerName: z.string().min(1).max(120),
  playerPhone: z.string().min(7).max(25),
  playerCount: z.number().int().min(1).max(8).optional().default(4),
});

/** Bloqueo técnico: limpieza de cristales, lluvia, cambio de red. */
export const createMaintenanceSchema = z.object({
  courtId: z.string().cuid(),
  date: dateStr,
  startTime: hhmm,
  endTime: hhmm,
  note: z.string().min(1).max(200),
});

export const listBookingsQuerySchema = z.object({
  date: dateStr.optional(),
  status: z.enum(['PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
});

export const calendarQuerySchema = z.object({
  date: dateStr,
});

export type CreateCourtInput = z.infer<typeof createCourtSchema>;
export type UpdateCourtInput = z.infer<typeof updateCourtSchema>;
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>;
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;
