import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import {
  deliveryCheckoutSchema,
  dineInCheckoutSchema,
  manualOrderSchema,
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
    const order = await orderService.createManualOrder(req.restaurantId!, input);
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
};
