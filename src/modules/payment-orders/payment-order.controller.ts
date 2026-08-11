import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createPaymentOrderSchema, payPaymentOrderSchema } from './payment-order.dto';
import { paymentOrderService } from './payment-order.service';

export const paymentOrderController = {
  /** GET /payment-orders/payables — deudas con proveedor sin saldar y sin orden emitida. */
  listPayables: asyncHandler(async (req: Request, res: Response) => {
    const supplierId = typeof req.query.supplierId === 'string' ? req.query.supplierId : undefined;
    res.json({ data: await paymentOrderService.listPayables(req.restaurantId!, supplierId) });
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    res.json({ data: await paymentOrderService.list(req.restaurantId!, status) });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await paymentOrderService.getById(req.restaurantId!, req.params.id) });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createPaymentOrderSchema.parse(req.body);
    res.status(201).json({ data: await paymentOrderService.create(req.restaurantId!, req.auth?.userId, input) });
  }),

  pay: asyncHandler(async (req: Request, res: Response) => {
    const input = payPaymentOrderSchema.parse(req.body ?? {});
    res.json({ data: await paymentOrderService.pay(req.restaurantId!, req.params.id, req.auth?.userId, input) });
  }),

  cancel: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await paymentOrderService.cancel(req.restaurantId!, req.params.id) });
  }),
};
