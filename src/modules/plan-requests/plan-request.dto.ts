import { z } from 'zod';

// Los campos llegan como multipart/form-data (van junto al archivo del
// comprobante), por eso los numéricos/booleanos vienen como string y hay
// que coercionarlos. z.coerce.boolean() NO sirve para esto: en JS
// Boolean("false") es true, así que hay que comparar el string a mano.
const formBoolean = z.preprocess((v) => v === 'true' || v === true, z.boolean()).optional().default(false);

export const createPlanRequestSchema = z.object({
  plan: z.enum(['DELIVERY', 'STARTER', 'PRO', 'PREMIUM', 'CUSTOM']),
  billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL']),
  paymentMethod: z.enum(['PAGO_MOVIL', 'BINANCE', 'BANK_TRANSFER']),

  // Solo para plan CUSTOM.
  customTables: z.coerce.number().int().min(0).max(100).optional(),
  customUsers: z.coerce.number().int().min(0).max(100).optional(),
  customOrders: z.coerce.number().int().min(0).max(10000).optional(),
  customAdministration: formBoolean,
  customInventoryBasic: formBoolean,
  customInventoryRecipe: formBoolean,
  customAccountsPayable: formBoolean,

  contactName: z.string().min(1, 'Falta el nombre de contacto.').max(120),
  contactEmail: z.string().email('Correo inválido.'),
  contactPhone: z.string().max(30).optional(),
  restaurantName: z.string().max(120).optional(),

  promoCode: z.string().max(40).optional(),
});

export type CreatePlanRequestInput = z.infer<typeof createPlanRequestSchema>;

export const approvePlanRequestSchema = z.object({
  // Solo necesario para solicitudes SIGNUP que aún no estén vinculadas a un restaurante.
  restaurantId: z.string().min(1).optional(),
});

export type ApprovePlanRequestInput = z.infer<typeof approvePlanRequestSchema>;

export const rejectPlanRequestSchema = z.object({
  status: z.enum(['REJECTED', 'PAYMENT_NOT_RECEIVED']),
});

export type RejectPlanRequestInput = z.infer<typeof rejectPlanRequestSchema>;

export const activateRestaurantSchema = z.object({
  plan: z.enum(['DELIVERY', 'STARTER', 'PRO', 'PREMIUM', 'CUSTOM']),
  billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL']),
});

export type ActivateRestaurantInput = z.infer<typeof activateRestaurantSchema>;
