import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';

const PAYMENT_METHODS = Object.values(PaymentMethod) as [PaymentMethod, ...PaymentMethod[]];

/**
 * Un soporte adjunto a la orden: factura, nota de crédito, planilla de retención o el
 * comprobante de la transferencia. `url` es la ruta que devolvió /payment-orders/upload-document.
 */
export const paymentOrderAttachmentSchema = z.object({
  url: z.string().min(1).max(300),
  name: z.string().min(1).max(160),
  type: z.enum(['image', 'pdf']),
  // 'ORDER' = cargado al emitir la orden; 'PAYMENT' = cargado al registrar el pago.
  stage: z.enum(['ORDER', 'PAYMENT']).optional().default('ORDER'),
});

export type PaymentOrderAttachment = z.infer<typeof paymentOrderAttachmentSchema>;

/** Emitir una orden: qué cuentas por pagar entran. El monto lo calcula el servidor a partir
 * de esos gastos — nunca se confía en un total mandado por el cliente. */
export const createPaymentOrderSchema = z.object({
  movementIds: z.array(z.string().min(1)).min(1, 'Elige al menos una cuenta por pagar.').max(200),
  // Solo se usa si ninguno de los gastos tenía proveedor cargado.
  supplierId: z.string().min(1).nullish(),
  note: z.string().max(300).nullish(),
  // Soportes de la orden (facturas, presupuestos): imágenes o PDF ya subidos.
  attachments: z.array(paymentOrderAttachmentSchema).max(10).optional(),
});

export type CreatePaymentOrderInput = z.infer<typeof createPaymentOrderSchema>;

/** Marcarla pagada: con qué se pagó, su referencia y el detalle fiscal del pago. */
export const payPaymentOrderSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS).nullish(),
  referenceNumber: z.string().max(80).nullish(),
  // Lo realmente pagado. Si viene en "BS" el service lo convierte a moneda base con la tasa
  // BCV del momento del pago — el monto congelado de la orden ya no aplica si la tasa cambió.
  paidAmount: z.coerce.number().positive().max(100000000).nullish(),
  paidCurrency: z.enum(['BASE', 'BS']).optional().default('BASE'),
  // Retenciones (el negocio como agente de retención) y nota de crédito, en moneda base.
  islrRetentionBase: z.coerce.number().nonnegative().max(1000000).nullish(),
  ivaRetentionBase: z.coerce.number().nonnegative().max(1000000).nullish(),
  creditNoteBase: z.coerce.number().nonnegative().max(1000000).nullish(),
  // Desglose informativo de la factura.
  ivaAmountBase: z.coerce.number().nonnegative().max(1000000).nullish(),
  totalWithIvaBase: z.coerce.number().nonnegative().max(10000000).nullish(),
  // De cuál cuenta bancaria salió el dinero, cuando el método tiene varias.
  bankAccountId: z.string().max(60).nullish(),
  // Soportes del pago (comprobante de transferencia, planilla de retención): se suman a los
  // que ya traía la orden, no los reemplazan.
  attachments: z.array(paymentOrderAttachmentSchema).max(10).optional(),
});

export type PayPaymentOrderInput = z.infer<typeof payPaymentOrderSchema>;
