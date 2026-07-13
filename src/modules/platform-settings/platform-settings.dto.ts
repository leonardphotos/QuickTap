import { z } from 'zod';

const pagoMovilSchema = z.object({
  banco: z.string().max(80).optional(),
  telefono: z.string().max(30).optional(),
  cedula: z.string().max(30).optional(),
  titular: z.string().max(120).optional(),
});

const binanceSchema = z.object({
  id: z.string().max(80).optional(),
  correo: z.string().max(120).optional(),
});

const bankTransferSchema = z.object({
  banco: z.string().max(80).optional(),
  cuenta: z.string().max(40).optional(),
  titular: z.string().max(120).optional(),
  rif: z.string().max(30).optional(),
});

export const updatePaymentMethodsSchema = z.object({
  pagoMovil: pagoMovilSchema.optional(),
  binance: binanceSchema.optional(),
  bankTransfer: bankTransferSchema.optional(),
});

export type UpdatePaymentMethodsInput = z.infer<typeof updatePaymentMethodsSchema>;
