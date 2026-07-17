import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import {
  addOrderItemSchema,
  deliveryCheckoutSchema,
  deliveryQuoteSchema,
  dineInCheckoutSchema,
  dispatchCourierSchema,
  manualOrderSchema,
  markKitchenReadySchema,
  orderHistoryQuerySchema,
  recordPaymentSchema,
  setAwaitingPaymentSchema,
  setTipSchema,
  updateOrderCustomerSchema,
  updateOrderItemsSchema,
  updateStatusSchema,
} from './order.dto';
import { orderService } from './order.service';

export const orderController = {
  /** POST /api/v1/public/checkout/dine-in — comensal en mesa (público). */
  checkoutDineIn: asyncHandler(async (req: Request, res: Response) => {
    const input = dineInCheckoutSchema.parse(req.body);
    const order = await orderService.checkoutDineIn(input);
    res.status(201).json({ data: order });
  }),

  /** POST /api/v1/public/checkout/delivery/:slug — cliente delivery (público). */
  checkoutDelivery: asyncHandler(async (req: Request, res: Response) => {
    const input = deliveryCheckoutSchema.parse(req.body);
    const result = await orderService.checkoutDelivery(req.params.slug, input);
    res.status(201).json({ data: result });
  }),

  /** GET /api/v1/public/checkout/delivery/:slug/quote — costo de envío en vivo (público). */
  deliveryQuote: asyncHandler(async (req: Request, res: Response) => {
    const { lat, lng } = deliveryQuoteSchema.parse(req.query);
    const quote = await orderService.getDeliveryQuote(req.params.slug, lat, lng);
    res.json({ data: quote });
  }),

  /** POST /api/v1/orders/manual — el staff (ej. Mesero) carga un pedido a mano (protegido). */
  createManual: asyncHandler(async (req: Request, res: Response) => {
    const input = manualOrderSchema.parse(req.body);
    const order = await orderService.createManualOrder(req.restaurantId!, input, req.auth?.userId);
    res.status(201).json({ data: order });
  }),

  /** GET /api/v1/orders/kitchen — cola de cocina (protegido). */
  kitchenQueue: asyncHandler(async (req: Request, res: Response) => {
    const orders = await orderService.listKitchenQueue(req.restaurantId!);
    res.json({ data: orders });
  }),

  /** GET /api/v1/orders/delivery — cola de la sección Delivery (protegido). */
  deliveryQueue: asyncHandler(async (req: Request, res: Response) => {
    const orders = await orderService.listDeliveryQueue(req.restaurantId!);
    res.json({ data: orders });
  }),

  /** PATCH /api/v1/orders/:id/items — editar cantidades de un pedido (protegido). */
  updateItems: asyncHandler(async (req: Request, res: Response) => {
    const input = updateOrderItemsSchema.parse(req.body);
    const order = await orderService.updateItems(req.restaurantId!, req.params.id, input.items);
    res.json({ data: order });
  }),

  /** POST /api/v1/orders/:id/items — añadir un producto a un pedido ya creado (protegido). */
  addItem: asyncHandler(async (req: Request, res: Response) => {
    const input = addOrderItemSchema.parse(req.body);
    const order = await orderService.addItem(req.restaurantId!, req.params.id, input);
    res.status(201).json({ data: order });
  }),

  /** POST /api/v1/orders/:id/payments — registrar un cobro, botones "Pagar" / "Pago Fraccionado" (protegido). */
  addPayment: asyncHandler(async (req: Request, res: Response) => {
    const input = recordPaymentSchema.parse(req.body);
    const order = await orderService.addPayment(req.restaurantId!, req.params.id, input);
    res.status(201).json({ data: order });
  }),

  /** PATCH /api/v1/orders/:id/customer — editar nombre/teléfono/dirección/nota (protegido). */
  updateCustomer: asyncHandler(async (req: Request, res: Response) => {
    const input = updateOrderCustomerSchema.parse(req.body);
    const order = await orderService.updateCustomer(req.restaurantId!, req.params.id, input);
    res.json({ data: order });
  }),

  /** PATCH /api/v1/orders/:id/status — cambio de estado (protegido). */
  updateStatus: asyncHandler(async (req: Request, res: Response) => {
    const { status } = updateStatusSchema.parse(req.body);
    const order = await orderService.updateStatus(req.restaurantId!, req.params.id, status);
    res.json({ data: order });
  }),

  /** PATCH /api/v1/orders/:id/kitchen-ready — una estación de cocina marca lista su parte. */
  markKitchenReady: asyncHandler(async (req: Request, res: Response) => {
    const { kitchenName } = markKitchenReadySchema.parse(req.body);
    const order = await orderService.markKitchenReady(req.restaurantId!, req.params.id, kitchenName);
    res.json({ data: order });
  }),

  /** GET /api/v1/orders/summary/today — resumen de ventas del día (Dashboard). */
  todaySummary: asyncHandler(async (req: Request, res: Response) => {
    const summary = await orderService.getTodaySummary(req.restaurantId!);
    res.json({ data: summary });
  }),

  /** PATCH /api/v1/orders/:id/tip — agregar/editar propina a mano (solo plan Premium). */
  setTip: asyncHandler(async (req: Request, res: Response) => {
    const { tipBase } = setTipSchema.parse(req.body);
    const order = await orderService.setTip(req.restaurantId!, req.params.id, tipBase);
    res.json({ data: order });
  }),

  /** PATCH /api/v1/orders/:id/awaiting-payment — botón del reloj: activa/desactiva la cuenta abierta pendiente por cobrar. */
  setAwaitingPayment: asyncHandler(async (req: Request, res: Response) => {
    const { awaitingPayment } = setAwaitingPaymentSchema.parse(req.body);
    const order = await orderService.setAwaitingPayment(req.restaurantId!, req.params.id, awaitingPayment);
    res.json({ data: order });
  }),

  /** GET /api/v1/orders/history — historial de pedidos con filtros (solo plan Premium). */
  history: asyncHandler(async (req: Request, res: Response) => {
    const query = orderHistoryQuerySchema.parse(req.query);
    const result = await orderService.getOrderHistory(req.restaurantId!, query);
    res.json({ data: result });
  }),

  /** GET /api/v1/orders/waiters — personal que ha cargado pedidos, para el filtro "Mesero" (solo plan Premium). */
  waiters: asyncHandler(async (req: Request, res: Response) => {
    const rows = await orderService.listWaiters(req.restaurantId!);
    res.json({ data: rows });
  }),

  /** GET /api/v1/orders/reports/products — más/menos vendidos (solo plan Premium). */
  productReport: asyncHandler(async (req: Request, res: Response) => {
    const { range } = orderHistoryQuerySchema.pick({ range: true }).parse(req.query);
    const rows = await orderService.getProductReport(req.restaurantId!, range);
    res.json({ data: rows });
  }),

  /** GET /api/v1/orders/reports/couriers — movimiento por repartidor (solo plan Premium). */
  courierReport: asyncHandler(async (req: Request, res: Response) => {
    const { range } = orderHistoryQuerySchema.pick({ range: true }).parse(req.query);
    const rows = await orderService.getCourierStats(req.restaurantId!, range);
    res.json({ data: rows });
  }),

  /** GET /api/v1/orders/reports/payment-methods — movimiento por método de pago (solo plan Premium). */
  paymentMethodReport: asyncHandler(async (req: Request, res: Response) => {
    const { range } = orderHistoryQuerySchema.pick({ range: true }).parse(req.query);
    const rows = await orderService.getPaymentMethodStats(req.restaurantId!, range);
    res.json({ data: rows });
  }),

  /** POST /api/v1/orders/:id/accept — el mesero acepta un pedido en NEEDS_CONFIRMATION y lo manda a cocina. */
  accept: asyncHandler(async (req: Request, res: Response) => {
    const order = await orderService.acceptOrder(req.restaurantId!, req.params.id);
    res.json({ data: order });
  }),

  /** GET /api/v1/orders/live — todos los pedidos activos, para el panel del Dashboard. */
  liveOrders: asyncHandler(async (req: Request, res: Response) => {
    const orders = await orderService.listLiveOrders(req.restaurantId!);
    res.json({ data: orders });
  }),

  /** DELETE /api/v1/orders/:id — "Cancelar" desde Pedidos en vivo: borra, no queda registrado. */
  remove: asyncHandler(async (req: Request, res: Response) => {
    const result = await orderService.deleteOrderHard(req.restaurantId!, req.params.id);
    res.json({ data: result });
  }),

  /** POST /api/v1/orders/:id/dispatch-courier — "Delivery": arma el WhatsApp para el repartidor. */
  dispatchCourier: asyncHandler(async (req: Request, res: Response) => {
    const { courierId } = dispatchCourierSchema.parse(req.body);
    const result = await orderService.dispatchToCourier(req.restaurantId!, req.params.id, courierId);
    res.json({ data: result });
  }),

  /** POST /api/v1/orders/:id/send-whatsapp — "Enviar vía WhatsApp": arma el enlace al teléfono del cliente. */
  sendWhatsapp: asyncHandler(async (req: Request, res: Response) => {
    const result = await orderService.sendComandaWhatsapp(req.restaurantId!, req.params.id);
    res.json({ data: result });
  }),
};
