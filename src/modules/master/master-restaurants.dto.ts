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
