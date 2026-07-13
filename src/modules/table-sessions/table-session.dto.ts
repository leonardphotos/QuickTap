import { z } from 'zod';

export const moveTableSessionSchema = z.object({
  tableId: z.string().min(1, 'Falta la mesa destino.'),
});

export type MoveTableSessionInput = z.infer<typeof moveTableSessionSchema>;
