import { z } from 'zod';

const EXPENSE_CATEGORIES = [
  'UTILITIES',
  'SUPPLIES',
  'RENT',
  'PAYROLL',
  'ADMINISTRATIVE',
  'MARKETING',
  'TRANSPORT',
  'MAINTENANCE',
  'FURNITURE',
  'FUEL',
  'TRAVEL',
  'MEALS',
  'LODGING',
  'OTHER',
] as const;

const INCOME_CATEGORIES = ['TIP', 'DEBT', 'OTHER'] as const;

const PAYMENT_METHODS = [
  'MOBILE_PAYMENT',
  'ZELLE',
  'CASH',
  'CASH_USD',
  'CARD',
  'BINANCE',
  'PAYPAL',
  'TRANSFER',
] as const;

const DOCUMENT_TYPES = ['FISCAL_INVOICE', 'DELIVERY_NOTE'] as const;

/** Botón "Añadir movimiento" en Administración → Resumen: ingreso/egreso/propina manual.
 * También cubre el módulo de Gastos: categoría, proveedor, reabastecimiento de inventario y crédito. */
export const createMovementSchema = z
  .object({
    type: z.enum(['INCOME', 'EXPENSE']),
    amountBase: z.coerce.number().positive().max(1000000),
    // Si viene "BS", `amountBase` se recibe en bolívares y el service lo convierte a la
    // moneda base del restaurante con la tasa BCV vigente antes de guardarlo.
    amountCurrency: z.enum(['BASE', 'BS']).optional().default('BASE'),
    description: z.string().min(1, 'Escribe una descripción.').max(200),
    // Solo aplican cuando type = INCOME (botón "Añadir ingreso").
    incomeCategory: z.enum(INCOME_CATEGORIES).optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    // A cuál cuenta bancaria entró/salió el dinero, cuando el método tiene varias.
    bankAccountId: z.string().max(60).nullish(),
    category: z.enum(EXPENSE_CATEGORIES).optional(),
    supplierId: z.string().optional(),
    // Si viene, además de registrar el gasto suma `inventoryQuantity` al insumo.
    inventoryItemId: z.string().optional(),
    inventoryQuantity: z.coerce.number().positive().optional(),
    // Gasto tomado a crédito con el proveedor: queda pendiente por pagar.
    isCredit: z.boolean().optional().default(false),
    // --- Soporte del gasto (opcionales; pensados para gastos de operación/viaje) ---
    // Fecha real del gasto si no es hoy (factura de hace unos días). Solo la fecha, sin hora.
    expenseDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.')
      .optional(),
    referenceNumber: z.string().max(60).optional(),
    receiptImageUrl: z.string().max(300).optional(),
    spentByName: z.string().max(120).optional(),
    // --- Soporte documental adicional (factura ya cubierta por receiptImageUrl) ---
    quoteImageUrl: z.string().max(300).optional(),
    paymentProofImageUrl: z.string().max(300).optional(),
    notes: z.string().max(1000).optional(),
    documentType: z.enum(DOCUMENT_TYPES).optional(),
    isRecurring: z.boolean().optional().default(false),
    // Vencimiento de la factura del proveedor — alimenta la alerta de Cuentas por pagar.
    invoiceDueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.')
      .optional(),
  })
  .refine((v) => !v.inventoryItemId || v.inventoryQuantity != null, {
    message: 'Indica la cantidad recibida del insumo.',
    path: ['inventoryQuantity'],
  });

/**
 * Editar un gasto/ingreso ya cargado (monto equivocado, categoría equivocada, factura que
 * llegó después). Mismos campos que al crear, todos opcionales — el tipo NO se puede cambiar:
 * convertir un gasto en ingreso descuadraría los totales del período sin dejar rastro; para
 * eso se borra y se carga de nuevo.
 */
export const updateMovementSchema = z.object({
  amountBase: z.coerce.number().positive().max(1000000).optional(),
  amountCurrency: z.enum(['BASE', 'BS']).optional().default('BASE'),
  description: z.string().min(1, 'Escribe una descripción.').max(200).optional(),
  incomeCategory: z.enum(INCOME_CATEGORIES).nullable().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable().optional(),
  category: z.enum(EXPENSE_CATEGORIES).nullable().optional(),
  supplierId: z.string().nullable().optional(),
  // Reabastecimiento: cambiar insumo o cantidad revierte el anterior y aplica el nuevo.
  inventoryItemId: z.string().nullable().optional(),
  inventoryQuantity: z.coerce.number().positive().nullable().optional(),
  isCredit: z.boolean().optional(),
  expenseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.')
    .nullable()
    .optional(),
  referenceNumber: z.string().max(60).nullable().optional(),
  receiptImageUrl: z.string().max(300).nullable().optional(),
  spentByName: z.string().max(120).nullable().optional(),
  quoteImageUrl: z.string().max(300).nullable().optional(),
  paymentProofImageUrl: z.string().max(300).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  documentType: z.enum(DOCUMENT_TYPES).nullable().optional(),
  isRecurring: z.boolean().optional(),
  invoiceDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.')
    .nullable()
    .optional(),
});

/** Filtro de rango, igual que el resto de Administración. */
export const movementQuerySchema = z.object({
  range: z.enum(['day', 'week', 'month', 'year', 'all']).optional().default('day'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // "Pendientes con proveedores": ignora range/date, muestra todo lo que sigue a crédito sin pagar.
  onlyPendingCredit: z.coerce.boolean().optional(),
  // Filtro del módulo de Gastos: ver solo una categoría (para revisar de un vistazo cuáles
  // de esos gastos tienen factura fiscal y cuáles nota de entrega).
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  // Relación de cuenta por proveedor (Administración → Proveedores): solo sus compras.
  supplierId: z.string().optional(),
});

export type CreateMovementInput = z.infer<typeof createMovementSchema>;
export type UpdateMovementInput = z.infer<typeof updateMovementSchema>;
export type MovementQuery = z.infer<typeof movementQuerySchema>;
