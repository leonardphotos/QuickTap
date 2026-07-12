import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createTableSchema } from './table.dto';
import { tableService } from './table.service';

export const tableController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await tableService.list(req.restaurantId!) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createTableSchema.parse(req.body);
    res.status(201).json({ data: await tableService.create(req.restaurantId!, input) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await tableService.remove(req.restaurantId!, req.params.id) });
  }),
};
