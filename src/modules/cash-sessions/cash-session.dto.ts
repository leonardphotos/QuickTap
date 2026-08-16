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
  /**
   * Traspaso a bóveda: el efectivo que sale de la caja al cerrar el turno. Un renglón por
   * cuenta de origen (efectivo en Bs y efectivo en divisa suelen ser cuentas distintas), con
   * el monto EN LA MONEDA DE LA CUENTA DE ORIGEN. Opcional: cerrar sin traspasar sigue valiendo.
   */
  vaultTransfers: z
    .array(
      z.object({
        fromAccountId: z.string().min(1),
        toAccountId: z.string().min(1),
        amount: z.coerce.number().positive().max(1000000000),
      }),
    )
    .max(6)
    .optional(),
});

export type CloseCashSessionInput = z.infer<typeof closeCashSessionSchema>;
