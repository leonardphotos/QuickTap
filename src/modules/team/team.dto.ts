import { z } from 'zod';

// Roles asignables desde la UI de Equipo (OWNER/STAFF no se asignan aquí).
const assignableRoleSchema = z.enum(['ADMIN', 'CASHIER', 'WAITER', 'KITCHEN', 'SCREEN', 'COMANDA', 'NUMERO', 'CANCHA', 'COACH', 'VERIFICADOR']);

// Datos de cobro propios de un profesional (barbero/estilista) — mismo formato que
// Restaurant.paymentMethodsConfig, para que el POS los pinte con el mismo componente.
const paymentMethodsConfigSchema = z.record(z.string(), z.record(z.string(), z.unknown()));

export const createStaffSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(120),
  // Se normaliza a minúsculas: evita cuentas "duplicadas" por escribirlo distinto.
  email: z
    .string()
    .email()
    .transform((v) => v.trim().toLowerCase()),
  password: z.string().min(6).max(100),
  role: assignableRoleSchema,
  // Acceso a Inventario para Mesero/Cocina (los roles de acceso total ya lo tienen siempre).
  canAccessInventory: z.boolean().optional(),
  // Solo aplica a Cajero: por defecto tiene el mismo acceso que Mesero (más abrir/cerrar caja y
  // ver movimientos del día por método de pago) — esto le devuelve el acceso completo de antes.
  cashierFullAccess: z.boolean().optional(),
  // Local Comercial: presta servicios (barbero/estilista) y se le acreditan en el reporte.
  isServiceProvider: z.boolean().optional(),
  // % que se lleva de lo que factura. 100 = se lo lleva todo; 0/null = sin comisión.
  commissionPercent: z.coerce.number().min(0).max(100).nullable().optional(),
  paymentMethodsConfig: paymentMethodsConfigSchema.nullable().optional(),
  // Tablet de cancha (rol CANCHA): a qué cancha queda atornillada. El QR que se
  // escanee ahí tiene que ser de una reserva DE ESA cancha.
  clubCourtId: z.string().cuid().nullable().optional(),
});

export const updateStaffSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: assignableRoleSchema.optional(),
  isActive: z.boolean().optional(),
  canAccessInventory: z.boolean().optional(),
  cashierFullAccess: z.boolean().optional(),
  isServiceProvider: z.boolean().optional(),
  commissionPercent: z.coerce.number().min(0).max(100).nullable().optional(),
  paymentMethodsConfig: paymentMethodsConfigSchema.nullable().optional(),
  clubCourtId: z.string().cuid().nullable().optional(),
});

export const assignTablesSchema = z.object({
  tableIds: z.array(z.string().min(1)),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
export type AssignTablesInput = z.infer<typeof assignTablesSchema>;
