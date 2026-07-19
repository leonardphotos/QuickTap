import { z } from 'zod';

/** Un ítem del carrito tal como lo envía el cliente/mesero. */
export const cartItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive().max(99),
  // Si el producto usa "Precio por variantes", cuál variante eligió el cliente.
  variantId: z.string().min(1).optional(),
  // Modificadores elegidos (ids de Modifier). El service valida obligatoriedad/uno-vs-varios
  // contra las categorías asociadas al producto y congela nombre+precio en el pedido.
  modifierIds: z.array(z.string().min(1)).optional().default([]),
  note: z.string().max(200).optional(),
});

/** Checkout en mesa (canal DINE_IN). Requiere el token del QR de la mesa. */
export const dineInCheckoutSchema = z.object({
  qrToken: z.string().min(1, 'Falta el identificador de la mesa (QR).'),
  items: z.array(cartItemSchema).min(1, 'El carrito está vacío.'),
  customerName: z.string().min(1).max(120).optional(),
  // Cédula/documento de identidad, para los datos de facturación.
  customerIdNumber: z.string().min(1).max(20).optional(),
  // Obligatorio solo al abrir la cuenta (primer pedido de la mesa); se valida
  // en el service junto con nombre/cédula, no aquí, porque solo ahí se sabe
  // si ya existe una sesión abierta que reusar.
  customerPhone: z.string().min(1).max(30).optional(),
  // Requerida solo si la cuenta de la mesa ya está protegida con clave.
  pin: z.string().regex(/^\d{4}$/).optional(),
  // Propina opcional que el cliente agrega desde la mesa.
  tipBase: z.coerce.number().nonnegative().max(100000).optional(),
});

/**
 * Pedido cargado a mano por el staff: desde "Órdenes de Mesa" (siempre
 * DINE_IN, con tableId) o desde "Crear pedido" en el Dashboard (cualquier
 * canal). Delivery/Pickup no requieren mesa, pero sí datos del cliente.
 */
export const manualOrderSchema = z
  .object({
    channel: z.enum(['DINE_IN', 'DELIVERY', 'PICKUP', 'BAR']).optional().default('DINE_IN'),
    tableId: z.string().min(1).optional(),
    items: z.array(cartItemSchema).min(1, 'El pedido está vacío.'),
    customerName: z.string().min(1).max(120).optional(),
    customerIdNumber: z.string().min(1).max(20).optional(),
    customerPhone: z.string().max(30).optional(),
    customerAddress: z.string().max(300).optional(),
    customerNote: z.string().max(300).optional(),
    // Ubicación GPS del cliente (autocompletar dirección o "usar mi ubicación actual").
    customerLat: z.number().min(-90).max(90).optional(),
    customerLng: z.number().min(-180).max(180).optional(),
    // Cliente elegido del directorio (wizard "Crear pedido" → paso Clientes).
    customerId: z.string().optional(),
    // Cómo se piensa cobrar este pedido nuevo (wizard → paso Pago). 'DEBT' marca awaitingPayment
    // de una vez; 'FULL'/'SPLIT' solo le indican al frontend qué diálogo de pago abrir después.
    paymentIntent: z.enum(['FULL', 'SPLIT', 'DEBT']).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.channel === 'DINE_IN' && !data.tableId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Selecciona una mesa.', path: ['tableId'] });
    }
    // El nombre puede venir suelto (formulario) o resolverse en el service a partir de
    // `customerId` (wizard → paso Clientes), por eso aquí basta con que venga alguno de los dos.
    if (data.channel !== 'DINE_IN' && !data.customerName?.trim() && !data.customerId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Elige o crea un cliente.', path: ['customerName'] });
    }
    if (data.channel === 'DELIVERY' && !data.customerAddress?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Escribe la dirección de entrega.', path: ['customerAddress'] });
    }
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

/** Una estación de cocina marca lista su parte de la comanda. null = sin cocina asignada. */
export const markKitchenReadySchema = z.object({
  kitchenName: z.string().min(1).max(60).nullable(),
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

/** Botón del reloj en Pedidos: activa/desactiva la cuenta abierta pendiente por cobrar. */
export const setAwaitingPaymentSchema = z.object({
  awaitingPayment: z.coerce.boolean().optional().default(true),
});

/** Registrar un cobro (botones "Pagar" / "Pago Fraccionado" en Pedidos). */
export const recordPaymentSchema = z.object({
  amountBase: z.coerce.number().positive().max(1000000),
  method: paymentMethodSchema,
  // Descuento aplicado a este pago puntual (0-100). Opcional, solo informativo:
  // el monto real a acreditar sigue siendo `amountBase`.
  discountPercent: z.coerce.number().min(0).max(100).optional(),
});

/** Añadir un producto nuevo a un pedido ya creado, desde el panel de Pedidos en vivo. */
export const addOrderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive().max(99),
  variantId: z.string().min(1).optional(),
  modifierIds: z.array(z.string().min(1)).optional().default([]),
  note: z.string().max(200).optional(),
});

/** Editar los datos del cliente de un pedido ya creado. */
export const updateOrderCustomerSchema = z.object({
  customerName: z.string().min(1).max(120).optional(),
  customerPhone: z.string().max(30).optional(),
  customerAddress: z.string().max(300).optional(),
  customerNote: z.string().max(300).optional(),
  customerLat: z.number().min(-90).max(90).optional(),
  customerLng: z.number().min(-180).max(180).optional(),
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
  range: z.enum(['day', 'week', 'month', 'year', 'all']).optional().default('day'),
  // Fecha exacta ("YYYY-MM-DD"): si viene, ignora `range` y filtra ese día completo.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  channel: z.enum(['DINE_IN', 'DELIVERY', 'PICKUP', 'BAR']).optional(),
  paymentMethod: z.enum(['MOBILE_PAYMENT', 'ZELLE', 'CASH', 'CARD', 'BINANCE', 'PAYPAL', 'TRANSFER']).optional(),
  // Solo aplica a channel=DINE_IN: 'staff' = cargado por un mesero, 'customer' = el cliente desde su teléfono.
  placedBy: z.enum(['staff', 'customer']).optional(),
  // Filtra por el mesero/staff específico que cargó el pedido (Historial > "Mesero").
  placedByUserId: z.string().optional(),
  // Filtra pedidos que incluyan este producto (drill-down desde Productos).
  productId: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type ReportRange = z.infer<typeof orderHistoryQuerySchema>['range'];

export type CartItemInput = z.infer<typeof cartItemSchema>;
export type DineInCheckoutInput = z.infer<typeof dineInCheckoutSchema>;
export type DeliveryCheckoutInput = z.infer<typeof deliveryCheckoutSchema>;
export type ManualOrderInput = z.infer<typeof manualOrderSchema>;
export type UpdateOrderItemsInput = z.infer<typeof updateOrderItemsSchema>;
export type SetTipInput = z.infer<typeof setTipSchema>;
export type SetAwaitingPaymentInput = z.infer<typeof setAwaitingPaymentSchema>;
export type DispatchCourierInput = z.infer<typeof dispatchCourierSchema>;
export type AddOrderItemInput = z.infer<typeof addOrderItemSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type UpdateOrderCustomerInput = z.infer<typeof updateOrderCustomerSchema>;
export type OrderHistoryQuery = z.infer<typeof orderHistoryQuerySchema>;
