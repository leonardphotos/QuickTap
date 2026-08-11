import { z } from 'zod';

const phone = z.string().trim().min(7).max(20);

export const bookingSettingsSchema = z.object({
  requirePhoneVerification: z.boolean().optional(),
  otpTtlMinutes: z.number().int().min(2).max(60).optional(),
  autoBlacklistEnabled: z.boolean().optional(),
  noShowStrikesToBlock: z.number().int().min(1).max(10).optional(),
  loyaltyEnabled: z.boolean().optional(),
  pointsPerBooking: z.number().int().min(0).max(10_000).optional(),
  pointsPerCurrencyUnit: z.number().min(0).max(1000).optional(),
  pointsPerRedeemUnit: z.number().int().min(1).max(100_000).optional(),
});
export type BookingSettingsInput = z.infer<typeof bookingSettingsSchema>;

export const sendCodeSchema = z.object({ phone });
export const verifyCodeSchema = z.object({ phone, code: z.string().trim().regex(/^\d{6}$/, 'El código son 6 dígitos.') });

/** Nombre y teléfono son obligatorios en toda reserva pública — es requisito del
 * club, no un detalle de formulario. */
export const publicBookingContactSchema = z.object({
  playerName: z.string().trim().min(2, 'Escribe tu nombre.').max(80),
  playerPhone: phone,
});

export const registerAccountSchema = z.object({
  phone,
  name: z.string().trim().min(2).max(80).optional(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'El usuario necesita al menos 3 caracteres.')
    .max(24)
    .regex(/^[a-z0-9._-]+$/, 'Solo letras, números, punto, guion y guion bajo.'),
  password: z.string().min(6, 'La clave necesita al menos 6 caracteres.').max(72),
});
export type RegisterAccountInput = z.infer<typeof registerAccountSchema>;

export const loginSchema = z.object({
  phone,
  username: z.string().trim().toLowerCase().min(3).max(24),
  password: z.string().min(1).max(72),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const blacklistAddSchema = z.object({
  phone,
  reason: z.string().trim().min(3, 'Escribe el motivo.').max(200),
});
export const blacklistLiftSchema = z.object({ reason: z.string().trim().max(200).optional() });

export const adjustPointsSchema = z.object({
  delta: z.number().int().refine((n) => n !== 0, 'El ajuste no puede ser 0.'),
  note: z.string().trim().min(3, 'El motivo es obligatorio.').max(200),
});

export const redeemSchema = z.object({ points: z.number().int().min(1).max(1_000_000) });

export const inviteSchema = z
  .object({
    toAccountId: z.string().cuid().nullish(),
    toPhone: phone.nullish(),
    toName: z.string().trim().max(80).nullish(),
    bookingId: z.string().cuid().nullish(),
    message: z.string().trim().max(200).nullish(),
  })
  .refine((v) => v.toAccountId || v.toPhone, { message: 'Indica a quién invitas.' });
export type InviteInput = z.infer<typeof inviteSchema>;

/** Cancelar una reserva: el motivo es obligatorio, es el punto del requisito. */
export const cancelBookingSchema = z.object({
  reason: z.string().trim().min(3, 'Indica el motivo de la cancelación.').max(200),
});
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone,
  idNumber: z.string().trim().max(20).nullish(),
  address: z.string().trim().max(200).nullish(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const listCustomersQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  blocked: z.enum(['true', 'false']).optional(),
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
