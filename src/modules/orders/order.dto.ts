import { z } from 'zod';

type OrderChannelValue = 'DINE_IN' | 'DELIVERY' | 'PICKUP' | 'BAR' | 'EXPRESS';

/** Un ítem del carrito tal como lo envía el cliente/mesero. */
export const cartItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive().max(99),
  // Si el producto usa "Precio por variantes", cuál variante eligió el cliente.
  variantId: z.string().min(1).optional(),
  // Modificadores elegidos (ids de Modifier). El service valida obligatoriedad/uno-vs-varios
  // contra las categorías asociadas al producto y congela nombre+precio en el pedido.
  modifierIds: z.array(z.string().min(1)).optional().default([]),
  // Combo armable: una entrada POR INSTANCIA de cada plato componente (2× wokbox = dos
  // entradas), cada una con los modificadores elegidos para ESE plato. El service valida
  // cantidad y reglas contra los componentes reales del combo.
  comboSelections: z
    .array(
      z.object({
        componentProductId: z.string().min(1),
        // Distingue "Noodle Bar 16OZ" de "26OZ" cuando el combo trae los dos. Opcional: con
        // una sola fila del plato en el combo se resuelve sola (retrocompatibilidad).
        variantId: z.string().min(1).nullable().optional(),
        modifierIds: z.array(z.string().min(1)).default([]),
      }),
    )
    .max(40)
    .optional(),
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
    channel: z.enum(['DINE_IN', 'DELIVERY', 'PICKUP', 'BAR', 'EXPRESS']).optional().default('DINE_IN'),
    tableId: z.string().min(1).optional(),
    // Mesa con varias cuentas abiertas: a cuál de ellas se agrega este pedido.
    sessionId: z.string().min(1).optional(),
    // Mesa con varias cuentas abiertas: abre una cuenta NUEVA e independiente, en vez de
    // usar/crear la única cuenta de la mesa (comportamiento de siempre cuando no se manda).
    openNewAccount: z.boolean().optional(),
    // Nombre opcional de la cuenta nueva (ej. "Cuenta 2"). Solo aplica junto a openNewAccount.
    accountLabel: z.string().max(40).optional(),
    items: z.array(cartItemSchema).min(1, 'El pedido está vacío.'),
    customerName: z.string().min(1).max(120).optional(),
    customerIdNumber: z.string().min(1).max(20).optional(),
    customerPhone: z.string().max(30).optional(),
    customerAddress: z.string().max(300).optional(),
    customerNote: z.string().max(300).optional(),
    // Ubicación GPS del cliente (autocompletar dirección o "usar mi ubicación actual").
    customerLat: z.number().min(-90).max(90).optional(),
    customerLng: z.number().min(-180).max(180).optional(),
    // Envío escrito a mano por el staff (canal DELIVERY). Solo se acepta acá, en la creación
    // desde el panel: en el checkout público el monto SIEMPRE lo calcula el servidor, si no el
    // propio comensal podría ponerse el envío en 0.
    deliveryFeeBase: z.number().min(0).max(100000).optional(),
    // Cliente elegido del directorio (wizard "Crear pedido" → paso Clientes).
    customerId: z.string().optional(),
    // Cómo se piensa cobrar este pedido nuevo (wizard → paso Pago). 'DEBT' marca awaitingPayment
    // de una vez; 'FULL'/'SPLIT' solo le indican al frontend qué diálogo de pago abrir después.
    paymentIntent: z.enum(['FULL', 'SPLIT', 'DEBT']).optional(),
    // Método que el cliente eligió pagar (kiosco Comanda: sin cajero presente que lo capture
    // como referencia — solo se guarda la intención, para el ticket "Número de orden" y para
    // precargar el método al cobrar en caja).
    paymentMethod: z.enum(['MOBILE_PAYMENT', 'ZELLE', 'CASH', 'CASH_USD', 'CARD', 'BINANCE', 'PAYPAL', 'TRANSFER']).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.channel === 'DINE_IN' && !data.tableId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Selecciona una mesa.', path: ['tableId'] });
    }
    // El nombre puede venir suelto (formulario) o resolverse en el service a partir de
    // `customerId` (wizard → paso Clientes), por eso aquí basta con que venga alguno de los dos.
    // EXPRESS queda fuera a propósito: es una venta de mostrador al paso, se cobra y se va.
    // Exigirle un cliente sería justo lo que el canal existe para evitar.
    if (data.channel !== 'DINE_IN' && data.channel !== 'EXPRESS' && !data.customerName?.trim() && !data.customerId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Elige o crea un cliente.', path: ['customerName'] });
    }
    if (data.channel === 'DELIVERY' && !data.customerAddress?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Escribe la dirección de entrega.', path: ['customerAddress'] });
    }
    if (data.sessionId && data.openNewAccount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'No se puede abrir una cuenta nueva y agregar a una existente a la vez.',
        path: ['sessionId'],
      });
    }
  });

