import { z } from 'zod';

// Roles asignables desde la UI de Equipo (OWNER/STAFF no se asignan aquí).
const assignableRoleSchema = z.enum(['ADMIN', 'CASHIER', 'WAITER', 'KITCHEN', 'SCREEN']);

export const createStaffSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(120),
  // Se normaliza a minúsculas: evita cuentas "duplicadas" por escribirlo distinto.
  email: z
    .string()
    .email()
    .transform((v) => v.trim().toLowerCase()),
  password: z.string().min(6).max(100),
  role: assignableRoleSchema,
});

export const updateStaffSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: assignableRoleSchema.optional(),
  isActive: z.boolean().optional(),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
