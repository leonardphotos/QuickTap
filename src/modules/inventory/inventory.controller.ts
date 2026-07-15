import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createInventoryItemSchema, updateInventoryItemSchema } from './inventory.dto';
import { inventoryService } from './inventory.service';

export const inventoryController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await inventoryService.list(req.restaurantId!) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createInventoryItemSchema.parse(req.body);
    res.status(201).json({ data: await inventoryService.create(req.restaurantId!, input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateInventoryItemSchema.parse(req.body);
    res.json({ data: await inventoryService.update(req.restaurantId!, req.params.id, input) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await inventoryService.remove(req.restaurantId!, req.params.id) });
  }),
};
