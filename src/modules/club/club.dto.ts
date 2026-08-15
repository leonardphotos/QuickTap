import { z } from 'zod';

/** Filtro de período para Administración → Punto de equilibrio. */
export const breakEvenQuerySchema = z.object({
  range: z.enum(['day', 'week', 'month', 'year', 'all']).optional().default('month'),
  // Fecha exacta ("YYYY-MM-DD"): si viene, ignora `range` y filtra ese día completo.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const YYYYMMDD = /^\d{4}-\d{2}-\d{2}$/;

const hhmm = z.string().regex(HHMM, 'La hora debe tener formato HH:mm.');
const dateStr = z.string().regex(YYYYMMDD, 'La fecha debe tener formato YYYY-MM-DD.');

export const createCourtSchema = z.object({
  name: z.string().min(1).max(60),
  sport: z.enum(['PADEL', 'TENIS', 'FUTBOL', 'BASQUET', 'OTRO']).optional().default('PADEL'),
  courtType: z.enum(['LIBRE', 'TECHADA', 'INDOOR']).optional().default('LIBRE'),
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

/**
 * Extra que el jugador pide tener listo al llegar (tienda del club o menú del
 * restaurante vinculado, ver clubTabletService.getCatalog). Se guarda como
 * snapshot y NO se cobra ni descuenta stock acá: es una nota para recepción,
 * que cobra junto con la cancha cuando el jugador llega.
 */
const requestedExtraSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(120),
  quantity: z.number().int().min(1).max(20),
});

/** Reserva creada desde el panel (recepción) o desde la página pública del jugador. */
export const createBookingSchema = z
  .object({
    courtId: z.string().cuid(),
    date: dateStr,
    startTime: hhmm,
    // Se manda explícita para que el servidor valide que el hueco pedido coincide
    // con una franja real, en vez de confiar en una duración implícita.
    durationMinutes: z.number().int().min(30).max(240),
    playerName: z.string().min(1).max(120),
    playerPhone: z.string().min(7).max(25),
    // Opcional en el esquema porque recepción no siempre la tiene; la página del
    // jugador la exige en su propio formulario.
    playerIdNumber: z.string().min(4).max(20).optional(),
    playerCount: z.number().int().min(1).max(8).optional().default(4),
    requestedExtras: z.array(requestedExtraSchema).max(20).optional(),
    // Nombres de los jugadores cuando reservan 6+ y confirmaron que van a jugar
    // un Americano/Mexicano: snapshot para prellenar el torneo en la tablet de
    // la cancha, ver club-tablet.service.ts getSession.
    tournamentPlayerNames: z.array(z.string().min(1).max(60)).min(6).max(8).optional(),
  })
  .refine((v) => !v.tournamentPlayerNames || v.tournamentPlayerNames.length <= v.playerCount, {
    message: 'La cantidad de nombres no puede superar la cantidad de jugadores.',
    path: ['tournamentPlayerNames'],
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

const paymentMethodSchema = z.enum(['MOBILE_PAYMENT', 'ZELLE', 'CASH', 'CASH_USD', 'CARD', 'BINANCE', 'PAYPAL', 'TRANSFER']);

// Métodos que dejan rastro verificable y exigen referencia o comprobante (Punto de venta = "ticket").
// Todos menos Efectivo Bs/$ — mismo criterio que order.dto.ts (METHODS_REQUIRING_PROOF_OR_REFERENCE).
const METHODS_REQUIRING_PROOF_OR_REFERENCE = ['MOBILE_PAYMENT', 'ZELLE', 'CARD', 'BINANCE', 'PAYPAL', 'TRANSFER'] as const;

// De esos, los que además pueden adjuntar foto. Punto de Venta no: su ticket impreso ya es el comprobante,
// así que para CARD el número sigue siendo la única forma de cumplir.
const METHODS_ALLOWING_PROOF = ['MOBILE_PAYMENT', 'ZELLE', 'BINANCE', 'PAYPAL', 'TRANSFER'] as const;

/** Botón "Caja" en Canchas: Pagar (mode=full) o Pago fraccionado (mode=split), mismo esquema. */
export const recordBookingPaymentSchema = z
  .object({
    amountBase: z.coerce.number().positive().max(1000000),
    method: paymentMethodSchema,
    referenceNumber: z.string().max(60).optional(),
    proofImageUrl: z.string().optional(),
    // A cuál cuenta bancaria entró el dinero, cuando el método tiene varias.
    bankAccountId: z.string().max(60).nullish(),
    // Código de promoción del CRM: aplica su descuento y registra el canje.
    promoCode: z.string().max(40).nullish(),
  })
  .superRefine((data, ctx) => {
    // Basta con uno de los dos: quien tiene la captura no siempre transcribe el número, y
    // quien anota el número no siempre guarda la captura. Exigir ambos trancaba la caja.
    if (!METHODS_REQUIRING_PROOF_OR_REFERENCE.includes(data.method as any)) return;
    if (data.referenceNumber?.trim() || data.proofImageUrl?.trim()) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: METHODS_ALLOWING_PROOF.includes(data.method as any)
        ? 'Escribe el número de referencia o adjunta el comprobante.'
        : 'Escribe el número de ticket.',
      path: ['referenceNumber'],
    });
  });

/** "Deuda" en Canchas: recepción marca que sabe que esto se debe, sin registrar cobro. */
export const setBookingAwaitingPaymentSchema = z.object({
  awaitingPayment: z.coerce.boolean().optional().default(true),
});

/** Verificación de un pago reportado desde la tablet: aprobar cobra de verdad, rechazar solo marca. */
export const reviewReportedPaymentSchema = z.object({
  status: z.enum(['CONFIRMED', 'REJECTED']),
});

export type CreateCourtInput = z.infer<typeof createCourtSchema>;
export type UpdateCourtInput = z.infer<typeof updateCourtSchema>;
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>;
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;
export type RecordBookingPaymentInput = z.infer<typeof recordBookingPaymentSchema>;
export type SetBookingAwaitingPaymentInput = z.infer<typeof setBookingAwaitingPaymentSchema>;
