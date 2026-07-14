import { z } from 'zod';

export const moveTableSessionSchema = z.object({
  tableId: z.string().min(1, 'Falta la mesa destino.'),
});

export type MoveTableSessionInput = z.infer<typeof moveTableSessionSchema>;

export const setTableSessionPinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'La clave debe ser de 4 dígitos.'),
});

export type SetTableSessionPinInput = z.infer<typeof setTableSessionPinSchema>;
