import { z } from 'zod';

/** Un cargo único de la cotización (instalación, placas QR/NFC, lo que sea). */
const quoteItemSchema = z.object({
  label: z.string().trim().min(1).max(80),
  amountUsd: z.coerce.number().min(0).max(100000),
});

export const createPlatformQuoteSchema = z.object({
  clientName: z.string().trim().min(1, 'Falta el nombre del cliente.').max(120),
  clientPhone: z.string().trim().min(7, 'Falta el teléfono del cliente.').max(30),
  businessName: z.string().trim().max(120).nullish(),
  planName: z.string().trim().min(1, 'Falta el plan.').max(60),
  planPriceUsd: z.coerce.number().min(0).max(100000),
  planCycle: z.string().trim().min(1).max(30).default('Mensual'),
  items: z.array(quoteItemSchema).max(20).default([]),
  // Cargos recurrentes mensuales adicionales al plan (ej. Homologación de facturas).
  recurringItems: z.array(quoteItemSchema).max(10).default([]),
  note: z.string().trim().max(600).nullish(),
});

export type CreatePlatformQuoteInput = z.infer<typeof createPlatformQuoteSchema>;
export type PlatformQuoteItem = z.infer<typeof quoteItemSchema>;

export const listPlatformQuotesSchema = z.object({
  status: z.enum(['open', 'approved']).default('open'),
});
