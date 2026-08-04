import { z } from 'zod';

const scopeEnum = z.enum(['LOCAL', 'CASA_MATRIZ']);

export const createTransferSchema = z
  .object({
    fromRestaurantId: z.string().min(1),
    fromScope: scopeEnum,
    toRestaurantId: z.string().min(1),
    toScope: scopeEnum,
    itemId: z.string().min(1, 'Elige el insumo a transferir.'),
    quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0.'),
  })
  .refine((v) => !(v.fromRestaurantId === v.toRestaurantId && v.fromScope === v.toScope), {
    message: 'El origen y el destino no pueden ser el mismo.',
    path: ['toRestaurantId'],
  });

export type CreateTransferInput = z.infer<typeof createTransferSchema>;
