import { z } from 'zod';

/** El cliente manda qué y cuánto; el precio SIEMPRE lo pone el servidor. */
const tabletItemSchema = z.object({
  source: z.enum(['CLUB_STORE', 'RESTAURANT']),
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
});

export const createTabOrderSchema = z.object({
  accessToken: z.string().min(1).max(64),
  items: z.array(tabletItemSchema).min(1).max(40),
});

export type CreateTabOrderInput = z.infer<typeof createTabOrderSchema>;
