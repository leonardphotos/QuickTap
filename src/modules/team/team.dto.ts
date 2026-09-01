import { z } from 'zod';

// Roles asignables desde la UI de Equipo (OWNER/STAFF no se asignan aquí).
const assignableRoleSchema = z.enum(['ADMIN', 'CASHIER', 'WAITER', 'WAITER_TABLET', 'KITCHEN', 'SCREEN', 'COMANDA', 'NUMERO', 'CANCHA', 'COACH', 'VERIFICADOR']);

// Datos de cobro propios de un profesional (barbero/estilista) — mismo formato que
// Restaurant.paymentMethodsConfig, para que el POS los pinte con el mismo componente.
const paymentMethodsConfigSchema = z.record(z.string(), z.record(z.string(), z.unknown()));

export const createStaffSchema = z
  .object({
    name: z.string().min(1, 'El nombre es obligatorio.').max(120),
    // Obligatorio para todo rol EXCEPTO Mesero (ver el .superRefine debajo): un mesero ya no
    // tiene correo/clave propios, solo su clave de 4 dígitos en la Tablet de Meseros — se
    // genera uno interno al crearlo (ver teamService.create), invisible, nunca se le pide.
    email: z
      .string()
      .email()
      .transform((v) => v.trim().toLowerCase())
      .optional(),
    password: z.string().min(6).max(100).optional(),
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
    // Mesero: su clave de 4 dígitos para la Tablet de Meseros (identifica solo con ella, sin
    // elegir nombre) — por eso es obligatoria acá y no en cualquier otro rol. Única dentro del
    // restaurante, se valida en teamService.create.
    pin: z.string().regex(/^\d{4}$/, 'El PIN debe tener 4 dígitos.').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === 'WAITER') {
      if (!data.pin) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pin'], message: 'La clave es obligatoria para Mesero.' });
      }
      return;
    }
    if (!data.email) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['email'], message: 'El email es obligatorio.' });
    }
    if (!data.password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: 'La contraseña es obligatoria.' });
    }
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

// PIN de 4 dígitos para el segundo inicio de sesión (tablet compartida de meseros) — el
// mismo campo que la Pantalla de bloqueo, así que fijarlo acá también sirve para eso.
// null = quitar el PIN (el mesero deja de aparecer en la cuadrícula de la tablet).
export const setStaffPinSchema = z.object({
  pin: z
    .string()
    .regex(/^\d{4}$/, 'El PIN debe tener 4 dígitos.')
    .nullable(),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
export type AssignTablesInput = z.infer<typeof assignTablesSchema>;
export type SetStaffPinInput = z.infer<typeof setStaffPinSchema>;
