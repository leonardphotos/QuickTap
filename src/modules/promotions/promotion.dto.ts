import { z } from 'zod';
import { CUSTOMER_SEGMENTS } from '../customers/customer.dto';

/** Con qué lista se arma la campaña: un segmento del CRM o clientes elegidos a mano. */
export const PROMOTION_SEGMENTS = [...CUSTOMER_SEGMENTS, 'MANUAL'] as const;

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.');

export const createPromotionSchema = z
  .object({
    name: z.string().min(1, 'Escribe el nombre de la promoción.').max(120),
    // Mensaje de WhatsApp; placeholders {{nombre}}, {{codigo}}, {{descuento}}, {{vigencia}}.
    message: z.string().max(1000).nullish(),
    // Código canjeable; si no viene, se genera uno. Se guarda en MAYÚSCULAS.
    code: z
      .string()
      .min(3)
      .max(30)
      .regex(/^[A-Za-z0-9-]+$/, 'Solo letras, números y guiones.')
      .optional(),
    discountType: z.enum(['PERCENT', 'AMOUNT']),
    discountValue: z.coerce.number().positive().max(1000000),
    startsAt: dateStr.nullish(),
    endsAt: dateStr.nullish(),
    segment: z.enum(PROMOTION_SEGMENTS).optional().default('ALL'),
    // Lista elegida a mano (segment = MANUAL), o clientes extra sobre el segmento.
    customerIds: z.array(z.string()).max(2000).optional(),
    // Máximo de canjes por cliente; 0 = sin límite.
    maxPerCustomer: z.coerce.number().int().min(0).max(100).optional().default(1),
    // true = el código solo vale para los clientes de la lista.
    restrictToTargets: z.boolean().optional().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.discountType === 'PERCENT' && data.discountValue > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Un porcentaje no puede superar 100.', path: ['discountValue'] });
    }
  });

export const updatePromotionSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  message: z.string().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
  startsAt: dateStr.nullable().optional(),
  endsAt: dateStr.nullable().optional(),
  maxPerCustomer: z.coerce.number().int().min(0).max(100).optional(),
  restrictToTargets: z.boolean().optional(),
});

/** Validación desde caja: el código y (si se conoce) el teléfono del cliente. */
export const validatePromotionQuerySchema = z.object({
  code: z.string().min(1).max(40),
  phone: z.string().max(30).optional(),
});

export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;
export type ValidatePromotionQuery = z.infer<typeof validatePromotionQuerySchema>;
