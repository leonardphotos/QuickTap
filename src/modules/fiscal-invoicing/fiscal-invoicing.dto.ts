import { z } from 'zod';

export const enableFiscalInvoicingSchema = z.object({
  enabled: z.boolean(),
  environment: z.enum(['QA', 'PRODUCTION']).optional().default('QA'),
  username: z.string().min(1, 'El usuario es obligatorio.').max(200).optional(),
  // Solo obligatoria la primera vez o al querer rotarla — si no llega, se
  // conserva la que ya estaba guardada (ver fiscal-invoicing.service.ts).
  password: z.string().min(1).max(200).optional(),
});

export type EnableFiscalInvoicingInput = z.infer<typeof enableFiscalInvoicingSchema>;
