import { z } from 'zod';

export const createSupplierSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(120),
  // nullable además de optional: el formulario manda null para LIMPIAR el campo al editar
  // (omitirlo significa "no tocar", igual que en updateMovementSchema).
  phone: z.string().max(30).nullable().optional(),
  taxId: z.string().max(30).nullable().optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

/** Calificación de un proveedor: 4 criterios de 1 a 5 y comentario opcional. */
const score = z.coerce.number().int().min(1, 'Elige de 1 a 5 estrellas.').max(5);
export const rateSupplierSchema = z.object({
  quality: score,
  price: score,
  punctuality: score,
  service: score,
  comment: z.string().max(500).nullable().optional(),
});
export type RateSupplierInput = z.infer<typeof rateSupplierSchema>;