const paymentMethodSchema = z.enum(['MOBILE_PAYMENT', 'ZELLE', 'CASH', 'CASH_USD', 'CARD', 'BINANCE', 'PAYPAL', 'TRANSFER']);

// Métodos que dejan rastro verificable y exigen referencia o comprobante (Punto de venta = "ticket").
// Todos menos Efectivo Bs/$ (que no dejan rastro que verificar).
const METHODS_REQUIRING_PROOF_OR_REFERENCE = ['MOBILE_PAYMENT', 'ZELLE', 'CARD', 'BINANCE', 'PAYPAL', 'TRANSFER'] as const;

// De esos, los que además pueden adjuntar foto. Punto de Venta no: su ticket impreso ya es el
// comprobante, así que para CARD el número sigue siendo la única forma de cumplir.
const METHODS_ALLOWING_PROOF = ['MOBILE_PAYMENT', 'ZELLE', 'BINANCE', 'PAYPAL', 'TRANSFER'] as const;

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
  // Tanda concreta dentro del pedido. Cocina la manda siempre (cada tarjeta es una tanda);
  // se deja opcional para no romper a un cliente viejo, que sigue cerrando la estación entera.
  kitchenBatch: z.number().int().positive().optional(),
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

/** "Entregado" — el mesero lo marca cuando de verdad lleva el plato/producto a la mesa. */
export const markItemDeliveredSchema = z.object({
  delivered: z.boolean(),
});

/** Motivos de devolución al quitar/reducir un ítem YA entregado — subconjunto de WASTE_REASONS
 * (ver waste.dto.ts): los que de verdad puede explicar un mesero desde el pedido, sin el resto
 * de motivos de Merma (vencido, robo…) que no aplican a "el cliente lo devolvió". */
export const RETURN_REASONS = ['CUSTOMER_RETURN', 'PREPARATION', 'DAMAGED', 'OTHER'] as const;

/** Quitar/reducir un ítem YA entregado: a diferencia de updateOrderItemsSchema (una simple
 * corrección antes de que salga), esto pide el motivo y queda registrado en Merma
 * (WasteRecord) — es la "estadística aparte" de devoluciones. */
export const returnOrderItemSchema = z.object({
  quantity: z.coerce.number().int().positive().max(99),
  reason: z.enum(RETURN_REASONS),
  note: z.string().trim().max(300).optional(),
});

/** Agregar/editar la propina de un pedido a mano, desde Administración. */
export const setTipSchema = z.object({
  tipBase: z.coerce.number().nonnegative().max(100000),
});

/** Botón del reloj en Pedidos: activa/desactiva la cuenta abierta pendiente por cobrar. */
export const setAwaitingPaymentSchema = z.object({
  awaitingPayment: z.coerce.boolean().optional().default(true),
});

/** "Cancelar" (borrado duro) en Pedidos: el Mesero debe mandar el código de 6 dígitos de Ajustes. */
export const deleteOrderSchema = z.object({
  pin: z.string().optional(),
});

/** Registrar un cobro (botones "Pagar" / "Pago Fraccionado" en Pedidos). Si viene `items`, el
 * monto lo calcula el servidor a partir de esas líneas — `amountBase` se ignora en ese caso. */
