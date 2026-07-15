import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createDeliveryZoneSchema, updateDeliveryZoneSchema } from './delivery-zone.dto';
import { deliveryZoneService } from './delivery-zone.service';

export const deliveryZoneController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await deliveryZoneService.list(req.restaurantId!) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createDeliveryZoneSchema.parse(req.body);
    res.status(201).json({ data: await deliveryZoneService.create(req.restaurantId!, input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateDeliveryZoneSchema.parse(req.body);
    res.json({ data: await deliveryZoneService.update(req.restaurantId!, req.params.id, input) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await deliveryZoneService.remove(req.restaurantId!, req.params.id) });
  }),
};
