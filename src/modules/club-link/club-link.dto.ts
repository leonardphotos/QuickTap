import { z } from 'zod';

/** El código se escribe a mano en la tablet/panel del club: se normaliza a
 * mayúsculas y sin espacios para que "abc 123" y "ABC123" sean lo mismo. */
export const redeemLinkCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4)
    .max(20)
    .transform((c) => c.toUpperCase().replace(/[\s-]/g, '')),
});

export const setTabOrderStatusSchema = z.object({
  status: z.enum(['PREPARING', 'DELIVERED', 'CANCELLED']),
});

export const listKitchenOrdersQuerySchema = z.object({
  /** Por defecto solo lo que sigue vivo (PENDING + PREPARING).
   *
   * No usar `z.coerce.boolean()`: llega como string en el query, y `Boolean("false")`
   * es `true` — el filtro quedaba siempre encendido y las comandas entregadas no
   * salían nunca de la cola. */
  includeDelivered: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
});

export type RedeemLinkCodeInput = z.infer<typeof redeemLinkCodeSchema>;
export type SetTabOrderStatusInput = z.infer<typeof setTabOrderStatusSchema>;
export type ListKitchenOrdersQuery = z.infer<typeof listKitchenOrdersQuerySchema>;
