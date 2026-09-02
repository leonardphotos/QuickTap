import { z } from 'zod';

export const createCustomerSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(120),
  phone: z.string().min(1, 'El teléfono es obligatorio.').max(30),
  // RIF / cédula: obligatorio al crear (es el dato que pide el Libro de ventas y la factura);
  // en la edición sigue siendo parcial para no bloquear fichas viejas sin RIF.
  idNumber: z.string({ required_error: 'El RIF o cédula es obligatorio.' }).trim().min(1, 'El RIF o cédula es obligatorio.').max(30),
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
  /// Marcar a alguien como socio es autorizarle consumo gratis, así que el controlador
  /// exige rol de dueño/administrador antes de dejar pasar este campo.
  isPartner: z.boolean().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  idNumber: z.string().trim().max(30).nullable().optional(),
});

/** Segmentos del CRM: las "listas de clientes" con las que se arman las promos. */
export const CUSTOMER_SEGMENTS = ['ALL', 'FREQUENT', 'NEW', 'INACTIVE', 'BIRTHDAY'] as const;

export const customerQuerySchema = z.object({
  search: z.string().max(120).optional(),
  segment: z.enum(CUSTOMER_SEGMENTS).optional(),
  // Los socios viven en su propia pestaña: 'only' la alimenta, 'exclude' los saca de la
  // lista de clientes para que no aparezcan mezclados con la clientela normal.
  partner: z.enum(['only', 'exclude']).optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CustomerQuery = z.infer<typeof customerQuerySchema>;
export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number];
