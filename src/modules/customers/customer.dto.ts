import { z } from 'zod';

export const createCustomerSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(120),
  phone: z.string().min(1, 'El teléfono es obligatorio.').max(30),
  idNumber: z.string().max(30).optional(),
  address: z.string().max(300).optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const customerQuerySchema = z.object({
  search: z.string().max(120).optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CustomerQuery = z.infer<typeof customerQuerySchema>;
