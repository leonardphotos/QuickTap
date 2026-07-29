import { z } from 'zod';

export const createPlanRequestSchema = z.object({
  // Cuatro planes vigentes: Delivery ($18.99), Pro ($28.99, todos los
  // beneficios), Sucursales ($78.99, Pro + hasta 5 sucursales) y Delivery
  // Sucursales ($38.99, Delivery + hasta 5 sucursales).
  plan: z.enum(['DELIVERY', 'PRO', 'SUCURSALES', 'DELIVERY_SUCURSALES']),
  billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL']),
  paymentMethod: z.enum(['PAGO_MOVIL', 'BINANCE', 'BANK_TRANSFER']),
  // Número de referencia de la transferencia/pago móvil/Binance (reemplaza
  // la antigua subida de foto/PDF del comprobante).
  paymentReference: z.string().min(1, 'Escribe el número de referencia del pago.').max(100),

  // Solo para plan CUSTOM.
  customTables: z.coerce.number().int().min(0).max(100).optional(),
  customUsers: z.coerce.number().int().min(0).max(100).optional(),
  customOrders: z.coerce.number().int().min(0).max(10000).optional(),
  customAdministration: z.boolean().optional().default(false),
  customInventoryBasic: z.boolean().optional().default(false),
  customInventoryRecipe: z.boolean().optional().default(false),
  customAccountsPayable: z.boolean().optional().default(false),

  contactName: z.string().min(1, 'Falta el nombre de contacto.').max(120),
  contactEmail: z.string().email('Correo inválido.'),
  contactPhone: z.string().max(30).optional(),
  restaurantName: z.string().max(120).optional(),

  promoCode: z.string().max(40).optional(),
});

export type CreatePlanRequestInput = z.infer<typeof createPlanRequestSchema>;

/**
 * Igual que createPlanRequestSchema, pero sin paymentMethod/paymentReference:
 * esos los llena el servidor (RAMBLAY + el id que devuelva su API) en vez de
 * que el restaurante escriba un número de referencia a mano.
 */
export const createRamblayCheckoutSchema = createPlanRequestSchema.omit({
  paymentMethod: true,
  paymentReference: true,
});

export type CreateRamblayCheckoutInput = z.infer<typeof createRamblayCheckoutSchema>;

/**
 * Igual que createPlanRequestSchema, pero sin paymentMethod/paymentReference:
 * "pago fraccionado" — el restaurante todavía no sabe con qué método/referencia
 * va a pagar el primer abono, eso lo escribe por cada abono en
 * addPlanRequestPaymentSchema (POST /plan-requests/:id/payments).
 */
export const createInstallmentPlanRequestSchema = createPlanRequestSchema.omit({
  paymentMethod: true,
  paymentReference: true,
});

export type CreateInstallmentPlanRequestInput = z.infer<typeof createInstallmentPlanRequestSchema>;

/** Un abono del pago fraccionado: monto a abonar, método usado y su número de
 * referencia. El comprobante (imagen) llega aparte, como archivo multipart. */
export const addPlanRequestPaymentSchema = z.object({
  amountUsd: z.coerce.number().positive('El monto debe ser mayor a 0.').max(100000),
  paymentMethod: z.enum(['PAGO_MOVIL', 'BINANCE', 'BANK_TRANSFER']),
  paymentReference: z.string().min(1, 'Escribe el número de referencia del pago.').max(100),
});

export type AddPlanRequestPaymentInput = z.infer<typeof addPlanRequestPaymentSchema>;

export const approvePlanRequestSchema = z.object({
  // Solo necesario para solicitudes SIGNUP que aún no estén vinculadas a un restaurante.
  restaurantId: z.string().min(1).optional(),
});

export type ApprovePlanRequestInput = z.infer<typeof approvePlanRequestSchema>;

export const rejectPlanRequestSchema = z.object({
  status: z.enum(['REJECTED', 'PAYMENT_NOT_RECEIVED']),
});

export type RejectPlanRequestInput = z.infer<typeof rejectPlanRequestSchema>;

/** Corrección manual desde el drill-down de "Ingresos de QuickTap" en el Dashboard maestro. */
export const updatePlanRequestSchema = z.object({
  priceUsd: z.coerce.number().positive().max(100000).optional(),
  paymentReference: z.string().min(1).max(100).optional(),
});

export type UpdatePlanRequestInput = z.infer<typeof updatePlanRequestSchema>;

export const activateRestaurantSchema = z.object({
  plan: z.enum(['DELIVERY', 'PRO', 'SUCURSALES', 'DELIVERY_SUCURSALES']),
  billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL']),
});

export type ActivateRestaurantInput = z.infer<typeof activateRestaurantSchema>;
