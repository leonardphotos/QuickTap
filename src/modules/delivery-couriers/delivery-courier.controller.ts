import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createDeliveryCourierSchema, updateDeliveryCourierSchema } from './delivery-courier.dto';
import { deliveryCourierService } from './delivery-courier.service';

export const deliveryCourierController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await deliveryCourierService.list(req.restaurantId!) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createDeliveryCourierSchema.parse(req.body);
    res.status(201).json({ data: await deliveryCourierService.create(req.restaurantId!, input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateDeliveryCourierSchema.parse(req.body);
    res.json({ data: await deliveryCourierService.update(req.restaurantId!, req.params.id, input) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await deliveryCourierService.remove(req.restaurantId!, req.params.id) });
  }),
};
