import { z } from 'zod';

export const createDeliveryCourierSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(120),
  whatsappPhone: z.string().min(7, 'Escribe un número de WhatsApp válido.').max(30),
});

export const updateDeliveryCourierSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  whatsappPhone: z.string().min(7).max(30).optional(),
  isActive: z.boolean().optional(),
});

export type CreateDeliveryCourierInput = z.infer<typeof createDeliveryCourierSchema>;
export type UpdateDeliveryCourierInput = z.infer<typeof updateDeliveryCourierSchema>;
