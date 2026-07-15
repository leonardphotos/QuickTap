import { z } from 'zod';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// El correo se guarda y se compara sin importar mayúsculas/minúsculas ni
// espacios alrededor (evita cuentas "duplicadas" por escribirlo distinto).
const emailSchema = z
  .string()
  .email()
  .transform((v) => v.trim().toLowerCase());

export const registerSchema = z.object({
  restaurantName: z.string().min(1).max(120),
  slug: z
    .string()
    .min(3)
    .max(60)
    .regex(slugRegex, 'El slug solo puede tener minúsculas, números y guiones.'),
  whatsappPhone: z.string().min(7).max(30).optional(),
  // Moneda en la que el restaurante colocará sus precios ($ o €).
  baseCurrency: z.enum(['USD', 'EUR']).optional().default('USD'),
  ownerName: z.string().min(1).max(120),
  email: emailSchema,
  password: z.string().min(6).max(100),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  // El email es único por restaurante, no globalmente. Si el navegador ya
  // conoce el slug (login previo) se manda para resolver directo; si no
  // (dispositivo nuevo, storage borrado, miembro de equipo agregado desde
  // otro lugar), el backend busca por email entre todos los restaurantes.
  slug: z.string().min(1).optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: z
    .string()
    .length(6, 'El código debe tener 6 dígitos.')
    .regex(/^\d+$/, 'El código solo puede tener números.'),
  newPassword: z.string().min(6).max(100),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
