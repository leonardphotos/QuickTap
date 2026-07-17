import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createKitchenSchema, updateKitchenSchema } from './kitchen.dto';
import { kitchenService } from './kitchen.service';

export const kitchenController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await kitchenService.list(req.restaurantId!) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createKitchenSchema.parse(req.body);
    res.status(201).json({ data: await kitchenService.create(req.restaurantId!, input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateKitchenSchema.parse(req.body);
    res.json({ data: await kitchenService.update(req.restaurantId!, req.params.id, input) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await kitchenService.remove(req.restaurantId!, req.params.id) });
  }),
};
