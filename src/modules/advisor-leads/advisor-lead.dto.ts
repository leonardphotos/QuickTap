import { z } from 'zod';

/**
 * Formulario público "Contactar a un asesor" (Plan Elite).
 *
 * Los cuatro campos son obligatorios porque son justo lo que el asesor necesita para llamar
 * con algo de contexto: a quién, a qué número, dónde queda y de qué negocio se trata.
 */
export const createAdvisorLeadSchema = z.object({
  contactName: z.string().trim().min(2, 'Escribe tu nombre.').max(120),
  // Sin regex de país: el formulario es público y una validación estricta rebota números
  // escritos con espacios, guiones o prefijo internacional, que es como los escribe la gente.
  // Solo se exige que haya suficientes dígitos para que sea un teléfono de verdad.
  phone: z
    .string()
    .trim()
    .min(7, 'Escribe un número de contacto válido.')
    .max(30)
    .refine((v) => (v.match(/\d/g) ?? []).length >= 7, 'Escribe un número de contacto válido.'),
  address: z.string().trim().min(4, 'Escribe la dirección del negocio.').max(300),
  businessName: z.string().trim().min(2, 'Escribe el nombre del negocio.').max(120),
});

export const advisorLeadQuerySchema = z.object({
  status: z.enum(['PENDING', 'CONTACTED', 'CLOSED', 'DISCARDED']).optional(),
});

export const updateAdvisorLeadSchema = z.object({
  status: z.enum(['PENDING', 'CONTACTED', 'CLOSED', 'DISCARDED']).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export type CreateAdvisorLeadInput = z.infer<typeof createAdvisorLeadSchema>;
export type UpdateAdvisorLeadInput = z.infer<typeof updateAdvisorLeadSchema>;
