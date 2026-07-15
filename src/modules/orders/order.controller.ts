import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import {
  deliveryCheckoutSchema,
  dineInCheckoutSchema,
  manualOrderSchema,
  orderHistoryQuerySchema,
  setTipSchema,
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

  /** PATCH /api/v1/orders/:id/status — cambio de estado (protegido). */
  updateStatus: asyncHandler(async (req: Request, res: Response) => {
    const { status } = updateStatusSchema.parse(req.body);
    const order = await orderService.updateStatus(req.restaurantId!, req.params.id, status);
    res.json({ data: order });
  }),

  /** GET /api/v1/orders/summary/today — resumen de ventas del día (Dashboard). */
  todaySummary: asyncHandler(async (req: Request, res: Response) => {
    const summary = await orderService.getTodaySummary(req.restaurantId!);
    res.json({ data: summary });
  }),

  /** GET /api/v1/orders/summary/admin — resumen de Administración (solo plan Premium). */
  adminSummary: asyncHandler(async (req: Request, res: Response) => {
    const summary = await orderService.getAdminSummary(req.restaurantId!);
    res.json({ data: summary });
  }),

  /** PATCH /api/v1/orders/:id/tip — agregar/editar propina a mano (solo plan Premium). */
  setTip: asyncHandler(async (req: Request, res: Response) => {
    const { tipBase } = setTipSchema.parse(req.body);
    const order = await orderService.setTip(req.restaurantId!, req.params.id, tipBase);
    res.json({ data: order });
  }),

  /** GET /api/v1/orders/history — historial de pedidos con filtros (solo plan Premium). */
  history: asyncHandler(async (req: Request, res: Response) => {
    const query = orderHistoryQuerySchema.parse(req.query);
    const result = await orderService.getOrderHistory(req.restaurantId!, query);
    res.json({ data: result });
  }),

  /** GET /api/v1/orders/reports/products — más/menos vendidos (solo plan Premium). */
  productReport: asyncHandler(async (req: Request, res: Response) => {
    const { range } = orderHistoryQuerySchema.pick({ range: true }).parse(req.query);
    const rows = await orderService.getProductReport(req.restaurantId!, range);
    res.json({ data: rows });
  }),

  /** POST /api/v1/orders/:id/accept — el mesero acepta un pedido en NEEDS_CONFIRMATION y lo manda a cocina. */
  accept: asyncHandler(async (req: Request, res: Response) => {
    const order = await orderService.acceptOrder(req.restaurantId!, req.params.id);
    res.json({ data: order });
  }),
};
