import { z } from 'zod';

export const createCustomerSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(120),
  phone: z.string().min(1, 'El teléfono es obligatorio.').max(30),
  idNumber: z.string().max(30).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  // --- Ficha CRM ---
  email: z.string().max(120).nullable().optional(),
  // Solo la fecha; el año puede ser el real o cualquiera (importa mes y día).
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.')
    .nullable()
    .optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

/** Segmentos del CRM: las "listas de clientes" con las que se arman las promos. */
export const CUSTOMER_SEGMENTS = ['ALL', 'FREQUENT', 'NEW', 'INACTIVE', 'BIRTHDAY'] as const;

export const customerQuerySchema = z.object({
  search: z.string().max(120).optional(),
  segment: z.enum(CUSTOMER_SEGMENTS).optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CustomerQuery = z.infer<typeof customerQuerySchema>;
export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number];
