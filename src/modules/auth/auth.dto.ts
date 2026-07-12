import { z } from 'zod';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // El email es único por restaurante, así que hace falta el slug para saber cuál.
  slug: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
