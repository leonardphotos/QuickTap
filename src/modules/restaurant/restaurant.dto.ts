import { z } from 'zod';

export const updateRestaurantSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  logoUrl: z.string().url().optional(),
  whatsappPhone: z.string().min(7).max(30).optional(),
  // La "casilla de Tasa cambiaria": el restaurante elige en qué moneda
  // coloca sus precios. La conversión a Bs siempre usa la tasa BCV vigente.
  baseCurrency: z.enum(['USD', 'EUR']).optional(),
});

export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>;