export const recordPaymentSchema = z
  .object({
    amountBase: z.coerce.number().positive().max(1000000).optional(),
    method: paymentMethodSchema,
    // Descuento aplicado a este pago puntual, por % (0-100) o por monto fijo — el cliente manda
    // solo uno de los dos. Opcional, solo informativo: el monto real a acreditar sigue siendo
    // `amountBase` (ya viene descontado desde el cliente).
    discountPercent: z.coerce.number().min(0).max(100).optional(),
    discountAmount: z.coerce.number().nonnegative().optional(),
    // Ajuste puntual al cargo de servicio de este cobro (perdona parte/todo el servicio),
    // mismo criterio de % o monto fijo que el descuento — nunca toca el total original del pedido.
    serviceChargeDiscountPercent: z.coerce.number().min(0).max(100).optional(),
    serviceChargeDiscountAmount: z.coerce.number().nonnegative().optional(),
    // Número de referencia (Pago Móvil/Zelle) o de ticket (Punto de venta). Para esos métodos hay
    // que mandar esto O la foto del comprobante (ver superRefine abajo), no necesariamente ambos.
    referenceNumber: z.string().max(60).optional(),
    // Foto del comprobante — alternativa válida a la referencia, no un extra opcional.
    proofImageUrl: z.string().optional(),
    // A cuál cuenta bancaria entró el dinero, cuando el método tiene varias (varios
    // Zelle / varios Pago Móvil). Sin esto, se asienta en la vinculada al método.
    bankAccountId: z.string().max(60).nullish(),
    // Código de promoción del CRM: el servidor valida, aplica su descuento sobre el
    // saldo y registra el canje en la misma transacción del cobro.
    promoCode: z.string().max(40).nullish(),
    // Fraccionar por ítems: qué se está cobrando en este pago puntual (cantidad por OrderItem).
    items: z.array(z.object({ orderItemId: z.string().min(1), quantity: z.coerce.number().int().positive() })).optional(),
    // Propina que el cliente deja AL MOMENTO de cobrar este pago — plata real, aparte del saldo
    // del pedido (ver Order.tipBase / OrderPayment.tipBase). Nunca se descuenta de `amountBase`.
    tipBase: z.coerce.number().nonnegative().max(1000000).optional(),
    // --- Vuelto ---
    // Cuánto ENTREGÓ el cliente (solo efectivo). Si supera lo que se le acredita (amountBase /
    // ítems), la diferencia es el vuelto. Se guarda aparte para no chocar con "el monto no puede
    // superar el saldo": lo acreditado sigue topado al saldo, el vuelto es lo que sobra.
    amountReceived: z.coerce.number().positive().max(1000000).optional(),
    // Con qué se devolvió el vuelto: mismo efectivo (default) o Pago Móvil en Bs, etc.
    changeMethod: paymentMethodSchema.optional(),
    changeReferenceNumber: z.string().max(60).optional(),
  })
  .superRefine((data, ctx) => {
    // El vuelto solo tiene sentido si el cliente pagó en efectivo (billetes) — con Pago Móvil o
    // Zelle transfiere el monto exacto, no hay "de más" que devolver.
    if (data.amountReceived != null && data.method !== 'CASH' && data.method !== 'CASH_USD') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El vuelto solo aplica a pagos en efectivo.', path: ['amountReceived'] });
    }
    // Basta con uno de los dos: quien tiene la captura no siempre transcribe el número, y
    // quien anota el número no siempre guarda la captura. Exigir ambos trancaba la caja.
    if (
      METHODS_REQUIRING_PROOF_OR_REFERENCE.includes(data.method as any) &&
      !data.referenceNumber?.trim() &&
      !data.proofImageUrl?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: METHODS_ALLOWING_PROOF.includes(data.method as any)
          ? 'Escribe el número de referencia o adjunta el comprobante.'
          : 'Escribe el número de ticket.',
        path: ['referenceNumber'],
      });
    }
    if (!data.amountBase && !data.items?.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Escribe un monto o elige los ítems a cobrar.', path: ['amountBase'] });
    }
  });

/** Añadir un producto nuevo a un pedido ya creado, desde el panel de Pedidos en vivo. */
export const addOrderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive().max(99),
  variantId: z.string().min(1).optional(),
  modifierIds: z.array(z.string().min(1)).optional().default([]),
  comboSelections: z
    .array(
      z.object({
        componentProductId: z.string().min(1),
        // Distingue "Noodle Bar 16OZ" de "26OZ" cuando el combo trae los dos. Opcional: con
        // una sola fila del plato en el combo se resuelve sola (retrocompatibilidad).
        variantId: z.string().min(1).nullable().optional(),
        modifierIds: z.array(z.string().min(1)).default([]),
      }),
    )
    .max(40)
    .optional(),
  note: z.string().max(200).optional(),
});

/** Varios productos agregados de una sola vez a un pedido ya creado (ver "Enviar a cocina" en
 * el panel) — UNA sola tanda de cocina y UNA sola comanda con todo junto, no una por producto. */
export const addOrderItemsBatchSchema = z.object({
  items: z.array(addOrderItemSchema).min(1).max(40),
});

/**
 * Datos que el cajero confirma en el diálogo "Factura fiscal" antes de emitirla.
 *
 * El RIF/cédula es OBLIGATORIO: va impreso en un documento legal y una factura con el dato
 * errado no se corrige, se anula con nota de crédito. Se acepta el formato venezolano
 * (V/E/J/G/P + números, con o sin guion) y también solo dígitos, que es como la gente teclea
 * la cédula; el guion se normaliza acá para que la impresora reciba siempre lo mismo.
 */
export const printFiscalSchema = z.object({
  rif: z
    .string()
    .trim()
    .min(1, 'La cédula o RIF es obligatorio para la factura fiscal.')
    .max(20)
    .regex(/^([VEJGPvejgp]-?)?\d{5,10}$/, 'Cédula o RIF inválido. Ej: V-12345678 o J-407123456.')
    .transform((v) => {
      const s = v.toUpperCase().replace(/-/g, '');
      // Sin letra explícita se asume V (cédula de venezolano), que es el caso corriente.
      return /^\d+$/.test(s) ? `V-${s}` : `${s[0]}-${s.slice(1)}`;
    }),
  nombre: z.string().trim().min(1, 'El nombre o razón social es obligatorio.').max(60),
});
export type PrintFiscalInput = z.infer<typeof printFiscalSchema>;

