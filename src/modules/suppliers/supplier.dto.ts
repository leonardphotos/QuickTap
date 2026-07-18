import { z } from 'zod';

export const createSupplierSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(120),
  phone: z.string().max(30).optional(),
  taxId: z.string().max(30).optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
