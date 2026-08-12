import { z } from 'zod';

const pagoMovilSchema = z.object({
  banco: z.string().max(80).optional(),
  telefono: z.string().max(30).optional(),
  cedula: z.string().max(30).optional(),
  titular: z.string().max(120).optional(),
});

const binanceSchema = z.object({
  id: z.string().max(80).optional(),
  correo: z.string().max(120).optional(),
});

const bankTransferSchema = z.object({
  banco: z.string().max(80).optional(),
  cuenta: z.string().max(40).optional(),
  titular: z.string().max(120).optional(),
  rif: z.string().max(30).optional(),
});

export const updatePaymentMethodsSchema = z.object({
  pagoMovil: pagoMovilSchema.optional(),
  binance: binanceSchema.optional(),
  bankTransfer: bankTransferSchema.optional(),
  ramblayEnabled: z.boolean().optional(),
  manualPaymentEnabled: z.boolean().optional(),
  aiPhotoEnabled: z.boolean().optional(),
});

export type UpdatePaymentMethodsInput = z.infer<typeof updatePaymentMethodsSchema>;

const planPricesSchema = z.object({
  MONTHLY: z.coerce.number().positive().max(100000).optional(),
  QUARTERLY: z.coerce.number().positive().max(100000).optional(),
  SEMIANNUAL: z.coerce.number().positive().max(100000).optional(),
});

const planContentEntrySchema = z.object({
  name: z.string().min(1).max(80).optional(),
  subtitle: z.string().min(1).max(200).optional(),
  capacity: z.string().min(1).max(200).optional(),
  features: z.array(z.string().min(1).max(200)).max(20).optional(),
  prices: planPricesSchema.optional(),
});

/** Editor de planes del Dashboard maestro: precios/descripción, parcial por plan. */
export const updatePlanContentSchema = z.object({
  DELIVERY: planContentEntrySchema.optional(),
  PRO: planContentEntrySchema.optional(),
  ELITE: planContentEntrySchema.optional(),
  SHOP: planContentEntrySchema.optional(),
});

export type UpdatePlanContentInput = z.infer<typeof updatePlanContentSchema>;

/** Dashboard maestro → Planes: en qué moneda se cobra la mensualidad ($ o €). No es
 * Restaurant.baseCurrency (esa es la moneda del menú de cada tenant, otro concepto). */
export const updateSubscriptionCurrencySchema = z.object({
  currency: z.enum(['USD', 'EUR']),
});

export type UpdateSubscriptionCurrencyInput = z.infer<typeof updateSubscriptionCurrencySchema>;

/** Editor de mensajes del chatbot del master (Dashboard maestro → WhatsApp). Cada campo admite
 * placeholders `{{variable}}` — ver DEFAULT_MESSAGE_TEMPLATES en platform-settings.service.ts
 * para la lista de variables disponibles por mensaje. */
export const updateMessageTemplatesSchema = z.object({
  reminderMessage: z.string().min(1).max(2000).optional(),
  proofReceivedMessage: z.string().min(1).max(1000).optional(),
  paymentApprovedMessage: z.string().min(1).max(1000).optional(),
  paymentRejectedMessage: z.string().min(1).max(1000).optional(),
  welcomeMessage: z.string().min(1).max(1000).optional(),
});

export type UpdateMessageTemplatesInput = z.infer<typeof updateMessageTemplatesSchema>;