/** Lo que la Estación de Impresión reporta tras emitir: el correlativo lo lleva la máquina. */
export const fiscalResultSchema = z.object({
  numeroFactura: z.string().trim().min(1).max(30),
  serialMaquina: z.string().trim().min(1).max(30),
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

/** Cambiar el tipo (canal) de un pedido ya creado, ej. de Mesa a Delivery. */
export const changeChannelSchema = z
  .object({
    channel: z.enum(['DINE_IN', 'DELIVERY', 'PICKUP', 'BAR', 'EXPRESS']),
    tableId: z.string().min(1).optional(),
    customerAddress: z.string().max(300).optional(),
    customerLat: z.number().min(-90).max(90).optional(),
    customerLng: z.number().min(-180).max(180).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.channel === 'DINE_IN' && !data.tableId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Selecciona una mesa.', path: ['tableId'] });
    }
    if (data.channel === 'DELIVERY' && !data.customerAddress?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Escribe la dirección de entrega.', path: ['customerAddress'] });
    }
  });

/** "Delivery" en el panel de Pedidos en vivo: a qué repartidor despachar la comanda. */
// Sin courierId: el servidor elige repartidor por rotación ("despacho automático
// al cobrar", Ajustes → Delivery). Con courierId: lo eligió el cajero a mano.
export const dispatchCourierSchema = z.object({
  courierId: z.string().min(1, 'Elige un repartidor.').optional(),
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
  // Tramo libre desde–hasta (inclusivos, "YYYY-MM-DD"): si viene alguno, manda sobre `range` y `date`.
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  channel: z.enum(['DINE_IN', 'DELIVERY', 'PICKUP', 'BAR', 'EXPRESS']).optional(),
  // Varios canales a la vez, separados por coma ("DELIVERY,PICKUP"): lo usa la pantalla
  // de Delivery, que solo muestra su propio historial. `channel` (uno solo) tiene prioridad.
  channels: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? (v.split(',').filter((c) => ['DINE_IN', 'DELIVERY', 'PICKUP', 'BAR', 'EXPRESS'].includes(c)) as OrderChannelValue[])
        : undefined,
    ),
  paymentMethod: z.enum(['MOBILE_PAYMENT', 'ZELLE', 'CASH', 'CASH_USD', 'CARD', 'BINANCE', 'PAYPAL', 'TRANSFER']).optional(),
  // Quién cargó el pedido: 'staff' = un mesero/cajero, 'customer' = el cliente desde su
  // teléfono (QR de la mesa / delivery), 'kiosk' = autoservicio en la tablet Comanda.
  placedBy: z.enum(['staff', 'customer', 'kiosk']).optional(),
  // Filtra por el mesero/staff específico que cargó el pedido (Historial > "Mesero").
  placedByUserId: z.string().optional(),
  // Filtra pedidos que incluyan este producto (drill-down desde Productos).
  productId: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

/** Tramo desde–hasta opcional de Administración → Estadísticas. */
export const statsPeriodQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type ReportRange = z.infer<typeof orderHistoryQuerySchema>['range'];

export type CartItemInput = z.infer<typeof cartItemSchema>;
export type DineInCheckoutInput = z.infer<typeof dineInCheckoutSchema>;
export type DeliveryCheckoutInput = z.infer<typeof deliveryCheckoutSchema>;
export type ManualOrderInput = z.infer<typeof manualOrderSchema>;
export type UpdateOrderItemsInput = z.infer<typeof updateOrderItemsSchema>;
export type MarkItemDeliveredInput = z.infer<typeof markItemDeliveredSchema>;
export type ReturnOrderItemInput = z.infer<typeof returnOrderItemSchema>;
export type SetTipInput = z.infer<typeof setTipSchema>;
export type SetAwaitingPaymentInput = z.infer<typeof setAwaitingPaymentSchema>;
export type DeleteOrderInput = z.infer<typeof deleteOrderSchema>;
export type DispatchCourierInput = z.infer<typeof dispatchCourierSchema>;
export type AddOrderItemInput = z.infer<typeof addOrderItemSchema>;
export type AddOrderItemsBatchInput = z.infer<typeof addOrderItemsBatchSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type UpdateOrderCustomerInput = z.infer<typeof updateOrderCustomerSchema>;
export type ChangeChannelInput = z.infer<typeof changeChannelSchema>;
export type OrderHistoryQuery = z.infer<typeof orderHistoryQuerySchema>;
