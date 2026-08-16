import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';

const PAYMENT_METHODS = Object.values(PaymentMethod) as [PaymentMethod, ...PaymentMethod[]];

/** Crear una cuenta bancaria (o caja chica). La moneda se elige al crearla y no se puede
 * cambiar después: el libro mayor quedó asentado en esa moneda. */
export const createBankAccountSchema = z.object({
  name: z.string().min(1, 'Escribe el nombre de la cuenta.').max(120),
  currency: z.enum(['BASE', 'BS']),
  isPettyCash: z.boolean().optional().default(false),
  // Bóveda: destino del efectivo que sale de la caja al cerrar el turno.
  isVault: z.boolean().optional().default(false),
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)).max(8).optional().default([]),
  // Saldo inicial en la moneda de la cuenta — queda como primer asiento del libro.
  initialBalance: z.coerce.number().nonnegative().max(1000000000).optional(),
});

export const updateBankAccountSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  isPettyCash: z.boolean().optional(),
  isVault: z.boolean().optional(),
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)).max(8).optional(),
});

/** Transferencia entre cuentas propias. El monto va en la moneda de la cuenta ORIGEN; si el
 * destino usa otra moneda, el service convierte con la tasa BCV del momento. */
export const transferSchema = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  amount: z.coerce.number().positive().max(1000000000),
  // Concepto de la transferencia: obligatorio, es lo que queda escrito en el movimiento de
  // las dos cuentas — sin él, el libro del banco no explica por qué se movió la plata.
  note: z.string().trim().min(1, 'Escribe el concepto de la transferencia.').max(200),
});

/** Ajuste manual de saldo (conciliación contra el banco real), en la moneda de la cuenta. */
export const adjustSchema = z.object({
  direction: z.enum(['CREDIT', 'DEBIT']),
  amount: z.coerce.number().positive().max(1000000000),
  note: z.string().max(200).nullish(),
});

export const bankTransactionQuerySchema = z.object({
  range: z.enum(['day', 'week', 'month', 'year', 'all']).optional().default('month'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type AdjustInput = z.infer<typeof adjustSchema>;
export type BankTransactionQuery = z.infer<typeof bankTransactionQuerySchema>;
