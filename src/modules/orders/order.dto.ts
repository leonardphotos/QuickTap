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
  customerName: z.string().min(1).max(120).optional(),
  // Cédula/documento de identidad, para los datos de facturación.
  customerIdNumber: z.string().min(1).max(20).optional(),
  // Requerida solo si la cuenta de la mesa ya está protegida con clave.
  pin: z.string().regex(/^\d{4}$/).optional(),
  // Propina opcional que el cliente agrega desde la mesa.
  tipBase: z.coerce.number().nonnegative().max(100000).optional(),
});

/** Pedido cargado a mano por el staff (ej. Mesero) desde "Órdenes de Mesa". */
export const manualOrderSchema = z.object({
  tableId: z.string().min(1),
  items: z.array(cartItemSchema).min(1, 'El pedido está vacío.'),
  customerName: z.string().min(1).max(120).optional(),
  customerIdNumber: z.string().min(1).max(20).optional(),
});

const paymentMethodSchema = z.enum(['MOBILE_PAYMENT', 'ZELLE', 'CASH', 'CARD', 'BINANCE', 'PAYPAL', 'TRANSFER']);

/** Checkout de delivery/pickup -> genera enlace de WhatsApp. Todo es obligatorio salvo la nota. */
export const deliveryCheckoutSchema = z.object({
  mode: z.enum(['DELIVERY', 'PICKUP']).default('DELIVERY'),
  items: z.array(cartItemSchema).min(1, 'El carrito está vacío.'),
  customer: z.object({
    name: z.string().min(1, 'El nombre es obligatorio.').max(120),
    phone: z.string().min(7, 'Escribe un teléfono válido.').max(30),
    address: z.string().max(300).optional(),
    // Enlace de Google Maps con la ubicación GPS del cliente (botón "Usar mi ubicación actual").
    locationUrl: z.string().url().max(300).optional(),
    // Coordenadas crudas del mismo botón, para calcular el costo de envío.
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    paymentMethod: paymentMethodSchema,
    note: z.string().max(300).optional(),
  }),
});

/** Cambio de estado de una comanda (panel de cocina). */
export const updateStatusSchema = z.object({
  status: z.enum(['PENDING', 'KITCHEN', 'SERVED', 'CANCELLED']),
});

/** Editar cantidades de un pedido ya creado (sección Delivery). quantity: 0 quita el ítem. */
export const updateOrderItemsSchema = z.object({
  items: z
    .array(
      z.object({
        orderItemId: z.string().min(1),
        quantity: z.coerce.number().int().min(0).max(99),
      }),
    )
    .min(1),
});

/** Agregar/editar la propina de un pedido a mano, desde Administración. */
export const setTipSchema = z.object({
  tipBase: z.coerce.number().nonnegative().max(100000),
});

/** "Delivery" en el panel de Pedidos en vivo: a qué repartidor despachar la comanda. */
export const dispatchCourierSchema = z.object({
  courierId: z.string().min(1, 'Elige un repartidor.'),
});

/** Cotización en vivo del costo de envío, antes de enviar el pedido. */
export const deliveryQuoteSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

/** Filtros del historial de pedidos y reportes (Administración, solo Premium). */
export const orderHistoryQuerySchema = z.object({
  range: z.enum(['day', 'month', 'year', 'all']).optional().default('day'),
  channel: z.enum(['DINE_IN', 'DELIVERY', 'PICKUP']).optional(),
  paymentMethod: z.enum(['MOBILE_PAYMENT', 'ZELLE', 'CASH', 'CARD', 'BINANCE', 'PAYPAL', 'TRANSFER']).optional(),
  // Solo aplica a channel=DINE_IN: 'staff' = cargado por un mesero, 'customer' = el cliente desde su teléfono.
  placedBy: z.enum(['staff', 'customer']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type CartItemInput = z.infer<typeof cartItemSchema>;
export type DineInCheckoutInput = z.infer<typeof dineInCheckoutSchema>;
export type DeliveryCheckoutInput = z.infer<typeof deliveryCheckoutSchema>;
export type ManualOrderInput = z.infer<typeof manualOrderSchema>;
export type UpdateOrderItemsInput = z.infer<typeof updateOrderItemsSchema>;
export type SetTipInput = z.infer<typeof setTipSchema>;
export type DispatchCourierInput = z.infer<typeof dispatchCourierSchema>;
export type OrderHistoryQuery = z.infer<typeof orderHistoryQuerySchema>;
