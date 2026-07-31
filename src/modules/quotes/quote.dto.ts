import { z } from 'zod';

const quoteItemSchema = z.object({
  name: z.string().min(1).max(160),
  qty: z.coerce.number().positive().max(10000),
  unitPrice: z.coerce.number().nonnegative().max(1000000),
});

export const createQuoteSchema = z.object({
  customerName: z.string().max(160).optional(),
  customerPhone: z.string().max(30).optional(),
  note: z.string().max(500).optional(),
  items: z.array(quoteItemSchema).min(1, 'Agrega al menos un ítem.'),
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

export const markQuoteConvertedSchema = z.object({
  convertedToId: z.string().min(1).max(120),
});

export type MarkQuoteConvertedInput = z.infer<typeof markQuoteConvertedSchema>;
