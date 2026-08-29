import { z } from 'zod';

/**
 * Seguimiento del embudo de registro. Lo manda el navegador de alguien que TODAVÍA NO tiene
 * cuenta, así que la ruta es pública — de ahí que todo campo sea opcional y acotado: lo único
 * que puede hacer un abuso es ensuciar la lista de contactos, nunca tocar datos de un tenant.
 *
 * La contraseña no está acá a propósito y nunca debe estarlo.
 */
export const trackRegistrationSchema = z.object({
  sessionId: z.string().min(8).max(64),
  stage: z.enum(['START', 'FORM']).optional(),
  businessType: z.string().max(30).optional(),
  shopRubro: z.string().max(60).optional(),
  restaurantName: z.string().max(120).optional(),
  slug: z.string().max(80).optional(),
  whatsappPhone: z.string().max(30).optional(),
  ownerName: z.string().max(120).optional(),
  email: z.string().max(160).optional(),
  landingQuery: z.string().max(500).optional(),
  lastError: z.string().max(300).optional(),
});

export type TrackRegistrationInput = z.infer<typeof trackRegistrationSchema>;

/** Filtro de la lista del Dashboard maestro. */
export const funnelQuerySchema = z.object({
  range: z.enum(['day', 'week', 'month', 'year', 'all']).optional().default('month'),
});

export type FunnelQueryInput = z.infer<typeof funnelQuerySchema>;
