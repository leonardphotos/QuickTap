import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';

const PAYMENT_METHODS = Object.values(PaymentMethod) as [PaymentMethod, ...PaymentMethod[]];

/** Botón "Abrir Caja": saldo declarado por método de pago. */
export const openCashSessionSchema = z.object({
  openingBalances: z.record(z.enum(PAYMENT_METHODS), z.coerce.number().min(0).max(1000000)),
});

export type OpenCashSessionInput = z.infer<typeof openCashSessionSchema>;
