import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';

const PAYMENT_METHODS = Object.values(PaymentMethod) as [PaymentMethod, ...PaymentMethod[]];

export const createEmployeeSchema = z.object({
  name: z.string().min(1, 'Escribe el nombre.').max(120),
  position: z.string().max(80).nullish(),
  phone: z.string().max(30).nullish(),
  idNumber: z.string().max(30).nullish(),
  salaryBase: z.coerce.number().min(0).max(1000000).nullish(),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = createEmployeeSchema.partial().extend({
  active: z.boolean().optional(),
});

export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

/** Registrar un pago de nómina. Genera el gasto correspondiente (ver payrollService.pay). */
export const payEmployeeSchema = z.object({
  amountBase: z.coerce.number().positive('El monto debe ser mayor a 0.').max(1000000),
  periodLabel: z.string().max(60).nullish(),
  paymentMethod: z.enum(PAYMENT_METHODS).nullish(),
  note: z.string().max(300).nullish(),
});

export type PayEmployeeInput = z.infer<typeof payEmployeeSchema>;
