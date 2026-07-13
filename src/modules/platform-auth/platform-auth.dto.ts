import { z } from 'zod';

export const platformLoginSchema = z.object({
  email: z.string().email('Correo inválido.'),
  password: z.string().min(1, 'Falta la contraseña.'),
});

export type PlatformLoginInput = z.infer<typeof platformLoginSchema>;
