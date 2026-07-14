import { z } from 'zod';

/** El restaurante ya está autenticado; solo indica cuántas unidades quiere. */
export const createQrNfcRequestSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(1000),
});

export type CreateQrNfcRequestInput = z.infer<typeof createQrNfcRequestSchema>;
