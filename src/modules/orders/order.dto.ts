import { z } from 'zod';

/** Un ítem del carrito tal como lo envía el cliente/mesero. */
export const cartItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive().max(99),
  modifiers: z.array(z.string().max(80)).optional().default([]),
  note: z.string().max(200).optional(),
});

/** Checkout en mesa (canal DINE_IN). Requiere el token del QR de la mesa. */
export const dineInCheckoutSchema = z.object({
  qrToken: z.string().min(1, 'Falta el identificador de la mesa (QR).'),
  items: z.array(cartItemSchema).min(1, 'El carrito está vacío.'),
});

const paymentMethodSchema = z.enum(['MOBILE_PAYMENT', 'ZELLE', 'CASH', 'CARD']);

/** Checkout de delivery/pickup -> genera enlace de WhatsApp. */
export const deliveryCheckoutSchema = z.object({
  mode: z.enum(['DELIVERY', 'PICKUP']).default('DELIVERY'),
  items: z.array(cartItemSchema).min(1, 'El carrito está vacío.'),
  customer: z.object({
    name: z.string().min(1, 'El nombre es obligatorio.').max(120),
    phone: z.string().max(30).optional(),
    address: z.string().max(300).optional(),
    paymentMethod: paymentMethodSchema,
    note: z.string().max(300).optional(),
  }),
});

/** Cambio de estado de una comanda (panel de cocina). */
export const updateStatusSchema = z.object({
  status: z.enum(['PENDING', 'KITCHEN', 'SERVED', 'CANCELLED']),
});

export type CartItemInput = z.infer<typeof cartItemSchema>;
export type DineInCheckoutInput = z.infer<typeof dineInCheckoutSchema>;
export type DeliveryCheckoutInput = z.infer<typeof deliveryCheckoutSchema>;
