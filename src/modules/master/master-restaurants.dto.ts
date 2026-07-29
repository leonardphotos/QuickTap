import { z } from 'zod';

export const setSuspendedSchema = z.object({
  suspended: z.boolean(),
});

export type SetSuspendedInput = z.infer<typeof setSuspendedSchema>;

export const extendDaysSchema = z.object({
  days: z.coerce.number().int().min(-3650).max(3650),
});

export type ExtendDaysInput = z.infer<typeof extendDaysSchema>;

export const setPeriodEndSchema = z.object({
  // Llega como "YYYY-MM-DD" desde un <input type="date">.
  periodEnd: z.coerce.date(),
});

export type SetPeriodEndInput = z.infer<typeof setPeriodEndSchema>;

export const setIvaEnabledSchema = z.object({
  ivaEnabled: z.boolean(),
});

export type SetIvaEnabledInput = z.infer<typeof setIvaEnabledSchema>;

export const updateRestaurantUserSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(120).optional(),
  email: z
    .string()
    .email('Correo inválido.')
    .transform((v) => v.trim().toLowerCase())
    .optional(),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.').max(100).optional(),
});

export type UpdateRestaurantUserInput = z.infer<typeof updateRestaurantUserSchema>;

/** Crea la primera sucursal de un restaurante desde el Dashboard maestro, sin pasar por el
 * autoservicio del propio restaurante — ver master-restaurants.service.ts#createBranch. Si el
 * restaurante todavía no está en un plan que permita sucursales, lo activa automáticamente en
 * el plan elegido antes de crear la sucursal. */
export const createBranchForRestaurantSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(120),
  whatsappPhone: z.string().min(7).max(30).optional(),
  baseCurrency: z.enum(['USD', 'EUR']).optional().default('USD'),
  copyCatalog: z.boolean().default(false),
  plan: z.enum(['SUCURSALES', 'DELIVERY_SUCURSALES']).default('SUCURSALES'),
  billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL']).default('MONTHLY'),
});

export type CreateBranchForRestaurantInput = z.infer<typeof createBranchForRestaurantSchema>;

/** Precio mensual acordado manualmente por el equipo QuickTap (referencia interna, no
 * vinculado a los reportes automáticos de ingresos) — ver Restaurant.customMonthlyPriceUsd. */
export const setCustomMonthlyPriceSchema = z.object({
  customMonthlyPriceUsd: z.coerce.number().positive().max(100000).nullable(),
});

export type SetCustomMonthlyPriceInput = z.infer<typeof setCustomMonthlyPriceSchema>;
