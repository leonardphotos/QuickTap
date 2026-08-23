import { z } from 'zod';

export const createCompanySchema = z.object({
  name: z.string().min(1, 'La empresa necesita un nombre.').max(160),
  taxId: z.string().max(40).optional(),
  address: z.string().max(240).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email('Correo inválido.').optional(),
  currency: z.enum(['USD', 'EUR']).optional(),
  // No todas las empresas cierran en diciembre.
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12).optional(),
});
export const updateCompanySchema = createCompanySchema.partial().extend({ active: z.boolean().optional() });

export const createAccountSchema = z.object({
  code: z.string().min(1, 'La cuenta necesita un código.').max(20),
  name: z.string().min(1, 'La cuenta necesita un nombre.').max(120),
  kind: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']),
  parentId: z.string().min(1).nullable().optional(),
  // Las cuentas de agrupación totalizan a sus hijas y no reciben asientos.
  postable: z.boolean().optional(),
});

export const createContactSchema = z.object({
  name: z.string().min(1, 'El contacto necesita un nombre.').max(160),
  taxId: z.string().max(40).optional(),
  email: z.string().email('Correo inválido.').optional(),
  phone: z.string().max(40).optional(),
  address: z.string().max(240).optional(),
  // Uno puede ser varias cosas a la vez: hay proveedores que también compran.
  isCustomer: z.boolean().optional(),
  isSupplier: z.boolean().optional(),
  isEmployee: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
});

const lineaSchema = z.object({
  accountId: z.string().min(1, 'Elige la cuenta.'),
  debit: z.coerce.number().min(0).optional(),
  credit: z.coerce.number().min(0).optional(),
  detail: z.string().max(240).optional(),
  contactId: z.string().min(1).nullable().optional(),
});

export const createEntrySchema = z.object({
  date: z.string().min(1, 'Elige la fecha.'),
  description: z.string().min(1, 'Describe el asiento.').max(240),
  reference: z.string().max(80).optional(),
  source: z.string().max(20).optional(),
  // El cuadre (debe = haber) se valida en el service, que es donde se conocen los montos ya
  // convertidos a Decimal — hacerlo acá con números de coma flotante daría falsos descuadres.
  lines: z.array(lineaSchema).min(2, 'Un asiento necesita al menos dos líneas.'),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type CreateEntryInput = z.infer<typeof createEntrySchema>;
