import { z } from 'zod';

export const createAnnouncementSchema = z.object({
  message: z.string().min(1).max(4000),
  // null/omitido = manda a restaurantes y locales por igual.
  targetBusinessType: z.enum(['RESTAURANT', 'SHOP']).nullable().optional(),
});

export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

export const updateAnnouncementSchema = z.object({
  message: z.string().min(1).max(4000).optional(),
  targetBusinessType: z.enum(['RESTAURANT', 'SHOP']).nullable().optional(),
});

export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
