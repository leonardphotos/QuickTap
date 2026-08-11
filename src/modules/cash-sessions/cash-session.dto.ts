import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';

const PAYMENT_METHODS = Object.values(PaymentMethod) as [PaymentMethod, ...PaymentMethod[]];

/** Botón "Abrir Caja": saldo declarado por método de pago. */
export const openCashSessionSchema = z.object({
  openingBalances: z.record(z.enum(PAYMENT_METHODS), z.coerce.number().min(0).max(1000000)),
});

export type OpenCashSessionInput = z.infer<typeof openCashSessionSchema>;

/** Botón "Confirmar cierre": el conteo físico del arqueo, por método. Opcional — cerrar sin
 * contar sigue siendo válido y simplemente no genera arqueo (ver buildArqueo). */
export const closeCashSessionSchema = z.object({
  countedBalances: z.record(z.enum(PAYMENT_METHODS), z.coerce.number().min(0).max(1000000)).nullish(),
});

export type CloseCashSessionInput = z.infer<typeof closeCashSessionSchema>;
