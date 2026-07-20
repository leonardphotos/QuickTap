import { z } from 'zod';

export const createBranchSchema = z.object({
  name: z.string().min(1).max(120),
  whatsappPhone: z.string().min(7).max(30).optional(),
  baseCurrency: z.enum(['USD', 'EUR']).optional().default('USD'),
  // true = copiar categorías/productos/variantes/modificadores de la sede
  // principal como punto de partida; false = arrancar con catálogo vacío.
  // El inventario NUNCA se copia (ver branch.service.ts).
  copyCatalog: z.boolean().default(false),
});

export const branchReportQuerySchema = z.object({
  range: z.enum(['day', 'week', 'month', 'year', 'all']).default('month'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type BranchReportQuery = z.infer<typeof branchReportQuerySchema>;
