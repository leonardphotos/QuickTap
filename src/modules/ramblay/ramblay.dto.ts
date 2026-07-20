import { z } from 'zod';

/**
 * Payload del webhook de Ramblay, confirmado en https://ramblay.com/webhooks/:
 * mismo sobre de evento que Stripe. `data.object` varía de forma según el
 * `type` (Charge, Payment, Payframe...), así que se deja como record laxo y
 * cada handler lee solo los campos que le interesan.
 */
export const ramblayWebhookSchema = z.object({
  id: z.string(),
  type: z.string(),
  created: z.number().optional(),
  livemode: z.boolean().optional(),
  data: z.object({
    object: z.object({
      id: z.string(),
      status: z.string().optional(),
      client_reference_id: z.string().optional(),
    }),
  }),
});

export type RamblayWebhookPayload = z.infer<typeof ramblayWebhookSchema>;
