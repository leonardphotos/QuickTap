import { z } from 'zod';

export const createPlatformAdminSchema = z.object({
  name: z.string().min(1, 'Falta el nombre.').max(120),
  email: z.string().email('Correo inválido.'),
  password: z.string().min(8, 'Mínimo 8 caracteres.'),
  role: z.enum(['ADMIN', 'MANAGER']).default('MANAGER'),
});

export type CreatePlatformAdminInput = z.infer<typeof createPlatformAdminSchema>;

export const updatePlatformAdminSchema = z.object({
  name: z.string().min(1, 'Falta el nombre.').max(120).optional(),
  email: z.string().email('Correo inválido.').optional(),
  // Vacío/ausente = no cambiar la contraseña actual.
  password: z.union([z.string().min(8, 'Mínimo 8 caracteres.'), z.literal('')]).optional(),
  role: z.enum(['ADMIN', 'MANAGER']).optional(),
});

export type UpdatePlatformAdminInput = z.infer<typeof updatePlatformAdminSchema>;
