import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';

const PAYMENT_METHODS = Object.values(PaymentMethod) as [PaymentMethod, ...PaymentMethod[]];

/** Emitir una orden: qué cuentas por pagar entran. El monto lo calcula el servidor a partir
 * de esos gastos — nunca se confía en un total mandado por el cliente. */
export const createPaymentOrderSchema = z.object({
  movementIds: z.array(z.string().min(1)).min(1, 'Elige al menos una cuenta por pagar.').max(200),
  // Solo se usa si ninguno de los gastos tenía proveedor cargado.
  supplierId: z.string().min(1).nullish(),
  note: z.string().max(300).nullish(),
});

export type CreatePaymentOrderInput = z.infer<typeof createPaymentOrderSchema>;

/** Marcarla pagada: con qué se pagó y su referencia, para conciliar contra el banco. */
export const payPaymentOrderSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS).nullish(),
  referenceNumber: z.string().max(80).nullish(),
});

export type PayPaymentOrderInput = z.infer<typeof payPaymentOrderSchema>;
