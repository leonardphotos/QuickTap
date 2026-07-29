import { z } from 'zod';

export const enableFiscalInvoicingSchema = z.object({
  enabled: z.boolean(),
  environment: z.enum(['QA', 'PRODUCTION']).optional().default('QA'),
  username: z.string().min(1, 'El usuario es obligatorio.').max(200).optional(),
  // Solo obligatoria la primera vez o al querer rotarla — si no llega, se
  // conserva la que ya estaba guardada (ver fiscal-invoicing.service.ts).
  password: z.string().min(1).max(200).optional(),
  // IGTF: la alícuota vigente y si aplica a este contribuyente lo define su
  // contador. Se recibe como fracción (ej. 0.03 = 3%) y arranca desactivado
  // para no cobrar un impuesto que no corresponda.
  igtfEnabled: z.boolean().optional(),
  igtfRate: z.coerce.number().min(0).max(0.5).optional(),
});

export type EnableFiscalInvoicingInput = z.infer<typeof enableFiscalInvoicingSchema>;
